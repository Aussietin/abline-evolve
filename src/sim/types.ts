export interface Point {
  x: number;
  y: number;
}

export interface LineSegment {
  a: Point;
  b: Point;
}

export interface VehiclePhysicsConfig {
  maxSpeed: number; // px/s on clean ground
  maxAccel: number; // px/s^2
  maxTurnRate: number; // rad/s at full speed
  radius: number; // collision radius, px
  sensorCount: number;
  sensorRange: number; // px
  sensorFanDegrees: number; // total fan width, centered on heading
}

export interface Vehicle {
  x: number;
  y: number;
  heading: number; // radians
  speed: number;
  sensors: number[]; // normalized 0..1 distance readings, this tick
  genome: Genome;
  alive: boolean;
  timeAlive: number;
  arcProgress: number; // furthest arc-length reached along centerline
  lastSteer?: number;
  lastThrottle?: number;
}

export interface Genome {
  weights: Float32Array;
}

export interface NeuralNetConfig {
  inputSize: number; // v3: sensorCount*2 (wall channel + obstacle channel per ray) + 1 (speed)
  hiddenSize: number;
  outputSize: number; // 2: steer, throttle
  hiddenSize2?: number; // optional second hidden layer — the "Neural Expansion" upgrade.
  // Omitted/undefined preserves the original single-hidden-layer MVP topology exactly.
  // (v3 note: base topology/upgrade behavior deliberately left untouched — see neuralnet.ts.
  // inputSize did change in v3, for the new obstacle sensor channel below, which is why
  // save compatibility still needs a version bump despite the hidden-layer count being unchanged.)
}

// --- Obstacles (v3): procedurally placed per generation, never baked into a
// static track. Kept in types.ts (zero imports) so both sensors.ts and
// obstacles.ts can share the shapes without a circular import between them.

export interface CircleObstacle {
  kind: "stump" | "bog"; // stump = hard collision hazard, bog = traction/speed hazard
  x: number;
  y: number;
  radius: number;
}

export interface WashoutObstacle {
  kind: "washout"; // elongated erosion channel — hard collision, capsule-shaped
  a: Point;
  b: Point;
  halfWidth: number;
}

export type Obstacle = CircleObstacle | WashoutObstacle;

// The washout's four bounding edges (a rectangle running along a→b, halfWidth
// either side), used identically for raycasting (sensors.ts) and drawing
// (render.ts) so both agree on the same shape.
export function washoutEdges(w: WashoutObstacle): LineSegment[] {
  const dx = w.b.x - w.a.x;
  const dy = w.b.y - w.a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const hw = w.halfWidth;
  const p1: Point = { x: w.a.x + nx * hw, y: w.a.y + ny * hw };
  const p2: Point = { x: w.b.x + nx * hw, y: w.b.y + ny * hw };
  const p3: Point = { x: w.b.x - nx * hw, y: w.b.y - ny * hw };
  const p4: Point = { x: w.a.x - nx * hw, y: w.a.y - ny * hw };
  return [
    { a: p1, b: p2 },
    { a: p2, b: p3 },
    { a: p3, b: p4 },
    { a: p4, b: p1 },
  ];
}
