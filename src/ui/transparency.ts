import type { Genome, Vehicle, VehiclePhysicsConfig } from "../sim/types";
import type { Track } from "../sim/track";

// High-tech AgTech GPS telemetry & neural network transparency readouts.
// Styled as precision guidance flight/field computer instrumentation.

const MONO_FONT = "10px 'Consolas', 'SF Mono', monospace";
const MONO_BOLD = "bold 11px 'Consolas', 'SF Mono', monospace";
const PANEL_BG = "rgba(10, 16, 12, 0.82)";
const PANEL_BORDER = "rgba(75, 195, 125, 0.45)";
const GRID_LINE = "rgba(75, 195, 125, 0.1)";
const LABEL_COLOR = "rgba(165, 235, 190, 0.9)";
const ACCENT_GREEN = "#55e882";
const ACCENT_YELLOW = "#ffd845";
const ACCENT_RED = "#ff6550";

function drawPanelChrome(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  title: string,
  status: string = "ACTIVE"
): void {
  ctx.save();
  ctx.fillStyle = PANEL_BG;
  ctx.fillRect(x, y, w, h);

  // Subtle instrument grid
  ctx.strokeStyle = GRID_LINE;
  ctx.lineWidth = 1;
  const cols = 5;
  const rows = 3;
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

  // Panel outer frame
  ctx.strokeStyle = PANEL_BORDER;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

  // Precision corner brackets
  const tick = 6;
  ctx.strokeStyle = ACCENT_GREEN;
  ctx.lineWidth = 1.5;
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

  // Header Title & Status
  ctx.fillStyle = LABEL_COLOR;
  ctx.font = MONO_BOLD;
  ctx.fillText(title.toUpperCase(), x + 6, y - 5);

  ctx.fillStyle = status === "ACTIVE" ? ACCENT_GREEN : ACCENT_YELLOW;
  ctx.font = MONO_FONT;
  const statusText = `[ ${status} ]`;
  const tw = ctx.measureText(statusText).width;
  ctx.fillText(statusText, x + w - tw - 4, y - 5);
  ctx.restore();
}

// Compute cross-track error (lateral distance in pixels off nearest centerline segment)
export function computeCrossTrackError(track: Track, p: { x: number; y: number }): number {
  let bestDistSq = Infinity;
  let signedError = 0;
  const { centerline } = track;

  for (let i = 0; i < centerline.length - 1; i++) {
    const a = centerline[i];
    const b = centerline[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy || 1;
    let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const projX = a.x + t * dx;
    const projY = a.y + t * dy;
    const distSq = (p.x - projX) ** 2 + (p.y - projY) ** 2;

    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      // Cross product gives sign (left vs right of travel direction)
      const cross = dx * (p.y - a.y) - dy * (p.x - a.x);
      signedError = Math.sign(cross) * Math.sqrt(distSq);
    }
  }
  return signedError;
}

// Renders the live tractor guidance cockpit (Speedometer, XTE error bar, Steer & Throttle)
export function drawCockpitTelemetry(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  champion: Vehicle | undefined,
  physics: VehiclePhysicsConfig,
  track: Track
): void {
  drawPanelChrome(ctx, x, y, w, h, "Auto-Steer GPS", champion?.alive ? "ACTIVE" : "OFFLINE");

  if (!champion) {
    ctx.fillStyle = "rgba(165, 235, 190, 0.5)";
    ctx.font = MONO_FONT;
    ctx.fillText("No champion signal...", x + 8, y + 24);
    return;
  }

  // 1. Speed readout & bar
  const speed = champion.speed;
  const speedPct = Math.min(1, speed / physics.maxSpeed);
  ctx.fillStyle = LABEL_COLOR;
  ctx.font = MONO_FONT;
  ctx.fillText(`SPEED: ${(speed * 0.2).toFixed(1)} km/h`, x + 8, y + 16);

  ctx.fillStyle = "rgba(255,255,255,0.1)";
  ctx.fillRect(x + 8, y + 20, w - 16, 5);
  ctx.fillStyle = ACCENT_GREEN;
  ctx.fillRect(x + 8, y + 20, (w - 16) * speedPct, 5);

  // 2. Cross-Track Error (XTE) deviation bar (Center is zero, green zone in middle)
  const xte = computeCrossTrackError(track, champion);
  // Scale pixels to simulated centimeters (1px ≈ 3cm)
  const xteCm = Math.round(xte * 3);
  const xteMaxPx = track.width * 0.45;
  const normalizedXte = Math.max(-1, Math.min(1, xte / xteMaxPx)); // -1 (left) .. +1 (right)

  ctx.fillStyle = Math.abs(xteCm) < 15 ? ACCENT_GREEN : Math.abs(xteCm) < 40 ? ACCENT_YELLOW : ACCENT_RED;
  ctx.fillText(`XTE: ${xteCm > 0 ? "+" : ""}${xteCm} cm`, x + 8, y + 40);

  // XTE Bar background
  const barY = y + 45;
  const barW = w - 16;
  const barMid = x + 8 + barW / 2;
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fillRect(x + 8, barY, barW, 6);

  // Center mark
  ctx.fillStyle = ACCENT_GREEN;
  ctx.fillRect(barMid - 1, barY - 2, 2, 10);

  // Deviation indicator marker
  const markerX = barMid + normalizedXte * (barW / 2);
  ctx.fillStyle = Math.abs(xteCm) < 15 ? ACCENT_GREEN : ACCENT_YELLOW;
  ctx.beginPath();
  ctx.arc(markerX, barY + 3, 4, 0, Math.PI * 2);
  ctx.fill();

  // 3. Throttle & Steering angle meters
  const steer = champion.lastSteer ?? 0;
  const throttle = champion.lastThrottle ?? (speed / physics.maxSpeed);

  ctx.fillStyle = LABEL_COLOR;
  ctx.fillText(`STEER: ${(steer * 45).toFixed(0)}°`, x + 8, y + 68);
  ctx.fillText(`THR: ${Math.round(throttle * 100)}%`, x + w / 2 + 6, y + 68);

  // Mini Steer bar
  const sBarW = (w - 24) / 2;
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fillRect(x + 8, y + 72, sBarW, 4);
  const sMid = x + 8 + sBarW / 2;
  ctx.fillStyle = ACCENT_GREEN;
  ctx.fillRect(sMid, y + 72, (steer * sBarW) / 2, 4);

  // Mini Throttle bar
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fillRect(x + w / 2 + 6, y + 72, sBarW, 4);
  ctx.fillStyle = ACCENT_GREEN;
  ctx.fillRect(x + w / 2 + 6, y + 72, sBarW * Math.max(0, Math.min(1, throttle)), 4);
}

export function drawFitnessSparkline(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  history: number[]
): void {
  drawPanelChrome(ctx, x, y, w, h, "Coverage / Gen");

  const padTop = 8;
  const padBottom = 16;
  const plotH = h - padTop - padBottom;
  const plotY = y + padTop;

  if (history.length >= 2) {
    const max = Math.max(...history, 1);
    ctx.strokeStyle = ACCENT_GREEN;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    history.forEach((val, i) => {
      const px = x + (i / (history.length - 1)) * w;
      const py = plotY + plotH - (val / max) * plotH;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    });
    ctx.stroke();

    // Fill gradient under curve
    ctx.lineTo(x + w, plotY + plotH);
    ctx.lineTo(x, plotY + plotH);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, plotY, 0, plotY + plotH);
    grad.addColorStop(0, "rgba(85, 232, 130, 0.28)");
    grad.addColorStop(1, "rgba(85, 232, 130, 0.02)");
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.fillStyle = ACCENT_GREEN;
    ctx.font = MONO_FONT;
    ctx.fillText(`${Math.round(max)}m`, x + 6, plotY + 9);
  } else {
    ctx.fillStyle = "rgba(165, 235, 190, 0.5)";
    ctx.font = MONO_FONT;
    ctx.fillText("calibrating sensor data…", x + 8, plotY + plotH / 2);
  }

  ctx.fillStyle = LABEL_COLOR;
  ctx.font = MONO_FONT;
  ctx.fillText(`gen 1..${Math.max(history.length, 1)}`, x + 6, y + h - 4);
}

export function drawWeightHeatmap(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  genome: Genome
): void {
  drawPanelChrome(ctx, x, y, w, h, "Synapse Weights");

  const pad = 6;
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
    // Positive weights in emerald green, negative weights in amber/red
    ctx.fillStyle = v >= 0 ? `rgba(85, 232, 130, ${Math.abs(v)})` : `rgba(255, 95, 75, ${Math.abs(v)})`;
    ctx.fillRect(plotX + col * cellW, plotY + row * cellH, cellW - 0.8, cellH - 0.8);
  }

  ctx.fillStyle = LABEL_COLOR;
  ctx.font = MONO_FONT;
  ctx.fillText(`n=${weights.length} |w|max=${maxAbs.toFixed(2)}`, x + 6, y + h - 4);
}
