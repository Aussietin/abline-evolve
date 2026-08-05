import type { Track } from "../sim/track";
import type { Population } from "../sim/population";
import type { VehiclePhysicsConfig } from "../sim/types";

export function renderTrack(ctx: CanvasRenderingContext2D, track: Track): void {
  ctx.strokeStyle = "#8a7a4a";
  ctx.lineWidth = 3;
  for (const wall of track.walls) {
    ctx.beginPath();
    ctx.moveTo(wall.a.x, wall.a.y);
    ctx.lineTo(wall.b.x, wall.b.y);
    ctx.stroke();
  }

  ctx.strokeStyle = "#c9c07a";
  ctx.setLineDash([8, 8]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  track.centerline.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = "rgba(90, 60, 20, 0.55)";
  for (const patch of track.mud) {
    ctx.beginPath();
    ctx.arc(patch.x, patch.y, patch.radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function renderPopulation(
  ctx: CanvasRenderingContext2D,
  pop: Population,
  physics: VehiclePhysicsConfig
): void {
  pop.vehicles.forEach((v, i) => {
    if (!v.alive) return;
    const isBest = i === pop.currentBestIndex;

    ctx.save();
    ctx.translate(v.x, v.y);
    ctx.rotate(v.heading);
    ctx.fillStyle = isBest ? "#6fd142" : "rgba(220, 200, 160, 0.55)";
    ctx.fillRect(-physics.radius, -physics.radius * 0.65, physics.radius * 2, physics.radius * 1.3);
    ctx.restore();

    if (isBest) {
      drawSensors(ctx, v, physics);
    }
  });
}

function drawSensors(
  ctx: CanvasRenderingContext2D,
  v: { x: number; y: number; heading: number; sensors: number[] },
  physics: VehiclePhysicsConfig
): void {
  const fanRad = (physics.sensorFanDegrees * Math.PI) / 180;
  ctx.strokeStyle = "rgba(111, 209, 66, 0.35)";
  ctx.lineWidth = 1;
  v.sensors.forEach((reading, i) => {
    const t = physics.sensorCount === 1 ? 0.5 : i / (physics.sensorCount - 1);
    const angle = v.heading - fanRad / 2 + t * fanRad;
    const dist = reading * physics.sensorRange;
    ctx.beginPath();
    ctx.moveTo(v.x, v.y);
    ctx.lineTo(v.x + Math.cos(angle) * dist, v.y + Math.sin(angle) * dist);
    ctx.stroke();
  });
}
