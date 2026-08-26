import type { NeuralNetConfig, VehiclePhysicsConfig } from "./types";
import type { Track } from "./track";
import type { Population, PopulationConfig } from "./population";
import { stepPopulation } from "./population";
import type { EconomyState } from "./economy";
import { collectGenerationRewards } from "./economy";
import type { UpgradeLevels } from "./upgrades";
import { effectiveMutationMagnitude } from "./upgrades";

// Headless generation-advance used for both offline-progress catch-up and
// (potentially) any future non-rendered fast-forward. No DOM/timer
// awareness here — a caller that wants to avoid blocking the main thread
// for hours of offline time should call this repeatedly with small
// `seconds` chunks and yield between calls (see game/offlineProgress.ts).
export interface HeadlessAdvanceResult {
  secondsSimulated: number;
  rewardedGenerations: number; // new watermark into pop.fitnessHistory — pass back in next call
}

export function advanceHeadless(
  pop: Population,
  track: Track,
  physics: VehiclePhysicsConfig,
  netCfg: NeuralNetConfig,
  popCfg: PopulationConfig,
  economy: EconomyState,
  prestigeMultiplier: number,
  upgradeLevels: UpgradeLevels,
  baseMutationMagnitude: number,
  processedGenerations: number,
  seconds: number,
  dt: number = 1 / 60
): HeadlessAdvanceResult {
  let remaining = seconds;
  while (remaining > 1e-9) {
    popCfg.mutationMagnitude = effectiveMutationMagnitude(baseMutationMagnitude, pop.generation, upgradeLevels);
    stepPopulation(pop, track, physics, netCfg, popCfg, dt);
    remaining -= dt;
  }
  const rewardedGenerations = collectGenerationRewards(pop, track, economy, prestigeMultiplier, processedGenerations);
  return { secondsSimulated: seconds - Math.max(remaining, 0), rewardedGenerations };
}
