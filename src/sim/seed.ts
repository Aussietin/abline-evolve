import type { Genome, NeuralNetConfig, Vehicle } from "./types";
import type { PopulationConfig } from "./population";
import type { Track } from "./track";
import { randomGenome, mutate, cloneGenome } from "./genome";
import { weightCount } from "./neuralnet";
import { spawnVehicle } from "./vehicle";

// Builds a starting-population vehicle array for a fresh run where the
// "Inherited Genes" prestige upgrade is owned: half the population starts as
// mutated variants of the retiring run's champion (one unmutated copy plus
// gaussian variants), the rest as pure-random genomes — same shape as
// population.ts's own generation rollover, just used once at run start
// instead of every generation. Kept out of population.ts so the core MVP
// evolution loop stays untouched.
export function seedPopulationWithInheritance(
  track: Track,
  netCfg: NeuralNetConfig,
  popCfg: PopulationConfig,
  championGenome: Genome,
  mutationMagnitude: number
): Vehicle[] {
  const vehicles: Vehicle[] = [];
  const inheritedCount = Math.max(1, Math.floor(popCfg.size * 0.5));

  vehicles.push(spawnVehicle(track, cloneGenome(championGenome)));
  for (let i = 1; i < inheritedCount; i++) {
    vehicles.push(spawnVehicle(track, mutate(championGenome, 0.3, mutationMagnitude)));
  }

  const freshSize = weightCount(netCfg);
  for (let i = inheritedCount; i < popCfg.size; i++) {
    vehicles.push(spawnVehicle(track, randomGenome(freshSize)));
  }

  return vehicles;
}
