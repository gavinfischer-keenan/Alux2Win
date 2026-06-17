// ============================================================
// ProductionSystem.ts — Particle generation for owned planets
// ============================================================

import type { GameState, ParticleData, PlanetData } from '../types';
import { PLANET_RADIUS } from '../types';
import { randomRange } from '../utils/MathUtils';

/**
 * Generates orbiting particles for non-neutral planets at their production rate.
 * Tracks per-planet fractional accumulator to handle sub-1 rates correctly.
 */
export class ProductionSystem {
  /** Fractional particle accumulator keyed by planet id. */
  private accumulators: Map<string, number> = new Map();

  update(dt: number, state: GameState): void {
    for (const planet of state.planets.values()) {
      // Neutral planets do not produce.
      if (planet.faction === 'neutral') continue;

      // Do not overfill a planet.
      if (planet.particles >= planet.capacity) continue;

      // Accumulate production.
      let acc = (this.accumulators.get(planet.id) ?? 0) + dt * planet.productionRate;

      // Emit whole particles.
      while (acc >= 1.0 && planet.particles < planet.capacity) {
        acc -= 1.0;
        planet.particles += 1;
        state.particles.push(this._spawnOrbiting(state, planet));
      }

      this.accumulators.set(planet.id, acc);
    }
  }

  /** Remove accumulator state when a planet changes hands or is destroyed. */
  resetPlanet(planetId: string): void {
    this.accumulators.delete(planetId);
  }

  // ---- Private ----

  private _spawnOrbiting(state: GameState, planet: PlanetData): ParticleData {
    const orbitAngle  = randomRange(0, Math.PI * 2);
    const orbitRadius = PLANET_RADIUS[planet.upgradeLevel] * 1.8;
    const x = planet.x + orbitRadius * Math.cos(orbitAngle);
    const y = planet.y + orbitRadius * Math.sin(orbitAngle);

    // Orbital tangent velocity (perpendicular to radius).
    const orbitSpeed = 1.2; // rad/sec
    const vx = -Math.sin(orbitAngle) * orbitRadius * orbitSpeed;
    const vy =  Math.cos(orbitAngle) * orbitRadius * orbitSpeed;

    const id = ++state.particleIdCounter;

    return {
      id,
      x,
      y,
      vx,
      vy,
      faction:      planet.faction,
      mode:         'orbiting',
      homePlanetId: planet.id,
      orbitAngle,
      orbitRadius,
      alive:        true,
    };
  }
}
