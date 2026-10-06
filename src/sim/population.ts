import type { Genome, NeuralNetConfig, Obstacle, Vehicle, VehiclePhysicsConfig } from "./types";
import type { Track } from "./track";
import { randomGenome, mutate, cloneGenome } from "./genome";
import { weightCount } from "./neuralnet";
import { spawnVehicle, stepVehicle } from "./vehicle";
import { generateObstacles, nextObstacleGenId } from "./obstacles";

const STALL_GRACE_SECONDS = 8; // extra seconds beyond 'progress / top speed' before a generation times out
const STAGNATION_START = 15; // generations without a new record before explorers join

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
  stagnantGens?: number; // generations since bestEverFitness last improved (drives the plateau escape)
  obstacles: Obstacle[]; // this generation's procedurally placed stumps/bog holes/washouts
  obstacleGenId: number; // bumps every time `obstacles` is (re)generated — render.ts cache key
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
    obstacles: generateObstacles(track),
    obstacleGenId: nextObstacleGenId(),
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
    stepVehicle(v, track, pop.obstacles, physics, netCfg, dt);
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

  // The clock stretches with the leader: a fixed cap (12 s ~ 1140 m at top speed)
  // made any field longer than that impossible to finish. The lead tractor earns
  // the time it needs to cover its progress, plus a grace window, so a stalled
  // fleet still times out but a working one can run the whole field.
  const allowance = Math.max(popCfg.maxGenerationSeconds, bestFitness / physics.maxSpeed + STALL_GRACE_SECONDS);
  if (!anyAlive || pop.genSeconds >= allowance) {
    endGeneration(pop, track, popCfg, bestFitness);
  }
}

function endGeneration(pop: Population, track: Track, popCfg: PopulationConfig, bestFitness: number): void {
  const champion = pop.vehicles[pop.currentBestIndex].genome;
  if (bestFitness > pop.bestEverFitness + 1) {
    pop.stagnantGens = 0;
  } else {
    pop.stagnantGens = (pop.stagnantGens ?? 0) + 1;
  }
  if (bestFitness > pop.bestEverFitness) {
    pop.bestEverFitness = bestFitness;
    pop.bestEverGenome = cloneGenome(champion);
  }
  pop.fitnessHistory.push(pop.bestEverFitness);

  const nextVehicles: Vehicle[] = [];
  nextVehicles.push(spawnVehicle(track, cloneGenome(pop.bestEverGenome))); // unmutated control
  // Plateau escape: once the record has sat still for a while, a share of the
  // fleet becomes bold explorers (bigger, wider mutations of the champion) so a
  // stuck population can find the next trick instead of polishing the same one.
  const stagnant = pop.stagnantGens ?? 0;
  const explorers = stagnant >= STAGNATION_START ? Math.ceil(popCfg.size * 0.4) : 0;
  const boldMag = Math.max(popCfg.mutationMagnitude, 0.5) * (1 + Math.min(2, (stagnant - STAGNATION_START) / 40));
  for (let i = 1; i < popCfg.size; i++) {
    const bold = i > popCfg.size - 1 - explorers;
    const mutated = bold
      ? mutate(pop.bestEverGenome, 0.5, boldMag)
      : mutate(pop.bestEverGenome, popCfg.mutationRate, popCfg.mutationMagnitude);
    nextVehicles.push(spawnVehicle(track, mutated));
  }

  pop.vehicles = nextVehicles;
  pop.generation += 1;
  pop.genSeconds = 0;
  pop.currentBestIndex = 0;
  // Fresh hazard layout every generation — the net has to react to sensor
  // input in the moment, never memorize a fixed obstacle arrangement.
  pop.obstacles = generateObstacles(track);
  pop.obstacleGenId = nextObstacleGenId();
}
