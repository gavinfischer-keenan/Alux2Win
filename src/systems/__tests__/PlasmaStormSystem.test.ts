import { describe, it, expect } from 'vitest';
import { PlasmaStormSystem } from '../PlasmaStormSystem';
import type { GameState, ParticleData, PlanetData, PlasmaStormData } from '../../types';

describe('PlasmaStormSystem', () => {
  const createGameState = (
    particles: Partial<ParticleData>[] = [],
    planets: Partial<PlanetData>[] = [],
    plasmaStorms: Partial<PlasmaStormData>[] = []
  ): GameState => {
    const state = {
      planets: new Map(planets.map((pl, i) => [`pl${i}`, { id: `pl${i}`, ...pl } as PlanetData])),
      particles: particles as ParticleData[],
      blackHoles: new Map(),
      selectedPlanetIds: new Set(),
      selectedParticleIds: new Set(),
      particleIdCounter: particles.length,
      tick: 0,
      running: true,
      winner: null,
      worldWidth: 2000,
      worldHeight: 2000,
      plasmaStorms: plasmaStorms as PlasmaStormData[],
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

  it('moves storms and rotates their angle', () => {
    const system = new PlasmaStormSystem();
    const storm: Partial<PlasmaStormData> = { x: 500, y: 500, vx: 100, vy: -50, radiusX: 100, radiusY: 100, angle: 0 };
    const state = createGameState([], [], [storm]);

    system.update(1.0, state);
    expect(state.plasmaStorms[0].x).toBe(600);
    expect(state.plasmaStorms[0].y).toBe(450);
    expect(state.plasmaStorms[0].angle).toBeGreaterThan(0);
  });

  it('bounces storms off boundaries', () => {
    const system = new PlasmaStormSystem();
    // Move storm left towards 0, with radiusX = 100
    const storm: Partial<PlasmaStormData> = { x: 105, y: 500, vx: -10, vy: 0, radiusX: 100, radiusY: 100, angle: 0 };
    const state = createGameState([], [], [storm]);

    system.update(1.0, state); // new x would be 95, which is < 100, so it clamps to 100 and bounces vx to positive
    expect(state.plasmaStorms[0].x).toBe(100);
    expect(state.plasmaStorms[0].vx).toBe(10);
  });

  it('applies stormTimer increment to unprotected particles inside storm', () => {
    const system = new PlasmaStormSystem();
    const storm: Partial<PlasmaStormData> = { x: 500, y: 500, radiusX: 100, radiusY: 100, vx: 0, vy: 0, angle: 0 };
    // Unprotected particle inside storm
    const p: Partial<ParticleData> = { x: 500, y: 500, vx: 0, vy: 0, alive: true, stormTimer: 0, inStorm: false, faction: 'player', mode: 'traveling' };
    const state = createGameState([p], [], [storm]);

    system.update(1.0, state);
    expect(state.particles[0].inStorm).toBe(true);
    expect(state.particles[0].stormTimer).toBe(1.0);
    expect(state.particles[0].alive).toBe(true);
  });

  it('kills particle after threshold time inside storm', () => {
    const system = new PlasmaStormSystem();
    const storm: Partial<PlasmaStormData> = { x: 500, y: 500, radiusX: 100, radiusY: 100, vx: 0, vy: 0, angle: 0 };
    // particle inside storm with stormTimer already at 4.5
    const p: Partial<ParticleData> = { x: 500, y: 500, vx: 0, vy: 0, alive: true, stormTimer: 4.5, inStorm: false, faction: 'player', mode: 'traveling' };
    const state = createGameState([p], [], [storm]);

    system.update(1.0, state); // dt = 1.0, stormTimer -> 5.5 (> 5), kills particle
    expect(state.particles.length).toBe(0);
  });
});
