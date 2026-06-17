// ============================================================
// CollisionSystem.ts — Strength-aware particle-particle collision
// ============================================================

import type { GameState, ParticleData } from '../types';
import { COLLISION_DISTANCE } from '../types';
import { SpatialHash } from '../core/SpatialHash';

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
  constructor(private readonly _ownedSpatialHash?: SpatialHash) {}

  update(state: GameState, externalHash?: SpatialHash): void {
    const particles = state.particles;
    const spatialHash = externalHash ?? this._ownedSpatialHash;
    if (!spatialHash) {
      console.error('CollisionSystem: no SpatialHash provided');
      return;
    }
    if (particles.length < 2) return;

    // ---- Rebuild spatial hash ----
    spatialHash.clear();
    for (const p of particles) {
      if (p.alive) spatialHash.insert(p);
    }

    // ---- Pass 1: Accumulate damage ----
    // Use string key "${lo}_${hi}" to safely deduplicate pairs regardless of ID magnitude
    const processedPairs = new Set<string>();

    for (const p of particles) {
      if (!p.alive) continue;

      const nearby = spatialHash.getNearby(p);

      for (const other of nearby) {
        if (other === p)                 continue;
        if (!other.alive)                continue;
        if (other.faction === p.faction) continue; // same faction

        // Deduplicate pair
        const lo = Math.min(p.id, other.id);
        const hi = Math.max(p.id, other.id);
        const pairKey = `${lo}_${hi}`;
        if (processedPairs.has(pairKey)) continue;

        const dx = p.x - other.x;
        const dy = p.y - other.y;
        if (dx * dx + dy * dy >= COLLISION_DIST_SQ) continue;

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
            orbitRadius:   p.orbitRadius,
            alive:         true,
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
