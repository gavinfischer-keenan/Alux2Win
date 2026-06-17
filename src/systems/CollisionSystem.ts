// ============================================================
// CollisionSystem.ts — Particle-particle annihilation via SpatialHash
// ============================================================

import type { GameState } from '../types';
import { COLLISION_DISTANCE } from '../types';
import { SpatialHash } from '../core/SpatialHash';

const COLLISION_DIST_SQ = COLLISION_DISTANCE * COLLISION_DISTANCE;

/**
 * Performs 1:1 annihilation between particles of different factions.
 * Uses a SpatialHash for broad-phase culling, then exact distance for narrow-phase.
 *
 * SpatialHash may be provided at construction time OR passed per update() call
 * (GameScene builds its own SpatialHash and passes it at call-time).
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

    // Track which particles have already been annihilated this tick.
    const annihilated = new Set<number>();
    let anyDied = false;

    // ---- Narrow-phase collision ----
    for (const p of particles) {
      if (!p.alive || annihilated.has(p.id)) continue;

      const nearby = spatialHash.getNearby(p);

      for (const other of nearby) {
        if (other === p)                    continue; // Skip self.
        if (!other.alive)                   continue;
        if (annihilated.has(other.id))      continue;
        if (other.faction === p.faction)    continue; // Same faction — no collision.

        const dx = p.x - other.x;
        const dy = p.y - other.y;
        const distSq = dx * dx + dy * dy;

        if (distSq < COLLISION_DIST_SQ) {
          // 1:1 annihilation.
          p.alive     = false;
          other.alive = false;
          annihilated.add(p.id);
          annihilated.add(other.id);
          anyDied = true;
          break; // p is dead; stop checking neighbours.
        }
      }
    }

    // ---- Prune dead particles ----
    if (anyDied) {
      state.particles = particles.filter((p) => p.alive);
    }
  }
}
