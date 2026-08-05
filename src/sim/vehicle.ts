import type { Vehicle, VehiclePhysicsConfig, Genome, NeuralNetConfig } from "./types";
import type { Track } from "./track";
import { castSensors } from "./sensors";
import { forward } from "./neuralnet";
import { distanceToNearestWall, mudSpeedMultiplierAt, projectArcLength } from "./track";

export function spawnVehicle(track: Track, genome: Genome): Vehicle {
  return {
    x: track.startPose.x,
    y: track.startPose.y,
    heading: track.startPose.heading,
    speed: 0,
    sensors: [],
    genome,
    alive: true,
    timeAlive: 0,
    arcProgress: 0,
  };
}

export function stepVehicle(
  vehicle: Vehicle,
  track: Track,
  physics: VehiclePhysicsConfig,
  netCfg: NeuralNetConfig,
  dt: number
): void {
  if (!vehicle.alive) return;

  vehicle.sensors = castSensors(
    vehicle,
    vehicle.heading,
    physics.sensorCount,
    physics.sensorFanDegrees,
    physics.sensorRange,
    track.walls
  );

  const inputs = [...vehicle.sensors, vehicle.speed / physics.maxSpeed];
  const [steer, throttle] = forward(netCfg, vehicle.genome, inputs);

  const mudMult = mudSpeedMultiplierAt(track, vehicle);
  const effectiveMaxSpeed = physics.maxSpeed * mudMult;

  vehicle.speed += throttle * physics.maxAccel * dt;
  vehicle.speed = Math.max(0, Math.min(effectiveMaxSpeed, vehicle.speed));

  const turnScale = 0.3 + 0.7 * (vehicle.speed / physics.maxSpeed); // sluggish turning near-stationary
  vehicle.heading += steer * physics.maxTurnRate * turnScale * dt;

  vehicle.x += Math.cos(vehicle.heading) * vehicle.speed * dt;
  vehicle.y += Math.sin(vehicle.heading) * vehicle.speed * dt;
  vehicle.timeAlive += dt;

  const arc = projectArcLength(track, vehicle);
  if (arc > vehicle.arcProgress) vehicle.arcProgress = arc;

  if (distanceToNearestWall(track, vehicle) < physics.radius) {
    vehicle.alive = false;
  }
  if (vehicle.arcProgress >= track.totalLength - 1) {
    vehicle.alive = false; // reached the end of the row — stop simulating it
  }
}
