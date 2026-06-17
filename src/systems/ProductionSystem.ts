// ============================================================
// ProductionSystem.ts — Particle generation + auto-absorb + 5X formation
// ============================================================

import type { GameState, ParticleData, PlanetData } from '../types';
import {
  PLANET_RADIUS,
  PARTICLE_ORBIT_AUTO_ABSORB_SECS,
  COMBO_ORBIT_THRESHOLD,
} from '../types';
import { randomRange } from '../utils/MathUtils';

export class ProductionSystem {
  /** Fractional particle accumulator keyed by planet id. */
  private accumulators: Map<string, number> = new Map();

  update(dt: number, state: GameState): void {
    this._produceParticles(dt, state);
    this._tickAutoAbsorb(dt, state);
    this._formComposites(state);
  }

  resetPlanet(planetId: string): void {
    this.accumulators.delete(planetId);
  }

  // ---- Production ----

  private _produceParticles(dt: number, state: GameState): void {
    for (const planet of state.planets.values()) {
      if (planet.faction === 'neutral') continue;
      if (planet.particles >= planet.capacity) continue;

      let acc = (this.accumulators.get(planet.id) ?? 0) + dt * planet.productionRate;

      while (acc >= 1.0 && planet.particles < planet.capacity) {
        acc -= 1.0;
        planet.particles += 1;
        state.particles.push(this._spawnOrbiting(state, planet));
      }

      this.accumulators.set(planet.id, acc);
    }
  }

  // ---- Auto-absorb: orbiting 1X particles idle > 20s get absorbed at non-max planets ----

  private _tickAutoAbsorb(dt: number, state: GameState): void {
    const toAbsorb: number[] = []; // particle IDs

    for (const p of state.particles) {
      if (!p.alive || p.mode !== 'orbiting' || p.strength !== 1) continue;

      const home = state.planets.get(p.homePlanetId);
      if (!home || home.upgradeLevel >= 3) continue; // max-upgraded: never auto-absorb

      p.orbitTimer += dt;

      if (p.orbitTimer >= PARTICLE_ORBIT_AUTO_ABSORB_SECS) {
        toAbsorb.push(p.id);
      }
    }

    if (toAbsorb.length === 0) return;

    const absorbSet = new Set<number>(toAbsorb);

    for (const p of state.particles) {
      if (!absorbSet.has(p.id)) continue;
      p.alive = false;
      const home = state.planets.get(p.homePlanetId);
      if (!home) continue;
      home.particles = Math.max(0, home.particles - 1);
      home.absorbedCount += p.strength;
    }

    state.particles = state.particles.filter(p => p.alive);
  }

  // ---- 5X Formation: at max-upgraded planets, every COMBO_ORBIT_THRESHOLD (5) orbiting 1X → 1 5X ----

  private _formComposites(state: GameState): void {
    // Collect orbiting 1X particles per max-upgraded planet
    const orbitMap = new Map<string, ParticleData[]>(); // planetId → particles

    for (const p of state.particles) {
      if (!p.alive || p.mode !== 'orbiting' || p.strength !== 1) continue;
      const home = state.planets.get(p.homePlanetId);
      if (!home || home.upgradeLevel < 3) continue;

      let list = orbitMap.get(p.homePlanetId);
      if (!list) { list = []; orbitMap.set(p.homePlanetId, list); }
      list.push(p);
    }

    const newComposites: ParticleData[] = [];

    for (const [planetId, orbiters] of orbitMap.entries()) {
      const groupCount = Math.floor(orbiters.length / COMBO_ORBIT_THRESHOLD);
      if (groupCount === 0) continue;

      const planet = state.planets.get(planetId)!;

      for (let g = 0; g < groupCount; g++) {
        const group = orbiters.splice(0, COMBO_ORBIT_THRESHOLD);
        // Average position and orbit angle of the group
        let avgX = 0, avgY = 0, avgAngle = 0;
        for (const p of group) {
          avgX += p.x;
          avgY += p.y;
          avgAngle += (p.orbitAngle ?? 0);
          p.alive = false; // consume the 1X particles
        }
        avgX     /= COMBO_ORBIT_THRESHOLD;
        avgY     /= COMBO_ORBIT_THRESHOLD;
        avgAngle /= COMBO_ORBIT_THRESHOLD;

        // Update planet particle count: remove 5, add 1
        planet.particles = Math.max(0, planet.particles - COMBO_ORBIT_THRESHOLD + 1);

        const orbitRadius = PLANET_RADIUS[planet.upgradeLevel] * 1.8;

        newComposites.push({
          id:            ++state.particleIdCounter,
          x:             avgX,
          y:             avgY,
          vx:            -Math.sin(avgAngle) * orbitRadius * 1.2,
          vy:             Math.cos(avgAngle) * orbitRadius * 1.2,
          faction:       planet.faction,
          mode:          'orbiting',
          strength:      5,
          orbitTimer:    0,
          damage:        0,
          homePlanetId:  planetId,
          orbitAngle:    avgAngle,
          orbitRadius,
          alive:         true,
        });
      }
    }

    // Remove consumed 1X particles
    state.particles = state.particles.filter(p => p.alive);

    // Add new 5X particles
    for (const c of newComposites) state.particles.push(c);
  }

  // ---- Spawn helpers ----

  private _spawnOrbiting(state: GameState, planet: PlanetData): ParticleData {
    const orbitAngle  = randomRange(0, Math.PI * 2);
    const orbitRadius = PLANET_RADIUS[planet.upgradeLevel] * 1.8;
    const x = planet.x + orbitRadius * Math.cos(orbitAngle);
    const y = planet.y + orbitRadius * Math.sin(orbitAngle);
    const orbitSpeed = 1.2;
    const vx = -Math.sin(orbitAngle) * orbitRadius * orbitSpeed;
    const vy =  Math.cos(orbitAngle) * orbitRadius * orbitSpeed;

    return {
      id:           ++state.particleIdCounter,
      x, y, vx, vy,
      faction:      planet.faction,
      mode:         'orbiting',
      strength:     1,
      orbitTimer:   0,
      damage:       0,
      homePlanetId: planet.id,
      orbitAngle,
      orbitRadius,
      alive:        true,
    };
  }
}
