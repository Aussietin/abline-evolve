// Standalone headless test harness — no framework, run directly with:
//   node scripts/sim-tests.ts
// Node 22.7+/24 strips basic TypeScript syntax natively, so this needs no
// build step. Keep this file to erasable TS only (no enums/namespaces/
// parameter properties) so it keeps running without a compiler.
//
// Exercises the pure sim/ modules headlessly: population/economy/upgrades/
// prestige/save-load round-trip/offline-replay. Exits non-zero on failure so
// it's usable in a pre-commit hook or CI later if wanted.

import { paddockTrack01 } from "../src/content/tracks.ts";
import { createPopulation, stepPopulation, type PopulationConfig } from "../src/sim/population.ts";
import type { NeuralNetConfig, VehiclePhysicsConfig } from "../src/sim/types.ts";
import { weightCount, forward } from "../src/sim/neuralnet.ts";
import { randomGenome } from "../src/sim/genome.ts";
import {
  createEconomyState,
  generationReward,
  applyGenerationReward,
  collectGenerationRewards,
} from "../src/sim/economy.ts";
import {
  createUpgradeLevels,
  tryPurchaseUpgrade,
  upgradeCost,
  effectiveMutationMagnitude,
  effectiveSensorRange,
  effectivePopulationSize,
  effectiveHiddenSize2,
  UPGRADES,
} from "../src/sim/upgrades.ts";
import {
  createPermanentUpgrades,
  legacyPointsForRetirement,
  retire,
  currencyMultiplierFor,
  tryPurchasePermanent,
} from "../src/sim/prestige.ts";
import { seedPopulationWithInheritance } from "../src/sim/seed.ts";
import {
  createMetaState,
  computeOfflineSeconds,
  toSaveData,
  metaFromSaveData,
  populationFromSaveData,
} from "../src/sim/gamestate.ts";
import { advanceHeadless } from "../src/sim/offline.ts";

let failures = 0;
let passed = 0;

function assert(cond: boolean, msg: string): void {
  if (cond) {
    passed++;
  } else {
    failures++;
    console.error(`FAIL: ${msg}`);
  }
}

function approxEqual(a: number, b: number, eps = 1e-6): boolean {
  return Math.abs(a - b) <= eps;
}

const track = paddockTrack01();
const physics: VehiclePhysicsConfig = {
  maxSpeed: 90,
  maxAccel: 60,
  maxTurnRate: 1.8,
  radius: 9,
  sensorCount: 5,
  sensorRange: 140,
  sensorFanDegrees: 160,
};
const netCfg: NeuralNetConfig = { inputSize: physics.sensorCount + 1, hiddenSize: 8, outputSize: 2 };
const popCfg: PopulationConfig = { size: 24, mutationRate: 0.2, mutationMagnitude: 0.4, maxGenerationSeconds: 12 };

// --- neuralnet: second hidden layer stays backward-compatible ---------------
{
  const singleLayerCfg: NeuralNetConfig = { inputSize: 6, hiddenSize: 8, outputSize: 2 };
  const twoLayerCfg: NeuralNetConfig = { inputSize: 6, hiddenSize: 8, outputSize: 2, hiddenSize2: 5 };
  assert(weightCount(singleLayerCfg) === 6 * 8 + 8 + 8 * 2 + 2, "weightCount matches MVP single-layer formula");
  assert(
    weightCount(twoLayerCfg) === 6 * 8 + 8 + 8 * 5 + 5 + 5 * 2 + 2,
    "weightCount accounts for the second hidden layer"
  );
  const g1 = randomGenome(weightCount(singleLayerCfg));
  const out1 = forward(singleLayerCfg, g1, [0.1, 0.2, 0.3, 0.4, 0.5, 0.6]);
  assert(out1.length === 2 && out1.every((v) => v >= -1 && v <= 1), "single-layer forward output is 2 values in [-1,1]");
  const g2 = randomGenome(weightCount(twoLayerCfg));
  const out2 = forward(twoLayerCfg, g2, [0.1, 0.2, 0.3, 0.4, 0.5, 0.6]);
  assert(out2.length === 2 && out2.every((v) => v >= -1 && v <= 1), "two-layer forward output is 2 values in [-1,1]");
}

// --- economy ------------------------------------------------------------
{
  const econ = createEconomyState();
  assert(econ.currency === 0 && econ.prestigeCurrency === 0, "fresh economy starts at zero");

  const rewardNoProgress = generationReward(0, 1000, 1);
  const rewardHalfway = generationReward(500, 1000, 1);
  const rewardFull = generationReward(1000, 1000, 1);
  assert(rewardNoProgress > 0, "reward pays a flat trickle even with zero distance progress");
  assert(rewardHalfway > rewardNoProgress, "more distance progress pays more");
  assert(rewardFull > rewardHalfway, "full-length progress pays the most");

  const multiplied = generationReward(500, 1000, 2);
  assert(multiplied > rewardHalfway, "prestige multiplier increases reward");

  applyGenerationReward(econ, 10);
  assert(econ.currency === 10 && econ.totalCurrencyEarned === 10 && econ.runCurrencyEarned === 10, "applyGenerationReward updates all three counters");

  const pop = createPopulation(track, netCfg, popCfg);
  pop.fitnessHistory.push(100, 200, 300);
  const processed = collectGenerationRewards(pop, track, econ, 1, 0);
  assert(processed === 3, "collectGenerationRewards processes every unrewarded history entry");
  assert(econ.currency > 10, "collectGenerationRewards actually paid out currency");
  const processedAgain = collectGenerationRewards(pop, track, econ, 1, processed);
  assert(processedAgain === 3, "collectGenerationRewards is a no-op once caught up");
}

// --- upgrades -------------------------------------------------------------
{
  const levels = createUpgradeLevels();
  assert(Object.values(levels).every((v) => v === 0), "fresh upgrade levels are all zero");

  const def = UPGRADES.find((u) => u.id === "fleetSize")!;
  const cost0 = upgradeCost(def, 0)!;
  const result = tryPurchaseUpgrade(levels, cost0, "fleetSize");
  assert(result.purchased && result.spent === cost0, "purchase succeeds with exact currency");
  assert(levels.fleetSize === 1, "purchase increments the level");

  const tooPoor = tryPurchaseUpgrade(levels, 0, "fleetSize");
  assert(!tooPoor.purchased && tooPoor.spent === 0, "purchase fails without enough currency");

  const maxedLevels = createUpgradeLevels();
  const neuralDef = UPGRADES.find((u) => u.id === "neuralExpansion")!;
  maxedLevels.neuralExpansion = neuralDef.maxLevel;
  const overMax = tryPurchaseUpgrade(maxedLevels, 1_000_000, "neuralExpansion");
  assert(!overMax.purchased, "purchase fails once a single-level upgrade is maxed");

  const sensorLevels = createUpgradeLevels();
  sensorLevels.sensorRange = 1;
  assert(effectiveSensorRange(140, sensorLevels) === 140 + 25, "sensorRange upgrade adds the per-level bonus");
  assert(effectivePopulationSize(24, levels) === 24 + 4, "fleetSize upgrade (already purchased above) adds the per-level bonus");
  assert(effectiveHiddenSize2(createUpgradeLevels()) === undefined, "no neuralExpansion means no second hidden layer");
  assert(effectiveHiddenSize2(maxedLevels) === 8, "owned neuralExpansion sets a second hidden layer size");

  const baseMag = 0.4;
  const gen1 = effectiveMutationMagnitude(baseMag, 1, createUpgradeLevels());
  const gen100 = effectiveMutationMagnitude(baseMag, 100, createUpgradeLevels());
  assert(approxEqual(gen1, baseMag), "mutation magnitude at generation 1 equals the base magnitude");
  assert(gen100 < gen1, "mutation magnitude decays over generations");
  assert(gen100 >= baseMag * 0.3 - 1e-9, "mutation magnitude never decays below its floor");

  const precisionLevels = createUpgradeLevels();
  precisionLevels.precisionActuators = 3;
  const precisionGen1 = effectiveMutationMagnitude(baseMag, 1, precisionLevels);
  assert(precisionGen1 < gen1, "precisionActuators shrinks the starting mutation magnitude");

  const steadyLevels = createUpgradeLevels();
  steadyLevels.steadyHands = 5;
  const steadyGen100 = effectiveMutationMagnitude(baseMag, 100, steadyLevels);
  assert(steadyGen100 > gen100, "steadyHands slows the decay, leaving a higher magnitude at the same generation");
}

// --- prestige ---------------------------------------------------------
{
  const permanent = createPermanentUpgrades();
  assert(currencyMultiplierFor(permanent) === 1, "no permanent upgrades means a 1x currency multiplier");
  permanent.veteranInstincts = 2;
  assert(approxEqual(currencyMultiplierFor(permanent), 1.16), "veteranInstincts adds 8% per level");

  assert(legacyPointsForRetirement(0) === 0, "retiring with no earnings pays no Legacy Points");
  assert(legacyPointsForRetirement(50) === 1, "legacy points follow the sqrt(earned/50) curve");
  assert(legacyPointsForRetirement(200) === 2, "legacy points scale up with more run earnings");

  const econ = createEconomyState();
  econ.currency = 500;
  econ.runCurrencyEarned = 800;
  econ.totalCurrencyEarned = 800;
  const earned = retire(econ);
  assert(earned === legacyPointsForRetirement(800), "retire() returns the legacy points it calculated");
  assert(econ.currency === 0 && econ.runCurrencyEarned === 0, "retire() zeroes run-scoped currency");
  assert(econ.prestigeCurrency === earned, "retire() credits prestigeCurrency");
  assert(econ.totalCurrencyEarned === 800, "retire() never touches lifetime earnings");

  const permLevels = createPermanentUpgrades();
  const permCurrency = 1000;
  const buy = tryPurchasePermanent(permLevels, permCurrency, "inheritedGenes");
  assert(buy.purchased && permLevels.inheritedGenes === 1, "permanent upgrade purchase works like run upgrades");
}

// --- seed (Inherited Genes) --------------------------------------------
{
  const champion = randomGenome(weightCount(netCfg));
  const vehicles = seedPopulationWithInheritance(track, netCfg, popCfg, champion, 0.1);
  assert(vehicles.length === popCfg.size, "seeded population matches the configured size");
  assert(
    Array.from(vehicles[0].genome.weights).every((w, i) => approxEqual(w, champion.weights[i])),
    "the first seeded vehicle is an unmutated clone of the champion"
  );
  const inheritedCount = Math.max(1, Math.floor(popCfg.size * 0.5));
  const lastInherited = vehicles[inheritedCount - 1];
  const someDiffer = Array.from(lastInherited.genome.weights).some((w, i) => !approxEqual(w, champion.weights[i]));
  assert(someDiffer, "mutated inherited vehicles differ from the champion");
}

// --- gamestate: save/load round-trip ------------------------------------
{
  const pop = createPopulation(track, netCfg, popCfg);
  for (let i = 0; i < 200; i++) stepPopulation(pop, track, physics, netCfg, popCfg, 1 / 60);
  assert(pop.generation >= 1, "population advances under repeated stepping");

  const meta = createMetaState();
  meta.economy.currency = 123;
  meta.upgrades.sensorRange = 2;

  const saveData = toSaveData(meta, pop, Date.now());
  assert(saveData.version === 1, "save data is versioned");
  assert(saveData.population.genomes.length === pop.vehicles.length, "save data captures every vehicle's genome");

  const restoredMeta = metaFromSaveData(saveData);
  assert(restoredMeta.economy.currency === 123, "restored meta preserves economy state");
  assert(restoredMeta.upgrades.sensorRange === 2, "restored meta preserves upgrade levels");

  const restoredPop = populationFromSaveData(track, saveData.population);
  assert(restoredPop.generation === pop.generation, "restored population preserves generation number");
  assert(restoredPop.vehicles.length === pop.vehicles.length, "restored population preserves vehicle count");
  assert(
    approxEqual(restoredPop.bestEverGenome.weights[0], pop.bestEverGenome.weights[0]),
    "restored population's champion genome matches the saved one"
  );
  assert(restoredPop.genSeconds === 0, "restored population starts its generation fresh (no mid-generation resume)");
}

// --- offline progress -----------------------------------------------------
{
  const now = 1_700_000_000_000;
  assert(computeOfflineSeconds(now, now) === 0, "no elapsed time means zero offline seconds");
  assert(computeOfflineSeconds(now + 60_000, now) === 60, "offline seconds converts ms to seconds");
  assert(
    computeOfflineSeconds(now + 999 * 3600 * 1000, now, 100) === 100,
    "offline seconds is capped so a stale save can't hang the tab"
  );

  const pop = createPopulation(track, netCfg, popCfg);
  const econ = createEconomyState();
  const levels = createUpgradeLevels();
  const result = advanceHeadless(pop, track, physics, netCfg, popCfg, econ, 1, levels, popCfg.mutationMagnitude, 0, 20);
  assert(approxEqual(result.secondsSimulated, 20, 1e-3), "advanceHeadless simulates the requested duration");
  assert(pop.generation >= 1, "advanceHeadless actually advances the population");
}

console.log(`\n${passed} passed, ${failures} failed`);
if (failures > 0) process.exit(1);
