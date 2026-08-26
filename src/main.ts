import type { NeuralNetConfig, VehiclePhysicsConfig } from "./sim/types";
import { paddockTrack01 } from "./content/tracks";
import { createPopulation, stepPopulation, type Population, type PopulationConfig } from "./sim/population";
import { cloneGenome } from "./sim/genome";
import { renderTrack, renderPopulation } from "./game/render";
import { drawFitnessSparkline, drawWeightHeatmap } from "./ui/transparency";
import {
  createMetaState,
  computeOfflineSeconds,
  metaFromSaveData,
  populationFromSaveData,
  type MetaState,
} from "./sim/gamestate";
import { collectGenerationRewards } from "./sim/economy";
import {
  createUpgradeLevels,
  effectiveMutationMagnitude,
  effectiveSensorRange,
  effectivePopulationSize,
  effectiveHiddenSize2,
  tryPurchaseUpgrade,
  type UpgradeId,
} from "./sim/upgrades";
import {
  currencyMultiplierFor,
  legacyPointsForRetirement,
  retire,
  tryPurchasePermanent,
  type PermanentUpgradeId,
} from "./sim/prestige";
import { seedPopulationWithInheritance } from "./sim/seed";
import { saveGame, loadGame } from "./game/save";
import { runOfflineReplay } from "./game/offlineProgress";
import { buildShopPanel, refreshShopPanel } from "./ui/shop";

const track = paddockTrack01();

// Tractor, not a car: slower top speed, wide sensor fan, sluggish turning at
// low speed (handled in vehicle.ts) — the whole point of the theme swap.
const basePhysics: VehiclePhysicsConfig = {
  maxSpeed: 90,
  maxAccel: 60,
  maxTurnRate: 1.8,
  radius: 9,
  sensorCount: 5,
  sensorRange: 140,
  sensorFanDegrees: 160,
};

const baseNetCfg: NeuralNetConfig = {
  inputSize: basePhysics.sensorCount + 1,
  hiddenSize: 8,
  outputSize: 2,
};

const basePopCfg: PopulationConfig = {
  size: 24,
  mutationRate: 0.2,
  mutationMagnitude: 0.4,
  maxGenerationSeconds: 12,
};

// Effective (upgrade-adjusted) configs. Reassigned whenever upgrade levels
// change; simTick/renderLoop read these `let` bindings directly each call,
// so a reassignment here takes effect on the very next tick/frame.
let physics: VehiclePhysicsConfig = { ...basePhysics };
let netCfg: NeuralNetConfig = { ...baseNetCfg };
let popCfg: PopulationConfig = { ...basePopCfg };

let meta: MetaState = createMetaState();
let population: Population;

function applyRunUpgradesToConfigs(): void {
  physics = { ...basePhysics, sensorRange: effectiveSensorRange(basePhysics.sensorRange, meta.upgrades) };
  netCfg = { ...baseNetCfg, hiddenSize2: effectiveHiddenSize2(meta.upgrades) };
  popCfg = { ...basePopCfg, size: effectivePopulationSize(basePopCfg.size, meta.upgrades) };
}

const canvas = document.getElementById("track-canvas") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const hud = document.getElementById("hud")!;
const appEl = document.getElementById("app")!;

const shopPanel = document.createElement("div");
shopPanel.id = "shop-panel";
shopPanel.className = "shop-panel";
appEl.appendChild(shopPanel);

const offlineOverlay = document.createElement("div");
offlineOverlay.id = "offline-overlay";
offlineOverlay.className = "offline-overlay";
offlineOverlay.style.display = "none";
appEl.appendChild(offlineOverlay);

let speedMultiplier = 1;
const fixedDt = 1 / 60;
let accumulator = 0;
let lastSimTime = performance.now();

function buildHud(): void {
  hud.innerHTML = `
    <span id="gen-label">Generation 1</span>
    <span id="fitness-label">Best: 0</span>
    <span id="currency-label">Credits: 0</span>
    <button id="speed-1x" class="active">1x</button>
    <button id="speed-4x">4x</button>
    <button id="speed-16x">16x</button>
    <button id="shop-toggle">Shop</button>
  `;
  document.getElementById("speed-1x")!.addEventListener("click", () => setSpeed(1));
  document.getElementById("speed-4x")!.addEventListener("click", () => setSpeed(4));
  document.getElementById("speed-16x")!.addEventListener("click", () => setSpeed(16));
  document.getElementById("shop-toggle")!.addEventListener("click", () => {
    shopPanel.classList.toggle("open");
  });
}

function setSpeed(mult: number): void {
  speedMultiplier = mult;
  document.querySelectorAll("#hud button[id^='speed-']").forEach((btn) => btn.classList.remove("active"));
  document.getElementById(`speed-${mult}x`)!.classList.add("active");
}

function buildShop(): void {
  buildShopPanel(shopPanel, {
    onBuyUpgrade: buyUpgrade,
    onBuyPermanent: buyPermanent,
    onRetire: doRetire,
  });
  refreshShop();
}

function refreshShop(): void {
  const preview = legacyPointsForRetirement(meta.economy.runCurrencyEarned);
  refreshShopPanel(shopPanel, meta.economy, meta.upgrades, meta.permanent, preview);
}

function buyUpgrade(id: UpgradeId): void {
  const result = tryPurchaseUpgrade(meta.upgrades, meta.economy.currency, id);
  if (!result.purchased) return;
  meta.economy.currency -= result.spent;

  if (id === "neuralExpansion") {
    // Structural change: the weight layout no longer matches any existing
    // genome, so the current population restarts from scratch on the new,
    // bigger brain rather than trying to reinterpret old weights.
    netCfg = { ...baseNetCfg, hiddenSize2: effectiveHiddenSize2(meta.upgrades) };
    population = createPopulation(track, netCfg, popCfg);
    meta.rewardedGenerations = 0;
  } else {
    applyRunUpgradesToConfigs();
  }

  refreshShop();
  saveGame(meta, population);
}

function buyPermanent(id: PermanentUpgradeId): void {
  const result = tryPurchasePermanent(meta.permanent, meta.economy.prestigeCurrency, id);
  if (!result.purchased) return;
  meta.economy.prestigeCurrency -= result.spent;
  refreshShop();
  saveGame(meta, population);
}

function doRetire(): void {
  const preview = legacyPointsForRetirement(meta.economy.runCurrencyEarned);
  const ok = window.confirm(
    `Retire this run for ${preview} Legacy Points?\n\nCredits and run upgrades reset to zero. ` +
      `Legacy Points and permanent bonuses carry over.`
  );
  if (!ok) return;

  const seedGenome = meta.permanent.inheritedGenes > 0 ? cloneGenome(population.bestEverGenome) : null;

  retire(meta.economy);
  meta.upgrades = createUpgradeLevels();
  meta.retirements += 1;
  meta.rewardedGenerations = 0;

  physics = { ...basePhysics };
  netCfg = { ...baseNetCfg };
  popCfg = { ...basePopCfg };

  population = createPopulation(track, netCfg, popCfg);
  if (seedGenome) {
    population.vehicles = seedPopulationWithInheritance(track, netCfg, popCfg, seedGenome, popCfg.mutationMagnitude);
    population.bestEverGenome = cloneGenome(seedGenome);
  }

  refreshShop();
  saveGame(meta, population);
}

// Simulation is driven by setInterval, NOT requestAnimationFrame: rAF is
// suspended by the browser whenever the tab is hidden/backgrounded, which
// would silently stop an "idle" game's progress the moment it's minimized.
// setInterval keeps ticking (throttled, not halted) in the background, and
// the fixed-timestep accumulator below catches up on however much real time
// actually elapsed between calls.
function simTick(): void {
  const now = performance.now();
  const realDt = Math.min((now - lastSimTime) / 1000, 1);
  lastSimTime = now;
  accumulator += realDt;

  let ticks = 0;
  while (accumulator >= fixedDt && ticks < 4000) {
    for (let i = 0; i < speedMultiplier; i++) {
      popCfg.mutationMagnitude = effectiveMutationMagnitude(basePopCfg.mutationMagnitude, population.generation, meta.upgrades);
      stepPopulation(population, track, physics, netCfg, popCfg, fixedDt);
    }
    accumulator -= fixedDt;
    ticks++;
  }

  const prestigeMult = currencyMultiplierFor(meta.permanent);
  meta.rewardedGenerations = collectGenerationRewards(population, track, meta.economy, prestigeMult, meta.rewardedGenerations);

  updateHud();
  refreshShop();
}

function updateHud(): void {
  document.getElementById("gen-label")!.textContent = `Generation ${population.generation}`;
  document.getElementById("fitness-label")!.textContent =
    `Best: ${Math.round(population.bestEverFitness)} / ${Math.round(track.totalLength)}`;
  document.getElementById("currency-label")!.textContent =
    `Credits: ${meta.economy.currency}  |  Legacy: ${meta.economy.prestigeCurrency}`;
}

function renderLoop(): void {
  draw();
  requestAnimationFrame(renderLoop);
}

function draw(): void {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  renderTrack(ctx, track, canvas.width, canvas.height);
  renderPopulation(ctx, population, physics);
  drawFitnessSparkline(ctx, canvas.width - 216, 10, 206, 68, population.fitnessHistory);
  drawWeightHeatmap(ctx, canvas.width - 216, 96, 106, 106, population.bestEverGenome);
}

function showOfflineOverlay(show: boolean): void {
  offlineOverlay.style.display = show ? "flex" : "none";
}

function updateOfflineOverlay(done: number, total: number): void {
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 100;
  offlineOverlay.textContent = `Catching up on offline progress… ${pct}%`;
}

async function init(): Promise<void> {
  const saved = loadGame();

  if (saved) {
    meta = metaFromSaveData(saved);
    applyRunUpgradesToConfigs();
    population = populationFromSaveData(track, saved.population);

    const offlineSeconds = computeOfflineSeconds(Date.now(), saved.savedAt);
    if (offlineSeconds > 5) {
      showOfflineOverlay(true);
      updateOfflineOverlay(0, offlineSeconds);
      const prestigeMult = currencyMultiplierFor(meta.permanent);
      meta.rewardedGenerations = await runOfflineReplay({
        pop: population,
        track,
        physics,
        netCfg,
        popCfg,
        economy: meta.economy,
        prestigeMultiplier: prestigeMult,
        upgradeLevels: meta.upgrades,
        baseMutationMagnitude: basePopCfg.mutationMagnitude,
        rewardedGenerations: meta.rewardedGenerations,
        totalSeconds: offlineSeconds,
        onProgress: updateOfflineOverlay,
      });
      showOfflineOverlay(false);
    }
  } else {
    population = createPopulation(track, netCfg, popCfg);
  }

  buildHud();
  buildShop();
  updateHud();

  setInterval(simTick, 33);
  requestAnimationFrame(renderLoop);
  setInterval(() => saveGame(meta, population), 15000);
  window.addEventListener("beforeunload", () => saveGame(meta, population));
}

init();
