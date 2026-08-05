import { buildTrack, type Track } from "../sim/track";

// One hand-built paddock row for the MVP: a headland turn plus a boggy patch
// near the middle, so the tractor has to learn both steering and "don't gun
// it through the mud."
export function paddockTrack01(): Track {
  const centerline = [
    { x: 80, y: 520 },
    { x: 80, y: 380 },
    { x: 220, y: 300 },
    { x: 400, y: 340 },
    { x: 520, y: 260 },
    { x: 520, y: 140 },
    { x: 700, y: 80 },
    { x: 820, y: 120 },
  ];

  return buildTrack(centerline, 70, [{ x: 400, y: 340, radius: 45, speedMultiplier: 0.35 }]);
}
