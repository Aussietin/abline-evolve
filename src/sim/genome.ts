import type { Genome } from "./types";

export function randomGenome(size: number): Genome {
  const weights = new Float32Array(size);
  for (let i = 0; i < size; i++) weights[i] = gaussian() * 0.6;
  return { weights };
}

// Gaussian noise on a random subset of weights ("rate" = fraction touched).
export function mutate(genome: Genome, rate: number, magnitude: number): Genome {
  const src = genome.weights;
  const out = new Float32Array(src.length);
  for (let i = 0; i < src.length; i++) {
    out[i] = Math.random() < rate ? src[i] + gaussian() * magnitude : src[i];
  }
  return { weights: out };
}

export function cloneGenome(genome: Genome): Genome {
  return { weights: new Float32Array(genome.weights) };
}

// Box-Muller transform, standard normal.
function gaussian(): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
