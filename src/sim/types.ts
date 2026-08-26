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
}

export interface Genome {
  weights: Float32Array;
}

export interface NeuralNetConfig {
  inputSize: number; // sensorCount + 1 (speed)
  hiddenSize: number;
  outputSize: number; // 2: steer, throttle
  hiddenSize2?: number; // optional second hidden layer — the "Neural Expansion" upgrade.
  // Omitted/undefined preserves the original single-hidden-layer MVP topology exactly.
}
