import type { NeuralNetConfig, VehiclePhysicsConfig } from "./sim/types";
import { paddockField01 } from "./content/tracks";
import { createPopulation, stepPopulation, type Population, type PopulationConfig } from "./sim/population";
import { cloneGenome } from "./sim/genome";
import { rowIndexAtArc, distanceToNearestWall, projectArcLength } from "./sim/track";
import { hardObstacleHit, obstacleSpeedMultiplierAt } from "./sim/obstacles";
import {
  renderTrack,
  renderPopulation,
  renderObstacles,
  renderSwathLayer,
  stampTireTracks,
  updateAndRenderParticles,
  emitExhaust,
  emitDust,
  emitCrashDebris,
  emitMilestoneSparks,
  fadeSwathLayer,
} from "./game/render";
import {
  drawFitnessSparkline,
  drawWeightHeatmap,
  drawCockpitTelemetry,
} from "./ui/transparency";
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
import { sound } from "./game/audio";

const track = paddockField01();

const basePhysics: VehiclePhysicsConfig = {
  maxSpeed: 95,
  maxAccel: 65,
  maxTurnRate: 2.0,
  radius: 9,
  sensorCount: 5,
  sensorRange: 140,
  sensorFanDegrees: 160,
};

const baseNetCfg: NeuralNetConfig = {
  inputSize: basePhysics.sensorCount * 2 + 1,
  hiddenSize: 8,
  outputSize: 2,
};

const basePopCfg: PopulationConfig = {
  size: 24,
  mutationRate: 0.2,
  mutationMagnitude: 0.4,
  maxGenerationSeconds: 12,
};

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
const shopPanel = document.getElementById("shop-panel")!;
const offlineOverlay = document.getElementById("offline-overlay")!;
const offlineText = document.getElementById("offline-text")!;
const offlineBar = document.getElementById("offline-bar")!;
const notificationsContainer = document.getElementById("floating-notifications")!;
const driveHelper = document.getElementById("drive-helper")!;

let speedMultiplier = 1;
const fixedDt = 1 / 60;
let accumulator = 0;
let lastSimTime = performance.now();
let lastRecordDistance = 0;
let lastAnnouncedRow = 1;
let lastGeneration = 1;

// Camera state
type CameraMode = "overview" | "follow";
let cameraMode: CameraMode = "overview";
let camX = 450;
let camY = 300;

// Manual test drive vehicle state
let manualDriveActive = false;
interface ManualTractor {
  x: number;
  y: number;
  heading: number;
  speed: number;
  steer: number;
  throttle: number;
  alive: boolean;
  timeAlive: number;
  arcProgress: number;
}
let manualVehicle: ManualTractor | null = null;
const keysPressed: Record<string, boolean> = {};

function initManualVehicle(): void {
  manualVehicle = {
    x: track.startPose.x,
    y: track.startPose.y,
    heading: track.startPose.heading,
    speed: 0,
    steer: 0,
    throttle: 0,
    alive: true,
    timeAlive: 0,
    arcProgress: 0,
  };
}

function showToast(message: string): void {
  if (!notificationsContainer) return;
  const toast = document.createElement("div");
  toast.className = "notification-toast";
  toast.textContent = message;
  notificationsContainer.appendChild(toast);
  setTimeout(() => toast.remove(), 2300);
}

function setupEventListeners(): void {
  // Speed buttons
  const speeds = [1, 2, 5, 16];
  speeds.forEach((s) => {
    const btn = document.getElementById(`speed-${s}x`);
    if (btn) {
      btn.addEventListener("click", () => {
        sound.playClick();
        setSpeed(s);
      });
    }
  });

  // Camera toggle
  const camBtn = document.getElementById("cam-toggle");
  if (camBtn) {
    camBtn.addEventListener("click", () => {
      sound.playClick();
      cameraMode = cameraMode === "overview" ? "follow" : "overview";
      document.getElementById("cam-label")!.textContent = cameraMode === "overview" ? "Overview" : "Follow Cam";
      camBtn.classList.toggle("active", cameraMode === "follow");
    });
  }

  // Drive mode toggle
  const driveBtn = document.getElementById("drive-toggle");
  if (driveBtn) {
    driveBtn.addEventListener("click", () => {
      sound.playClick();
      manualDriveActive = !manualDriveActive;
      driveBtn.classList.toggle("active", manualDriveActive);
      driveHelper.style.display = manualDriveActive ? "block" : "none";
      if (manualDriveActive) {
        initManualVehicle();
        showToast("🚜 Manual Test Drive Engaged!");
      }
    });
  }

  // Audio mute toggle
  const audioBtn = document.getElementById("audio-toggle");
  const audioIcon = document.getElementById("audio-icon");
  if (audioBtn && audioIcon) {
    const updateIcon = () => {
      audioIcon.textContent = sound.isMuted() ? "🔇" : "🔊";
    };
    updateIcon();
    audioBtn.addEventListener("click", () => {
      sound.toggleMute();
      updateIcon();
    });
  }

  // Shop drawer toggle
  const shopToggle = document.getElementById("shop-toggle");
  if (shopToggle) {
    shopToggle.addEventListener("click", () => {
      sound.playClick();
      shopPanel.classList.toggle("open");
    });
  }

  // Keyboard controls for test driving & shortcuts
  window.addEventListener("keydown", (e) => {
    keysPressed[e.code] = true;
    if (e.code === "KeyM") {
      sound.toggleMute();
      if (audioIcon) audioIcon.textContent = sound.isMuted() ? "🔇" : "🔊";
    }
    if (e.code === "KeyC") {
      cameraMode = cameraMode === "overview" ? "follow" : "overview";
      document.getElementById("cam-label")!.textContent = cameraMode === "overview" ? "Overview" : "Follow Cam";
      if (camBtn) camBtn.classList.toggle("active", cameraMode === "follow");
    }
  });

  window.addEventListener("keyup", (e) => {
    keysPressed[e.code] = false;
  });
}

function setSpeed(mult: number): void {
  speedMultiplier = mult;
  document.querySelectorAll("#viewport-controls button[id^='speed-']").forEach((btn) => btn.classList.remove("active"));
  document.getElementById(`speed-${mult}x`)?.classList.add("active");
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
  sound.playPurchase();

  if (id === "neuralExpansion") {
    netCfg = { ...baseNetCfg, hiddenSize2: effectiveHiddenSize2(meta.upgrades) };
    population = createPopulation(track, netCfg, popCfg);
    meta.rewardedGenerations = 0;
    showToast("🧠 Neural Expansion Activated!");
  } else {
    applyRunUpgradesToConfigs();
    showToast("⚡ Upgrade Installed!");
  }

  refreshShop();
  saveGame(meta, population);
}

function buyPermanent(id: PermanentUpgradeId): void {
  const result = tryPurchasePermanent(meta.permanent, meta.economy.prestigeCurrency, id);
  if (!result.purchased) return;
  meta.economy.prestigeCurrency -= result.spent;
  sound.playPurchase();
  showToast("🌟 Legacy Tech Unlocked!");
  refreshShop();
  saveGame(meta, population);
}

function doRetire(): void {
  const preview = legacyPointsForRetirement(meta.economy.runCurrencyEarned);
  const ok = window.confirm(
    `Retire fleet for +${preview} Legacy Points?\n\nCredits and run upgrades will reset. Legacy Points and permanent upgrades are kept.`
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

  fadeSwathLayer();
  sound.playMilestone();
  showToast(`🌾 Retired! +${preview} Legacy Points Awarded`);

  refreshShop();
  saveGame(meta, population);
}

function stepManualVehicle(dt: number): void {
  if (!manualVehicle || !manualVehicle.alive) return;

  // Steering
  let steerTarget = 0;
  if (keysPressed["KeyA"] || keysPressed["ArrowLeft"]) steerTarget -= 1;
  if (keysPressed["KeyD"] || keysPressed["ArrowRight"]) steerTarget += 1;
  manualVehicle.steer = steerTarget;

  // Throttle
  let throttle = 0;
  if (keysPressed["KeyW"] || keysPressed["ArrowUp"]) throttle += 1;
  if (keysPressed["KeyS"] || keysPressed["ArrowDown"]) throttle -= 0.6;
  manualVehicle.throttle = throttle;

  const speedMult = obstacleSpeedMultiplierAt(population.obstacles, manualVehicle);
  const effectiveMaxSpeed = physics.maxSpeed * speedMult;

  manualVehicle.speed += throttle * physics.maxAccel * dt;
  manualVehicle.speed = Math.max(-15, Math.min(effectiveMaxSpeed, manualVehicle.speed));

  const turnScale = 0.35 + 0.65 * (Math.abs(manualVehicle.speed) / physics.maxSpeed);
  manualVehicle.heading += manualVehicle.steer * physics.maxTurnRate * turnScale * dt;

  manualVehicle.x += Math.cos(manualVehicle.heading) * manualVehicle.speed * dt;
  manualVehicle.y += Math.sin(manualVehicle.heading) * manualVehicle.speed * dt;
  manualVehicle.timeAlive += dt;

  const arc = projectArcLength(track, manualVehicle);
  if (arc > manualVehicle.arcProgress) manualVehicle.arcProgress = arc;

  // Collisions
  if (
    distanceToNearestWall(track, manualVehicle) < physics.radius ||
    hardObstacleHit(population.obstacles, manualVehicle, physics.radius)
  ) {
    manualVehicle.alive = false;
    sound.playCrash();
    emitCrashDebris(manualVehicle.x, manualVehicle.y);
    showToast("💥 Manual tractor crashed! Resetting in 1s...");
    setTimeout(() => {
      if (manualDriveActive) initManualVehicle();
    }, 1000);
  }
}

function simTick(): void {
  const now = performance.now();
  const realDt = Math.min((now - lastSimTime) / 1000, 1);
  lastSimTime = now;
  accumulator += realDt;

  let ticks = 0;
  while (accumulator >= fixedDt && ticks < 4000) {
    for (let i = 0; i < speedMultiplier; i++) {
      popCfg.mutationMagnitude = effectiveMutationMagnitude(
        basePopCfg.mutationMagnitude,
        population.generation,
        meta.upgrades
      );
      stepPopulation(population, track, physics, netCfg, popCfg, fixedDt);

      if (manualDriveActive) {
        stepManualVehicle(fixedDt);
      }
    }
    accumulator -= fixedDt;
    ticks++;
  }

  // Stamp tire tracks for living vehicles
  stampTireTracks(population, physics);

  // Rewards and milestones
  const oldBalance = meta.economy.currency;
  const prestigeMult = currencyMultiplierFor(meta.permanent);
  meta.rewardedGenerations = collectGenerationRewards(
    population,
    track,
    meta.economy,
    prestigeMult,
    meta.rewardedGenerations
  );
  const earned = meta.economy.currency - oldBalance;
  if (earned > 0) {
    showToast(`+${earned} Credits!`);
  }

  // Detect generation advancement
  if (population.generation > lastGeneration) {
    lastGeneration = population.generation;
    fadeSwathLayer();
  }

  // Check for new distance records
  if (population.bestEverFitness > lastRecordDistance + 60) {
    lastRecordDistance = population.bestEverFitness;
    sound.playMilestone();
    const champion = population.vehicles[population.currentBestIndex];
    if (champion) emitMilestoneSparks(champion.x, champion.y);
    showToast(`🏆 New Fleet Record: ${Math.round(population.bestEverFitness)} m!`);
  }

  // Check for row completion
  const champion = population.vehicles[population.currentBestIndex];
  if (champion) {
    const currentRow = rowIndexAtArc(track, champion.arcProgress);
    if (currentRow > lastAnnouncedRow) {
      lastAnnouncedRow = currentRow;
      sound.playMilestone();
      showToast(`🚩 Row ${currentRow}/${track.rowCount} Entered!`);
    }
  }

  // Modulate engine sound pitch based on champion speed
  const champSpeed = champion?.alive ? champion.speed / physics.maxSpeed : 0;
  sound.updateEngine(champSpeed, true);

  updateHud();
  refreshShop();
}

function updateHud(): void {
  document.getElementById("gen-label")!.textContent = `Gen ${population.generation}`;
  const champion = population.vehicles[population.currentBestIndex];
  const currentRow = champion ? rowIndexAtArc(track, champion.arcProgress) : 1;
  document.getElementById("row-label")!.textContent = `Row ${currentRow}/${track.rowCount}`;
  document.getElementById("fitness-label")!.textContent = `${Math.round(population.bestEverFitness)} m`;
  document.getElementById("credits-value")!.textContent = `${meta.economy.currency}`;
  document.getElementById("legacy-value")!.textContent = `${meta.economy.prestigeCurrency} LP`;
}

function renderLoop(): void {
  draw();
  requestAnimationFrame(renderLoop);
}

function draw(): void {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const champion = population.vehicles[population.currentBestIndex];

  // Camera handling
  if (cameraMode === "follow" && champion && champion.alive) {
    const targetCamX = champion.x;
    const targetCamY = champion.y;
    camX += (targetCamX - camX) * 0.08;
    camY += (targetCamY - camY) * 0.08;

    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(1.7, 1.7);
    ctx.translate(-camX, -camY);

    // World-space rendering
    renderTrack(ctx, track, canvas.width, canvas.height);
    renderSwathLayer(ctx, canvas.width, canvas.height);
    renderObstacles(ctx, population.obstacles, population.obstacleGenId, canvas.width, canvas.height);
    renderPopulation(ctx, population, physics, manualDriveActive ? manualVehicle : null);
    updateAndRenderParticles(ctx, 1 / 60);

    ctx.restore();
  } else {
    // Overview mode (full field)
    renderTrack(ctx, track, canvas.width, canvas.height);
    renderSwathLayer(ctx, canvas.width, canvas.height);
    renderObstacles(ctx, population.obstacles, population.obstacleGenId, canvas.width, canvas.height);
    renderPopulation(ctx, population, physics, manualDriveActive ? manualVehicle : null);
    updateAndRenderParticles(ctx, 1 / 60);
  }

  // Particle emission for living vehicles
  if (champion && champion.alive) {
    emitExhaust(champion.x, champion.y, champion.heading, champion.lastThrottle ?? 0.8);
    if (champion.speed > 15) emitDust(champion.x, champion.y, champion.heading);
  }

  // Screen-space AgTech Cockpit HUD Widgets
  drawCockpitTelemetry(ctx, 14, 14, 180, 84, champion, physics, track);
  drawFitnessSparkline(ctx, canvas.width - 200, 14, 186, 68, population.fitnessHistory);
  drawWeightHeatmap(ctx, canvas.width - 120, 94, 106, 88, population.bestEverGenome);
}

function showOfflineOverlay(show: boolean): void {
  offlineOverlay.style.display = show ? "flex" : "none";
}

function updateOfflineOverlay(done: number, total: number): void {
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 100;
  offlineText.textContent = `Catching up on offline fleet progress… ${pct}%`;
  offlineBar.style.width = `${pct}%`;
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

  setupEventListeners();
  buildShop();
  updateHud();

  setInterval(simTick, 33);
  requestAnimationFrame(renderLoop);
  setInterval(() => saveGame(meta, population), 15000);
  window.addEventListener("beforeunload", () => saveGame(meta, population));
}

init();
