// ============================================================
// GravitySystem.ts — Black hole gravity and particle destruction
// ============================================================

import type { GameState } from '../types';
import { clamp } from '../utils/MathUtils';
import { audioManager } from '../core/AudioManager';

/** Maximum gravitational acceleration applied per frame (px/s²). */
const MAX_GRAV_ACCEL = 500;

/**
 * Applies gravitational pull from each black hole to all alive particles,
 * and destroys any particle that enters the black hole's core radius.
 */
export class GravitySystem {
  update(dt: number, state: GameState): void {
    const blackHoles = Array.from(state.blackHoles.values());
    if (blackHoles.length === 0) return;

    let anyDied = false;

    for (const particle of state.particles) {
      if (!particle.alive) continue;

      for (const bh of blackHoles) {
        const dx = bh.x - particle.x;
        const dy = bh.y - particle.y;
        const distSq = dx * dx + dy * dy;
        const radiusSq = bh.radius * bh.radius;

        // Instant destruction inside event horizon.
        if (distSq < radiusSq) {
          particle.alive = false;
          anyDied = true;
          if (particle.faction === 'player') {
            audioManager.playBlackholeTrap();
          }
          break; // No need to check other black holes.
        }

        // Apply gravity within pull radius.
        const pullRadiusSq = bh.pullRadius * bh.pullRadius;
        if (distSq < pullRadiusSq && distSq > 0) {
          const dist = Math.sqrt(distSq);
          // Inverse-square acceleration, capped per frame to prevent tunnelling.
          const rawAccel = bh.pullStrength / distSq * dt;
          const accel    = clamp(rawAccel, 0, MAX_GRAV_ACCEL * dt);

          particle.vx += (dx / dist) * accel;
          particle.vy += (dy / dist) * accel;
        }
      }
    }

    // Prune dead particles once per update.
    if (anyDied) {
      state.particles = state.particles.filter((p) => p.alive);
    }
  }
}
