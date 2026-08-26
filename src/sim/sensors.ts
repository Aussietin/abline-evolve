import type { LineSegment, Obstacle, Point } from "./types";
import { washoutEdges } from "./types";

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

// Ray-vs-circle intersection (unit direction assumed), nearest positive hit.
function rayIntersectCircle(origin: Point, dirX: number, dirY: number, cx: number, cy: number, r: number): number | null {
  const ox = origin.x - cx;
  const oy = origin.y - cy;
  const b = 2 * (ox * dirX + oy * dirY);
  const c = ox * ox + oy * oy - r * r;
  const disc = b * b - 4 * c;
  if (disc < 0) return null;
  const sqrtDisc = Math.sqrt(disc);
  const t1 = (-b - sqrtDisc) / 2;
  const t2 = (-b + sqrtDisc) / 2;
  if (t1 >= 0) return t1;
  if (t2 >= 0) return t2;
  return null;
}

function rayIntersectObstacle(origin: Point, dirX: number, dirY: number, obstacle: Obstacle): number | null {
  if (obstacle.kind === "washout") {
    let closest: number | null = null;
    for (const edge of washoutEdges(obstacle)) {
      const hit = rayIntersectSegment(origin, dirX, dirY, edge);
      if (hit !== null && (closest === null || hit < closest)) closest = hit;
    }
    return closest;
  }
  return rayIntersectCircle(origin, dirX, dirY, obstacle.x, obstacle.y, obstacle.radius);
}

// Second, independent sensor fan cast against obstacles only (stumps, bog
// holes, washouts) — same ray geometry as castSensors so readings line up
// index-for-index, but this channel lets the net tell "off the guidance
// line" (castSensors/walls) apart from "obstacle dead ahead, swerve" (this).
export function castObstacleSensors(
  origin: Point,
  heading: number,
  count: number,
  fanDegrees: number,
  range: number,
  obstacles: Obstacle[]
): number[] {
  const fanRad = (fanDegrees * Math.PI) / 180;
  const readings: number[] = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const angle = heading - fanRad / 2 + t * fanRad;
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);

    let closest = range;
    for (const obstacle of obstacles) {
      const hit = rayIntersectObstacle(origin, dirX, dirY, obstacle);
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
