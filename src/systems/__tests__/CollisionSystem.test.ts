import { describe, it, expect, beforeEach } from 'vitest';
import { CollisionSystem } from '../CollisionSystem';
import { SpatialHash } from '../../core/SpatialHash';
import type { GameState, ParticleData } from '../../types';
import { COLLISION_DISTANCE } from '../../types';

describe('CollisionSystem', () => {
  let system: CollisionSystem;
  let state: GameState;
  let spatialHash: SpatialHash;

  beforeEach(() => {
    system = new CollisionSystem();
    spatialHash = new SpatialHash(40);
    state = {
      planets: new Map(),
      particles: [],
      blackHoles: new Map(),
      selectedPlanetIds: new Set(),
      selectedParticleIds: new Set(),
      particleIdCounter: 100,
      tick: 0,
      running: true,
      winner: null,
      worldWidth: 2000,
      worldHeight: 2000,
      plasmaStorms: [],
      asteroids: [],
      asteroidRespawnTimer: 0,
      gammaRay: { enabled: false, timer: 0, intervalSeconds: 0, path: null, firing: false, fireProgress: 0 },
      speedZones: [],
      portals: [],
      trappingBlackHoles: [],
      whiteHoles: [],
    };
  });

  function createParticle(id: number, x: number, y: number, faction: any, strength: any = 1, inStorm: boolean = false): ParticleData {
    return {
      id,
      x,
      y,
      vx: 0,
      vy: 0,
      faction,
      mode: 'traveling',
      strength,
      orbitTimer: 0,
      damage: 0,
      homePlanetId: 'p1',
      alive: true,
      stormTimer: 0,
      inStorm,
      speedMod: 1.0,
      portalCooldown: 0,
      trappedByBH: null,
    };
  }

  function runSystem() {
    spatialHash.clear();
    for (const p of state.particles) {
      if (p.alive) spatialHash.insert(p);
    }
    system.update(state, spatialHash);
  }

  it('should not collide particles of the same faction', () => {
    const p1 = createParticle(1, 100, 100, 'player', 1);
    const p2 = createParticle(2, 100 + COLLISION_DISTANCE - 1, 100, 'player', 1);
    state.particles.push(p1, p2);

    runSystem();

    expect(state.particles.length).toBe(2);
    expect(state.particles[0].alive).toBe(true);
    expect(state.particles[1].alive).toBe(true);
  });

  it('should not collide if particles are further than COLLISION_DISTANCE', () => {
    const p1 = createParticle(1, 100, 100, 'player', 1);
    const p2 = createParticle(2, 100 + COLLISION_DISTANCE + 1, 100, 'enemy_a', 1);
    state.particles.push(p1, p2);

    runSystem();

    expect(state.particles.length).toBe(2);
    expect(p1.alive).toBe(true);
    expect(p2.alive).toBe(true);
  });

  it('should destroy both 1X particles on collision', () => {
    const p1 = createParticle(1, 100, 100, 'player', 1);
    const p2 = createParticle(2, 100 + COLLISION_DISTANCE - 1, 100, 'enemy_a', 1);
    state.particles.push(p1, p2);

    runSystem();

    expect(state.particles.length).toBe(0);
  });

  it('should destroy 1X and devolve 5X into four 1X particles on collision', () => {
    const p1 = createParticle(1, 100, 100, 'player', 5);
    const p2 = createParticle(2, 100 + COLLISION_DISTANCE - 1, 100, 'enemy_a', 1);
    state.particles.push(p1, p2);

    runSystem();

    // 1X is dead. 5X is dead but spawns four 1X particles.
    expect(state.particles.length).toBe(4);
    for (const p of state.particles) {
      expect(p.alive).toBe(true);
      expect(p.strength).toBe(1);
      expect(p.faction).toBe('player');
      expect(p.id).toBeGreaterThan(100); // Because counter started at 100
    }
  });

  it('should destroy both 5X particles on collision', () => {
    const p1 = createParticle(1, 100, 100, 'player', 5);
    const p2 = createParticle(2, 100 + COLLISION_DISTANCE - 1, 100, 'enemy_a', 5);
    state.particles.push(p1, p2);

    runSystem();

    expect(state.particles.length).toBe(0);
  });

  it('should properly accumulate damage if surrounded by multiple 1X enemies', () => {
    // One 5X player vs two 1X enemies
    const p1 = createParticle(1, 100, 100, 'player', 5);
    const p2 = createParticle(2, 100 + COLLISION_DISTANCE - 1, 100, 'enemy_a', 1);
    const p3 = createParticle(3, 100 - COLLISION_DISTANCE + 1, 100, 'enemy_a', 1);
    state.particles.push(p1, p2, p3);

    runSystem();

    // The two 1X enemies take 5 damage each, so they die.
    // The 5X player takes 1 + 1 = 2 damage, so it dies and devolves into 3 1X particles.
    expect(state.particles.length).toBe(3);
    for (const p of state.particles) {
      expect(p.alive).toBe(true);
      expect(p.strength).toBe(1);
      expect(p.faction).toBe('player');
    }
  });

  it('should ignore collision if either particle is in a storm', () => {
    const p1 = createParticle(1, 100, 100, 'player', 1, true); // inStorm
    const p2 = createParticle(2, 100, 100, 'enemy_a', 1, false);
    state.particles.push(p1, p2);

    runSystem();

    expect(state.particles.length).toBe(2);
    expect(p1.alive).toBe(true);
    expect(p2.alive).toBe(true);
  });

  it('should correctly deduplicate pairs even if many particles', () => {
    const p1 = createParticle(1, 100, 100, 'player', 5);
    const p2 = createParticle(2, 100, 100, 'enemy_a', 1);
    
    // We hack the hash logic to ensure multiple lookups might happen 
    // to test deduplication, but just having them in the same spot does that implicitly.
    state.particles.push(p1, p2);
    runSystem();

    // Even if p1 checks p2 and p2 checks p1, it should only count as 1 damage to p1
    expect(state.particles.length).toBe(4); // 5 - 1 = 4 remaining 1X particles
  });
});
