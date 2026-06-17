// ============================================================
// UpgradeSystem.ts — Planet upgrade level progression
// ============================================================

import type { GameState, UpgradeLevel } from '../types';
import {
  UPGRADE_THRESHOLDS,
  PLANET_CAPACITY,
  PLANET_PRODUCTION,
  PLANET_RADIUS,
} from '../types';

/**
 * Checks each planet's absorbedCount against the threshold for the next
 * upgrade level. When met, upgrades capacity, productionRate, and resets counter.
 *
 * Upgrade chain: 1 → 2 (25 absorbed) → 3 (50 more absorbed).
 */
export class UpgradeSystem {
  update(state: GameState): void {
    for (const planet of state.planets.values()) {
      if (planet.upgradeLevel >= 3) continue;

      const nextLevel = (planet.upgradeLevel + 1) as UpgradeLevel;
      const threshold = UPGRADE_THRESHOLDS[nextLevel];

      if (planet.absorbedCount >= threshold) {
        planet.upgradeLevel    = nextLevel;
        planet.capacity        = PLANET_CAPACITY[nextLevel];
        planet.productionRate  = PLANET_PRODUCTION[nextLevel];
        // PLANET_RADIUS is used by renderers; no need to store it in PlanetData
        // but we note it here so callers know rendering must update.
        planet.absorbedCount   = 0;
      }
    }
  }
}

// Export PLANET_RADIUS so callers can reference the updated visual size
// without importing from types directly.
export { PLANET_RADIUS };
