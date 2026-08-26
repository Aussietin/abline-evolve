import { UPGRADES, upgradeCost, type UpgradeId, type UpgradeLevels } from "../sim/upgrades";
import { PERMANENT_UPGRADES, permanentUpgradeCost, type PermanentUpgradeId, type PermanentUpgradeLevels } from "../sim/prestige";
import type { EconomyState } from "../sim/economy";

// DOM-building UI for the upgrade shop + prestige panel. No sim logic here
// — every button just calls back into main.ts, which owns all state
// mutation and re-render scheduling.

export interface ShopCallbacks {
  onBuyUpgrade: (id: UpgradeId) => void;
  onBuyPermanent: (id: PermanentUpgradeId) => void;
  onRetire: () => void;
}

export function buildShopPanel(container: HTMLElement, callbacks: ShopCallbacks): void {
  container.innerHTML = `
    <div class="shop-section">
      <h3>Upgrades <span class="shop-hint">(reset on retirement)</span></h3>
      <div id="shop-upgrades"></div>
    </div>
    <div class="shop-section">
      <h3>Legacy <span class="shop-hint">(permanent)</span></h3>
      <div id="shop-permanent"></div>
      <button id="retire-btn" class="retire-btn">Retire this run</button>
    </div>
  `;

  container.querySelector("#retire-btn")!.addEventListener("click", () => callbacks.onRetire());

  const upgradesEl = container.querySelector("#shop-upgrades")!;
  for (const def of UPGRADES) {
    const row = document.createElement("div");
    row.className = "shop-row";
    row.id = `upgrade-row-${def.id}`;
    row.innerHTML = `
      <div class="shop-row-info">
        <strong>${def.name}</strong> <span class="shop-level"></span>
        <div class="shop-desc">${def.description}</div>
      </div>
      <button class="shop-buy"></button>
    `;
    row.querySelector(".shop-buy")!.addEventListener("click", () => callbacks.onBuyUpgrade(def.id));
    upgradesEl.appendChild(row);
  }

  const permanentEl = container.querySelector("#shop-permanent")!;
  for (const def of PERMANENT_UPGRADES) {
    const row = document.createElement("div");
    row.className = "shop-row";
    row.id = `permanent-row-${def.id}`;
    row.innerHTML = `
      <div class="shop-row-info">
        <strong>${def.name}</strong> <span class="shop-level"></span>
        <div class="shop-desc">${def.description}</div>
      </div>
      <button class="shop-buy"></button>
    `;
    row.querySelector(".shop-buy")!.addEventListener("click", () => callbacks.onBuyPermanent(def.id));
    permanentEl.appendChild(row);
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
    const row = container.querySelector(`#upgrade-row-${def.id}`);
    if (!row) continue;
    const level = upgrades[def.id];
    const cost = upgradeCost(def, level);
    row.querySelector(".shop-level")!.textContent = `Lv ${level}/${def.maxLevel}`;
    const btn = row.querySelector(".shop-buy") as HTMLButtonElement;
    if (cost === null) {
      btn.textContent = "MAX";
      btn.disabled = true;
    } else {
      btn.textContent = `${cost}`;
      btn.disabled = economy.currency < cost;
    }
  }

  for (const def of PERMANENT_UPGRADES) {
    const row = container.querySelector(`#permanent-row-${def.id}`);
    if (!row) continue;
    const level = permanent[def.id];
    const cost = permanentUpgradeCost(def, level);
    row.querySelector(".shop-level")!.textContent = `Lv ${level}/${def.maxLevel}`;
    const btn = row.querySelector(".shop-buy") as HTMLButtonElement;
    if (cost === null) {
      btn.textContent = "MAX";
      btn.disabled = true;
    } else {
      btn.textContent = `${cost} LP`;
      btn.disabled = economy.prestigeCurrency < cost;
    }
  }

  const retireBtn = container.querySelector("#retire-btn") as HTMLButtonElement | null;
  if (retireBtn) retireBtn.textContent = `Retire this run  (+${previewLegacyPoints} Legacy Points)`;
}
