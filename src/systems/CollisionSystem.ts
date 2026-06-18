// ============================================================
// CollisionSystem.ts — Strength-aware particle-particle collision
// ============================================================

import type { GameState, ParticleData } from '../types';
import { COLLISION_DISTANCE } from '../types';
import { SpatialHash } from '../core/SpatialHash';
import { audioManager } from '../core/AudioManager';

const COLLISION_DIST_SQ = COLLISION_DISTANCE * COLLISION_DISTANCE;

/**
 * Two-pass collision resolution:
 *   Pass 1 — For every enemy-faction pair within COLLISION_DISTANCE,
 *             accumulate reciprocal strength damage on each particle.
 *   Pass 2 — Resolve: fully-damaged particles die; 5X particles with
 *             partial damage (damage < 5) devolve into (5 - damage) 1X particles.
 *
 * Pair deduplication prevents double-counting via a processed-pair Set.
 */
export class CollisionSystem {
  private _processedPairs = new Set<number>();
  private _nearbyBuffer: ParticleData[] = [];

  constructor(private readonly _ownedSpatialHash?: SpatialHash) {}

  update(state: GameState, externalHash?: SpatialHash): void {
    const particles = state.particles;
    const spatialHash = externalHash ?? this._ownedSpatialHash;
    if (!spatialHash) {
      console.error('CollisionSystem: no SpatialHash provided');
      return;
    }
    if (particles.length < 2) return;

    // ---- Pass 1: Accumulate damage ----
    // Use numeric pair key to avoid string allocation GC overhead
    this._processedPairs.clear();
    const processedPairs = this._processedPairs;

    for (const p of particles) {
      if (!p.alive) continue;

      const nearby = spatialHash.getNearby(p, this._nearbyBuffer);

      for (let i = 0; i < nearby.length; i++) {
        const other = nearby[i];
        if (other === p)                 continue;
        if (!other.alive)                continue;
        if (other.faction === p.faction) continue; // same faction
        if (p.inStorm || other.inStorm)  continue; // storm-protected

        // Deduplicate pair
        const lo = p.id < other.id ? p.id : other.id;
        const hi = p.id < other.id ? other.id : p.id;
        const pairKey = (lo * 1000000000) + hi; // Safe up to MAX_SAFE_INTEGER for IDs < 9,000,000
        if (processedPairs.has(pairKey)) continue;

        const dx = p.x - other.x;
        const dy = p.y - other.y;
        if (dx * dx + dy * dy >= COLLISION_DIST_SQ) continue;

        if (p.faction === 'player' || other.faction === 'player') {
          audioManager.playCombatEngage();
        }

        processedPairs.add(pairKey);

        // Reciprocal damage: each takes the other's strength
        p.damage     += other.strength;
        other.damage += p.strength;
      }
    }

    // ---- Pass 2: Resolve deaths and devolve 5X ----
    const devolved: ParticleData[] = [];
    let anyDied = false;

    for (const p of particles) {
      if (p.damage === 0) continue;
      const dmg = p.damage;
      p.damage = 0; // reset for next frame

      if (dmg >= p.strength) {
        // Fully killed
        p.alive = false;
        anyDied = true;
      } else if (p.strength === 5) {
        // 5X partially damaged → devolve to (5 - dmg) 1X particles
        p.alive = false;
        anyDied = true;
        const remainder = p.strength - dmg;
        for (let i = 0; i < remainder; i++) {
          const offsetAngle = (i / remainder) * Math.PI * 2;
          devolved.push({
            id:            0, // assigned below after push
            x:             p.x + Math.cos(offsetAngle) * 3,
            y:             p.y + Math.sin(offsetAngle) * 3,
            vx:            p.vx * 0.8 + Math.cos(offsetAngle) * 10,
            vy:            p.vy * 0.8 + Math.sin(offsetAngle) * 10,
            faction:       p.faction,
            mode:          p.mode === 'orbiting' ? 'orbiting' : 'traveling',
            strength:      1,
            orbitTimer:    0,
            damage:        0,
            homePlanetId:  p.homePlanetId,
            targetPlanetId: p.targetPlanetId,
            targetX:       p.targetX,
            targetY:       p.targetY,
            orbitAngle:    p.orbitAngle,
            alive:         true,
            stormTimer:    0,
            inStorm:       false,
            speedMod:      1.0,
            portalCooldown: 0,
            trappedByBH:   null,
          });
        }
      }
    }

    if (anyDied) {
      state.particles = particles.filter(p => p.alive);
    }

    // Assign IDs to devolved particles and push them in
    for (const d of devolved) {
      d.id = ++state.particleIdCounter;
      state.particles.push(d);
    }
  }
}


