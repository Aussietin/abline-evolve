import type { Genome } from "../sim/types";

// The two "make the ML visible" panels: a fitness-over-generations sparkline
// and a live heatmap of the current champion genome's weights. Idle Machine
// Learning only shows a green best-bike; this exposes what's actually driving
// that green highlight. Styled as instrumentation readouts (mono font, grid,
// corner ticks) rather than floating unlabeled boxes.

const MONO_FONT = "10px 'Consolas', 'SF Mono', monospace";
const PANEL_BG = "rgba(8, 14, 10, 0.72)";
const PANEL_BORDER = "rgba(120, 216, 200, 0.55)";
const GRID_LINE = "rgba(120, 216, 200, 0.12)";
const LABEL_COLOR = "rgba(160, 230, 210, 0.85)";

function drawPanelChrome(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, title: string): void {
  ctx.fillStyle = PANEL_BG;
  ctx.fillRect(x, y, w, h);

  // Grid: gives it a plotted-instrument look instead of a flat swatch.
  ctx.strokeStyle = GRID_LINE;
  ctx.lineWidth = 1;
  const cols = 6;
  const rows = 4;
  ctx.beginPath();
  for (let i = 1; i < cols; i++) {
    const gx = x + (i / cols) * w;
    ctx.moveTo(gx, y);
    ctx.lineTo(gx, y + h);
  }
  for (let i = 1; i < rows; i++) {
    const gy = y + (i / rows) * h;
    ctx.moveTo(x, gy);
    ctx.lineTo(x + w, gy);
  }
  ctx.stroke();

  ctx.strokeStyle = PANEL_BORDER;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

  // Corner ticks — the flight-computer/terminal-readout detail.
  const tick = 6;
  ctx.beginPath();
  for (const [cx, cy, dx, dy] of [
    [x, y, 1, 1],
    [x + w, y, -1, 1],
    [x, y + h, 1, -1],
    [x + w, y + h, -1, -1],
  ] as const) {
    ctx.moveTo(cx, cy + dy * tick);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx + dx * tick, cy);
  }
  ctx.stroke();

  ctx.fillStyle = LABEL_COLOR;
  ctx.font = "bold 10px 'Consolas', 'SF Mono', monospace";
  ctx.fillText(title.toUpperCase(), x + 6, y - 5);
}

export function drawFitnessSparkline(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  history: number[]
): void {
  drawPanelChrome(ctx, x, y, w, h, "Fitness / Gen");

  const padTop = 6;
  const padBottom = 16;
  const plotH = h - padTop - padBottom;
  const plotY = y + padTop;

  if (history.length >= 2) {
    const max = Math.max(...history, 1);
    ctx.strokeStyle = "#6fd142";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    history.forEach((val, i) => {
      const px = x + (i / (history.length - 1)) * w;
      const py = plotY + plotH - (val / max) * plotH;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    });
    ctx.stroke();

    // Fill under the curve for a proper telemetry-plot feel.
    ctx.lineTo(x + w, plotY + plotH);
    ctx.lineTo(x, plotY + plotH);
    ctx.closePath();
    ctx.fillStyle = "rgba(111, 209, 66, 0.12)";
    ctx.fill();

    ctx.fillStyle = LABEL_COLOR;
    ctx.font = MONO_FONT;
    ctx.fillText(Math.round(max).toString(), x + 4, plotY + 9);
  } else {
    ctx.fillStyle = "rgba(160, 230, 210, 0.5)";
    ctx.font = MONO_FONT;
    ctx.fillText("collecting data…", x + 6, plotY + plotH / 2);
  }

  ctx.fillStyle = LABEL_COLOR;
  ctx.font = MONO_FONT;
  ctx.fillText(`gen 1..${Math.max(history.length, 1)}`, x + 4, y + h - 5);
}

export function drawWeightHeatmap(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  genome: Genome
): void {
  drawPanelChrome(ctx, x, y, w, h, "Champion Weights");

  const pad = 4;
  const plotX = x + pad;
  const plotY = y + pad;
  const plotW = w - pad * 2;
  const plotH = h - pad * 2 - 10;

  const weights = genome.weights;
  const cols = Math.ceil(Math.sqrt(weights.length));
  const rows = Math.ceil(weights.length / cols);
  const cellW = plotW / cols;
  const cellH = plotH / rows;

  let maxAbs = 1e-6;
  for (const wt of weights) maxAbs = Math.max(maxAbs, Math.abs(wt));

  for (let i = 0; i < weights.length; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const v = weights[i] / maxAbs; // -1..1
    ctx.fillStyle = v >= 0 ? `rgba(111, 209, 66, ${Math.abs(v)})` : `rgba(216, 90, 70, ${Math.abs(v)})`;
    ctx.fillRect(plotX + col * cellW, plotY + row * cellH, cellW - 1, cellH - 1);
  }

  ctx.fillStyle = LABEL_COLOR;
  ctx.font = MONO_FONT;
  ctx.fillText(`n=${weights.length}  |w|max=${maxAbs.toFixed(2)}`, x + 4, y + h - 4);
}
