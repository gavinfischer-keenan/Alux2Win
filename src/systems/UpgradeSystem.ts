// ============================================================
// UpgradeSystem.ts — Planet upgrade level progression
// ============================================================

import type { GameState, UpgradeLevel } from '../types';
import {
  UPGRADE_THRESHOLDS,
  PLANET_MAX_HEALTH,
  PLANET_PRODUCTION,
  PLANET_RADIUS,
} from '../types';
import { audioManager } from '../core/AudioManager';

export class UpgradeSystem {
  update(state: GameState): void {
    for (const planet of state.planets.values()) {
      if (planet.upgradeLevel >= 3) continue;

      const nextLevel = (planet.upgradeLevel + 1) as UpgradeLevel;
      const threshold = UPGRADE_THRESHOLDS[nextLevel];

      if (planet.absorbedCount >= threshold) {
        planet.upgradeLevel   = nextLevel;
        const newMax          = PLANET_MAX_HEALTH[nextLevel];
        planet.maxHealth      = newMax;
        planet.health         = newMax;
        planet.productionRate = PLANET_PRODUCTION[nextLevel];
        planet.absorbedCount  = 0;

        if (planet.faction === 'player') {
          audioManager.playUpgrade(true);
        }
      }
    }
  }
}

export { PLANET_RADIUS };
