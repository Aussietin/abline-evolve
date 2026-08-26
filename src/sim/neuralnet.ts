import type { Genome, NeuralNetConfig } from "./types";

// Tiny fixed-topology feedforward net: input -> hidden (tanh) -> output (tanh).
// Weights/biases live flattened in Genome.weights; this module only evaluates.

export function weightCount(cfg: NeuralNetConfig): number {
  const w1 = cfg.inputSize * cfg.hiddenSize;
  const b1 = cfg.hiddenSize;
  if (cfg.hiddenSize2) {
    // Neural Expansion upgrade: input -> hidden1 -> hidden2 -> output.
    const w1b = cfg.hiddenSize * cfg.hiddenSize2;
    const b1b = cfg.hiddenSize2;
    const w2 = cfg.hiddenSize2 * cfg.outputSize;
    const b2 = cfg.outputSize;
    return w1 + b1 + w1b + b1b + w2 + b2;
  }
  const w2 = cfg.hiddenSize * cfg.outputSize;
  const b2 = cfg.outputSize;
  return w1 + b1 + w2 + b2;
}

function tanh(x: number): number {
  return Math.tanh(x);
}

function denseLayer(
  inputs: number[],
  w: Float32Array,
  offset: number,
  inSize: number,
  outSize: number
): { output: number[]; nextOffset: number } {
  const out = new Array(outSize).fill(0);
  for (let o = 0; o < outSize; o++) {
    let sum = 0;
    for (let i = 0; i < inSize; i++) {
      sum += inputs[i] * w[offset + o * inSize + i];
    }
    out[o] = sum;
  }
  offset += inSize * outSize;
  for (let o = 0; o < outSize; o++) {
    out[o] = tanh(out[o] + w[offset + o]);
  }
  offset += outSize;
  return { output: out, nextOffset: offset };
}

export function forward(cfg: NeuralNetConfig, genome: Genome, inputs: number[]): number[] {
  const w = genome.weights;

  const layer1 = denseLayer(inputs, w, 0, cfg.inputSize, cfg.hiddenSize);

  if (!cfg.hiddenSize2) {
    // Original single-hidden-layer MVP path — unchanged.
    return denseLayer(layer1.output, w, layer1.nextOffset, cfg.hiddenSize, cfg.outputSize).output;
  }

  const layer2 = denseLayer(layer1.output, w, layer1.nextOffset, cfg.hiddenSize, cfg.hiddenSize2);
  return denseLayer(layer2.output, w, layer2.nextOffset, cfg.hiddenSize2, cfg.outputSize).output;
}
