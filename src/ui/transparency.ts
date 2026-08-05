import type { Genome } from "../sim/types";

// The two "make the ML visible" panels: a fitness-over-generations sparkline
// and a live heatmap of the current champion genome's weights. Idle Machine
// Learning only shows a green best-bike; this exposes what's actually driving
// that green highlight.

export function drawFitnessSparkline(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  history: number[]
): void {
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = "#5a5a4a";
  ctx.strokeRect(x, y, w, h);

  if (history.length < 2) return;
  const max = Math.max(...history, 1);
  ctx.strokeStyle = "#6fd142";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  history.forEach((val, i) => {
    const px = x + (i / (history.length - 1)) * w;
    const py = y + h - (val / max) * h;
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  });
  ctx.stroke();

  ctx.fillStyle = "#c9c07a";
  ctx.font = "11px sans-serif";
  ctx.fillText("best fitness / generation", x + 4, y + 12);
}

export function drawWeightHeatmap(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  genome: Genome
): void {
  const weights = genome.weights;
  const cols = Math.ceil(Math.sqrt(weights.length));
  const rows = Math.ceil(weights.length / cols);
  const cellW = w / cols;
  const cellH = h / rows;

  let maxAbs = 1e-6;
  for (const wt of weights) maxAbs = Math.max(maxAbs, Math.abs(wt));

  for (let i = 0; i < weights.length; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const v = weights[i] / maxAbs; // -1..1
    ctx.fillStyle = v >= 0 ? `rgba(111, 209, 66, ${Math.abs(v)})` : `rgba(216, 90, 70, ${Math.abs(v)})`;
    ctx.fillRect(x + col * cellW, y + row * cellH, cellW - 1, cellH - 1);
  }

  ctx.strokeStyle = "#5a5a4a";
  ctx.strokeRect(x, y, w, h);
  ctx.fillStyle = "#c9c07a";
  ctx.font = "11px sans-serif";
  ctx.fillText("champion brain weights", x + 4, y - 4);
}
