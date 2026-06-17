import { describe, it, expect, beforeEach } from 'vitest';
import { ProductionSystem } from '../ProductionSystem';
import type { GameState, PlanetData, ParticleData } from '../../types';

describe('ProductionSystem', () => {
  let system: ProductionSystem;

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
    system = new ProductionSystem();
  });

  it('does not produce particles for neutral planets', () => {
    const planet: Partial<PlanetData> = { id: 'p1', faction: 'neutral', particles: 0, capacity: 20, productionRate: 10, inStorm: false };
    const state = createGameState([planet]);

    system.update(1.0, state);
    expect(state.planets.get('p1')!.particles).toBe(0);
    expect(state.particles.length).toBe(0);
  });

  it('respects planet capacity', () => {
    const planet: Partial<PlanetData> = { id: 'p1', faction: 'player', particles: 20, capacity: 20, productionRate: 10, inStorm: false };
    const state = createGameState([planet]);

    system.update(1.0, state);
    expect(state.planets.get('p1')!.particles).toBe(20);
    expect(state.particles.length).toBe(0);
  });

  it('does not produce if in plasma storm', () => {
    const planet: Partial<PlanetData> = { id: 'p1', faction: 'player', particles: 0, capacity: 20, productionRate: 10, inStorm: true };
    const state = createGameState([planet]);

    system.update(1.0, state);
    expect(state.planets.get('p1')!.particles).toBe(0);
    expect(state.particles.length).toBe(0);
  });

  it('produces particles based on productionRate and dt', () => {
    const planet: Partial<PlanetData> = { 
      id: 'p1', faction: 'player', particles: 0, capacity: 20, 
      productionRate: 0.5, inStorm: false, upgradeLevel: 1, x: 100, y: 100 
    };
    const state = createGameState([planet]);

    // dt = 1.0, productionRate = 0.5, acc = 0.5, no particle yet
    system.update(1.0, state);
    expect(state.planets.get('p1')!.particles).toBe(0);
    expect(state.particles.length).toBe(0);

    // dt = 1.0, acc = 1.0 -> 1 particle produced
    system.update(1.0, state);
    expect(state.planets.get('p1')!.particles).toBe(1);
    expect(state.particles.length).toBe(1);
    expect(state.particles[0].faction).toBe('player');
    expect(state.particles[0].mode).toBe('orbiting');
    expect(state.particles[0].homePlanetId).toBe('p1');
  });

  it('auto-absorbs orbiting 1X particles at non-max planets after 20s', () => {
    const planet: Partial<PlanetData> = { 
      id: 'p1', upgradeLevel: 1, particles: 5, bonusHealth: 0, maxBonusHealth: 10, absorbedCount: 0 
    };
    const particle: Partial<ParticleData> = { 
      id: 1, alive: true, mode: 'orbiting', strength: 1, homePlanetId: 'p1', orbitTimer: 19 
    };
    const state = createGameState([planet], [particle]);

    // dt = 1.5 -> orbitTimer goes to 20.5 -> triggers absorb
    system.update(1.5, state);
    const updatedPlanet = state.planets.get('p1')!;
    
    expect(state.particles.length).toBe(0); // particle absorbed
    expect(updatedPlanet.particles).toBe(4); // max(0, particles - 1)
    expect(updatedPlanet.bonusHealth).toBe(1); // healed 1 strength
    expect(updatedPlanet.absorbedCount).toBe(0); // bonusHealth absorbed the 1 strength entirely
  });

  it('does not auto-absorb at max-upgraded planets (level 3)', () => {
    const planet: Partial<PlanetData> = { 
      id: 'p1', upgradeLevel: 3, particles: 5, bonusHealth: 0, maxBonusHealth: 75, absorbedCount: 0 
    };
    const particle: Partial<ParticleData> = { 
      id: 1, alive: true, mode: 'orbiting', strength: 1, homePlanetId: 'p1', orbitTimer: 19 
    };
    const state = createGameState([planet], [particle]);

    system.update(1.5, state); // orbitTimer > 20
    expect(state.particles.length).toBe(1); // not absorbed
    expect(state.particles[0].orbitTimer).toBe(19);
  });

  it('forms a 5X composite from 5 orbiting 1X particles at a level 3 planet', () => {
    const planet: Partial<PlanetData> = { 
      id: 'p1', faction: 'player', upgradeLevel: 3, particles: 10, x: 0, y: 0 
    };
    const particles: Partial<ParticleData>[] = Array.from({ length: 5 }, (_, i) => ({
      id: i + 1, alive: true, mode: 'orbiting', strength: 1, homePlanetId: 'p1',
      x: 10, y: 0, orbitAngle: 0, vx: 0, vy: 0
    }));
    const state = createGameState([planet], particles);

    system.update(1.0, state);
    
    // 5 1X particles removed, 1 5X particle added
    expect(state.particles.length).toBe(1);
    const composite = state.particles[0];
    expect(composite.strength).toBe(5);
    expect(composite.mode).toBe('orbiting');
    
    // planet particles = 10 - 5 + 1 = 6
    expect(state.planets.get('p1')!.particles).toBe(6);
  });
});
