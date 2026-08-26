import type { Genome } from "./types";
import type { Track } from "./track";
import type { Population } from "./population";
import { spawnVehicle } from "./vehicle";
import { createEconomyState, type EconomyState } from "./economy";
import { createUpgradeLevels, type UpgradeLevels } from "./upgrades";
import { createPermanentUpgrades, type PermanentUpgradeLevels } from "./prestige";

// Meta-progression state: everything that isn't already carried by
// population.ts's own Population object (vehicles/generation/fitness). Kept
// as one plain object so main.ts has a single thing to pass around, save,
// and reset on retire.
export interface MetaState {
  economy: EconomyState;
  upgrades: UpgradeLevels;
  permanent: PermanentUpgradeLevels;
  retirements: number;
  rewardedGenerations: number; // watermark into pop.fitnessHistory already paid out
}

export function createMetaState(): MetaState {
  return {
    economy: createEconomyState(),
    upgrades: createUpgradeLevels(),
    permanent: createPermanentUpgrades(),
    retirements: 0,
    rewardedGenerations: 0,
  };
}

export const MAX_OFFLINE_SECONDS = 10 * 3600; // 10 hours — long enough to reward "away for the day", capped so a week-old save can't hang the tab

export function computeOfflineSeconds(nowMs: number, savedAtMs: number, capSeconds: number = MAX_OFFLINE_SECONDS): number {
  const elapsed = (nowMs - savedAtMs) / 1000;
  return Math.max(0, Math.min(capSeconds, elapsed));
}

// --- Save data: plain-JSON shape, pure transforms only (no localStorage) --

export interface SaveData {
  version: 1;
  savedAt: number; // epoch ms
  meta: MetaState;
  population: {
    generation: number;
    bestEverFitness: number;
    bestEverGenome: number[];
    fitnessHistory: number[];
    genomes: number[][];
  };
}

export function toSaveData(meta: MetaState, pop: Population, nowMs: number): SaveData {
  return {
    version: 1,
    savedAt: nowMs,
    meta: {
      economy: { ...meta.economy },
      upgrades: { ...meta.upgrades },
      permanent: { ...meta.permanent },
      retirements: meta.retirements,
      rewardedGenerations: meta.rewardedGenerations,
    },
    population: {
      generation: pop.generation,
      bestEverFitness: pop.bestEverFitness,
      bestEverGenome: Array.from(pop.bestEverGenome.weights),
      fitnessHistory: [...pop.fitnessHistory],
      genomes: pop.vehicles.map((v) => Array.from(v.genome.weights)),
    },
  };
}

export function metaFromSaveData(data: SaveData): MetaState {
  return {
    economy: { ...data.meta.economy },
    upgrades: { ...data.meta.upgrades },
    permanent: { ...data.meta.permanent },
    retirements: data.meta.retirements,
    rewardedGenerations: data.meta.rewardedGenerations,
  };
}

// Rebuilds a Population from saved genomes. Vehicles restart at the top of
// their (saved) generation rather than mid-run — a save can only capture
// genomes cleanly at a fresh spawn, so at most a few in-progress seconds of
// that one generation are lost, never anything about the champion itself.
export function populationFromSaveData(track: Track, saved: SaveData["population"]): Population {
  const genomes: Genome[] = saved.genomes.map((g) => ({ weights: Float32Array.from(g) }));
  const vehicles = genomes.map((g) => spawnVehicle(track, g));
  return {
    vehicles,
    generation: saved.generation,
    genSeconds: 0,
    bestEverGenome: { weights: Float32Array.from(saved.bestEverGenome) },
    bestEverFitness: saved.bestEverFitness,
    currentBestIndex: 0,
    fitnessHistory: [...saved.fitnessHistory],
  };
}
