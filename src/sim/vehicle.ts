import type { Vehicle, VehiclePhysicsConfig, Genome, NeuralNetConfig, Obstacle } from "./types";
import type { Track } from "./track";
import { castSensors, castObstacleSensors } from "./sensors";
import { forward } from "./neuralnet";
import { distanceToNearestWall, projectArcLength } from "./track";
import { hardObstacleHit, obstacleSpeedMultiplierAt } from "./obstacles";

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
  obstacles: Obstacle[],
  physics: VehiclePhysicsConfig,
  netCfg: NeuralNetConfig,
  dt: number
): void {
  if (!vehicle.alive) return;

  // Two independent sensor fans, same ray geometry: wallSensors reports how
  // far off the guidance corridor each ray reaches, obstacleSensors reports
  // the nearest stump/bog/washout along that same ray — so the net can tell
  // "drifting off the AB line" apart from "hazard dead ahead, swerve."
  const wallSensors = castSensors(
    vehicle,
    vehicle.heading,
    physics.sensorCount,
    physics.sensorFanDegrees,
    physics.sensorRange,
    track.walls
  );
  const obstacleSensors = castObstacleSensors(
    vehicle,
    vehicle.heading,
    physics.sensorCount,
    physics.sensorFanDegrees,
    physics.sensorRange,
    obstacles
  );
  vehicle.sensors = [...wallSensors, ...obstacleSensors];

  const inputs = [...vehicle.sensors, vehicle.speed / physics.maxSpeed];
  const [steer, throttle] = forward(netCfg, vehicle.genome, inputs);
  vehicle.lastSteer = steer;
  vehicle.lastThrottle = throttle;

  const speedMult = obstacleSpeedMultiplierAt(obstacles, vehicle);
  const effectiveMaxSpeed = physics.maxSpeed * speedMult;

  vehicle.speed += throttle * physics.maxAccel * dt;
  vehicle.speed = Math.max(0, Math.min(effectiveMaxSpeed, vehicle.speed));

  const turnScale = 0.3 + 0.7 * (vehicle.speed / physics.maxSpeed); // sluggish turning near-stationary
  vehicle.heading += steer * physics.maxTurnRate * turnScale * dt;

  vehicle.x += Math.cos(vehicle.heading) * vehicle.speed * dt;
  vehicle.y += Math.sin(vehicle.heading) * vehicle.speed * dt;
  vehicle.timeAlive += dt;

  const arc = projectArcLength(track, vehicle);
  if (arc > vehicle.arcProgress) vehicle.arcProgress = arc;

  // Stumps and washouts are hard hazards — same generation-ending collision
  // as running off the corridor. Bog holes are soft (handled above via the
  // speed multiplier only) and never end the generation.
  if (distanceToNearestWall(track, vehicle) < physics.radius || hardObstacleHit(obstacles, vehicle, physics.radius)) {
    vehicle.alive = false;
  }
  if (vehicle.arcProgress >= track.totalLength - 1) {
    vehicle.alive = false; // reached the end of the last row — stop simulating it
  }
}
