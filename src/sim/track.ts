import type { LineSegment, Point } from "./types";
import { pointSegmentDistance } from "./sensors";

export interface MudPatch {
  x: number;
  y: number;
  radius: number;
  speedMultiplier: number; // applied to maxSpeed while inside
}

export interface Track {
  id: string;
  centerline: Point[];
  width: number;
  walls: LineSegment[]; // left + right boundary segments, for sensors/collision
  gates: LineSegment[]; // perpendicular cross-lines at each centerline vertex (visual only)
  mud: MudPatch[];
  startPose: { x: number; y: number; heading: number };
  cumDist: number[]; // cumulative arc length at each centerline vertex
  totalLength: number;
}

function perpendicular(dx: number, dy: number): Point {
  const len = Math.hypot(dx, dy) || 1;
  return { x: -dy / len, y: dx / len };
}

export function buildTrack(centerline: Point[], width: number, mud: MudPatch[] = []): Track {
  const left: Point[] = [];
  const right: Point[] = [];
  const gates: LineSegment[] = [];
  const half = width / 2;

  for (let i = 0; i < centerline.length; i++) {
    const prev = centerline[Math.max(i - 1, 0)];
    const next = centerline[Math.min(i + 1, centerline.length - 1)];
    const perp = perpendicular(next.x - prev.x, next.y - prev.y);
    const p = centerline[i];
    left.push({ x: p.x + perp.x * half, y: p.y + perp.y * half });
    right.push({ x: p.x - perp.x * half, y: p.y - perp.y * half });
    gates.push({ a: left[i], b: right[i] });
  }

  const walls: LineSegment[] = [];
  for (let i = 0; i < left.length - 1; i++) walls.push({ a: left[i], b: left[i + 1] });
  for (let i = 0; i < right.length - 1; i++) walls.push({ a: right[i], b: right[i + 1] });

  const cumDist = [0];
  for (let i = 1; i < centerline.length; i++) {
    const d = Math.hypot(centerline[i].x - centerline[i - 1].x, centerline[i].y - centerline[i - 1].y);
    cumDist.push(cumDist[i - 1] + d);
  }

  const start = centerline[0];
  const second = centerline[1];
  const startHeading = Math.atan2(second.y - start.y, second.x - start.x);

  return {
    id: "paddock-01",
    centerline,
    width,
    walls,
    gates,
    mud,
    startPose: { x: start.x, y: start.y, heading: startHeading },
    cumDist,
    totalLength: cumDist[cumDist.length - 1],
  };
}

// Project a point onto the centerline polyline; returns arc-length of the
// closest point (used as fitness — "how far along the row has it gotten").
export function projectArcLength(track: Track, p: Point): number {
  let best = Infinity;
  let bestArc = 0;
  const { centerline, cumDist } = track;
  for (let i = 0; i < centerline.length - 1; i++) {
    const a = centerline[i];
    const b = centerline[i + 1];
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const lenSq = abx * abx + aby * aby || 1;
    let t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const cx = a.x + t * abx;
    const cy = a.y + t * aby;
    const dist = Math.hypot(p.x - cx, p.y - cy);
    if (dist < best) {
      best = dist;
      const segLen = Math.hypot(abx, aby);
      bestArc = cumDist[i] + t * segLen;
    }
  }
  return bestArc;
}

export function distanceToNearestWall(track: Track, p: Point): number {
  let min = Infinity;
  for (const wall of track.walls) {
    const d = pointSegmentDistance(p, wall);
    if (d < min) min = d;
  }
  return min;
}

export function mudSpeedMultiplierAt(track: Track, p: Point): number {
  for (const patch of track.mud) {
    if (Math.hypot(p.x - patch.x, p.y - patch.y) <= patch.radius) return patch.speedMultiplier;
  }
  return 1;
}
