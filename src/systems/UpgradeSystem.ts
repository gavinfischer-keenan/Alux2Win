// ============================================================
// UpgradeSystem.ts — Planet upgrade level progression
// ============================================================

import type { GameState, UpgradeLevel } from '../types';
import {
  UPGRADE_THRESHOLDS,
  PLANET_CAPACITY,
  PLANET_PRODUCTION,
  PLANET_RADIUS,
  PLANET_BONUS_HEALTH,
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
        planet.capacity       = PLANET_CAPACITY[nextLevel];
        planet.productionRate = PLANET_PRODUCTION[nextLevel];
        planet.absorbedCount  = 0;

        // Grant bonus health for the new level
        const bh = PLANET_BONUS_HEALTH[nextLevel];
        planet.bonusHealth    = bh;
        planet.maxBonusHealth = bh;

        if (planet.faction === 'player') {
          audioManager.playUpgrade(true);
        }
      }
    }
  }
}

export { PLANET_RADIUS };
