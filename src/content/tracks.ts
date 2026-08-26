import { buildBoustrophedonField, type Track } from "../sim/track";

// v3 paddock: 4 parallel AB-line rows worked in sequence (row 1 end-to-end,
// headland U-turn, row 2 back the other way, ...) — real multi-row coverage
// instead of one S-curve. Obstacles (stumps/bog holes/washouts) are no
// longer baked in here — they're generated fresh every generation, see
// sim/obstacles.ts.
export function paddockField01(): Track {
  return buildBoustrophedonField(
    {
      rowCount: 4,
      rowLength: 650,
      rowSpacing: 90,
      startX: 80,
      startY: 120,
      turnSegments: 12,
    },
    70
  );
}
