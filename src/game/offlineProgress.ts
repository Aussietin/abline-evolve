import type { NeuralNetConfig, VehiclePhysicsConfig } from "../sim/types";
import type { Track } from "../sim/track";
import type { Population, PopulationConfig } from "../sim/population";
import type { EconomyState } from "../sim/economy";
import type { UpgradeLevels } from "../sim/upgrades";
import { advanceHeadless } from "../sim/offline";

// Chunked orchestration around sim/offline.ts's advanceHeadless: hours of
// offline time simulated as one synchronous while-loop would freeze the tab
// while it loads, so this breaks it into small chunks and yields to the
// event loop (setTimeout 0) between them, reporting progress so main.ts can
// show a "catching up..." overlay instead of an apparently-hung page.

const CHUNK_SECONDS = 30; // sim-seconds simulated per macrotask

export interface OfflineReplayParams {
  pop: Population;
  track: Track;
  physics: VehiclePhysicsConfig;
  netCfg: NeuralNetConfig;
  popCfg: PopulationConfig;
  economy: EconomyState;
  prestigeMultiplier: number;
  upgradeLevels: UpgradeLevels;
  baseMutationMagnitude: number;
  rewardedGenerations: number;
  totalSeconds: number;
  onProgress?: (doneSeconds: number, totalSeconds: number) => void;
}

// Resolves with the final rewardedGenerations watermark once totalSeconds of
// sim time has been replayed (or done early — the caller passes a small
// totalSeconds when there's nothing to catch up).
export function runOfflineReplay(params: OfflineReplayParams): Promise<number> {
  const {
    pop, track, physics, netCfg, popCfg, economy, prestigeMultiplier,
    upgradeLevels, baseMutationMagnitude, totalSeconds, onProgress,
  } = params;

  let rewardedGenerations = params.rewardedGenerations;
  let doneSeconds = 0;

  return new Promise((resolve) => {
    function step(): void {
      if (doneSeconds >= totalSeconds) {
        onProgress?.(doneSeconds, totalSeconds);
        resolve(rewardedGenerations);
        return;
      }
      const chunk = Math.min(CHUNK_SECONDS, totalSeconds - doneSeconds);
      const result = advanceHeadless(
        pop, track, physics, netCfg, popCfg, economy, prestigeMultiplier,
        upgradeLevels, baseMutationMagnitude, rewardedGenerations, chunk
      );
      doneSeconds += result.secondsSimulated;
      rewardedGenerations = result.rewardedGenerations;
      onProgress?.(doneSeconds, totalSeconds);
      setTimeout(step, 0);
    }
    step();
  });
}
