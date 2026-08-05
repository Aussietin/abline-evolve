import type { Genome, NeuralNetConfig, Vehicle, VehiclePhysicsConfig } from "./types";
import type { Track } from "./track";
import { randomGenome, mutate, cloneGenome } from "./genome";
import { weightCount } from "./neuralnet";
import { spawnVehicle, stepVehicle } from "./vehicle";

export interface PopulationConfig {
  size: number;
  mutationRate: number;
  mutationMagnitude: number;
  maxGenerationSeconds: number;
}

export interface Population {
  vehicles: Vehicle[];
  generation: number;
  genSeconds: number;
  bestEverGenome: Genome;
  bestEverFitness: number;
  currentBestIndex: number;
  fitnessHistory: number[]; // best fitness per completed generation
}

export function createPopulation(
  track: Track,
  netCfg: NeuralNetConfig,
  popCfg: PopulationConfig
): Population {
  const size = weightCount(netCfg);
  const vehicles: Vehicle[] = [];
  for (let i = 0; i < popCfg.size; i++) {
    vehicles.push(spawnVehicle(track, randomGenome(size)));
  }
  return {
    vehicles,
    generation: 1,
    genSeconds: 0,
    bestEverGenome: cloneGenome(vehicles[0].genome),
    bestEverFitness: 0,
    currentBestIndex: 0,
    fitnessHistory: [],
  };
}

export function stepPopulation(
  pop: Population,
  track: Track,
  physics: VehiclePhysicsConfig,
  netCfg: NeuralNetConfig,
  popCfg: PopulationConfig,
  dt: number
): void {
  let anyAlive = false;
  for (const v of pop.vehicles) {
    stepVehicle(v, track, physics, netCfg, dt);
    if (v.alive) anyAlive = true;
  }
  pop.genSeconds += dt;

  let bestIdx = 0;
  let bestFitness = -Infinity;
  for (let i = 0; i < pop.vehicles.length; i++) {
    const f = pop.vehicles[i].arcProgress;
    if (f > bestFitness) {
      bestFitness = f;
      bestIdx = i;
    }
  }
  pop.currentBestIndex = bestIdx;

  if (!anyAlive || pop.genSeconds >= popCfg.maxGenerationSeconds) {
    endGeneration(pop, track, popCfg, bestFitness);
  }
}

function endGeneration(pop: Population, track: Track, popCfg: PopulationConfig, bestFitness: number): void {
  const champion = pop.vehicles[pop.currentBestIndex].genome;
  if (bestFitness > pop.bestEverFitness) {
    pop.bestEverFitness = bestFitness;
    pop.bestEverGenome = cloneGenome(champion);
  }
  pop.fitnessHistory.push(pop.bestEverFitness);

  const nextVehicles: Vehicle[] = [];
  nextVehicles.push(spawnVehicle(track, cloneGenome(pop.bestEverGenome))); // unmutated control
  for (let i = 1; i < popCfg.size; i++) {
    const mutated = mutate(pop.bestEverGenome, popCfg.mutationRate, popCfg.mutationMagnitude);
    nextVehicles.push(spawnVehicle(track, mutated));
  }

  pop.vehicles = nextVehicles;
  pop.generation += 1;
  pop.genSeconds = 0;
  pop.currentBestIndex = 0;
}
