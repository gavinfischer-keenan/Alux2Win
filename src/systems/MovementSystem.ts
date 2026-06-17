// ============================================================
// MovementSystem.ts — Boid flocking + orbit + seek movement
// ============================================================

import type { GameState, ParticleData, PlanetData } from '../types';
import { PARTICLE_SPEED, PLANET_RADIUS } from '../types';
import { clamp } from '../utils/MathUtils';

// ---- Boid tuning constants ----
const BOID_RADIUS         = 60;    // px — neighbour search radius
const BOID_RADIUS_SQ      = BOID_RADIUS * BOID_RADIUS;
const SEP_WEIGHT          = 1.5;
const COH_WEIGHT          = 0.5;
const ALI_WEIGHT          = 0.4;
const SEEK_WEIGHT         = 2.5;
const ORBIT_SPEED         = 1.2;   // rad/sec
const COMBAT_PROXIMITY    = 20;    // px — switch to COMBAT mode at this range
const COMBAT_SPEED_FACTOR = 0.8;   // fraction of PARTICLE_SPEED

/**
 * Boid flocking + orbit + seek movement system.
 *
 * Modes:
 *   orbiting  — particle circles its home planet.
 *   traveling — boid flocking + seek toward target planet.
 *   combat    — direct seek toward target, no boids, slower speed.
 */
export class MovementSystem {
  update(dt: number, state: GameState): void {
    const planets = state.planets;

    // Build per-faction group of TRAVELING particles for boid calculations.
    // Keyed by faction string.
    const travelingByFaction: Map<string, ParticleData[]> = new Map();
    for (const p of state.particles) {
      if (!p.alive || p.mode !== 'traveling') continue;
      let group = travelingByFaction.get(p.faction);
      if (!group) {
        group = [];
        travelingByFaction.set(p.faction, group);
      }
      group.push(p);
    }

    for (const particle of state.particles) {
      if (!particle.alive) continue;

      switch (particle.mode) {
        case 'orbiting':
          this._updateOrbiting(particle, planets, dt);
          break;
        case 'traveling':
          this._updateTraveling(particle, planets, travelingByFaction, dt);
          break;
        case 'combat':
          this._updateCombat(particle, planets, dt);
          break;
      }
    }
  }

  // ---- Orbiting ----

  private _updateOrbiting(
    p: ParticleData,
    planets: Map<string, PlanetData>,
    dt: number
  ): void {
    const home = planets.get(p.homePlanetId);
    if (!home) return;

    const orbitRadius = p.orbitRadius ?? PLANET_RADIUS[home.upgradeLevel] * 1.8;
    p.orbitRadius = orbitRadius;
    p.orbitAngle  = ((p.orbitAngle ?? 0) + ORBIT_SPEED * dt);

    const angle = p.orbitAngle;
    p.x = home.x + orbitRadius * Math.cos(angle);
    p.y = home.y + orbitRadius * Math.sin(angle);

    // Tangent velocity for accurate rendering interpolation.
    p.vx = -Math.sin(angle) * orbitRadius * ORBIT_SPEED;
    p.vy =  Math.cos(angle) * orbitRadius * ORBIT_SPEED;
  }

  // ---- Traveling ----

  private _updateTraveling(
    p: ParticleData,
    planets: Map<string, PlanetData>,
    travelingByFaction: Map<string, ParticleData[]>,
    dt: number
  ): void {
    const target = p.targetPlanetId ? planets.get(p.targetPlanetId) : null;

    // ---- Boid forces ----
    let sepX = 0, sepY = 0;  // Separation
    let cohX = 0, cohY = 0;  // Cohesion
    let aliX = 0, aliY = 0;  // Alignment
    let neighbours = 0;

    const factionGroup = travelingByFaction.get(p.faction);
    if (factionGroup) {
      for (const other of factionGroup) {
        if (other === p || !other.alive) continue;
        const dx = p.x - other.x;
        const dy = p.y - other.y;
        const dSq = dx * dx + dy * dy;
        if (dSq > BOID_RADIUS_SQ) continue;

        const dist = Math.sqrt(dSq);
        neighbours++;

        // Separation: repel inversely to distance.
        if (dist > 0) {
          sepX += (dx / dist) / Math.max(dist, 1);
          sepY += (dy / dist) / Math.max(dist, 1);
        }

        // Cohesion: average position.
        cohX += other.x;
        cohY += other.y;

        // Alignment: average velocity.
        aliX += other.vx;
        aliY += other.vy;
      }
    }

    let forceX = 0;
    let forceY = 0;

    if (neighbours > 0) {
      // Cohesion: steer toward average position.
      cohX = cohX / neighbours - p.x;
      cohY = cohY / neighbours - p.y;
      const cohLen = Math.sqrt(cohX * cohX + cohY * cohY);
      if (cohLen > 0) { cohX /= cohLen; cohY /= cohLen; }

      // Alignment: normalise average velocity.
      aliX /= neighbours;
      aliY /= neighbours;
      const aliLen = Math.sqrt(aliX * aliX + aliY * aliY);
      if (aliLen > 0) { aliX /= aliLen; aliY /= aliLen; }

      // Separation: normalise.
      const sepLen = Math.sqrt(sepX * sepX + sepY * sepY);
      if (sepLen > 0) { sepX /= sepLen; sepY /= sepLen; }

      forceX = sepX * SEP_WEIGHT + cohX * COH_WEIGHT + aliX * ALI_WEIGHT;
      forceY = sepY * SEP_WEIGHT + cohY * COH_WEIGHT + aliY * ALI_WEIGHT;
    }

    // ---- Seek force toward target planet ----
    if (target) {
      const dx = target.x - p.x;
      const dy = target.y - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > 0) {
        forceX += (dx / dist) * SEEK_WEIGHT;
        forceY += (dy / dist) * SEEK_WEIGHT;

        // Transition to COMBAT when close enough.
        const targetRadius = PLANET_RADIUS[target.upgradeLevel];
        if (dist < COMBAT_PROXIMITY + targetRadius) {
          p.mode = 'combat';
        }
      }
    }

    // ---- Integrate velocity ----
    p.vx += forceX * PARTICLE_SPEED * dt;
    p.vy += forceY * PARTICLE_SPEED * dt;

    // Cap speed.
    const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
    if (speed > PARTICLE_SPEED) {
      p.vx = (p.vx / speed) * PARTICLE_SPEED;
      p.vy = (p.vy / speed) * PARTICLE_SPEED;
    }

    // ---- Integrate position ----
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }

  // ---- Combat ----

  private _updateCombat(
    p: ParticleData,
    planets: Map<string, PlanetData>,
    dt: number
  ): void {
    const target = p.targetPlanetId ? planets.get(p.targetPlanetId) : null;
    if (!target) return;

    const dx   = target.x - p.x;
    const dy   = target.y - p.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > 0) {
      const maxSpeed = PARTICLE_SPEED * COMBAT_SPEED_FACTOR;
      p.vx = (dx / dist) * maxSpeed;
      p.vy = (dy / dist) * maxSpeed;
    }

    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
}
