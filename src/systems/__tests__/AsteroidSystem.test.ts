import { describe, it, expect, vi } from 'vitest';
import { AsteroidSystem } from '../AsteroidSystem';
import type { GameState, AsteroidData, PlanetData, ParticleData } from '../../types';
import { EventBus } from '../../core/EventBus';

describe('AsteroidSystem', () => {
  it('spawns an asteroid if none exists after delay', () => {
    const system = new AsteroidSystem();
    const eventBus = new EventBus();

    const state: GameState = {
      worldWidth: 1000,
      worldHeight: 1000,
      planets: new Map(),
      particles: [],
      blackHoles: new Map(),
      speedZones: new Map(),
      portals: new Map(),
      trappingBHs: new Map(),
      whiteHoles: new Map(),
      selectedPlanetIds: new Set(),
      selectedParticleIds: new Set(),
      winner: null,
      running: true,
      timeElapsed: 0,
      asteroidConfig: { enabled: true },
      asteroids: [],
      asteroidRespawnTimer: 0,
      particleIdCounter: 0,
      hazardEffects: [],
      hazardEffectIdCounter: 0,
    };

    // Fast forward spawn timer (it spawns after 5 seconds)
    system.update(5.1, state, eventBus);

    expect(state.asteroids.length).toBe(1);
    expect(state.asteroids[0].radius).toBeGreaterThanOrEqual(14);
  });

  it('bounces off a planet and resets it to neutral', () => {
    const system = new AsteroidSystem();
    const eventBus = new EventBus();
    const emitSpy = vi.spyOn(eventBus, 'emit');

    const planet: PlanetData = {
      id: 'p1', x: 500, y: 500, faction: 'player', upgradeLevel: 1,
      health: 60, maxHealth: 60, productionRate: 10, absorbedCount: 0,
      isOrbiting: false,
    };

    const asteroid: AsteroidData = {
      id: 'a1', x: 500, y: 500, vx: 100, vy: 0,
      radius: 20, angle: 0, hitCount: 0, alive: true,
    };

    const state: GameState = {
      worldWidth: 1000, worldHeight: 1000,
      planets: new Map([['p1', planet]]),
      particles: [],
      blackHoles: new Map(),
      speedZones: new Map(),
      portals: new Map(),
      trappingBHs: new Map(),
      whiteHoles: new Map(),
      selectedPlanetIds: new Set(),
      selectedParticleIds: new Set(),
      winner: null,
      running: true,
      timeElapsed: 0,
      asteroidConfig: { enabled: true },
      asteroids: [asteroid],
      asteroidRespawnTimer: 0,
      particleIdCounter: 0,
      hazardEffects: [],
      hazardEffectIdCounter: 0,
    };

    system.update(0.1, state, eventBus); // Let it move and collide

    expect(planet.faction).toBe('neutral');
    expect(planet.health).toBe(40); // Reset to base max health for level 1
    expect(planet.upgradeLevel).toBe(1);
    // Note: AsteroidSystem does not emit planet:captured on reset

    // Asteroid should reverse X velocity because it bounced horizontally
    expect(asteroid.vx).toBeLessThan(0);
  });

  it('destroys particles and increments hitCount', () => {
    const system = new AsteroidSystem();
    const eventBus = new EventBus();

    const asteroid: AsteroidData = {
      id: 'a1', x: 500, y: 500, vx: 100, vy: 0,
      radius: 20, angle: 0, hitCount: 0, alive: true,
    };

    const particle: ParticleData = {
      id: 'part1', x: 500, y: 500, vx: -10, vy: 0,
      faction: 'player', mode: 'traveling',
      alive: true, strength: 1, homePlanetId: 'p2'
    };

    const state: GameState = {
      worldWidth: 1000, worldHeight: 1000,
      planets: new Map(),
      particles: [particle],
      blackHoles: new Map(),
      speedZones: new Map(),
      portals: new Map(),
      trappingBHs: new Map(),
      whiteHoles: new Map(),
      selectedPlanetIds: new Set(),
      selectedParticleIds: new Set(),
      winner: null,
      running: true,
      timeElapsed: 0,
      asteroidConfig: { enabled: true },
      asteroids: [asteroid],
      asteroidRespawnTimer: 0,
      particleIdCounter: 0,
      hazardEffects: [],
      hazardEffectIdCounter: 0,
    };

    system.update(0.1, state, eventBus);

    expect(particle.alive).toBe(false);
    expect(state.asteroids[0].hitCount).toBe(1);
  });
});
