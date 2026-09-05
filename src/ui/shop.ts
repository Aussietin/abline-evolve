import { UPGRADES, upgradeCost, type UpgradeId, type UpgradeLevels } from "../sim/upgrades";
import { PERMANENT_UPGRADES, permanentUpgradeCost, type PermanentUpgradeId, type PermanentUpgradeLevels } from "../sim/prestige";
import type { EconomyState } from "../sim/economy";
import { sound } from "../game/audio";

export interface ShopCallbacks {
  onBuyUpgrade: (id: UpgradeId) => void;
  onBuyPermanent: (id: PermanentUpgradeId) => void;
  onRetire: () => void;
}

export function buildShopPanel(container: HTMLElement, callbacks: ShopCallbacks): void {
  container.innerHTML = `
    <div class="shop-tabs">
      <button id="tab-run-btn" class="shop-tab-btn active">⚡ Fleet Upgrades (This Run)</button>
      <button id="tab-legacy-btn" class="shop-tab-btn">🌟 Legacy Tech (Permanent)</button>
    </div>

    <div id="tab-run-content" class="shop-tab-content">
      <div id="shop-upgrades-grid" class="shop-grid"></div>
    </div>

    <div id="tab-legacy-content" class="shop-tab-content" style="display: none;">
      <div id="shop-legacy-grid" class="shop-grid"></div>
      <div class="retire-box">
        <div class="retire-description">
          Retiring resets your current run's fleet and run upgrades, but awards permanent <strong>Legacy Points</strong> based on total credits earned.
        </div>
        <button id="retire-btn" class="retire-btn">Retire Fleet</button>
      </div>
    </div>
  `;

  const runTabBtn = container.querySelector("#tab-run-btn") as HTMLButtonElement;
  const legacyTabBtn = container.querySelector("#tab-legacy-btn") as HTMLButtonElement;
  const runContent = container.querySelector("#tab-run-content") as HTMLElement;
  const legacyContent = container.querySelector("#tab-legacy-content") as HTMLElement;

  runTabBtn.addEventListener("click", () => {
    sound.playClick();
    runTabBtn.classList.add("active");
    legacyTabBtn.classList.remove("active");
    runContent.style.display = "block";
    legacyContent.style.display = "none";
  });

  legacyTabBtn.addEventListener("click", () => {
    sound.playClick();
    legacyTabBtn.classList.add("active");
    runTabBtn.classList.remove("active");
    legacyContent.style.display = "block";
    runContent.style.display = "none";
  });

  container.querySelector("#retire-btn")!.addEventListener("click", () => {
    sound.playClick();
    callbacks.onRetire();
  });

  // Build Run Upgrade Cards
  const upgradesGrid = container.querySelector("#shop-upgrades-grid")!;
  for (const def of UPGRADES) {
    const card = document.createElement("div");
    card.className = "upgrade-card";
    card.id = `upgrade-card-${def.id}`;
    card.innerHTML = `
      <div class="card-top">
        <div class="card-title-group">
          <strong>${def.name}</strong>
          <div class="card-desc">${def.description}</div>
        </div>
        <span class="card-level-badge">Lv 0/${def.maxLevel}</span>
      </div>
      <div class="card-bottom">
        <span class="card-cost">${def.baseCost} Credits</span>
        <button class="buy-btn">Upgrade</button>
      </div>
    `;
    card.querySelector(".buy-btn")!.addEventListener("click", () => {
      callbacks.onBuyUpgrade(def.id);
    });
    upgradesGrid.appendChild(card);
  }

  // Build Permanent Legacy Cards
  const legacyGrid = container.querySelector("#shop-legacy-grid")!;
  for (const def of PERMANENT_UPGRADES) {
    const card = document.createElement("div");
    card.className = "upgrade-card";
    card.id = `permanent-card-${def.id}`;
    card.innerHTML = `
      <div class="card-top">
        <div class="card-title-group">
          <strong>${def.name}</strong>
          <div class="card-desc">${def.description}</div>
        </div>
        <span class="card-level-badge">Lv 0/${def.maxLevel}</span>
      </div>
      <div class="card-bottom">
        <span class="card-cost legacy">${def.baseCost} LP</span>
        <button class="buy-btn">Unlock</button>
      </div>
    `;
    card.querySelector(".buy-btn")!.addEventListener("click", () => {
      callbacks.onBuyPermanent(def.id);
    });
    legacyGrid.appendChild(card);
  }
}

export function refreshShopPanel(
  container: HTMLElement,
  economy: EconomyState,
  upgrades: UpgradeLevels,
  permanent: PermanentUpgradeLevels,
  previewLegacyPoints: number
): void {
  for (const def of UPGRADES) {
    const card = container.querySelector(`#upgrade-card-${def.id}`);
    if (!card) continue;
    const level = upgrades[def.id];
    const cost = upgradeCost(def, level);
    card.querySelector(".card-level-badge")!.textContent = `Lv ${level}/${def.maxLevel}`;
    const btn = card.querySelector(".buy-btn") as HTMLButtonElement;
    const costLabel = card.querySelector(".card-cost") as HTMLElement;

    if (cost === null) {
      costLabel.textContent = "MAX TIER";
      btn.textContent = "MAX";
      btn.disabled = true;
    } else {
      costLabel.textContent = `${cost} Credits`;
      btn.textContent = "Upgrade";
      btn.disabled = economy.currency < cost;
    }
  }

  for (const def of PERMANENT_UPGRADES) {
    const card = container.querySelector(`#permanent-card-${def.id}`);
    if (!card) continue;
    const level = permanent[def.id];
    const cost = permanentUpgradeCost(def, level);
    card.querySelector(".card-level-badge")!.textContent = `Lv ${level}/${def.maxLevel}`;
    const btn = card.querySelector(".buy-btn") as HTMLButtonElement;
    const costLabel = card.querySelector(".card-cost") as HTMLElement;

    if (cost === null) {
      costLabel.textContent = "MAX TIER";
      btn.textContent = "MAX";
      btn.disabled = true;
    } else {
      costLabel.textContent = `${cost} LP`;
      btn.textContent = "Unlock";
      btn.disabled = economy.prestigeCurrency < cost;
    }
  }

  const retireBtn = container.querySelector("#retire-btn") as HTMLButtonElement | null;
  if (retireBtn) {
    retireBtn.textContent = `Retire Fleet (+${previewLegacyPoints} Legacy Points)`;
  }
}
