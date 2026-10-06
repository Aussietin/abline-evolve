import { createLoveState, type LoveState } from "../sim/progress";

// Campaign progress lives under its own key so the existing v2 run save
// (fleet, upgrades, Legacy Points) keeps loading untouched.
const KEY = "abline-evolve-love-v1";

export function loadLove(): LoveState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as LoveState;
    if (p.version !== 1) return null;
    const base = createLoveState();
    return { ...base, ...p, fields: { ...p.fields }, achievements: [...(p.achievements ?? [])] };
  } catch {
    return null;
  }
}

export function saveLove(love: LoveState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(love));
  } catch {
    /* storage unavailable - progress just won't persist */
  }
}

export function clearLove(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
