// Campaign progress: star ratings per field, unlocks and achievements.
// Pure and headless - no DOM, no localStorage (game/loveSave.ts owns storage).

export interface FieldRecord {
  stars: number; // 0 = not cleared
  bestGen: number | null; // fewest generations to clear
}

export interface LoveState {
  version: 1;
  currentField: number;
  fields: Record<string, FieldRecord>;
  achievements: string[];
  totalGens: number; // lifetime generations bred
  manualRow: number; // furthest row reached in manual test drive
}

export function createLoveState(): LoveState {
  return { version: 1, currentField: 0, fields: {}, achievements: [], totalGens: 0, manualRow: 0 };
}

export function starsForGeneration(gen: number, par3: number, par2: number): number {
  if (gen <= par3) return 3;
  if (gen <= par2) return 2;
  return 1;
}

export interface ClearResult {
  stars: number;
  firstClear: boolean;
  improvedStars: number; // stars better than the previous record (0 if none)
}

export function recordClear(love: LoveState, fieldId: string, gen: number, par3: number, par2: number): ClearResult {
  const stars = starsForGeneration(gen, par3, par2);
  const prev = love.fields[fieldId] ?? { stars: 0, bestGen: null };
  const improved = Math.max(0, stars - prev.stars);
  love.fields[fieldId] = {
    stars: Math.max(prev.stars, stars),
    bestGen: prev.bestGen === null ? gen : Math.min(prev.bestGen, gen),
  };
  return { stars, firstClear: prev.stars === 0, improvedStars: improved };
}

// Field i is playable once field i-1 has at least one star. Field 0 is always open.
export function isFieldUnlocked(love: LoveState, fieldIds: string[], index: number): boolean {
  if (index <= 0) return true;
  return (love.fields[fieldIds[index - 1]]?.stars ?? 0) > 0;
}

export function totalStars(love: LoveState): number {
  let n = 0;
  for (const k in love.fields) n += love.fields[k].stars;
  return n;
}

export interface AchievementSnapshot {
  love: LoveState;
  fieldCount: number;
  totalCredits: number;
  retirements: number;
  neuralExpansion: boolean;
  bestRowReached: number; // champion, this field
}

export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
  test: (s: AchievementSnapshot) => boolean;
}

const cleared = (s: AchievementSnapshot) => Object.values(s.love.fields).filter((f) => f.stars > 0).length;
const perfect = (s: AchievementSnapshot) => Object.values(s.love.fields).filter((f) => f.stars >= 3).length;

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: "turn", name: "Headland Turn", desc: "Get a tractor into row 2.", test: (s) => s.bestRowReached >= 2 },
  { id: "first-clear", name: "Paddock Cleared", desc: "Finish any field.", test: (s) => cleared(s) >= 1 },
  { id: "three-star", name: "Perfectionist", desc: "Earn 3 stars on a field.", test: (s) => perfect(s) >= 1 },
  { id: "all-fields", name: "Whole Farm", desc: "Clear every field.", test: (s) => cleared(s) >= s.fieldCount },
  { id: "all-stars", name: "Master Farmer", desc: "3 stars on every field.", test: (s) => perfect(s) >= s.fieldCount },
  { id: "gen-100", name: "Century Breeder", desc: "Breed 100 generations.", test: (s) => s.love.totalGens >= 100 },
  { id: "gen-1000", name: "Dynasty", desc: "Breed 1000 generations.", test: (s) => s.love.totalGens >= 1000 },
  { id: "cash-5k", name: "Cash Crop", desc: "Earn 5,000 credits.", test: (s) => s.totalCredits >= 5000 },
  { id: "brain", name: "Big Brain", desc: "Install Neural Expansion.", test: (s) => s.neuralExpansion },
  { id: "retire", name: "Gone Fishing", desc: "Retire a fleet for Legacy Points.", test: (s) => s.retirements >= 1 },
  { id: "driver", name: "Hands On", desc: "Drive into row 2 yourself.", test: (s) => s.love.manualRow >= 2 },
];

// Returns the achievements newly earned (and records them on `love`).
export function checkAchievements(snap: AchievementSnapshot): AchievementDef[] {
  const fresh: AchievementDef[] = [];
  for (const a of ACHIEVEMENTS) {
    if (!snap.love.achievements.includes(a.id) && a.test(snap)) {
      snap.love.achievements.push(a.id);
      fresh.push(a);
    }
  }
  return fresh;
}
