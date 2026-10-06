import { FIELDS } from "../content/tracks";
import { ACHIEVEMENTS, isFieldUnlocked, totalStars, type LoveState } from "../sim/progress";
import { sound } from "../game/audio";

// DOM for the campaign layer: title screen, fields/medals sheet, clear card.
// All state comes in as arguments; nothing here owns game state.

const MEDAL_ICONS: Record<string, string> = {
  turn: "↪️",
  "first-clear": "🌾",
  "three-star": "🌟",
  "all-fields": "🗺️",
  "all-stars": "👑",
  "gen-100": "🧬",
  "gen-1000": "🏛️",
  "cash-5k": "💰",
  brain: "🧠",
  retire: "🎣",
  driver: "🚜",
};

function starsHtml(n: number): string {
  let out = "";
  for (let i = 0; i < 3; i++) out += i < n ? '<span class="on">★</span>' : "★";
  return `<span class="stars" aria-label="${n} of 3 stars">${out}</span>`;
}

export interface FieldsSheetHandlers {
  onPick: (index: number) => void;
}

let sheetTab: "fields" | "medals" = "fields";

export function renderFieldsSheet(love: LoveState, handlers: FieldsSheetHandlers): void {
  const body = document.getElementById("fields-body")!;
  document.querySelectorAll<HTMLButtonElement>("#fields-overlay .sheet-tab").forEach((b) => {
    b.classList.toggle("active", b.dataset.tab === sheetTab);
  });
  body.innerHTML = "";

  if (sheetTab === "fields") {
    const ids = FIELDS.map((f) => f.id);
    FIELDS.forEach((f, i) => {
      const rec = love.fields[f.id];
      const unlocked = isFieldUnlocked(love, ids, i);
      const current = love.currentField === i;
      const card = document.createElement("div");
      card.className = "field-card" + (current ? " current" : "") + (unlocked ? "" : " locked");
      const meta = !unlocked
        ? "Locked - clear the previous field"
        : rec?.bestGen
          ? `Best: cleared in ${rec.bestGen} gens  |  3★ <= ${f.par3}, 2★ <= ${f.par2}`
          : `Target: 3★ <= ${f.par3} gens, 2★ <= ${f.par2}`;
      card.innerHTML = `
        <div class="field-info">
          <div class="field-name">${i + 1}. ${f.name}</div>
          <div class="field-blurb">${f.blurb}</div>
          <div class="field-meta">${meta}</div>
        </div>
        ${starsHtml(rec?.stars ?? 0)}`;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "field-go";
      btn.textContent = current ? "Here" : unlocked ? "Go" : "Locked";
      btn.disabled = current || !unlocked;
      btn.addEventListener("click", () => handlers.onPick(i));
      card.appendChild(btn);
      body.appendChild(card);
    });
  } else {
    const got = ACHIEVEMENTS.filter((a) => love.achievements.includes(a.id)).length;
    const count = document.createElement("div");
    count.className = "medal-count";
    count.textContent = `${got} / ${ACHIEVEMENTS.length} medals  |  ${totalStars(love)} / ${FIELDS.length * 3} stars`;
    body.appendChild(count);
    for (const a of ACHIEVEMENTS) {
      const has = love.achievements.includes(a.id);
      const el = document.createElement("div");
      el.className = "medal" + (has ? " got" : "");
      el.innerHTML = `<div class="m-ico">${MEDAL_ICONS[a.id] ?? "🏅"}</div>
        <div><div class="m-name">${a.name}</div><div class="m-desc">${a.desc}</div></div>`;
      body.appendChild(el);
    }
  }
}

export function wireFieldsSheet(getLove: () => LoveState, handlers: FieldsSheetHandlers): { open: () => void; close: () => void } {
  const overlay = document.getElementById("fields-overlay")!;
  const open = () => {
    overlay.style.display = "flex";
    renderFieldsSheet(getLove(), handlers);
  };
  const close = () => {
    overlay.style.display = "none";
  };
  document.getElementById("fields-close")!.addEventListener("click", () => {
    sound.playClick();
    close();
  });
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  document.querySelectorAll<HTMLButtonElement>("#fields-overlay .sheet-tab").forEach((b) => {
    b.addEventListener("click", () => {
      sound.playClick();
      sheetTab = b.dataset.tab === "medals" ? "medals" : "fields";
      renderFieldsSheet(getLove(), handlers);
    });
  });
  return { open, close };
}

export interface ClearCardInfo {
  fieldName: string;
  stars: number;
  gen: number;
  bonus: number;
  firstClear: boolean;
  par3: number;
  par2: number;
  nextName: string | null;
}

export function showClearCard(info: ClearCardInfo, onNext: (() => void) | null, onKeep: () => void): void {
  const overlay = document.getElementById("clear-overlay")!;
  const card = overlay.querySelector<HTMLElement>(".clear-card")!;
  const nextStars = info.stars < 3 ? (info.stars === 2 ? info.par3 : info.par2) : null;
  card.innerHTML = `
    <h3>FIELD CLEARED!</h3>
    <div class="clear-sub">${info.fieldName} - ${info.gen} generations</div>
    <div class="clear-stars">${[0, 1, 2]
      .map((i) => `<span class="st${i < info.stars ? " on" : ""}" style="animation-delay:${0.35 + i * 0.4}s">★</span>`)
      .join("")}</div>
    ${info.bonus > 0 ? `<div class="clear-bonus">+${info.bonus} credits</div>` : ""}
    <div class="clear-par">${nextStars ? `Clear it in ${nextStars} gens or fewer for ${info.stars + 1}★` : "Perfect run!"}</div>
    <div class="clear-actions"></div>`;
  const actions = card.querySelector(".clear-actions")!;
  const close = () => {
    overlay.style.display = "none";
  };
  if (onNext && info.nextName) {
    const next = document.createElement("button");
    next.type = "button";
    next.className = "big-btn";
    next.textContent = `Next: ${info.nextName} ▶`;
    next.addEventListener("click", () => {
      sound.playClick();
      close();
      onNext();
    });
    actions.appendChild(next);
  }
  const keep = document.createElement("button");
  keep.type = "button";
  keep.className = "big-btn ghost";
  keep.textContent = "Keep evolving";
  keep.addEventListener("click", () => {
    sound.playClick();
    close();
    onKeep();
  });
  actions.appendChild(keep);

  overlay.style.display = "flex";
  // Confetti
  const colors = ["#ffd230", "#52e078", "#38bdf8", "#c084fc", "#f87171"];
  for (let i = 0; i < 36; i++) {
    const c = document.createElement("span");
    c.className = "confetti";
    c.style.left = `${Math.random() * 100}%`;
    c.style.background = colors[i % colors.length];
    c.style.animationDelay = `${Math.random() * 0.6}s`;
    c.style.animationDuration = `${1.6 + Math.random() * 1.2}s`;
    card.appendChild(c);
  }
  sound.playFanfare();
  for (let i = 0; i < info.stars; i++) setTimeout(() => sound.playStar(i), 350 + i * 400);
}

export function setTitleStats(love: LoveState, gen: number): void {
  const el = document.getElementById("title-stats")!;
  const parts: string[] = [];
  if (gen > 1 || love.totalGens > 0) parts.push(`Gen ${gen}`);
  if (totalStars(love) > 0) parts.push(`★ ${totalStars(love)}/${FIELDS.length * 3}`);
  if (love.achievements.length > 0) parts.push(`Medals ${love.achievements.length}/${ACHIEVEMENTS.length}`);
  el.innerHTML = parts.map((p) => `<span>${p}</span>`).join("");
  const play = document.getElementById("title-play")!;
  play.textContent = parts.length > 0 ? "▶ Continue" : "▶ Play";
}
