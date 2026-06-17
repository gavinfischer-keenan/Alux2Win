import { describe, it, expect } from 'vitest';
import { GravitySystem } from '../GravitySystem';
import type { GameState, ParticleData, BlackHoleData } from '../../types';

describe('GravitySystem', () => {
  const createGameState = (
    particles: Partial<ParticleData>[] = [],
    blackHoles: Partial<BlackHoleData>[] = []
  ): GameState => {
    const state = {
      planets: new Map(),
      particles: particles as ParticleData[],
      blackHoles: new Map(blackHoles.map((bh, i) => [`bh${i}`, bh as BlackHoleData])),
      selectedPlanetIds: new Set(),
      selectedParticleIds: new Set(),
      particleIdCounter: particles.length,
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
    return state;
  };

  it('does nothing if there are no black holes', () => {
    const system = new GravitySystem();
    const particle: Partial<ParticleData> = { x: 100, y: 100, vx: 0, vy: 0, alive: true };
    const state = createGameState([particle], []);

    system.update(1.0, state);
    expect(state.particles[0].vx).toBe(0);
    expect(state.particles[0].vy).toBe(0);
    expect(state.particles[0].alive).toBe(true);
  });

  it('instantly destroys particle if inside event horizon', () => {
    const system = new GravitySystem();
    const particle: Partial<ParticleData> = { x: 10, y: 10, vx: 0, vy: 0, alive: true };
    const bh: Partial<BlackHoleData> = { x: 0, y: 0, radius: 20, pullRadius: 100, pullStrength: 500 };
    const state = createGameState([particle], [bh]);

    system.update(1.0, state);
    // Pruned from the particles array
    expect(state.particles.length).toBe(0);
  });

  it('applies gravity if inside pullRadius but outside event horizon', () => {
    const system = new GravitySystem();
    // Particle at (100, 0), black hole at (0,0), radius 20, pullRadius 200
    // Dist = 100
    // rawAccel = pullStrength / distSq * dt = 10000 / 10000 * 1 = 1
    const particle: Partial<ParticleData> = { x: 100, y: 0, vx: 0, vy: 0, alive: true };
    const bh: Partial<BlackHoleData> = { x: 0, y: 0, radius: 20, pullRadius: 200, pullStrength: 10000 };
    const state = createGameState([particle], [bh]);

    system.update(1.0, state);
    expect(state.particles.length).toBe(1);
    expect(state.particles[0].alive).toBe(true);
    // accel = 1, dx = -100, dy = 0, dir = (-1, 0)
    // vx = -1
    expect(state.particles[0].vx).toBeCloseTo(-1);
    expect(state.particles[0].vy).toBe(0);
  });

  it('caps acceleration to MAX_GRAV_ACCEL * dt', () => {
    const system = new GravitySystem();
    // Particle at (30, 0), black hole at (0,0), radius 20, pullRadius 200
    // Dist = 30
    // pullStrength = 1000000 -> huge accel
    const particle: Partial<ParticleData> = { x: 30, y: 0, vx: 0, vy: 0, alive: true };
    const bh: Partial<BlackHoleData> = { x: 0, y: 0, radius: 20, pullRadius: 200, pullStrength: 1000000 };
    const state = createGameState([particle], [bh]);

    system.update(0.5, state); // dt = 0.5
    expect(state.particles[0].alive).toBe(true);
    // MAX_GRAV_ACCEL is 500, so max accel = 250
    // dx = -30, dy = 0, dir = (-1, 0) -> vx = -250
    expect(state.particles[0].vx).toBeCloseTo(-250);
  });

  it('ignores dead particles', () => {
    const system = new GravitySystem();
    const particle: Partial<ParticleData> = { x: 50, y: 0, vx: 0, vy: 0, alive: false };
    const bh: Partial<BlackHoleData> = { x: 0, y: 0, radius: 20, pullRadius: 200, pullStrength: 10000 };
    const state = createGameState([particle], [bh]);

    system.update(1.0, state);
    // still dead, no velocity change
    expect(state.particles[0].vx).toBe(0);
  });

  it('ignores particles outside pullRadius', () => {
    const system = new GravitySystem();
    const particle: Partial<ParticleData> = { x: 300, y: 0, vx: 0, vy: 0, alive: true };
    const bh: Partial<BlackHoleData> = { x: 0, y: 0, radius: 20, pullRadius: 200, pullStrength: 10000 };
    const state = createGameState([particle], [bh]);

    system.update(1.0, state);
    expect(state.particles[0].vx).toBe(0);
  });
});
