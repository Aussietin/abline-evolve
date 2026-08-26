import type { Track } from "../sim/track";
import type { Population } from "../sim/population";
import type { VehiclePhysicsConfig } from "../sim/types";
import type { Point } from "../sim/types";
import { drawTractor } from "./sprites";

// Everything in this module is static per track (field texture, guidance
// corridor, AB line, mud) except the tractors themselves. The static layer
// is expensive-ish to draw (hundreds of small furrow/row strokes) but never
// changes frame to frame, so it's baked to an offscreen canvas once and
// blitted with a single drawImage per frame instead of being redrawn.
let staticLayer: HTMLCanvasElement | null = null;
let staticLayerKey = "";

export function renderTrack(ctx: CanvasRenderingContext2D, track: Track, width: number, height: number): void {
  const key = `${track.id}:${width}x${height}`;
  if (!staticLayer || staticLayerKey !== key) {
    staticLayer = buildStaticLayer(track, width, height);
    staticLayerKey = key;
  }
  ctx.drawImage(staticLayer, 0, 0);
}

function buildStaticLayer(track: Track, width: number, height: number): HTMLCanvasElement {
  const layer = document.createElement("canvas");
  layer.width = width;
  layer.height = height;
  const ctx = layer.getContext("2d")!;

  drawField(ctx, width, height);
  drawGuidanceCorridor(ctx, track);
  drawHeadlandGates(ctx, track);
  drawMud(ctx, track);
  drawAbLine(ctx, track);

  return layer;
}

// Paddock ground: a soft gradient plus fine furrow striping so it reads as
// tilled earth rather than a flat colour card. Cheap because it's baked once.
function drawField(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const grad = ctx.createLinearGradient(0, 0, width, height);
  grad.addColorStop(0, "#33421f");
  grad.addColorStop(0.55, "#3d4f27");
  grad.addColorStop(1, "#2c3a1c");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // Furrow lines running diagonally across the whole field, alternating
  // slightly lighter/darker so the ground has visible row structure.
  const spacing = 16;
  ctx.lineWidth = 1;
  const span = width + height;
  for (let i = -height; i < span; i += spacing) {
    ctx.strokeStyle = (i / spacing) % 2 === 0 ? "rgba(210, 220, 160, 0.05)" : "rgba(20, 30, 10, 0.08)";
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + height, height);
    ctx.stroke();
  }

  // A gentle vignette so the panel edges recede and the corridor/tractors
  // (drawn brighter) hold visual focus.
  const vignette = ctx.createRadialGradient(
    width / 2,
    height / 2,
    Math.min(width, height) * 0.35,
    width / 2,
    height / 2,
    Math.max(width, height) * 0.7
  );
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.28)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);
}

// Reconstruct the left/right boundary polylines from track.walls (built as
// left-side segments followed by right-side segments in track.ts) without
// touching sim code — this is rendering-only geometry.
function boundaryPolylines(track: Track): { left: Point[]; right: Point[] } {
  const n = track.centerline.length;
  const leftWalls = track.walls.slice(0, n - 1);
  const rightWalls = track.walls.slice(n - 1, 2 * (n - 1));
  const left = leftWalls.length ? [leftWalls[0].a, ...leftWalls.map((w) => w.b)] : [];
  const right = rightWalls.length ? [rightWalls[0].a, ...rightWalls.map((w) => w.b)] : [];
  return { left, right };
}

// The tolerance corridor the tractor is allowed to wander within — rendered
// as a translucent tinted band with short perpendicular "planted row" ticks,
// not solid road-shoulder lines. This is what track.width/walls actually
// represent: steering tolerance, not a road edge.
function drawGuidanceCorridor(ctx: CanvasRenderingContext2D, track: Track): void {
  const { left, right } = boundaryPolylines(track);
  if (left.length < 2 || right.length < 2) return;

  ctx.fillStyle = "rgba(120, 150, 70, 0.16)";
  ctx.beginPath();
  ctx.moveTo(left[0].x, left[0].y);
  for (let i = 1; i < left.length; i++) ctx.lineTo(left[i].x, left[i].y);
  for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i].x, right[i].y);
  ctx.closePath();
  ctx.fill();

  // Faint boundary edges — just enough to show where the tolerance runs out,
  // not a hard road-shoulder line.
  ctx.strokeStyle = "rgba(180, 200, 130, 0.22)";
  ctx.lineWidth = 1;
  strokePolyline(ctx, left);
  strokePolyline(ctx, right);

  // Crop-row ticks: short perpendicular marks along the centerline evoking
  // planted rows either side of the guidance line.
  const { centerline, cumDist, totalLength } = track;
  const step = 22;
  ctx.strokeStyle = "rgba(60, 45, 20, 0.35)";
  ctx.lineWidth = 1.5;
  for (let d = 0; d < totalLength; d += step) {
    const p = pointAtArcLength(centerline, cumDist, d);
    if (!p) continue;
    const half = track.width * 0.42;
    ctx.beginPath();
    ctx.moveTo(p.x - p.ny * half, p.y + p.nx * half);
    ctx.lineTo(p.x + p.ny * half, p.y - p.nx * half);
    ctx.stroke();
  }
}

function strokePolyline(ctx: CanvasRenderingContext2D, pts: Point[]): void {
  ctx.beginPath();
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.stroke();
}

// Sample a point + unit normal along the centerline polyline at a given arc
// length, for placing crop-row ticks evenly regardless of vertex spacing.
function pointAtArcLength(
  centerline: Point[],
  cumDist: number[],
  d: number
): { x: number; y: number; nx: number; ny: number } | null {
  for (let i = 0; i < centerline.length - 1; i++) {
    if (d >= cumDist[i] && d <= cumDist[i + 1]) {
      const a = centerline[i];
      const b = centerline[i + 1];
      const segLen = cumDist[i + 1] - cumDist[i] || 1;
      const t = (d - cumDist[i]) / segLen;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      return { x: a.x + dx * t, y: a.y + dy * t, nx: -dy / len, ny: dx / len };
    }
  }
  return null;
}

// Perpendicular cross-lines at each centerline vertex mark headland turns —
// kept very faint since they're a wayfinding cue, not a boundary.
function drawHeadlandGates(ctx: CanvasRenderingContext2D, track: Track): void {
  ctx.strokeStyle = "rgba(200, 210, 160, 0.12)";
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 5]);
  for (const gate of track.gates) {
    ctx.beginPath();
    ctx.moveTo(gate.a.x, gate.a.y);
    ctx.lineTo(gate.b.x, gate.b.y);
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

function drawMud(ctx: CanvasRenderingContext2D, track: Track): void {
  for (const patch of track.mud) {
    const grad = ctx.createRadialGradient(patch.x, patch.y, 0, patch.x, patch.y, patch.radius);
    grad.addColorStop(0, "rgba(70, 45, 15, 0.6)");
    grad.addColorStop(1, "rgba(70, 45, 15, 0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(patch.x, patch.y, patch.radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

// The actual AB guidance line: a bright glowing dashed line, visually
// distinct from the corridor band — this is the thing the tractor is
// learning to track.
function drawAbLine(ctx: CanvasRenderingContext2D, track: Track): void {
  ctx.save();
  ctx.shadowColor = "rgba(255, 232, 90, 0.65)";
  ctx.shadowBlur = 6;
  ctx.strokeStyle = "#ffe85a";
  ctx.setLineDash([10, 8]);
  ctx.lineWidth = 2;
  strokePolyline(ctx, track.centerline);
  ctx.restore();
  ctx.setLineDash([]);
}

export function renderPopulation(
  ctx: CanvasRenderingContext2D,
  pop: Population,
  physics: VehiclePhysicsConfig
): void {
  pop.vehicles.forEach((v, i) => {
    if (!v.alive) return;
    const isBest = i === pop.currentBestIndex;

    ctx.save();
    ctx.translate(v.x, v.y);
    ctx.rotate(v.heading);
    if (isBest) {
      ctx.shadowColor = "rgba(143, 232, 90, 0.7)";
      ctx.shadowBlur = 8;
    }
    drawTractor(ctx, physics.radius, isBest);
    ctx.restore();

    if (isBest) {
      drawSensors(ctx, v, physics);
    }
  });
}

function drawSensors(
  ctx: CanvasRenderingContext2D,
  v: { x: number; y: number; heading: number; sensors: number[] },
  physics: VehiclePhysicsConfig
): void {
  const fanRad = (physics.sensorFanDegrees * Math.PI) / 180;
  ctx.strokeStyle = "rgba(111, 209, 66, 0.35)";
  ctx.lineWidth = 1;
  v.sensors.forEach((reading, i) => {
    const t = physics.sensorCount === 1 ? 0.5 : i / (physics.sensorCount - 1);
    const angle = v.heading - fanRad / 2 + t * fanRad;
    const dist = reading * physics.sensorRange;
    ctx.beginPath();
    ctx.moveTo(v.x, v.y);
    ctx.lineTo(v.x + Math.cos(angle) * dist, v.y + Math.sin(angle) * dist);
    ctx.stroke();
  });
}
