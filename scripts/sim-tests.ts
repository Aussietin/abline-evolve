// Standalone headless test harness — no framework, run directly with:
//   node scripts/sim-tests.ts
// Node 22.7+/24 strips basic TypeScript syntax natively, so this needs no
// build step. Keep this file to erasable TS only (no enums/namespaces/
// parameter properties) so it keeps running without a compiler.
//
// Exercises the pure sim/ modules headlessly: population/economy/upgrades/
// prestige/save-load round-trip/offline-replay. Exits non-zero on failure so
// it's usable in a pre-commit hook or CI later if wanted.

import { paddockField01 } from "../src/content/tracks.ts";
import { createPopulation, stepPopulation, type PopulationConfig } from "../src/sim/population.ts";
import type { NeuralNetConfig, VehiclePhysicsConfig } from "../src/sim/types.ts";
import { weightCount, forward } from "../src/sim/neuralnet.ts";
import { randomGenome } from "../src/sim/genome.ts";
import { spawnVehicle, stepVehicle } from "../src/sim/vehicle.ts";
import { castObstacleSensors } from "../src/sim/sensors.ts";
import {
  generateObstacles,
  hardObstacleHit,
  obstacleSpeedMultiplierAt,
  nextObstacleGenId,
  DEFAULT_OBSTACLE_CONFIG,
} from "../src/sim/obstacles.ts";
import { buildBoustrophedonField, rowIndexAtArc } from "../src/sim/track.ts";
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

const track = paddockField01();
const physics: VehiclePhysicsConfig = {
  maxSpeed: 90,
  maxAccel: 60,
  maxTurnRate: 1.8,
  radius: 9,
  sensorCount: 5,
  sensorRange: 140,
  sensorFanDegrees: 160,
};
// v3: two sensor channels per ray (wall + obstacle) — see sensors.ts/vehicle.ts.
const netCfg: NeuralNetConfig = { inputSize: physics.sensorCount * 2 + 1, hiddenSize: 8, outputSize: 2 };
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
  assert(saveData.version === 2, "save data is versioned (bumped to 2 in v3 for the new obstacle sensor inputs)");
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

// --- v3: multi-row field geometry ------------------------------------------
{
  const field = buildBoustrophedonField(
    { rowCount: 4, rowLength: 650, rowSpacing: 90, startX: 80, startY: 120, turnSegments: 12 },
    70
  );
  assert(field.rowCount === 4, "boustrophedon field reports the configured row count");
  assert(field.rowEndDistances.length === 4, "one rowEndDistances entry per row");
  for (let i = 1; i < field.rowEndDistances.length; i++) {
    assert(field.rowEndDistances[i] > field.rowEndDistances[i - 1], "row end distances are strictly increasing");
  }
  assert(
    field.rowEndDistances[field.rowEndDistances.length - 1] === field.totalLength,
    "the last row's end distance equals the field's total length"
  );
  assert(field.totalLength > 4 * 650, "total length includes the headland turns, not just the four straight rows");

  assert(rowIndexAtArc(field, 0) === 1, "arc length 0 is in row 1");
  assert(
    rowIndexAtArc(field, field.totalLength) === field.rowCount,
    "arc length at the very end is in the last row"
  );
  assert(
    rowIndexAtArc(field, field.rowEndDistances[0] + 1) === 2,
    "arc length just past row 1's end reports row 2"
  );

  // A single-row buildTrack (no field config) still reports sane defaults —
  // multi-row support didn't regress the plain single-line case.
  const single = buildBoustrophedonField({ rowCount: 1, rowLength: 400, rowSpacing: 90, startX: 0, startY: 0 }, 70);
  assert(single.rowCount === 1 && single.rowEndDistances.length === 1, "a 1-row field behaves like a plain single line");
}

// --- v3: obstacle sensor casting -------------------------------------------
{
  const origin = { x: 0, y: 0 };
  const heading = 0; // facing +x

  const clear = castObstacleSensors(origin, heading, 5, 160, 100, []);
  assert(clear.every((r) => r === 1), "no obstacles means every obstacle-sensor ray reads fully clear (1.0)");

  const stumpAhead = castObstacleSensors(origin, heading, 5, 160, 100, [{ kind: "stump", x: 50, y: 0, radius: 10 }]);
  const centerIdx = 2; // middle ray of 5, pointing straight along heading
  assert(stumpAhead[centerIdx] < 1, "a stump directly ahead shortens the center obstacle-sensor ray");
  assert(approxEqual(stumpAhead[centerIdx], 0.4, 0.02), "the shortened reading matches distance-to-stump-edge / range");
  assert(stumpAhead[0] === 1, "a ray far off to the side of a small stump stays clear");

  const washoutAcross = castObstacleSensors(origin, heading, 5, 160, 100, [
    { kind: "washout", a: { x: 50, y: -40 }, b: { x: 50, y: 40 }, halfWidth: 8 },
  ]);
  assert(washoutAcross[centerIdx] < 1, "a washout crossing straight ahead is detected by the obstacle sensor");

  const bogAhead = castObstacleSensors(origin, heading, 5, 160, 100, [{ kind: "bog", x: 50, y: 0, radius: 10 }]);
  assert(bogAhead[centerIdx] < 1, "bog holes are sensed too, even though they're a soft (non-collision) hazard");
}

// --- v3: obstacle hazard behavior ------------------------------------------
{
  const stump = { kind: "stump" as const, x: 100, y: 100, radius: 10 };
  assert(hardObstacleHit([stump], { x: 105, y: 100 }, 9), "a point inside a stump's radius+vehicle-radius is a hard hit");
  assert(!hardObstacleHit([stump], { x: 200, y: 200 }, 9), "a point far from any obstacle is not a hard hit");

  const washout = { kind: "washout" as const, a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, halfWidth: 10 };
  assert(hardObstacleHit([washout], { x: 50, y: 0 }, 9), "a point on a washout's centerline is a hard hit");
  assert(!hardObstacleHit([washout], { x: 50, y: 100 }, 9), "a point far off a washout's line is not a hard hit");

  const bog = { kind: "bog" as const, x: 0, y: 0, radius: 20 };
  assert(!hardObstacleHit([bog], { x: 0, y: 0 }, 9), "bog holes never register as a hard hit — soft hazard only");
  assert(obstacleSpeedMultiplierAt([bog], { x: 0, y: 0 }) < 1, "standing inside a bog hole slows the effective max speed");
  assert(obstacleSpeedMultiplierAt([bog], { x: 500, y: 500 }) === 1, "outside any bog hole, speed is unaffected");

  const generated = generateObstacles(track);
  const [minStumps, maxStumps] = DEFAULT_OBSTACLE_CONFIG.stumpCount;
  const [minBogs, maxBogs] = DEFAULT_OBSTACLE_CONFIG.bogCount;
  const stumps = generated.filter((o) => o.kind === "stump");
  const bogs = generated.filter((o) => o.kind === "bog");
  assert(stumps.length >= minStumps && stumps.length <= maxStumps, "generated stump count stays within configured range");
  assert(bogs.length >= minBogs && bogs.length <= maxBogs, "generated bog count stays within configured range");
  for (const o of generated) {
    if (o.kind === "stump" || o.kind === "bog") {
      assert(o.radius < track.width / 2, "no generated circular obstacle is wide enough to fully block the corridor");
    } else {
      assert(o.halfWidth < track.width / 2, "no generated washout is wide enough to fully block the corridor");
    }
  }

  const id1 = nextObstacleGenId();
  const id2 = nextObstacleGenId();
  assert(id2 > id1, "obstacle generation ids are monotonically increasing (used as the render cache key)");
}

// --- v3: a hard obstacle actually ends a vehicle's generation --------------
{
  const genome = randomGenome(weightCount(netCfg));
  const v = spawnVehicle(track, genome);
  // Drop a stump exactly on the vehicle's own spawn point so the very first
  // step's collision check trips regardless of what the (random) genome
  // outputs for steer/throttle — proves the hard-hazard path in vehicle.ts
  // actually ends the generation, consistent with the existing wall-hit path.
  const stumpOnSpawn = [{ kind: "stump" as const, x: v.x, y: v.y, radius: physics.radius + 5 }];
  stepVehicle(v, track, stumpOnSpawn, physics, netCfg, 1 / 60);
  assert(!v.alive, "driving into a stump ends the vehicle's generation, same as a corridor-wall collision");

  const v2 = spawnVehicle(track, genome);
  stepVehicle(v2, track, [], physics, netCfg, 1 / 60);
  assert(v2.alive, "with no obstacles present, the same first step leaves the vehicle alive");
}

console.log(`\n${passed} passed, ${failures} failed`);
if (failures > 0) process.exit(1);
