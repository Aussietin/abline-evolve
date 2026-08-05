import type { Genome, NeuralNetConfig } from "./types";

// Tiny fixed-topology feedforward net: input -> hidden (tanh) -> output (tanh).
// Weights/biases live flattened in Genome.weights; this module only evaluates.

export function weightCount(cfg: NeuralNetConfig): number {
  const w1 = cfg.inputSize * cfg.hiddenSize;
  const b1 = cfg.hiddenSize;
  const w2 = cfg.hiddenSize * cfg.outputSize;
  const b2 = cfg.outputSize;
  return w1 + b1 + w2 + b2;
}

function tanh(x: number): number {
  return Math.tanh(x);
}

export function forward(cfg: NeuralNetConfig, genome: Genome, inputs: number[]): number[] {
  const w = genome.weights;
  let offset = 0;

  const hidden = new Array(cfg.hiddenSize).fill(0);
  for (let h = 0; h < cfg.hiddenSize; h++) {
    let sum = 0;
    for (let i = 0; i < cfg.inputSize; i++) {
      sum += inputs[i] * w[offset + h * cfg.inputSize + i];
    }
    hidden[h] = sum;
  }
  offset += cfg.inputSize * cfg.hiddenSize;
  for (let h = 0; h < cfg.hiddenSize; h++) {
    hidden[h] = tanh(hidden[h] + w[offset + h]);
  }
  offset += cfg.hiddenSize;

  const output = new Array(cfg.outputSize).fill(0);
  for (let o = 0; o < cfg.outputSize; o++) {
    let sum = 0;
    for (let h = 0; h < cfg.hiddenSize; h++) {
      sum += hidden[h] * w[offset + o * cfg.hiddenSize + h];
    }
    output[o] = sum;
  }
  offset += cfg.hiddenSize * cfg.outputSize;
  for (let o = 0; o < cfg.outputSize; o++) {
    output[o] = tanh(output[o] + w[offset + o]);
  }

  return output;
}
