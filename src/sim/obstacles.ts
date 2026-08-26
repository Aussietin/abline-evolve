import type { Obstacle, Point } from "./types";
import { pointSegmentDistance } from "./sensors";
import type { Track } from "./track";

// Procedural obstacle placement (v3). Deliberately NOT baked into tracks.ts —
// Austin's brief was explicit that obstacles must "appear" fresh so the net
// has to react to sensor input in the moment rather than memorize a fixed
// layout. generateObstacles() is called once per generation (population.ts)
// so every generation's tractors face a new arrangement.

const BOG_SPEED_MULTIPLIER = 0.35; // matches the old MVP mud-patch penalty

export interface ObstacleGenConfig {
  stumpCount: [number, number];
  bogCount: [number, number];
  washoutCount: [number, number];
  stumpRadius: [number, number];
  bogRadius: [number, number];
  washoutHalfWidth: [number, number];
  washoutLength: [number, number];
}

// Radii/half-widths are kept comfortably below the corridor's half-width
// (track.width/2) so an obstacle — even placed dead-center — never fully
// blocks the row; the tractor always has a lane on one side to route around.
export const DEFAULT_OBSTACLE_CONFIG: ObstacleGenConfig = {
  stumpCount: [2, 4],
  bogCount: [1, 2],
  washoutCount: [0, 1],
  stumpRadius: [9, 15],
  bogRadius: [20, 32],
  washoutHalfWidth: [9, 15],
  washoutLength: [50, 110],
};

let obstacleGenCounter = 0;
// Monotonic id for cache-keying the render layer — generation numbers alone
// aren't unique across a retire/upgrade-triggered population reset (both
// restart at generation 1), so render.ts keys off this instead.
export function nextObstacleGenId(): number {
  return ++obstacleGenCounter;
}

function randInt(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min + 1));
}

function randRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function pointAndNormalAtArc(track: Track, d: number): { p: Point; nx: number; ny: number } | null {
  const { centerline, cumDist } = track;
  for (let i = 0; i < centerline.length - 1; i++) {
    if (d >= cumDist[i] && d <= cumDist[i + 1]) {
      const a = centerline[i];
      const b = centerline[i + 1];
      const segLen = cumDist[i + 1] - cumDist[i] || 1;
      const t = (d - cumDist[i]) / segLen;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      return { p: { x: a.x + dx * t, y: a.y + dy * t }, nx: -dy / len, ny: dx / len };
    }
  }
  return null;
}

export function generateObstacles(track: Track, cfg: ObstacleGenConfig = DEFAULT_OBSTACLE_CONFIG): Obstacle[] {
  const obstacles: Obstacle[] = [];
  const maxLateral = track.width * 0.25; // keep obstacles off the very edge of the corridor
  const { totalLength } = track;
  if (totalLength <= 0) return obstacles;

  const placeCircle = (kind: "stump" | "bog", radius: number): void => {
    const d = randRange(totalLength * 0.08, totalLength * 0.92);
    const at = pointAndNormalAtArc(track, d);
    if (!at) return;
    const lateral = randRange(-maxLateral, maxLateral);
    obstacles.push({ kind, x: at.p.x + at.nx * lateral, y: at.p.y + at.ny * lateral, radius });
  };

  const stumpN = randInt(cfg.stumpCount[0], cfg.stumpCount[1]);
  for (let i = 0; i < stumpN; i++) placeCircle("stump", randRange(cfg.stumpRadius[0], cfg.stumpRadius[1]));

  const bogN = randInt(cfg.bogCount[0], cfg.bogCount[1]);
  for (let i = 0; i < bogN; i++) placeCircle("bog", randRange(cfg.bogRadius[0], cfg.bogRadius[1]));

  const washoutN = randInt(cfg.washoutCount[0], cfg.washoutCount[1]);
  for (let i = 0; i < washoutN; i++) {
    const halfWidth = randRange(cfg.washoutHalfWidth[0], cfg.washoutHalfWidth[1]);
    const length = randRange(cfg.washoutLength[0], cfg.washoutLength[1]);
    const d = randRange(totalLength * 0.15, totalLength * 0.85);
    const at = pointAndNormalAtArc(track, d);
    if (!at) continue;
    const lateral = randRange(-maxLateral, maxLateral);
    const cx = at.p.x + at.nx * lateral;
    const cy = at.p.y + at.ny * lateral;
    // Oriented roughly across the row (along the corridor normal) with some
    // random skew, so it reads as a gouge cutting across the guidance line
    // rather than running parallel with it.
    const angle = Math.atan2(at.ny, at.nx) + randRange(-0.4, 0.4);
    const halfLen = length / 2;
    obstacles.push({
      kind: "washout",
      a: { x: cx - Math.cos(angle) * halfLen, y: cy - Math.sin(angle) * halfLen },
      b: { x: cx + Math.cos(angle) * halfLen, y: cy + Math.sin(angle) * halfLen },
      halfWidth,
    });
  }

  return obstacles;
}

// Stumps and washouts end the generation on contact, same as a corridor-wall
// hit in vehicle.ts — internally consistent hard-hazard behavior.
export function hardObstacleHit(obstacles: Obstacle[], p: Point, vehicleRadius: number): boolean {
  for (const o of obstacles) {
    if (o.kind === "stump") {
      if (Math.hypot(p.x - o.x, p.y - o.y) < o.radius + vehicleRadius) return true;
    } else if (o.kind === "washout") {
      if (pointSegmentDistance(p, { a: o.a, b: o.b }) < o.halfWidth + vehicleRadius) return true;
    }
  }
  return false;
}

// Bog holes are a soft hazard: no collision, just the old mud-patch traction
// penalty, reused as-is (see brief point 2 — "bog holes ARE the existing mud
// mechanic", just relocated from a static track.mud into the dynamic
// per-generation obstacle set so they can appear/move like the others).
export function obstacleSpeedMultiplierAt(obstacles: Obstacle[], p: Point): number {
  for (const o of obstacles) {
    if (o.kind === "bog" && Math.hypot(p.x - o.x, p.y - o.y) <= o.radius) return BOG_SPEED_MULTIPLIER;
  }
  return 1;
}
