// ============================================================
// MovementSystem.ts — Boid flocking + orbit + seek + stationed movement
// ============================================================

import type { GameState, ParticleData, PlanetData } from '../types';
import { PARTICLE_SPEED, PLANET_RADIUS, ARRIVE_THRESHOLD } from '../types';
import type { SpatialHash } from '../core/SpatialHash';

const BOID_RADIUS         = 60;
const AGGRO_RADIUS        = 40;
const AGGRO_WEIGHT        = 4.0;
const BOID_RADIUS_SQ      = BOID_RADIUS * BOID_RADIUS;
const SEP_WEIGHT          = 1.5;
const COH_WEIGHT          = 0.5;
const ALI_WEIGHT          = 0.4;
const SEEK_WEIGHT         = 2.5;
const ORBIT_SPEED         = 1.2;
const COMBAT_PROXIMITY    = 20;
const COMBAT_SPEED_FACTOR = 0.8;

export class MovementSystem {
  private _nearbyBuffer: ParticleData[] = [];

  update(dt: number, state: GameState, spatialHash: SpatialHash): void {
    const planets = state.planets;

    for (const particle of state.particles) {
      if (!particle.alive) continue;

      switch (particle.mode) {
        case 'orbiting':
          this._updateOrbiting(particle, planets, dt);
          break;
        case 'traveling':
          this._updateTraveling(particle, planets, dt, spatialHash);
          break;
        case 'combat':
          this._updateCombat(particle, planets, dt, spatialHash);
          break;
        case 'stationed':
          this._updateStationed(particle, spatialHash, dt);
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
    p.vx = -Math.sin(angle) * orbitRadius * ORBIT_SPEED;
    p.vy =  Math.cos(angle) * orbitRadius * ORBIT_SPEED;
  }

  // ---- Traveling ----

  private _updateTraveling(
    p: ParticleData,
    planets: Map<string, PlanetData>,
    dt: number,
    spatialHash: SpatialHash
  ): void {
    // Resolve target: planet (dynamic chase) or empty space coordinate
    const targetPlanet = p.targetPlanetId ? planets.get(p.targetPlanetId) : null;

    // ---- Waypoint: if set, navigate here first before real target ----
    if (p.waypointX !== undefined && p.waypointY !== undefined) {
      const wx = p.waypointX - p.x;
      const wy = p.waypointY - p.y;
      const wDist = Math.sqrt(wx * wx + wy * wy);
      if (wDist <= ARRIVE_THRESHOLD) {
        // Arrived at waypoint — clear it and resume toward real target
        p.waypointX = undefined;
        p.waypointY = undefined;
      } else {
        // Steer toward waypoint
        const wSpeed = PARTICLE_SPEED;
        p.vx = (wx / wDist) * wSpeed;
        p.vy = (wy / wDist) * wSpeed;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        return; // Skip rest of traveling logic this frame
      }
    }

    const destX = targetPlanet ? targetPlanet.x : (p.targetX ?? null);
    const destY = targetPlanet ? targetPlanet.y : (p.targetY ?? null);

    // ---- Check arrival at empty-space target → become stationed ----
    if (!targetPlanet && destX !== null && destY !== null) {
      const ax = destX - p.x;
      const ay = destY - p.y;
      if (Math.sqrt(ax * ax + ay * ay) <= ARRIVE_THRESHOLD) {
        p.mode = 'stationed';
        p.vx = 0;
        p.vy = 0;
        return;
      }
    }

    // ---- Boid forces (only among same-faction traveling particles) ----
    let sepX = 0, sepY = 0;
    let cohX = 0, cohY = 0;
    let aliX = 0, aliY = 0;
    let neighbours = 0;

    const nearbyBoids = spatialHash.getNearby(p, this._nearbyBuffer);
    for (let i = 0; i < nearbyBoids.length; i++) {
      const other = nearbyBoids[i];
      if (other === p || !other.alive || other.faction !== p.faction || other.mode !== 'traveling') continue;
      const dx = p.x - other.x;
      const dy = p.y - other.y;
      const dSq = dx * dx + dy * dy;
      if (dSq > BOID_RADIUS_SQ) continue;

      const dist = Math.sqrt(dSq);
      neighbours++;

      if (dist > 0) {
        sepX += (dx / dist) / Math.max(dist, 1);
        sepY += (dy / dist) / Math.max(dist, 1);
      }
      cohX += other.x;
      cohY += other.y;
      aliX += other.vx;
      aliY += other.vy;
    }

    let forceX = 0;
    let forceY = 0;

    if (neighbours > 0) {
      cohX = cohX / neighbours - p.x;
      cohY = cohY / neighbours - p.y;
      const cohLen = Math.sqrt(cohX * cohX + cohY * cohY);
      if (cohLen > 0) { cohX /= cohLen; cohY /= cohLen; }

      aliX /= neighbours;
      aliY /= neighbours;
      const aliLen = Math.sqrt(aliX * aliX + aliY * aliY);
      if (aliLen > 0) { aliX /= aliLen; aliY /= aliLen; }

      const sepLen = Math.sqrt(sepX * sepX + sepY * sepY);
      if (sepLen > 0) { sepX /= sepLen; sepY /= sepLen; }

      forceX = sepX * SEP_WEIGHT + cohX * COH_WEIGHT + aliX * ALI_WEIGHT;
      forceY = sepY * SEP_WEIGHT + cohY * COH_WEIGHT + aliY * ALI_WEIGHT;
    }

    // ---- Seek force ----
    if (destX !== null && destY !== null) {
      const dx = destX - p.x;
      const dy = destY - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > 0) {
        forceX += (dx / dist) * SEEK_WEIGHT;
        forceY += (dy / dist) * SEEK_WEIGHT;

        // Transition to COMBAT when near a planet target
        if (targetPlanet) {
          const targetRadius = PLANET_RADIUS[targetPlanet.upgradeLevel];
          if (dist < COMBAT_PROXIMITY + targetRadius) {
            p.mode = 'combat';
          }
        }
      }
    }

    // ---- Aggro force ----
    let aggroX = 0, aggroY = 0;
    let closestDistSq = AGGRO_RADIUS * AGGRO_RADIUS;
    const nearby = nearbyBoids;
    for (let i = 0; i < nearby.length; i++) {
      const other = nearby[i];
      if (!other.alive || other.faction === p.faction || other.faction === 'neutral') continue;
      const odx = other.x - p.x;
      const ody = other.y - p.y;
      const dSq = odx * odx + ody * ody;
      if (dSq < closestDistSq) {
        closestDistSq = dSq;
        aggroX = odx;
        aggroY = ody;
      }
    }
    if (closestDistSq < AGGRO_RADIUS * AGGRO_RADIUS) {
      const dist = Math.sqrt(closestDistSq);
      forceX += (aggroX / dist) * AGGRO_WEIGHT;
      forceY += (aggroY / dist) * AGGRO_WEIGHT;
    }

    // ---- Integrate velocity (apply speedMod from SpeedZones) ----
    p.vx += forceX * PARTICLE_SPEED * dt;
    p.vy += forceY * PARTICLE_SPEED * dt;

    const effectiveSpeed = PARTICLE_SPEED * (p.speedMod ?? 1.0);
    const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
    if (speed > effectiveSpeed) {
      p.vx = (p.vx / speed) * effectiveSpeed;
      p.vy = (p.vy / speed) * effectiveSpeed;
    }

    p.x += p.vx * dt;
    p.y += p.vy * dt;

    // Decrement deployTimer if active
    if (p.deployTimer !== undefined && p.deployTimer > 0) {
      p.deployTimer -= dt;
    }
  }

  // ---- Combat ----

  private _updateCombat(
    p: ParticleData,
    planets: Map<string, PlanetData>,
    dt: number,
    spatialHash: SpatialHash
  ): void {
    const target = p.targetPlanetId ? planets.get(p.targetPlanetId) : null;
    if (!target) return;

    let forceX = 0;
    let forceY = 0;

    const dx   = target.x - p.x;
    const dy   = target.y - p.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > 0) {
      forceX += (dx / dist);
      forceY += (dy / dist);
    }

    // ---- Aggro force ----
    let aggroX = 0, aggroY = 0;
    let closestDistSq = AGGRO_RADIUS * AGGRO_RADIUS;
    const nearby = spatialHash.getNearby(p, this._nearbyBuffer);
    for (let i = 0; i < nearby.length; i++) {
      const other = nearby[i];
      if (!other.alive || other.faction === p.faction || other.faction === 'neutral') continue;
      const odx = other.x - p.x;
      const ody = other.y - p.y;
      const dSq = odx * odx + ody * ody;
      if (dSq < closestDistSq) {
        closestDistSq = dSq;
        aggroX = odx;
        aggroY = ody;
      }
    }
    if (closestDistSq < AGGRO_RADIUS * AGGRO_RADIUS) {
      const aDist = Math.sqrt(closestDistSq);
      forceX += (aggroX / aDist) * AGGRO_WEIGHT;
      forceY += (aggroY / aDist) * AGGRO_WEIGHT;
    }

    const forceDist = Math.sqrt(forceX * forceX + forceY * forceY) || 1;
    const maxSpeed = PARTICLE_SPEED * COMBAT_SPEED_FACTOR;

    // We instantly apply this to velocity for combat
    p.vx = (forceX / forceDist) * maxSpeed;
    p.vy = (forceY / forceDist) * maxSpeed;

    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }

  // ---- Stationed ----

  private _updateStationed(p: ParticleData, spatialHash: SpatialHash, dt: number): void {
    let aggroX = 0;
    let aggroY = 0;
    let closestDistSq = AGGRO_RADIUS * AGGRO_RADIUS;
    
    // Aggro Check
    const nearby = spatialHash.getNearby(p, this._nearbyBuffer);
    for (let i = 0; i < nearby.length; i++) {
      const other = nearby[i];
      if (!other.alive || other.faction === p.faction || other.faction === 'neutral') continue;
      const dx = other.x - p.x;
      const dy = other.y - p.y;
      const dSq = dx * dx + dy * dy;
      if (dSq < closestDistSq) {
        closestDistSq = dSq;
        aggroX = dx;
        aggroY = dy;
      }
    }
    
    if (closestDistSq < AGGRO_RADIUS * AGGRO_RADIUS) {
       const dist = Math.sqrt(closestDistSq);
       p.vx += (aggroX / dist) * AGGRO_WEIGHT * PARTICLE_SPEED * dt;
       p.vy += (aggroY / dist) * AGGRO_WEIGHT * PARTICLE_SPEED * dt;
    } else {
       // gently return to targetX, targetY if pulled away
       if (p.targetX !== undefined && p.targetY !== undefined) {
         const dx = p.targetX - p.x;
         const dy = p.targetY - p.y;
         const dist = Math.sqrt(dx * dx + dy * dy);
         if (dist > ARRIVE_THRESHOLD) {
            p.vx += (dx / dist) * SEEK_WEIGHT * PARTICLE_SPEED * dt;
            p.vy += (dy / dist) * SEEK_WEIGHT * PARTICLE_SPEED * dt;
         } else {
            // Decelerate
            p.vx *= 0.8;
            p.vy *= 0.8;
         }
       } else {
         p.vx = 0;
         p.vy = 0;
       }
    }

    const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
    if (speed > PARTICLE_SPEED) {
      p.vx = (p.vx / speed) * PARTICLE_SPEED;
      p.vy = (p.vy / speed) * PARTICLE_SPEED;
    }

    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
}
