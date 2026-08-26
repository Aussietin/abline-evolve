import type { LineSegment, Point } from "./types";
import { pointSegmentDistance } from "./sensors";

export interface Track {
  id: string;
  centerline: Point[];
  width: number;
  walls: LineSegment[]; // left + right boundary segments, for sensors/collision
  gates: LineSegment[]; // perpendicular cross-lines at each centerline vertex (visual only)
  startPose: { x: number; y: number; heading: number };
  cumDist: number[]; // cumulative arc length at each centerline vertex
  totalLength: number;
  rowCount: number; // v3: number of parallel AB-line rows this track covers (1 for a plain single line)
  rowEndDistances: number[]; // v3: cumulative arc length at the end of each row, for "row X of N" HUD/fitness display
}

function perpendicular(dx: number, dy: number): Point {
  const len = Math.hypot(dx, dy) || 1;
  return { x: -dy / len, y: dx / len };
}

export function buildTrack(centerline: Point[], width: number): Track {
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
  const totalLength = cumDist[cumDist.length - 1];

  return {
    id: "paddock-01",
    centerline,
    width,
    walls,
    gates,
    startPose: { x: start.x, y: start.y, heading: startHeading },
    cumDist,
    totalLength,
    rowCount: 1,
    rowEndDistances: [totalLength],
  };
}

export interface FieldLayoutConfig {
  rowCount: number;
  rowLength: number;
  rowSpacing: number; // vertical gap between row centerlines; also sets the headland U-turn radius (spacing/2)
  startX: number;
  startY: number;
  turnSegments?: number; // points used to approximate each headland semicircle
}

// Builds a real multi-row paddock: `rowCount` parallel rows worked in a
// boustrophedon ("back and forth") pattern — row 1 end to end, a headland
// U-turn, row 2 in the opposite direction, and so on — exactly how a real
// spray/plant job covers a paddock. It's expressed as one long continuous
// centerline (straight row segments + semicircular headland turns), which
// means every existing centerline-consumer (buildTrack, projectArcLength,
// distanceToNearestWall, the renderer's baked static layer) works on it
// completely unchanged — multi-row coverage falls out of richer geometry,
// not a new mechanic.
export function buildBoustrophedonField(cfg: FieldLayoutConfig, width: number): Track {
  const { rowCount, rowLength, rowSpacing, startX, startY, turnSegments = 12 } = cfg;
  const points: Point[] = [];
  const rowEndPointIdx: number[] = [];
  let goingRight = true;

  for (let r = 0; r < rowCount; r++) {
    const y = startY + r * rowSpacing;
    const xStart = goingRight ? startX : startX + rowLength;
    const xEnd = goingRight ? startX + rowLength : startX;
    points.push({ x: xStart, y });
    points.push({ x: xEnd, y });
    rowEndPointIdx.push(points.length - 1);

    if (r < rowCount - 1) {
      // Headland turn: a semicircle centered between this row and the next,
      // bulging outward past the field edge (away from xStart) so the path
      // stays smooth and never overlaps itself.
      const cx = xEnd;
      const cy = y + rowSpacing / 2;
      const radius = rowSpacing / 2;
      const sweep = goingRight ? 1 : -1;
      for (let s = 1; s < turnSegments; s++) {
        const t = s / turnSegments;
        const angle = -Math.PI / 2 + sweep * t * Math.PI;
        points.push({ x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius });
      }
      goingRight = !goingRight;
    }
  }

  const track = buildTrack(points, width);
  const rowEndDistances = rowEndPointIdx.map((i) => track.cumDist[i]);
  return { ...track, rowCount, rowEndDistances };
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

// Which row (1-indexed) a given arc-length distance along the centerline
// currently falls in — for the "Row X / N" HUD readout.
export function rowIndexAtArc(track: Track, arc: number): number {
  for (let i = 0; i < track.rowEndDistances.length; i++) {
    if (arc <= track.rowEndDistances[i]) return i + 1;
  }
  return track.rowCount;
}
