import type { EconomyState } from "./economy";

// Retirement / prestige loop: give up the current run (population + run
// upgrades + spendable currency) for permanent, cross-run bonuses paid for
// in Legacy Points. Pure — no DOM, no localStorage.

export type PermanentUpgradeId = "veteranInstincts" | "inheritedGenes";

export interface PermanentUpgradeDef {
  id: PermanentUpgradeId;
  name: string;
  description: string;
  maxLevel: number;
  baseCost: number;
  costGrowth: number;
}

export const PERMANENT_UPGRADES: PermanentUpgradeDef[] = [
  {
    id: "veteranInstincts",
    name: "Veteran Instincts",
    description: "+8% Credits earned per generation, permanently, per level.",
    maxLevel: 5,
    baseCost: 3,
    costGrowth: 1.8,
  },
  {
    id: "inheritedGenes",
    name: "Inherited Genes",
    description: "New runs seed part of the starting population from your last champion instead of pure random genomes.",
    maxLevel: 1,
    baseCost: 5,
    costGrowth: 1,
  },
];

export type PermanentUpgradeLevels = Record<PermanentUpgradeId, number>;

export function createPermanentUpgrades(): PermanentUpgradeLevels {
  return { veteranInstincts: 0, inheritedGenes: 0 };
}

export function permanentUpgradeCost(def: PermanentUpgradeDef, currentLevel: number): number | null {
  if (currentLevel >= def.maxLevel) return null;
  return Math.round(def.baseCost * Math.pow(def.costGrowth, currentLevel));
}

export function tryPurchasePermanent(
  levels: PermanentUpgradeLevels,
  prestigeCurrency: number,
  id: PermanentUpgradeId
): { spent: number; purchased: boolean } {
  const def = PERMANENT_UPGRADES.find((u) => u.id === id)!;
  const cost = permanentUpgradeCost(def, levels[id]);
  if (cost === null || prestigeCurrency < cost) return { spent: 0, purchased: false };
  levels[id] += 1;
  return { spent: cost, purchased: true };
}

export function currencyMultiplierFor(permanent: PermanentUpgradeLevels): number {
  return 1 + permanent.veteranInstincts * 0.08;
}

// Legacy Points payout for retiring now, based on how much this run earned.
// Square-root curve: meaningful early runs still pay out something, but
// there's real diminishing returns to grinding one run forever instead of
// looping back to generation 1.
export function legacyPointsForRetirement(runCurrencyEarned: number): number {
  return Math.floor(Math.sqrt(runCurrencyEarned / 50));
}

// Retires the current run: pays out Legacy Points, zeroes spendable/run
// currency. Caller is responsible for resetting run upgrades and rebuilding
// the population (population.ts stays untouched by this module).
export function retire(economy: EconomyState): number {
  const earned = legacyPointsForRetirement(economy.runCurrencyEarned);
  economy.prestigeCurrency += earned;
  economy.currency = 0;
  economy.runCurrencyEarned = 0;
  return earned;
}
