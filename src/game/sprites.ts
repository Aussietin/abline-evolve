// Cheap, geometry-only top-down tractor sprite. Drawn every frame for every
// living vehicle (up to several dozen at 16x speed), so this stays a handful
// of fill calls with no shadows/gradients except on the single champion.

export function drawTractor(
  ctx: CanvasRenderingContext2D,
  radius: number,
  isBest: boolean
): void {
  // Local space: +x is heading (forward/nose), tractor is already
  // translated+rotated onto the vehicle's position/heading by the caller.
  const bodyLen = radius * 2.1;
  const bodyW = radius * 1.15;
  const rearW = radius * 1.55; // rear axle/wheels wider than front — tractor silhouette
  const frontW = radius * 0.9;

  const bodyColor = isBest ? "#8fe85a" : "#c8b888";
  const wheelColor = isBest ? "#264018" : "#2a281e";
  const cabColor = isBest ? "#dff5c8" : "#e6ddc4";

  // Rear wheels (wide stance, sit at the back of the body)
  ctx.fillStyle = wheelColor;
  ctx.fillRect(-bodyLen * 0.42, -rearW / 2, bodyLen * 0.24, rearW);
  // Front wheels (narrower)
  ctx.fillRect(bodyLen * 0.22, -frontW / 2, bodyLen * 0.16, frontW);

  // Chassis
  ctx.fillStyle = bodyColor;
  ctx.fillRect(-bodyLen / 2, -bodyW / 2, bodyLen, bodyW);

  // Cab block, offset toward the rear (where a real tractor cab sits)
  ctx.fillStyle = cabColor;
  ctx.fillRect(-bodyLen * 0.18, -bodyW * 0.32, bodyLen * 0.34, bodyW * 0.64);

  // Heading nose — small triangle at the front tip so orientation reads at
  // a glance relative to the AB line.
  ctx.fillStyle = isBest ? "#ffe25a" : "#8a8264";
  ctx.beginPath();
  ctx.moveTo(bodyLen / 2 + radius * 0.3, 0);
  ctx.lineTo(bodyLen / 2 - radius * 0.1, -radius * 0.35);
  ctx.lineTo(bodyLen / 2 - radius * 0.1, radius * 0.35);
  ctx.closePath();
  ctx.fill();
}
