// ============================================================
// TrappingBlackHoleSystem.ts — Trapping (non-destructive) black hole logic
// ============================================================
//
// Unlike the destructive GravitySystem, this system TRAPS particles inside
// the black hole's gravitational well without killing them.  Trapped particles
// are held at the BH centre and are only released when the owning player or AI
// issues a deploy / move command (i.e. the particle's mode flips to 'traveling'
// with a valid target).
//
// Update order (called once per game tick):
//   1. Advance pulseAngle for each BH (animation only).
//   2. Pull free particles that enter pullRadius toward the BH core.
//   3. Snap-and-hold particles that reach the core (dist <= 8).
//   4. Release trapped particles that have received a move command.
// ============================================================

import type { GameState, TrappingBlackHoleData, ParticleData } from '../types';

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

    // ------------------------------------------------------------------ 1.
    // Advance visual pulse angle for every trapping black hole.
    // ------------------------------------------------------------------ //
    for (const bh of bhs) {
      bh.pulseAngle += 0.9 * dt;
    }

    // ------------------------------------------------------------------ 2-4.
    // Process every alive particle.
    // ------------------------------------------------------------------ //
    for (const p of state.particles) {
      if (!p.alive) continue;

      // ---- Particles that are NOT currently trapped -------------------------
      if (p.trappedByBH === null) {
        for (const bh of bhs) {
          const dx   = bh.x - p.x;
          const dy   = bh.y - p.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < bh.pullRadius && dist > 0) {
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
              // -- Snap to core: particle is now trapped --
              p.trappedByBH = bh.id;
              p.x           = bh.x;
              p.y           = bh.y;
              p.vx          = 0;
              p.vy          = 0;
              p.mode        = 'stationed';
            }

            // Only one BH can act on a particle per tick.
            break;
          }
        }

        // Re-read trappedByBH: it may have just been set above.
        // If it was just set the hold-in-place block below will handle it
        // on the next tick, which is fine.
        continue;
      }

      // ---- Particles that ARE currently trapped ----------------------------
      // Check for a move / deploy command first.
      const hasTarget =
        p.targetPlanetId !== undefined ||
        (p.targetX !== undefined && p.targetY !== undefined);

      if (hasTarget && p.mode === 'traveling') {
        // The player/AI issued a deploy command — release the particle.
        p.trappedByBH = null;
        // Leave position, velocity, and mode as set by the deploy logic.
        continue;
      }

      // No move command: find the owning BH and hold the particle in place.
      const ownerBH = this._findBH(bhs, p.trappedByBH);
      if (ownerBH !== null) {
        p.x  = ownerBH.x;
        p.y  = ownerBH.y;
        p.vx = 0;
        p.vy = 0;
      } else {
        // BH no longer exists — free the particle.
        p.trappedByBH = null;
      }
    }
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private _findBH(
    bhs: TrappingBlackHoleData[],
    id: string,
  ): TrappingBlackHoleData | null {
    for (const bh of bhs) {
      if (bh.id === id) return bh;
    }
    return null;
  }
}
