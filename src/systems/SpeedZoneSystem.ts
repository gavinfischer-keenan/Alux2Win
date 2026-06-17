// ============================================================
// SpeedZoneSystem.ts - Speed zone hazard logic for Alux2Win
// ============================================================
//
// Responsibilities:
//   1. Reset ALL alive particles to speedMod = 1.0 each frame.
//   2. For each alive particle, check every speed zone in order.
//      The first zone whose circle contains the particle wins:
//        - 'speedup'  → speedMod = 1.5
//        - 'slowdown' → speedMod = 0.3
//   3. Tick zone.pulseAngle each frame for the renderer's swirl animation.
// ============================================================

import type { GameState } from '../types';

export class SpeedZoneSystem {
  update(dt: number, state: GameState): void {
    const { speedZones, particles } = state;

    // -- 1. Reset all alive particles to normal speed ----------
    for (const p of particles) {
      if (!p.alive) continue;
      p.speedMod = 1.0;
    }

    // -- 2. Apply zone speed modifiers -------------------------
    for (const p of particles) {
      if (!p.alive) continue;

      for (const zone of speedZones) {
        const dx   = p.x - zone.x;
        const dy   = p.y - zone.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist <= zone.radius) {
          if (zone.type === 'speedup') {
            p.speedMod = 2.0; // further 50% increase from original 1.5
          } else {
            // 'slowdown'
            p.speedMod = 0.3;
          }
          break; // First zone wins; skip remaining zones.
        }
      }
    }

    // -- 3. Tick pulse angle for visual animation --------------
    for (const zone of speedZones) {
      zone.pulseAngle += 0.8 * dt;
    }
  }
}
