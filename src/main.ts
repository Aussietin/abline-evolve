import type { NeuralNetConfig, VehiclePhysicsConfig } from "./sim/types";
import { paddockTrack01 } from "./content/tracks";
import { createPopulation, stepPopulation, type PopulationConfig } from "./sim/population";
import { renderTrack, renderPopulation } from "./game/render";
import { drawFitnessSparkline, drawWeightHeatmap } from "./ui/transparency";

const track = paddockTrack01();

// Tractor, not a car: slower top speed, wide sensor fan, sluggish turning at
// low speed (handled in vehicle.ts) — the whole point of the theme swap.
const physics: VehiclePhysicsConfig = {
  maxSpeed: 90,
  maxAccel: 60,
  maxTurnRate: 1.8,
  radius: 9,
  sensorCount: 5,
  sensorRange: 140,
  sensorFanDegrees: 160,
};

const netCfg: NeuralNetConfig = {
  inputSize: physics.sensorCount + 1,
  hiddenSize: 8,
  outputSize: 2,
};

const popCfg: PopulationConfig = {
  size: 24,
  mutationRate: 0.2,
  mutationMagnitude: 0.4,
  maxGenerationSeconds: 12,
};

let population = createPopulation(track, netCfg, popCfg);

const canvas = document.getElementById("track-canvas") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const hud = document.getElementById("hud")!;

let speedMultiplier = 1;
const fixedDt = 1 / 60;
let accumulator = 0;
let lastSimTime = performance.now();

function buildHud(): void {
  hud.innerHTML = `
    <span id="gen-label">Generation 1</span>
    <span id="fitness-label">Best: 0</span>
    <button id="speed-1x" class="active">1x</button>
    <button id="speed-4x">4x</button>
    <button id="speed-16x">16x</button>
  `;
  document.getElementById("speed-1x")!.addEventListener("click", () => setSpeed(1));
  document.getElementById("speed-4x")!.addEventListener("click", () => setSpeed(4));
  document.getElementById("speed-16x")!.addEventListener("click", () => setSpeed(16));
}

function setSpeed(mult: number): void {
  speedMultiplier = mult;
  document.querySelectorAll("#hud button").forEach((btn) => btn.classList.remove("active"));
  document.getElementById(`speed-${mult}x`)!.classList.add("active");
}

// Simulation is driven by setInterval, NOT requestAnimationFrame: rAF is
// suspended by the browser whenever the tab is hidden/backgrounded, which
// would silently stop an "idle" game's progress the moment it's minimized.
// setInterval keeps ticking (throttled, not halted) in the background, and
// the fixed-timestep accumulator below catches up on however much real time
// actually elapsed between calls.
function simTick(): void {
  const now = performance.now();
  const realDt = Math.min((now - lastSimTime) / 1000, 1);
  lastSimTime = now;
  accumulator += realDt;

  let ticks = 0;
  while (accumulator >= fixedDt && ticks < 4000) {
    for (let i = 0; i < speedMultiplier; i++) {
      stepPopulation(population, track, physics, netCfg, popCfg, fixedDt);
    }
    accumulator -= fixedDt;
    ticks++;
  }

  document.getElementById("gen-label")!.textContent = `Generation ${population.generation}`;
  document.getElementById("fitness-label")!.textContent =
    `Best: ${Math.round(population.bestEverFitness)} / ${Math.round(track.totalLength)}`;
}

function renderLoop(): void {
  draw();
  requestAnimationFrame(renderLoop);
}

function draw(): void {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  renderTrack(ctx, track);
  renderPopulation(ctx, population, physics);
  drawFitnessSparkline(ctx, canvas.width - 210, 10, 200, 60, population.fitnessHistory);
  drawWeightHeatmap(ctx, canvas.width - 210, 90, 100, 100, population.bestEverGenome);
}

buildHud();
setInterval(simTick, 33);
requestAnimationFrame(renderLoop);
