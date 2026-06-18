// ============================================================
// PlasmaStormSystem.ts - Plasma storm hazard logic for LUX
// ============================================================
//
// Responsibilities:
//   1. Move each storm by its velocity and bounce off world edges.
//   2. Slowly rotate each storm (angle += 0.15 * dt).
//   3. Track which planets are inside a storm and trigger
//      storm-exit combat resolution when a planet leaves a storm.
//   4. Damage unprotected particles that linger inside storms,
//      killing them after 5 seconds of sustained exposure.
//   5. Export isParticleProtected() for CollisionSystem/CombatSystem.
// ============================================================

import type { GameState, ParticleData, PlanetData, Faction } from '../types';

// -- Helpers ------------------------------------------------------------------

/**
 * Returns true when point (px, py) is inside the axis-aligned ellipse centred
 * at (ex, ey) with semi-axes radiusX and radiusY.
 */
function pointInEllipse(
  px: number, py: number,
  ex: number, ey: number,
  radiusX: number, radiusY: number,
): boolean {
  const dx = px - ex;
  const dy = py - ey;
  return (dx * dx) / (radiusX * radiusX) + (dy * dy) / (radiusY * radiusY) <= 1;
}

/**
 * Returns true if the particle is currently protected from storm damage.
 *
 * A particle is protected when it is in 'orbiting' mode AND its home planet
 * is also inside a storm - the planet's gravity field shields its orbiters.
 *
 * Exported for use by CollisionSystem / CombatSystem so that those systems
 * can skip combat interactions involving storm-protected particles.
 */
export function isParticleProtected(p: ParticleData, state: GameState): boolean {
  if (!p.inStorm) return false;

  // Orbiting particles are shielded only when their home planet is also in a storm.
  if (p.mode === 'orbiting') {
    const home = state.planets.get(p.homePlanetId);
    if (home && home.inStorm) return true;
  }

  return false;
}

// -- System -------------------------------------------------------------------

export class PlasmaStormSystem {
  // -- Public API -----------------------------------------------

  update(dt: number, state: GameState): void {
    const { plasmaStorms, worldWidth, worldHeight } = state;

    // -- 1. Move storms and bounce off world edges -------------
    for (const storm of plasmaStorms) {
      // Slowly rotate the storm's visual angle each frame.
      storm.angle += 0.15 * dt;

      // Translate by velocity * dt.
      storm.x += storm.vx * dt;
      storm.y += storm.vy * dt;

      // Bounce: keep the entire ellipse extents within [0, worldWidth/worldHeight].
      if (storm.x - storm.radiusX < 0) {
        storm.x = storm.radiusX;
        storm.vx = Math.abs(storm.vx);
      } else if (storm.x + storm.radiusX > worldWidth) {
        storm.x = worldWidth - storm.radiusX;
        storm.vx = -Math.abs(storm.vx);
      }

      if (storm.y - storm.radiusY < 0) {
        storm.y = storm.radiusY;
        storm.vy = Math.abs(storm.vy);
      } else if (storm.y + storm.radiusY > worldHeight) {
        storm.y = worldHeight - storm.radiusY;
        storm.vy = -Math.abs(storm.vy);
      }
    }

    // -- 2 & 3. Planet-storm checks + storm-exit combat --------
    for (const planet of state.planets.values()) {
      // Snapshot previous state before computing new overlap.
      planet.wasInStorm = planet.inStorm;

      // Check if this planet's centre lies inside any storm ellipse.
      let nowInStorm = false;
      for (const storm of plasmaStorms) {
        if (pointInEllipse(planet.x, planet.y, storm.x, storm.y, storm.radiusX, storm.radiusY)) {
          nowInStorm = true;
          break;
        }
      }
      planet.inStorm = nowInStorm;

      // Storm-exit event: planet was inside last frame, now outside.
      if (planet.wasInStorm && !planet.inStorm) {
        this._triggerStormExitCombat(planet, state);
      }
    }

    // -- 4. Particle-storm checks ------------------------------
    const STORM_KILL_TIME = 5; // seconds of unprotected exposure before death

    for (const particle of state.particles) {
      if (!particle.alive) continue;

      // Determine whether this particle overlaps any storm.
      let inStorm = false;
      for (const storm of plasmaStorms) {
        if (pointInEllipse(particle.x, particle.y, storm.x, storm.y, storm.radiusX, storm.radiusY)) {
          inStorm = true;
          break;
        }
      }
      particle.inStorm = inStorm;

      if (inStorm) {
        const protected_ = isParticleProtected(particle, state);

        if (!protected_) {
          particle.stormTimer += dt;
          if (particle.stormTimer > STORM_KILL_TIME) {
            particle.alive = false;
          }
        }
        // Protected particles: stormTimer is intentionally left unchanged so
        // that accumulated exposure is preserved if protection later drops.
      } else {
        // Outside all storms - reset the damage accumulator.
        particle.stormTimer = 0;
      }
    }

    // -- 5. Purge dead particles -------------------------------
    state.particles = state.particles.filter(p => p.alive);
  }

  // -- Private helpers ------------------------------------------

  /**
   * Called when a planet exits a plasma storm.
   *
   * Collects alive orbiting particles for this planet, groups them by faction,
   * then runs mutual annihilation between the two largest factions (1-for-1)
   * until one faction is eliminated.  The surviving faction's remaining
   * particles stay alive and the planet's faction is updated accordingly.
   */
  private _triggerStormExitCombat(planet: PlanetData, state: GameState): void {
    // Collect alive orbiting particles that belong to this planet.
    const orbiting = state.particles.filter(
      p => p.alive && p.mode === 'orbiting' && p.homePlanetId === planet.id,
    );

    if (orbiting.length === 0) return;

    // Group particles by faction.
    const byFaction = new Map<Faction, ParticleData[]>();
    for (const p of orbiting) {
      let arr = byFaction.get(p.faction);
      if (!arr) {
        arr = [];
        byFaction.set(p.faction, arr);
      }
      arr.push(p);
    }

    // Nothing to resolve with only one faction.
    if (byFaction.size < 2) {
      this._updatePlanetFaction(planet, byFaction);
      return;
    }

    // Annihilate the two largest factions one particle at a time until one is gone.
    while (byFaction.size >= 2) {
      // Sort descending by particle count so we always pair the two biggest.
      const sorted = Array.from(byFaction.entries()).sort(([, a], [, b]) => b.length - a.length);
      const [factionA, groupA] = sorted[0];
      const [factionB, groupB] = sorted[1];

      // Kill one from each side.
      const victimA = groupA.pop()!;
      const victimB = groupB.pop()!;
      victimA.alive = false;
      victimB.alive = false;

      // Remove exhausted factions.
      if (groupA.length === 0) byFaction.delete(factionA);
      if (groupB.length === 0) byFaction.delete(factionB);
    }

    // Update the planet's controlling faction based on survivors.
    this._updatePlanetFaction(planet, byFaction);
  }

  /**
   * Assigns the planet's faction to the sole surviving faction after combat,
   * or leaves it unchanged when the result is a total draw (no survivors).
   */
  private _updatePlanetFaction(
    planet: PlanetData,
    byFaction: Map<Faction, ParticleData[]>,
  ): void {
    if (byFaction.size === 1) {
      const [survivingFaction] = byFaction.keys();
      planet.faction = survivingFaction;
    }
    // Zero surviving factions ? total annihilation; preserve current faction.
    // More than one surviving faction should not occur after resolution.
  }
}
