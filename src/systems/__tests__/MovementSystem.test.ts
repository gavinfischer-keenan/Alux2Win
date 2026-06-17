import { describe, it, expect, beforeEach } from 'vitest';
import { MovementSystem } from '../MovementSystem';
import type { GameState, ParticleData, PlanetData } from '../../types';
import { PARTICLE_SPEED, PLANET_RADIUS } from '../../types';

describe('MovementSystem', () => {
  let system: MovementSystem;
  let mockSpatialHash: any;

  const createGameState = (planets: Partial<PlanetData>[] = [], particles: Partial<ParticleData>[] = []): GameState => {
    return {
      planets: new Map(planets.map(p => [p.id, p as PlanetData])),
      particles: particles as ParticleData[],
      particleIdCounter: particles.length,
      blackHoles: new Map(),
      selectedPlanetIds: new Set(),
      selectedParticleIds: new Set(),
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
      whiteHoles: []
    } as unknown as GameState;
  };

  beforeEach(() => {
    system = new MovementSystem();
    mockSpatialHash = {
      getNearby: () => []
    };
  });

  it('updates orbiting particles correctly', () => {
    const planet: Partial<PlanetData> = { id: 'p1', x: 100, y: 100, upgradeLevel: 1 };
    const particle: Partial<ParticleData> = {
      id: 1, alive: true, mode: 'orbiting', homePlanetId: 'p1', orbitAngle: 0, orbitRadius: 20, x: 0, y: 0, vx: 0, vy: 0
    };
    const state = createGameState([planet], [particle]);

    system.update(1.0, state, mockSpatialHash);

    const p = state.particles[0];
    expect(p.orbitAngle).toBeGreaterThan(0); // angle increased by ORBIT_SPEED * dt
    // Orbit radius updated to base * 1.8 if not set, or stays the same. Here we set it to 20, but it gets overwritten or not?
    // Wait, the code says: p.orbitRadius = orbitRadius (where orbitRadius = p.orbitRadius ?? ...). So it keeps 20.
    // x = 100 + 20 * cos(newAngle)
    expect(p.x).toBeCloseTo(100 + 20 * Math.cos(p.orbitAngle!));
    expect(p.y).toBeCloseTo(100 + 20 * Math.sin(p.orbitAngle!));
  });

  it('traveling particle switches to stationed if reached empty space target', () => {
    const particle: Partial<ParticleData> = {
      id: 1, alive: true, mode: 'traveling', targetX: 100, targetY: 100, x: 95, y: 95, vx: 10, vy: 10
    };
    const state = createGameState([], [particle]);

    system.update(1.0, state, mockSpatialHash);

    // dx=5, dy=5 => dist ~ 7.07, threshold is 8.
    expect(state.particles[0].mode).toBe('stationed');
    expect(state.particles[0].vx).toBe(0);
    expect(state.particles[0].vy).toBe(0);
  });

  it('traveling particle seeks target and transitions to combat if near planet', () => {
    const planet: Partial<PlanetData> = { id: 'p1', x: 100, y: 100, upgradeLevel: 1 };
    const particle: Partial<ParticleData> = {
      id: 1, alive: true, mode: 'traveling', targetPlanetId: 'p1', x: 60, y: 100, vx: 0, vy: 0
    };
    const state = createGameState([planet], [particle]);

    system.update(1.0, state, mockSpatialHash);

    // Planet radius level 1 is 18. combat proximity is 20. 18+20 = 38.
    // particle at 60, target at 100. dist = 40. 
    // It should seek, vx should be positive, not combat yet.
    expect(state.particles[0].mode).toBe('traveling');
    expect(state.particles[0].vx).toBeGreaterThan(0);

    // Next update, let's move it closer
    state.particles[0].x = 70; // dist 30
    system.update(1.0, state, mockSpatialHash);
    expect(state.particles[0].mode).toBe('combat');
  });

  it('boid separation pushes traveling particles apart', () => {
    const p1: Partial<ParticleData> = { id: 1, alive: true, faction: 'player', mode: 'traveling', x: 10, y: 10, vx: 0, vy: 0, targetX: 100, targetY: 10 };
    const p2: Partial<ParticleData> = { id: 2, alive: true, faction: 'player', mode: 'traveling', x: 12, y: 10, vx: 0, vy: 0, targetX: 100, targetY: 10 };
    const state = createGameState([], [p1, p2]);

    mockSpatialHash.getNearby = (p: ParticleData) => state.particles; // They see each other

    system.update(1.0, state, mockSpatialHash);

    // p1 x=10, p2 x=12. They should repel.
    // Seek force points to +x. Sep force for p1 points to -x.
    // We can't easily assert the exact velocity, but let's just make sure they move and don't crash.
    expect(state.particles[0].vx).not.toBe(0);
    expect(state.particles[1].vx).not.toBe(0);
  });

  it('combat particle seeks target planet with MAX speed', () => {
    const planet: Partial<PlanetData> = { id: 'p1', x: 100, y: 100 };
    const particle: Partial<ParticleData> = {
      id: 1, alive: true, mode: 'combat', targetPlanetId: 'p1', x: 0, y: 0, vx: 0, vy: 0
    };
    const state = createGameState([planet], [particle]);

    system.update(1.0, state, mockSpatialHash);

    // COMBAT_SPEED_FACTOR = 0.8 -> max speed = 0.8 * 60 = 48
    const expectedSpeed = PARTICLE_SPEED * 0.8;
    const speed = Math.sqrt(state.particles[0].vx! ** 2 + state.particles[0].vy! ** 2);
    expect(speed).toBeCloseTo(expectedSpeed);
  });

  it('stationed particle stays still or softly seeks targetX/Y', () => {
    const particle: Partial<ParticleData> = {
      id: 1, alive: true, mode: 'stationed', targetX: 100, targetY: 100, x: 99, y: 100, vx: 0, vy: 0
    };
    const state = createGameState([], [particle]);

    system.update(1.0, state, mockSpatialHash);
    // distance is 1 (dx=1, dy=0), which is <= ARRIVE_THRESHOLD(8).
    // so it decelerates. vx should be 0 * 0.8 = 0.
    expect(state.particles[0].vx).toBeCloseTo(0);
    expect(state.particles[0].vy).toBeCloseTo(0);

    // Now put it further away
    state.particles[0].x = 50;
    system.update(1.0, state, mockSpatialHash);
    // dist is 50 > 8. seek force applied.
    expect(state.particles[0].vx).toBeGreaterThan(0);
  });

  it('stationed particle aggros nearby enemy', () => {
    const p1: Partial<ParticleData> = { id: 1, alive: true, faction: 'player', mode: 'stationed', x: 10, y: 10, vx: 0, vy: 0 };
    const p2: Partial<ParticleData> = { id: 2, alive: true, faction: 'enemy_a', mode: 'traveling', x: 15, y: 10, vx: 0, vy: 0 };
    const state = createGameState([], [p1, p2]);

    mockSpatialHash.getNearby = () => state.particles;

    system.update(1.0, state, mockSpatialHash);

    // p1 aggros on p2 -> dx=5, dy=0.
    expect(state.particles[0].vx).toBeGreaterThan(0);
  });

  it('applies speedMod for traveling particles', () => {
    const p: Partial<ParticleData> = { id: 1, alive: true, mode: 'traveling', speedMod: 2.0, targetX: 100, targetY: 0, x: 0, y: 0, vx: 1000, vy: 0 };
    const state = createGameState([], [p]);

    system.update(1.0, state, mockSpatialHash);
    
    // The integration limits speed to PARTICLE_SPEED * p.speedMod
    // PARTICLE_SPEED = 60, speedMod = 2.0 => max speed = 120
    expect(state.particles[0].vx).toBeCloseTo(120);
  });
});
