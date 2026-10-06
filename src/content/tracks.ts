import { buildBoustrophedonField, type Track } from "../sim/track";
import { DEFAULT_OBSTACLE_CONFIG, type ObstacleGenConfig } from "../sim/obstacles";

// A campaign of fields. Each is a boustrophedon (back-and-forth) paddock; later
// ones are bigger, tighter and rougher. Obstacles are still generated fresh
// every generation (sim/obstacles.ts), tuned per field via obstacleCfg.
export interface FieldDef {
  id: string;
  name: string;
  blurb: string;
  build: () => Track;
  // Generation targets for the star rating: finish the field by gen <= par3 for
  // three stars, <= par2 for two, any time for one.
  par3: number;
  par2: number;
  clearBonus: number; // credits per star on a clear (first clear and each improvement)
}

function rough(more: Partial<ObstacleGenConfig>): ObstacleGenConfig {
  return { ...DEFAULT_OBSTACLE_CONFIG, ...more };
}

export const FIELDS: FieldDef[] = [
  {
    id: "paddock-01",
    name: "Home Paddock",
    blurb: "4 rows. Gentle ground, a few stumps. Learn the line.",
    par3: 90,
    par2: 250,
    clearBonus: 120,
    build: () =>
      buildBoustrophedonField(
        { id: "paddock-01", rowCount: 4, rowLength: 650, rowSpacing: 90, startX: 80, startY: 120, turnSegments: 12 },
        70
      ),
  },
  {
    id: "creek-flats",
    name: "Creek Flats",
    blurb: "5 longer rows, a narrower lane, washouts after the rain.",
    par3: 140,
    par2: 380,
    clearBonus: 260,
    build: () =>
      buildBoustrophedonField(
        {
          id: "creek-flats", rowCount: 5, rowLength: 720, rowSpacing: 80, startX: 70, startY: 100, turnSegments: 12,
          obstacleCfg: rough({ stumpCount: [3, 5], bogCount: [1, 3], washoutCount: [1, 2] }),
        },
        62
      ),
  },
  {
    id: "rangeview-block",
    name: "Rangeview Block",
    blurb: "6 tight rows and lots of bog holes. Speed alone will not save you.",
    par3: 200,
    par2: 520,
    clearBonus: 480,
    build: () =>
      buildBoustrophedonField(
        {
          id: "rangeview-block", rowCount: 6, rowLength: 760, rowSpacing: 72, startX: 60, startY: 90, turnSegments: 12,
          obstacleCfg: rough({ stumpCount: [4, 6], bogCount: [3, 5], bogRadius: [22, 34], washoutCount: [1, 2] }),
        },
        56
      ),
  },
  {
    id: "marwood-mega",
    name: "Marwood Mega-Block",
    blurb: "8 skinny rows, hazards everywhere. The boss paddock.",
    par3: 320,
    par2: 800,
    clearBonus: 900,
    build: () =>
      buildBoustrophedonField(
        {
          id: "marwood-mega", rowCount: 8, rowLength: 800, rowSpacing: 64, startX: 50, startY: 70, turnSegments: 12,
          obstacleCfg: rough({ stumpCount: [5, 8], bogCount: [3, 5], washoutCount: [2, 3], washoutLength: [50, 100] }),
        },
        50
      ),
  },
];

// Back-compat: the original single paddock.
export function paddockField01(): Track {
  return FIELDS[0].build();
}
