// ============================================================
// TrappingBlackHoleSystem.ts — Cinematic lethal black hole logic
// ============================================================
//
// This system provides a more cinematic pull-in effect compared to GravitySystem.
// It overrides particle velocities with a slow, controlled drift toward the centre.
// Once particles reach the core, they are instantly destroyed, with no escape.
//
// Update order (called once per game tick):
//   1. Advance pulseAngle for each BH (animation only).
//   2. Pull free particles that enter pullRadius toward the BH core.
//   3. Destroy particles that reach the core (dist <= 8).
// ============================================================

import type { GameState, TrappingBlackHoleData, ParticleData } from '../types';
import { audioManager } from '../core/AudioManager';

/** Distance threshold (px) at which a particle is considered "at the core". */
const CORE_DISTANCE = 8;

/** Speed (px/sec) applied toward the BH while a particle is being pulled in. */
const PULL_SPEED = 10;

export class TrappingBlackHoleSystem {
  /**
   * Main per-frame update.
   * @param dt    Delta-time in seconds since last frame.
   * @param state Current mutable game state.
   */
  update(dt: number, state: GameState): void {
    const bhs = state.trappingBlackHoles;
    if (bhs.length === 0) return;

    let anyDied = false;

    // ------------------------------------------------------------------ 1.
    // Advance visual pulse angle for every trapping black hole.
    // ------------------------------------------------------------------ //
    for (const bh of bhs) {
      bh.pulseAngle += 0.9 * dt;
    }

    // ------------------------------------------------------------------ 2.
    // Process every alive particle.
    // ------------------------------------------------------------------ //
    for (const p of state.particles) {
      if (!p.alive) continue;

      if (p.trappedByBH === null) {
        for (const bh of bhs) {
          const dx   = bh.x - p.x;
          const dy   = bh.y - p.y;
          const distSq = dx * dx + dy * dy;
          const pullRadiusSq = bh.pullRadius * bh.pullRadius;

          if (distSq < pullRadiusSq && distSq > 0) {
            const dist = Math.sqrt(distSq);
            if (dist > CORE_DISTANCE) {
              // -- Pull toward centre --
              const nx       = dx / dist;
              const ny       = dy / dist;
              const pullMag  = PULL_SPEED * dt;

              p.x  += nx * pullMag;
              p.y  += ny * pullMag;

              // Override velocity to a slow controlled drift toward centre
              // so the particle does not overshoot or fight the pull.
              p.vx = nx * PULL_SPEED;
              p.vy = ny * PULL_SPEED;
            } else {
              // -- Reached the core: particle is instantly killed --
              p.alive = false;
              anyDied = true;
              if (p.faction === 'player') {
                audioManager.playBlackholeTrap();
              }
            }

            // Only one BH can act on a particle per tick.
            break;
          }
        }
        continue;
      }

      // If they were already trapped from a previous save, kill them.
      p.alive = false;
      anyDied = true;
    }

    // Do not filter state.particles to avoid GC pressure.
    // They will be recycled.
  }
}
