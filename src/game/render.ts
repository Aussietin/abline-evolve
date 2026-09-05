import type { Track } from "../sim/track";
import type { Population } from "../sim/population";
import type { VehiclePhysicsConfig } from "../sim/types";
import type { Obstacle, Point } from "../sim/types";
import { washoutEdges } from "../sim/types";
import { drawTractor } from "./sprites";

// --- Static Field Layer (baked once per track/size) ---
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
  drawAbLine(ctx, track);

  return layer;
}

// --- Dynamic Swath / Cultivated Soil & Tire Track Layer ---
let swathLayer: HTMLCanvasElement | null = null;
let swathKey = "";

export function resetSwathLayer(): void {
  if (swathLayer) {
    const ctx = swathLayer.getContext("2d")!;
    ctx.clearRect(0, 0, swathLayer.width, swathLayer.height);
  }
}

export function fadeSwathLayer(): void {
  if (swathLayer) {
    const ctx = swathLayer.getContext("2d")!;
    ctx.fillStyle = "rgba(44, 58, 28, 0.08)";
    ctx.fillRect(0, 0, swathLayer.width, swathLayer.height);
  }
}

export function renderSwathLayer(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const key = `${width}x${height}`;
  if (!swathLayer || swathKey !== key) {
    swathLayer = document.createElement("canvas");
    swathLayer.width = width;
    swathLayer.height = height;
    swathKey = key;
  }
  ctx.drawImage(swathLayer, 0, 0);
}

// Stamping tire tracks and worked furrows into the swath layer
export function stampTireTracks(pop: Population, physics: VehiclePhysicsConfig): void {
  if (!swathLayer) return;
  const ctx = swathLayer.getContext("2d")!;

  pop.vehicles.forEach((v, i) => {
    if (!v.alive || v.speed < 2) return;
    const isBest = i === pop.currentBestIndex;

    const cos = Math.cos(v.heading);
    const sin = Math.sin(v.heading);
    const rearX = v.x - cos * physics.radius * 0.9;
    const rearY = v.y - sin * physics.radius * 0.9;
    const perpX = -sin;
    const perpY = cos;
    const halfStance = physics.radius * 0.65;

    // Left and right tire tread contact points
    const leftX = rearX + perpX * halfStance;
    const leftY = rearY + perpY * halfStance;
    const rightX = rearX - perpX * halfStance;
    const rightY = rearY - perpY * halfStance;

    // Tilled earth / tire imprint color
    ctx.fillStyle = isBest ? "rgba(35, 25, 12, 0.45)" : "rgba(38, 28, 14, 0.25)";
    ctx.fillRect(leftX - 1.2, leftY - 1.2, 2.4, 2.4);
    ctx.fillRect(rightX - 1.2, rightY - 1.2, 2.4, 2.4);

    // Cultivator center furrow marks behind hitch
    if (isBest) {
      ctx.fillStyle = "rgba(48, 34, 16, 0.35)";
      ctx.fillRect(rearX - perpX * (halfStance * 0.3) - 1, rearY - perpY * (halfStance * 0.3) - 1, 2, 2);
      ctx.fillRect(rearX + perpX * (halfStance * 0.3) - 1, rearY + perpY * (halfStance * 0.3) - 1, 2, 2);
    }
  });
}

// --- Particle Effects Engine ---
export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  alpha: number;
  maxLife: number;
  life: number;
}

const particles: Particle[] = [];

export function emitExhaust(x: number, y: number, heading: number, throttle: number): void {
  if (Math.random() > 0.45) return;
  const speed = 10 + Math.random() * 20;
  // Offset exhaust pipe to front right of hood
  const cos = Math.cos(heading);
  const sin = Math.sin(heading);
  const exX = x + cos * 6 - sin * 4;
  const exY = y + sin * 6 + cos * 4;
  const driftAngle = heading + Math.PI + (Math.random() - 0.5) * 0.5;

  particles.push({
    x: exX,
    y: exY,
    vx: Math.cos(driftAngle) * speed,
    vy: Math.sin(driftAngle) * speed - 6,
    radius: 1.5 + Math.random() * 2,
    color: throttle > 0.7 ? "60, 60, 65" : "150, 150, 155",
    alpha: 0.55,
    maxLife: 0.5,
    life: 0.5,
  });
}

export function emitDust(x: number, y: number, heading: number): void {
  if (Math.random() > 0.35) return;
  const spreadAngle = heading + Math.PI + (Math.random() - 0.5) * 1.2;
  const speed = 5 + Math.random() * 15;
  particles.push({
    x: x + (Math.random() - 0.5) * 6,
    y: y + (Math.random() - 0.5) * 6,
    vx: Math.cos(spreadAngle) * speed,
    vy: Math.sin(spreadAngle) * speed,
    radius: 1 + Math.random() * 2.5,
    color: "115, 95, 65",
    alpha: 0.4,
    maxLife: 0.45,
    life: 0.45,
  });
}

export function emitCrashDebris(x: number, y: number): void {
  for (let i = 0; i < 16; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 20 + Math.random() * 60;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: 1.5 + Math.random() * 3,
      color: i % 3 === 0 ? "230, 190, 70" : "80, 50, 30",
      alpha: 0.8,
      maxLife: 0.6,
      life: 0.6,
    });
  }
}

export function emitMilestoneSparks(x: number, y: number): void {
  for (let i = 0; i < 30; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 40 + Math.random() * 90;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: 2 + Math.random() * 3,
      color: i % 2 === 0 ? "255, 230, 50" : "110, 240, 100",
      alpha: 1.0,
      maxLife: 0.8,
      life: 0.8,
    });
  }
}

export function updateAndRenderParticles(ctx: CanvasRenderingContext2D, dt: number): void {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) {
      particles.splice(i, 1);
      continue;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.radius += dt * 1.5;

    const currentAlpha = (p.life / p.maxLife) * p.alpha;
    ctx.fillStyle = `rgba(${p.color}, ${Math.max(0, currentAlpha)})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

// --- Obstacle Rendering ---
let obstacleLayer: HTMLCanvasElement | null = null;
let obstacleLayerKey = "";

export function renderObstacles(
  ctx: CanvasRenderingContext2D,
  obstacles: Obstacle[],
  obstacleGenId: number,
  width: number,
  height: number
): void {
  const key = `${obstacleGenId}:${width}x${height}`;
  if (!obstacleLayer || obstacleLayerKey !== key) {
    obstacleLayer = buildObstacleLayer(obstacles, width, height);
    obstacleLayerKey = key;
  }
  ctx.drawImage(obstacleLayer, 0, 0);
}

function buildObstacleLayer(obstacles: Obstacle[], width: number, height: number): HTMLCanvasElement {
  const layer = document.createElement("canvas");
  layer.width = width;
  layer.height = height;
  const ctx = layer.getContext("2d")!;
  for (const o of obstacles) {
    switch (o.kind) {
      case "stump":
        drawStump(ctx, o.x, o.y, o.radius);
        break;
      case "bog":
        drawBog(ctx, o.x, o.y, o.radius);
        break;
      case "washout":
        drawWashout(ctx, o);
        break;
    }
  }
  return layer;
}

function drawStump(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number): void {
  ctx.save();
  // Drop shadow
  ctx.shadowColor = "rgba(0, 0, 0, 0.65)";
  ctx.shadowBlur = 6;
  ctx.shadowOffsetX = 3;
  ctx.shadowOffsetY = 3;

  // Outer bark
  const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
  grad.addColorStop(0, "#b88355");
  grad.addColorStop(0.65, "#7d4d29");
  grad.addColorStop(0.92, "#4a2d16");
  grad.addColorStop(1, "#301d0e");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Wood rings
  ctx.strokeStyle = "rgba(65, 40, 20, 0.7)";
  ctx.lineWidth = 1;
  for (let r = radius * 0.28; r < radius * 0.88; r += radius * 0.22) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Radial wood check/crack
  ctx.strokeStyle = "rgba(35, 20, 10, 0.85)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + radius * 0.75, y - radius * 0.2);
  ctx.stroke();

  // Mossy green accent spot
  ctx.fillStyle = "rgba(80, 120, 45, 0.75)";
  ctx.beginPath();
  ctx.arc(x - radius * 0.5, y + radius * 0.3, radius * 0.32, 0, Math.PI * 2);
  ctx.fill();

  // Red/Orange glowing hazard warning rim
  ctx.strokeStyle = "rgba(240, 80, 50, 0.75)";
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(x, y, radius + 2.5, 0, Math.PI * 2);
  ctx.stroke();
}

function drawBog(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number): void {
  // Soft muddy basin
  const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
  grad.addColorStop(0, "rgba(52, 34, 16, 0.88)");
  grad.addColorStop(0.55, "rgba(65, 44, 20, 0.7)");
  grad.addColorStop(0.88, "rgba(60, 48, 22, 0.35)");
  grad.addColorStop(1, "rgba(50, 45, 20, 0)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();

  // Murky water pool in center with specular water reflection
  ctx.fillStyle = "rgba(38, 55, 48, 0.65)";
  ctx.beginPath();
  ctx.ellipse(x, y, radius * 0.62, radius * 0.45, 0.3, 0, Math.PI * 2);
  ctx.fill();

  // Cyan water ripple highlight
  ctx.strokeStyle = "rgba(100, 220, 240, 0.45)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(x, y, radius * 0.4, 0.5, 2.6);
  ctx.stroke();

  // Caution mud symbol or border
  ctx.strokeStyle = "rgba(215, 175, 75, 0.5)";
  ctx.setLineDash([4, 6]);
  ctx.beginPath();
  ctx.arc(x, y, radius - 1, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawWashout(ctx: CanvasRenderingContext2D, w: Extract<Obstacle, { kind: "washout" }>): void {
  const edges = washoutEdges(w);
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.7)";
  ctx.shadowBlur = 8;

  ctx.beginPath();
  ctx.moveTo(edges[0].a.x, edges[0].a.y);
  for (const e of edges) ctx.lineTo(e.b.x, e.b.y);
  ctx.closePath();

  // Dark deep ravine gradient
  const grad = ctx.createLinearGradient(w.a.x, w.a.y, w.b.x, w.b.y);
  grad.addColorStop(0, "#23160a");
  grad.addColorStop(0.5, "#110b05");
  grad.addColorStop(1, "#23160a");
  ctx.fillStyle = grad;
  ctx.fill();

  // Erosion warning edge
  ctx.strokeStyle = "rgba(240, 80, 60, 0.75)";
  ctx.lineWidth = 1.8;
  ctx.stroke();
  ctx.restore();

  // Jagged cracks along the washout
  ctx.strokeStyle = "rgba(95, 65, 35, 0.65)";
  ctx.lineWidth = 1.2;
  const dx = w.b.x - w.a.x;
  const dy = w.b.y - w.a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const steps = Math.max(3, Math.round(len / 12));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const cx = w.a.x + dx * t;
    const cy = w.a.y + dy * t;
    const jitter = ((i % 3) - 1) * w.halfWidth * 0.5;
    ctx.beginPath();
    ctx.moveTo(cx - nx * w.halfWidth * 0.8 + nx * jitter, cy - ny * w.halfWidth * 0.8 + ny * jitter);
    ctx.lineTo(cx + nx * w.halfWidth * 0.8 + nx * jitter, cy + ny * w.halfWidth * 0.8 + ny * jitter);
    ctx.stroke();
  }
}

// --- Paddock Field Ground ---
function drawField(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  // Rich agricultural soil & grass gradient
  const grad = ctx.createLinearGradient(0, 0, width, height);
  grad.addColorStop(0, "#2a361a");
  grad.addColorStop(0.5, "#334420");
  grad.addColorStop(1, "#232e15");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // Textured furrows running diagonally across the paddock
  const spacing = 14;
  ctx.lineWidth = 1;
  const span = width + height;
  for (let i = -height; i < span; i += spacing) {
    ctx.strokeStyle = (i / spacing) % 2 === 0 ? "rgba(195, 215, 140, 0.04)" : "rgba(15, 25, 8, 0.08)";
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + height, height);
    ctx.stroke();
  }

  // Soft atmospheric vignette
  const vignette = ctx.createRadialGradient(
    width / 2,
    height / 2,
    Math.min(width, height) * 0.32,
    width / 2,
    height / 2,
    Math.max(width, height) * 0.72
  );
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.38)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);
}

function boundaryPolylines(track: Track): { left: Point[]; right: Point[] } {
  const n = track.centerline.length;
  const leftWalls = track.walls.slice(0, n - 1);
  const rightWalls = track.walls.slice(n - 1, 2 * (n - 1));
  const left = leftWalls.length ? [leftWalls[0].a, ...leftWalls.map((w) => w.b)] : [];
  const right = rightWalls.length ? [rightWalls[0].a, ...rightWalls.map((w) => w.b)] : [];
  return { left, right };
}

function drawGuidanceCorridor(ctx: CanvasRenderingContext2D, track: Track): void {
  const { left, right } = boundaryPolylines(track);
  if (left.length < 2 || right.length < 2) return;

  // Corridor tolerance zone
  ctx.fillStyle = "rgba(110, 160, 65, 0.12)";
  ctx.beginPath();
  ctx.moveTo(left[0].x, left[0].y);
  for (let i = 1; i < left.length; i++) ctx.lineTo(left[i].x, left[i].y);
  for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i].x, right[i].y);
  ctx.closePath();
  ctx.fill();

  // Corridor perimeter boundary line
  ctx.strokeStyle = "rgba(175, 215, 115, 0.28)";
  ctx.lineWidth = 1.2;
  ctx.setLineDash([8, 6]);
  strokePolyline(ctx, left);
  strokePolyline(ctx, right);
  ctx.setLineDash([]);

  // Perpendicular crop ticks
  const { centerline, cumDist, totalLength } = track;
  const step = 20;
  ctx.strokeStyle = "rgba(60, 48, 22, 0.38)";
  ctx.lineWidth = 1.5;
  for (let d = 0; d < totalLength; d += step) {
    const p = pointAtArcLength(centerline, cumDist, d);
    if (!p) continue;
    const half = track.width * 0.44;
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

function drawHeadlandGates(ctx: CanvasRenderingContext2D, track: Track): void {
  ctx.strokeStyle = "rgba(220, 230, 160, 0.22)";
  ctx.lineWidth = 1.2;
  ctx.setLineDash([4, 6]);
  for (const gate of track.gates) {
    ctx.beginPath();
    ctx.moveTo(gate.a.x, gate.a.y);
    ctx.lineTo(gate.b.x, gate.b.y);
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

function drawAbLine(ctx: CanvasRenderingContext2D, track: Track): void {
  // Glowing high-precision AB GPS guidance line
  ctx.save();
  ctx.shadowColor = "rgba(255, 235, 60, 0.85)";
  ctx.shadowBlur = 8;
  ctx.strokeStyle = "#ffe234";
  ctx.setLineDash([12, 8]);
  ctx.lineWidth = 2.5;
  strokePolyline(ctx, track.centerline);
  ctx.restore();
  ctx.setLineDash([]);

  // Draw start 'A' marker & end 'B' marker
  if (track.centerline.length > 0) {
    const startP = track.centerline[0];
    const endP = track.centerline[track.centerline.length - 1];

    ctx.fillStyle = "#ffe234";
    ctx.font = "bold 12px 'Segoe UI', system-ui, sans-serif";
    ctx.fillText("POINT A", startP.x - 22, startP.y - 14);

    ctx.fillStyle = "#8fe85a";
    ctx.fillText("POINT B", endP.x - 22, endP.y - 14);
  }
}

// --- Population & Vehicles Rendering ---
export function renderPopulation(
  ctx: CanvasRenderingContext2D,
  pop: Population,
  physics: VehiclePhysicsConfig,
  manualVehicle: { x: number; y: number; heading: number; steer: number; alive: boolean } | null = null
): void {
  // First draw fleet vehicles (non-champions)
  pop.vehicles.forEach((v, i) => {
    if (!v.alive || i === pop.currentBestIndex) return;

    ctx.save();
    ctx.translate(v.x, v.y);
    ctx.rotate(v.heading);
    drawTractor(ctx, physics.radius, false, v.lastSteer ?? 0, false);
    ctx.restore();
  });

  // Then draw player manual test-drive vehicle if active
  if (manualVehicle && manualVehicle.alive) {
    ctx.save();
    ctx.translate(manualVehicle.x, manualVehicle.y);
    ctx.rotate(manualVehicle.heading);
    ctx.shadowColor = "rgba(50, 180, 255, 0.8)";
    ctx.shadowBlur = 10;
    drawTractor(ctx, physics.radius, false, manualVehicle.steer, true);
    ctx.restore();
  }

  // Draw current Champion on top with highlight
  const champ = pop.vehicles[pop.currentBestIndex];
  if (champ && champ.alive) {
    ctx.save();
    ctx.translate(champ.x, champ.y);
    ctx.rotate(champ.heading);
    ctx.shadowColor = "rgba(110, 240, 80, 0.9)";
    ctx.shadowBlur = 12;
    drawTractor(ctx, physics.radius, true, champ.lastSteer ?? 0, false);
    ctx.restore();

    drawChampionSensors(ctx, champ, physics);
  }
}

function drawChampionSensors(
  ctx: CanvasRenderingContext2D,
  v: { x: number; y: number; heading: number; sensors: number[] },
  physics: VehiclePhysicsConfig
): void {
  const fanRad = (physics.sensorFanDegrees * Math.PI) / 180;
  const halfSensors = physics.sensorCount;

  // v.sensors has [wallSensors..., obstacleSensors...]
  for (let i = 0; i < halfSensors; i++) {
    const t = halfSensors === 1 ? 0.5 : i / (halfSensors - 1);
    const angle = v.heading - fanRad / 2 + t * fanRad;
    const wallReading = v.sensors[i] ?? 1;
    const obsReading = v.sensors[i + halfSensors] ?? 1;

    // Nearest contact distance
    const minReading = Math.min(wallReading, obsReading);
    const dist = minReading * physics.sensorRange;

    // Beam color: yellow-red if obstacle ahead, cyan-green if clear corridor
    const hitObstacle = obsReading < wallReading && obsReading < 0.95;
    ctx.strokeStyle = hitObstacle ? "rgba(255, 100, 70, 0.65)" : "rgba(80, 240, 140, 0.4)";
    ctx.lineWidth = hitObstacle ? 1.5 : 1;

    ctx.beginPath();
    ctx.moveTo(v.x, v.y);
    ctx.lineTo(v.x + Math.cos(angle) * dist, v.y + Math.sin(angle) * dist);
    ctx.stroke();

    // Small contact reticle dot at end of beam
    if (minReading < 0.99) {
      ctx.fillStyle = hitObstacle ? "#ff5544" : "#55ffaa";
      ctx.beginPath();
      ctx.arc(v.x + Math.cos(angle) * dist, v.y + Math.sin(angle) * dist, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
