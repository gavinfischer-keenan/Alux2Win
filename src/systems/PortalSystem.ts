// ============================================================
// PortalSystem.ts - Portal teleportation hazard for LUX
// ============================================================
//
// Responsibilities:
//   1. Tick pulseAngle on all portals for the renderer's visual animation.
//   2. Tick portalCooldown on all alive particles.
//   3. Evaluate each cooling-down-free TRAVELING particle against every
//      portal pair to determine whether using the portal would shorten its
//      journey by at least 25%.  If so, teleport immediately.
//   4. Also teleport any particle that physically enters a portal (≤30 px).
// ============================================================

import type { GameState, ParticleData, PortalData } from '../types';
import { PARTICLE_SPEED } from '../types';

// -- Helpers ------------------------------------------------------------------

/** Euclidean distance between two points. */
function dist(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  return Math.sqrt(dx * dx + dy * dy);
}

// -- System -------------------------------------------------------------------

export class PortalSystem {
  // -- Public API -----------------------------------------------

  update(dt: number, state: GameState): void {
    const { portals, particles, planets } = state;

    // -- 1. Animate portal pulse angles -----------------------
    for (const portal of portals) {
      portal.pulseAngle += 1.2 * dt;
    }

    // -- 2. Tick particle cooldowns ---------------------------
    for (const particle of particles) {
      if (!particle.alive) continue;
      if (particle.portalCooldown > 0) {
        particle.portalCooldown = Math.max(0, particle.portalCooldown - dt);
      }
    }

    // -- 3 & 4. Evaluate portals for TRAVELING particles ------
    for (const p of particles) {
      if (!p.alive) continue;
      if (p.mode !== 'traveling') continue;
      if (p.portalCooldown > 0) continue;

      // Resolve the particle's ultimate target position.
      let targetX: number;
      let targetY: number;
      if (p.targetPlanetId) {
        const planet = planets.get(p.targetPlanetId);
        if (planet) {
          targetX = planet.x;
          targetY = planet.y;
        } else {
          targetX = p.targetX ?? p.x;
          targetY = p.targetY ?? p.y;
        }
      } else {
        targetX = p.targetX ?? p.x;
        targetY = p.targetY ?? p.y;
      }

      let teleported = false;

      for (const portal of portals) {
        const dToPortal = dist(p.x, p.y, portal.x, portal.y);

        // -- 4. Physical proximity teleport (≤ 30 px) ---------
        if (dToPortal <= 30) {
          const pair = this._findPair(portal, portals);
          if (pair) {
            this._teleport(p, portal, pair);
            teleported = true;
            break;
          }
          continue;
        }

        // Skip portals the particle is very close to (prevents jitter).
        if (dToPortal <= 50) continue;

        // -- 3. Route-shortcut evaluation ---------------------
        const pair = this._findPair(portal, portals);
        if (!pair) continue;

        if (this._shouldUsePortal(p, portal, pair, targetX, targetY)) {
          this._teleport(p, portal, pair);
          teleported = true;
          break;
        }
      }

      // Suppress unused-variable warning; teleported used for early-break logic above.
      void teleported;
    }
  }

  // -- Private helpers ------------------------------------------

  /**
   * Finds the other portal in the same pair.
   * Returns null when the portal has no matching pair or is unpaired.
   */
  private _findPair(portal: PortalData, portals: PortalData[]): PortalData | null {
    if (!portal.pairId) return null;
    for (const other of portals) {
      if (other !== portal && other.pairId === portal.pairId) {
        return other;
      }
    }
    return null;
  }

  /**
   * Returns true when routing through (entry → exit) saves the particle
   * at least 25% of the direct distance to its target, AND the entry
   * portal is not behind the particle's current heading.
   */
  private _shouldUsePortal(
    p: ParticleData,
    entry: PortalData,
    exit: PortalData,
    targetX: number,
    targetY: number,
  ): boolean {
    const directDist = dist(p.x, p.y, targetX, targetY);
    const viaPortalDist = dist(p.x, p.y, entry.x, entry.y) + dist(exit.x, exit.y, targetX, targetY);

    // Must save at least 25% of direct distance.
    if (viaPortalDist >= directDist * 0.75) return false;

    // Reject if the entry portal is behind the particle (dot product check).
    const dotProduct = (entry.x - p.x) * p.vx + (entry.y - p.y) * p.vy;
    if (dotProduct < 0) return false;

    return true;
  }

  /**
   * Teleports the particle to the exit portal with a randomised exit velocity,
   * then imposes a 2.5-second cooldown so the particle cannot immediately
   * re-enter any portal.
   */
  private _teleport(p: ParticleData, _entry: PortalData, exit: PortalData): void {
    // Place at exit portal.
    p.x = exit.x;
    p.y = exit.y;

    // Randomise exit direction, boosted slightly above normal speed.
    const angle = Math.random() * Math.PI * 2;
    const speed = PARTICLE_SPEED * 1.2;
    p.vx = Math.cos(angle) * speed;
    p.vy = Math.sin(angle) * speed;

    // Cooldown prevents immediate re-entry into any portal.
    p.portalCooldown = 2.5;
  }
}
