import type { Population } from "../sim/population";
import type { MetaState, SaveData } from "../sim/gamestate";
import { toSaveData } from "../sim/gamestate";

// Only place in the codebase that touches localStorage — everything else
// (serialization shape, offline-progress math) is pure and lives in sim/.

const SAVE_KEY = "abline-evolve-save-v1";

export function saveGame(meta: MetaState, pop: Population): void {
  try {
    const data = toSaveData(meta, pop, Date.now());
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch (err) {
    // Storage can be full/unavailable (private browsing, quota) — an idle
    // game losing a save shouldn't crash the tab, just skip this save.
    console.warn("abline-evolve: save failed", err);
  }
}

export function loadGame(): SaveData | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SaveData;
    if (parsed.version !== 2) return null; // unknown/old/future save shape — start fresh rather than guess or migrate
    return parsed;
  } catch (err) {
    console.warn("abline-evolve: save data corrupted, starting fresh", err);
    return null;
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // ignore
  }
}
