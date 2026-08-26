import type { Population } from "./population";
import type { Track } from "./track";

// Currency ("Credits"). Pure, headless — no DOM/localStorage here.

export interface EconomyState {
  currency: number; // spendable this run
  totalCurrencyEarned: number; // lifetime, across all runs — stats only, never reset
  runCurrencyEarned: number; // this run only — resets on retire, basis for Legacy Points payout
  prestigeCurrency: number; // "Legacy Points" — permanent, survives retirement
}

export function createEconomyState(): EconomyState {
  return { currency: 0, totalCurrencyEarned: 0, runCurrencyEarned: 0, prestigeCurrency: 0 };
}

// Reward for one completed generation. `currentBestFitness` is the
// population's best-ever arc-length progress as of that generation (i.e. the
// value population.ts just pushed onto fitnessHistory) — using the
// cumulative standing rather than a per-generation delta means a plateaued
// population still earns a trickle every generation (idle games shouldn't
// zero out the moment a run stalls), while progress toward the end of the
// row still pays a real bonus.
export function generationReward(
  currentBestFitness: number,
  trackLength: number,
  prestigeMultiplier: number
): number {
  const progressFrac = Math.max(0, Math.min(1, currentBestFitness / trackLength));
  const flatTrickle = 4;
  const distanceBonus = progressFrac * 20;
  return Math.round((flatTrickle + distanceBonus) * prestigeMultiplier);
}

export function applyGenerationReward(economy: EconomyState, reward: number): void {
  economy.currency += reward;
  economy.totalCurrencyEarned += reward;
  economy.runCurrencyEarned += reward;
}

// Walks pop.fitnessHistory from `processedCount` to its end, paying out a
// generationReward for each entry not yet rewarded, and returns the new
// processed count (== pop.fitnessHistory.length). Called after every batch
// of stepPopulation() calls — whether that's one real-time tick, a fast-
// forward burst, or an offline-progress replay — so reward logic lives in
// exactly one place regardless of who's driving the sim loop.
export function collectGenerationRewards(
  pop: Population,
  track: Track,
  economy: EconomyState,
  prestigeMultiplier: number,
  processedCount: number
): number {
  for (let i = processedCount; i < pop.fitnessHistory.length; i++) {
    applyGenerationReward(economy, generationReward(pop.fitnessHistory[i], track.totalLength, prestigeMultiplier));
  }
  return pop.fitnessHistory.length;
}
