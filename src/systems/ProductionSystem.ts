// ============================================================
// ProductionSystem.ts — Particle generation + auto-absorb + 5X formation
// ============================================================

import type { GameState, ParticleData, PlanetData } from '../types';
import {
  PLANET_RADIUS,
  PARTICLE_ORBIT_AUTO_ABSORB_SECS,
  COMBO_ORBIT_THRESHOLD,
  PLANET_PRODUCTION,
} from '../types';
import { randomRange } from '../utils/MathUtils';
import { SettingsStore } from '../core/SettingsStore';

export class ProductionSystem {
  /** Fractional particle accumulator keyed by planet id. */
  private accumulators: Map<string, number> = new Map();
  private _lastDeadIndex = 0;

  update(dt: number, state: GameState): void {
    this._produceParticles(dt, state);
    this._formComposites(state);
    this._triggerNeutralAttacks(state);
  }

  resetPlanet(planetId: string): void {
    this.accumulators.delete(planetId);
  }

  // ---- Production ----

  private _produceParticles(dt: number, state: GameState): void {
    for (const planet of state.planets.values()) {
      if (planet.lockoutTimer !== undefined && planet.lockoutTimer > 0) {
        planet.lockoutTimer = Math.max(0, planet.lockoutTimer - dt);
      }

      let rate = planet.productionRate;

      if (planet.faction === 'neutral') {
        // Neutral planets produce at 1/3 the level 1 rate
        rate = PLANET_PRODUCTION[1] / 3;
      } else if (planet.faction !== 'player') {
        const difficulty = SettingsStore.get().difficulty;
        if (difficulty === 'normal') rate *= 1.1;
        else if (difficulty === 'hard') rate *= 1.2;
      }

      let acc = (this.accumulators.get(planet.id) ?? 0) + dt * rate;

      while (acc >= 1.0) {
        acc -= 1.0;

        if (planet.faction === 'neutral') {
          const cap = planet.originalNeutralHealth ?? planet.maxHealth;
          if (planet.health < cap) {
            // Partly conquered -> heal to reverse colonization
            planet.health += 1;
            if (planet.health >= cap) {
              planet.health = cap;
              planet.colonizer = null;
            }
          } else {
            // Fully healed -> spawn orbiting neutral particle
            const recycled = this._getDeadParticle(state);
            if (recycled) {
              this._initOrbiting(recycled, state, planet);
              recycled.faction = 'neutral';
            } else {
              const p = this._spawnOrbiting(state, planet);
              p.faction = 'neutral';
              state.particles.push(p);
            }
          }
        } else {
          // Normal faction production
          const recycled = this._getDeadParticle(state);
          if (recycled) {
            this._initOrbiting(recycled, state, planet);
          } else {
            state.particles.push(this._spawnOrbiting(state, planet));
          }
        }
      }

      this.accumulators.set(planet.id, acc);

      // Shield regeneration
      if (planet.isShielded && planet.faction !== 'neutral') {
        planet.shieldTimer = (planet.shieldTimer ?? 0) + dt;
        if (planet.shieldTimer >= 15.0) {
          planet.shieldTimer -= 15.0;
          
          let generated = 1;
          if (planet.upgradeLevel === 3) {
            generated = 2;
          } else if (planet.upgradeLevel === 2) {
            planet._shieldAltToggle = !planet._shieldAltToggle;
            generated = planet._shieldAltToggle ? 2 : 1;
          }
          
          planet.shieldPoints = (planet.shieldPoints ?? 0) + generated;
        }
      }
    }
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

        // (Orbiting particles don't consume internal slots)

        const orbitRadius = PLANET_RADIUS[planet.upgradeLevel] * 1.8;
        const vx = -Math.sin(avgAngle) * orbitRadius * 1.2;
        const vy =  Math.cos(avgAngle) * orbitRadius * 1.2;

        const recycled = this._getDeadParticle(state);
        if (recycled) {
          recycled.x = avgX;
          recycled.y = avgY;
          recycled.vx = vx;
          recycled.vy = vy;
          recycled.faction = planet.faction;
          recycled.mode = 'orbiting';
          recycled.strength = 5;
          recycled.orbitTimer = 0;
          recycled.damage = 0;
          recycled.homePlanetId = planetId;
          recycled.targetPlanetId = undefined;
          recycled.targetX = undefined;
          recycled.targetY = undefined;
          recycled.waypointX = undefined;
          recycled.waypointY = undefined;
          recycled.orbitAngle = avgAngle;
          recycled.orbitRadius = orbitRadius;
          recycled.alive = true;
          recycled.speedMod = 1.0;
          recycled.portalCooldown = 0;
          recycled.trappedByBH = null;
          recycled.deployTimer = 0;
        } else {
          newComposites.push({
            id:            ++state.particleIdCounter,
            x:             avgX,
            y:             avgY,
            vx,
            vy,
            faction:       planet.faction,
            mode:          'orbiting',
            strength:      5,
            orbitTimer:    0,
            damage:        0,
            homePlanetId:  planetId,
            orbitAngle:    avgAngle,
            orbitRadius,
            alive:         true,
            speedMod:      1.0,
            portalCooldown: 0,
            trappedByBH:   null,
          });
        }
      }
    }

    // Optimization: Do not filter state.particles to avoid GC pressure.
    // The consumed 1X particles are marked alive = false and will be recycled.

    // Add new 5X particles
    for (const c of newComposites) state.particles.push(c);
  }

  // ---- Neutral Surprise Attacks ----

  private _triggerNeutralAttacks(state: GameState): void {
    const neutralOrbiters = new Map<string, ParticleData[]>();

    // Collect orbiters for neutral planets
    for (const p of state.particles) {
      if (!p.alive || p.mode !== 'orbiting' || p.faction !== 'neutral') continue;
      let list = neutralOrbiters.get(p.homePlanetId);
      if (!list) { list = []; neutralOrbiters.set(p.homePlanetId, list); }
      list.push(p);
    }

    for (const [planetId, orbiters] of neutralOrbiters.entries()) {
      if (orbiters.length >= 40) {
        const home = state.planets.get(planetId);
        if (!home) continue;

        // Find nearest non-neutral planet
        let nearestPlanet: PlanetData | null = null;
        let bestDistSq = Infinity;
        for (const target of state.planets.values()) {
          if (target.faction === 'neutral') continue;
          const distSq = (target.x - home.x) ** 2 + (target.y - home.y) ** 2;
          if (distSq < bestDistSq) {
            bestDistSq = distSq;
            nearestPlanet = target;
          }
        }

        if (nearestPlanet) {
          // Send 35 particles in a surprise attack
          const attackGroup = orbiters.slice(0, 35);
          for (const p of attackGroup) {
            p.mode = 'attacking';
            p.targetPlanetId = nearestPlanet.id;
            p.targetX = nearestPlanet.x;
            p.targetY = nearestPlanet.y;
            p.orbitTimer = 0;
            // Add a small deploy timer offset so they launch in a stream like normal deploys
            p.deployTimer = Math.random() * 0.5;
          }
        }
      }
    }
  }

  // ---- Spawn helpers ----

  private _getDeadParticle(state: GameState): ParticleData | null {
    const len = state.particles.length;
    if (len === 0) return null;
    for (let i = 0; i < len; i++) {
      const idx = (this._lastDeadIndex + i) % len;
      const p = state.particles[idx];
      if (!p.alive) {
        this._lastDeadIndex = idx + 1;
        return p;
      }
    }
    return null;
  }

  private _initOrbiting(p: ParticleData, state: GameState, planet: PlanetData): void {
    const orbitAngle  = randomRange(0, Math.PI * 2);
    const orbitRadius = PLANET_RADIUS[planet.upgradeLevel] * 1.8;
    const x = planet.x + orbitRadius * Math.cos(orbitAngle);
    const y = planet.y + orbitRadius * Math.sin(orbitAngle);
    const orbitSpeed = 1.2;
    const vx = -Math.sin(orbitAngle) * orbitRadius * orbitSpeed;
    const vy =  Math.cos(orbitAngle) * orbitRadius * orbitSpeed;

    p.x = x; p.y = y; p.vx = vx; p.vy = vy;
    p.faction = planet.faction;
    p.mode = 'orbiting';
    p.strength = 1;
    p.orbitTimer = 0;
    p.damage = 0;
    p.homePlanetId = planet.id;
    p.targetPlanetId = undefined;
    p.targetX = undefined;
    p.targetY = undefined;
    p.waypointX = undefined;
    p.waypointY = undefined;
    p.orbitAngle = orbitAngle;
    p.orbitRadius = orbitRadius;
    p.alive = true;
    p.speedMod = 1.0;
    p.portalCooldown = 0;
    p.trappedByBH = null;
    p.deployTimer = 0;
  }

  private _spawnOrbiting(state: GameState, planet: PlanetData): ParticleData {
    const p = {} as ParticleData;
    p.id = ++state.particleIdCounter;
    this._initOrbiting(p, state, planet);
    return p;
  }
}
