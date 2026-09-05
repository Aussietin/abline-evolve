// Top-down precision agriculture tractor sprite.
// Renders realistic agricultural proportions: long chassis hood, rear cab with glass reflection,
// GPS guidance receiver dome, rear hitch with cultivator implement, and front wheels that
// articulate with steering angle.

export function drawTractor(
  ctx: CanvasRenderingContext2D,
  radius: number,
  isBest: boolean,
  steerAngle: number = 0,
  isManual: boolean = false
): void {
  // Local space: (0,0) is vehicle center, +x is forward (heading)
  const bodyLen = radius * 2.3;
  const bodyW = radius * 1.15;
  const rearW = radius * 1.65;
  const frontW = radius * 1.1;

  // Colors based on status
  let bodyColor = "#b89e72"; // Dusty workhorse fleet
  let hoodColor = "#9e845a";
  let cabColor = "#d6cbaf";
  let glassColor = "rgba(40, 60, 50, 0.85)";
  let rimColor = "#c29d38";
  let tireColor = "#22201c";
  let gpsDomeColor = "#e0e0e0";

  if (isBest) {
    bodyColor = "#44a627"; // Vibrant Precision Ag Green
    hoodColor = "#36881e";
    cabColor = "#52c230";
    glassColor = "rgba(25, 45, 55, 0.9)";
    rimColor = "#ffd230"; // Classic Ag yellow rims
    tireColor = "#1a1c18";
    gpsDomeColor = "#ffe640"; // Glowing GPS receiver
  } else if (isManual) {
    bodyColor = "#2589d8"; // Player manual test drive tractor (Electric Blue)
    hoodColor = "#1d6eb0";
    cabColor = "#3da5f8";
    glassColor = "rgba(10, 30, 60, 0.9)";
    rimColor = "#ffffff";
    tireColor = "#181a20";
    gpsDomeColor = "#00ffff";
  }

  // 1. Rear Cultivator Implement / Tool-Bar (trailing hitch)
  const hitchX = -bodyLen * 0.58;
  ctx.strokeStyle = "#444038";
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(-bodyLen * 0.45, 0);
  ctx.lineTo(hitchX, 0);
  // Cross bar
  ctx.moveTo(hitchX, -rearW * 0.6);
  ctx.lineTo(hitchX, rearW * 0.6);
  ctx.stroke();

  // Tine tips / disks on cultivator
  ctx.fillStyle = isBest ? "#ffe640" : "#777265";
  const tines = [-rearW * 0.55, -rearW * 0.28, 0, rearW * 0.28, rearW * 0.55];
  for (const ty of tines) {
    ctx.fillRect(hitchX - 1.5, ty - 1, 3, 2);
  }

  // 2. Rear Heavy-Duty Tires (Wide Stance, Deep Treads)
  const rearTireW = bodyLen * 0.3;
  const rearTireH = radius * 0.46;
  const rearTireX = -bodyLen * 0.42;

  // Left & Right rear tires
  [-rearW / 2, rearW / 2 - rearTireH].forEach((ty) => {
    // Tire body
    ctx.fillStyle = tireColor;
    ctx.beginPath();
    ctx.roundRect(rearTireX, ty, rearTireW, rearTireH, 2);
    ctx.fill();

    // Tread ribs
    ctx.strokeStyle = "#383630";
    ctx.lineWidth = 1;
    for (let tx = rearTireX + 2; tx < rearTireX + rearTireW - 1; tx += 4) {
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(tx + 2, ty + rearTireH);
      ctx.stroke();
    }

    // Wheel Rim
    ctx.fillStyle = rimColor;
    ctx.fillRect(rearTireX + rearTireW * 0.25, ty + rearTireH * 0.25, rearTireW * 0.5, rearTireH * 0.5);
  });

  // 3. Front Steerable Wheels (Articulated with steer angle!)
  const frontTireW = bodyLen * 0.22;
  const frontTireH = radius * 0.34;
  const frontAxleX = bodyLen * 0.32;
  const clampedSteer = Math.max(-0.65, Math.min(0.65, steerAngle));

  [-frontW / 2 + frontTireH / 2, frontW / 2 - frontTireH / 2].forEach((ty) => {
    ctx.save();
    ctx.translate(frontAxleX, ty);
    ctx.rotate(clampedSteer);

    // Tire
    ctx.fillStyle = tireColor;
    ctx.beginPath();
    ctx.roundRect(-frontTireW / 2, -frontTireH / 2, frontTireW, frontTireH, 2);
    ctx.fill();

    // Front Rim
    ctx.fillStyle = rimColor;
    ctx.fillRect(-frontTireW * 0.25, -frontTireH * 0.25, frontTireW * 0.5, frontTireH * 0.5);
    ctx.restore();
  });

  // 4. Main Body / Hood & Engine Bay
  ctx.fillStyle = hoodColor;
  ctx.beginPath();
  // Tapered hood toward the nose
  ctx.moveTo(bodyLen * 0.48, -frontW * 0.32);
  ctx.lineTo(bodyLen * 0.48, frontW * 0.32);
  ctx.lineTo(-bodyLen * 0.1, bodyW * 0.5);
  ctx.lineTo(-bodyLen * 0.48, bodyW * 0.5);
  ctx.lineTo(-bodyLen * 0.48, -bodyW * 0.5);
  ctx.lineTo(-bodyLen * 0.1, -bodyW * 0.5);
  ctx.closePath();
  ctx.fill();

  // Front Radiator Grille
  ctx.fillStyle = "#181a14";
  ctx.beginPath();
  ctx.roundRect(bodyLen * 0.44, -frontW * 0.25, bodyLen * 0.06, frontW * 0.5, 1);
  ctx.fill();

  // Headlights
  if (isBest || isManual) {
    ctx.fillStyle = "#fffbe0";
    ctx.fillRect(bodyLen * 0.45, -frontW * 0.28, 2, 3);
    ctx.fillRect(bodyLen * 0.45, frontW * 0.28 - 3, 2, 3);
  }

  // Exhaust Stack (Vertical pipe on right side of hood)
  ctx.fillStyle = "#222";
  ctx.beginPath();
  ctx.arc(bodyLen * 0.15, -bodyW * 0.36, radius * 0.14, 0, Math.PI * 2);
  ctx.fill();

  // 5. Operator Cab (Situated toward rear, over rear axle)
  const cabX = -bodyLen * 0.34;
  const cabY = -bodyW * 0.42;
  const cabWidth = bodyLen * 0.42;
  const cabHeight = bodyW * 0.84;

  ctx.fillStyle = bodyColor;
  ctx.beginPath();
  ctx.roundRect(cabX, cabY, cabWidth, cabHeight, 3);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Cab Glass (Wraparound front & rear windshield)
  ctx.fillStyle = glassColor;
  ctx.beginPath();
  ctx.roundRect(cabX + 2, cabY + 2, cabWidth - 4, cabHeight - 4, 2);
  ctx.fill();

  // Glass specular highlight streak
  ctx.strokeStyle = "rgba(255, 255, 255, 0.45)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(cabX + 4, cabY + 4);
  ctx.lineTo(cabX + cabWidth * 0.7, cabY + cabHeight - 4);
  ctx.stroke();

  // Cab Roof Cap
  ctx.fillStyle = cabColor;
  ctx.beginPath();
  ctx.roundRect(cabX + 3, cabY + 3, cabWidth - 6, cabHeight - 6, 2);
  ctx.fill();

  // 6. GPS Guidance Receiver Dome ("The StarFire / Trimble Dome")
  // The essential visual identifier of precision AB-line auto-steer!
  ctx.fillStyle = gpsDomeColor;
  ctx.beginPath();
  ctx.arc(cabX + cabWidth * 0.5, 0, radius * 0.28, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#444";
  ctx.lineWidth = 0.8;
  ctx.stroke();

  if (isBest) {
    // Faint satellite lock pulse on champion
    ctx.fillStyle = "rgba(255, 230, 60, 0.85)";
    ctx.beginPath();
    ctx.arc(cabX + cabWidth * 0.5, 0, radius * 0.12, 0, Math.PI * 2);
    ctx.fill();
  }
}
