import type { LineSegment, Point } from "./types";

// Ray-vs-segment intersection, returns distance along ray or null if no hit.
function rayIntersectSegment(origin: Point, dirX: number, dirY: number, seg: LineSegment): number | null {
  const { a, b } = seg;
  const segX = b.x - a.x;
  const segY = b.y - a.y;
  const denom = dirX * segY - dirY * segX;
  if (Math.abs(denom) < 1e-9) return null;

  const diffX = a.x - origin.x;
  const diffY = a.y - origin.y;
  const t = (diffX * segY - diffY * segX) / denom; // distance along ray
  const u = (diffX * dirY - diffY * dirX) / denom; // position along segment [0,1]

  if (t < 0 || u < 0 || u > 1) return null;
  return t;
}

// Cast `count` rays fanned across `fanDegrees`, centered on heading, against
// all wall segments. Returns normalized distances (0 = wall touching, 1 = clear
// to sensorRange), one per ray.
export function castSensors(
  origin: Point,
  heading: number,
  count: number,
  fanDegrees: number,
  range: number,
  walls: LineSegment[]
): number[] {
  const fanRad = (fanDegrees * Math.PI) / 180;
  const readings: number[] = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const angle = heading - fanRad / 2 + t * fanRad;
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);

    let closest = range;
    for (const wall of walls) {
      const hit = rayIntersectSegment(origin, dirX, dirY, wall);
      if (hit !== null && hit < closest) closest = hit;
    }
    readings.push(closest / range);
  }
  return readings;
}

// Shortest distance from a point to a segment — used for wall-collision checks.
export function pointSegmentDistance(p: Point, seg: LineSegment): number {
  const { a, b } = seg;
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lenSq = abx * abx + aby * aby;
  let t = lenSq === 0 ? 0 : ((p.x - a.x) * abx + (p.y - a.y) * aby) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = a.x + t * abx;
  const cy = a.y + t * aby;
  return Math.hypot(p.x - cx, p.y - cy);
}
