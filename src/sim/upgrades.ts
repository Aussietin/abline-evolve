// Run-scoped upgrades: bought with Credits, reset on retire (see prestige.ts).
// Pure config math only — no DOM, no localStorage.

export type UpgradeId =
  | "fleetSize"
  | "sensorRange"
  | "precisionActuators"
  | "steadyHands"
  | "neuralExpansion";

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  description: string;
  maxLevel: number;
  baseCost: number;
  costGrowth: number; // cost multiplier per level already owned
}

export const UPGRADES: UpgradeDef[] = [
  {
    id: "fleetSize",
    name: "Fleet Expansion",
    description: "+4 tractors in every generation's population.",
    maxLevel: 5,
    baseCost: 40,
    costGrowth: 1.9,
  },
  {
    id: "sensorRange",
    name: "Long-Range Sensors",
    description: "+25px sensor range — spots headland turns and the mud patch sooner.",
    maxLevel: 6,
    baseCost: 30,
    costGrowth: 1.7,
  },
  {
    id: "precisionActuators",
    name: "Precision Actuators",
    description: "Smaller mutation steps — refines a good champion instead of overshooting it.",
    maxLevel: 6,
    baseCost: 35,
    costGrowth: 1.8,
  },
  {
    id: "steadyHands",
    name: "Steady Hands",
    description: "Slows the natural mutation-size decay, so the population keeps exploring for longer before it settles.",
    maxLevel: 5,
    baseCost: 50,
    costGrowth: 2.0,
  },
  {
    id: "neuralExpansion",
    name: "Neural Expansion",
    description: "Grows a second hidden layer in every brain — a smarter ceiling, at the cost of restarting the current population from scratch.",
    maxLevel: 1,
    baseCost: 500,
    costGrowth: 1,
  },
];

export type UpgradeLevels = Record<UpgradeId, number>;

export function createUpgradeLevels(): UpgradeLevels {
  return {
    fleetSize: 0,
    sensorRange: 0,
    precisionActuators: 0,
    steadyHands: 0,
    neuralExpansion: 0,
  };
}

export function upgradeCost(def: UpgradeDef, currentLevel: number): number | null {
  if (currentLevel >= def.maxLevel) return null;
  return Math.round(def.baseCost * Math.pow(def.costGrowth, currentLevel));
}

// Attempts to spend `currency` on one level of `id`. Mutates both `levels`
// and returns the currency actually spent (0 if unaffordable or maxed).
export function tryPurchaseUpgrade(
  levels: UpgradeLevels,
  currency: number,
  id: UpgradeId
): { spent: number; purchased: boolean } {
  const def = UPGRADES.find((u) => u.id === id)!;
  const cost = upgradeCost(def, levels[id]);
  if (cost === null || currency < cost) return { spent: 0, purchased: false };
  levels[id] += 1;
  return { spent: cost, purchased: true };
}

// --- Effects on the sim configs -------------------------------------------

export const SENSOR_RANGE_PER_LEVEL = 25;
export const FLEET_SIZE_PER_LEVEL = 4;
export const PRECISION_MAGNITUDE_MULT_PER_LEVEL = 0.85; // smaller mutation steps
export const NEURAL_EXPANSION_HIDDEN2_SIZE = 8;

// Mutation magnitude decays each generation (simulated-annealing style: wide
// exploration early, fine settling later), floored so it never goes fully
// static. Steady Hands slows the decay toward 1.0 (near-no-decay) as it
// levels up — "reduced mutation-rate decay" from the design brief.
const BASE_DECAY_PER_GEN = 0.985;
const MUTATION_MAGNITUDE_FLOOR_FRACTION = 0.3;

export function mutationDecayFactor(levels: UpgradeLevels): number {
  const t = levels.steadyHands / 5; // 0..1
  return BASE_DECAY_PER_GEN + (1 - BASE_DECAY_PER_GEN) * t * 0.8;
}

// The mutation magnitude to use for the generation currently in progress.
// `generation` is 1-indexed (population.ts starts at generation 1).
export function effectiveMutationMagnitude(
  baseMagnitude: number,
  generation: number,
  levels: UpgradeLevels
): number {
  const scaledBase = baseMagnitude * Math.pow(PRECISION_MAGNITUDE_MULT_PER_LEVEL, levels.precisionActuators);
  const decay = mutationDecayFactor(levels);
  const floor = scaledBase * MUTATION_MAGNITUDE_FLOOR_FRACTION;
  const decayed = scaledBase * Math.pow(decay, Math.max(0, generation - 1));
  return Math.max(floor, decayed);
}

export function effectiveSensorRange(baseRange: number, levels: UpgradeLevels): number {
  return baseRange + levels.sensorRange * SENSOR_RANGE_PER_LEVEL;
}

export function effectivePopulationSize(baseSize: number, levels: UpgradeLevels): number {
  return baseSize + levels.fleetSize * FLEET_SIZE_PER_LEVEL;
}

export function effectiveHiddenSize2(levels: UpgradeLevels): number | undefined {
  return levels.neuralExpansion > 0 ? NEURAL_EXPANSION_HIDDEN2_SIZE : undefined;
}
