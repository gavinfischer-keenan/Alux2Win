import { describe, it, expect, beforeEach } from 'vitest';
import { ProductionSystem } from '../ProductionSystem';
import type { GameState } from '../../types';
import { PLANET_PRODUCTION, PLANET_MAX_HEALTH } from '../../types';
import { createMockGameState, createMockParticle, createMockPlanet } from '../../utils/__tests__/TestFactory';

describe('ProductionSystem', () => {
  it('spawns particles over time based on productionRate', () => {
    const system = new ProductionSystem();
    const planet = createMockPlanet({
      id: 'p1', x: 0, y: 0, faction: 'player', upgradeLevel: 1,
      health: 10, maxHealth: 50, productionRate: 10, absorbedCount: 0,
      isOrbiting: false,
    });

    const state = createMockGameState({
      planets: new Map([['p1', planet]]),
    });

    // 0.1s at rate 10 = 1 particle
    system.update(0.1, state);

    expect(state.particles.filter(p => p.alive).length).toBe(1);
    expect(state.particles[0].mode).toBe('orbiting');
    expect(state.particles[0].faction).toBe('player');
  });

  it('forms 5X composites when 5 particles orbit a level 3 planet', () => {
    const system = new ProductionSystem();
    const planet = createMockPlanet({
      id: 'p1', x: 0, y: 0, faction: 'player', upgradeLevel: 3,
      health: 150, maxHealth: 150, productionRate: 10, absorbedCount: 0,
      isOrbiting: false,
    });

    const state = createMockGameState({
      planets: new Map([['p1', planet]]),
    });

    // Spawn 5 orbiting particles manually
    for (let i = 0; i < 5; i++) {
      state.particles.push(createMockParticle({
        id: i, x: 0, y: 0, vx: 0, vy: 0,
        faction: 'player', mode: 'orbiting', strength: 1,
        homePlanetId: 'p1', alive: true
      }));
    }

    // This should trigger the composite formation
    system.update(0, state);

    // Expecting one 5X particle
    expect(state.particles.filter(p => p.alive).length).toBe(1);
    expect(state.particles[0].strength).toBe(5);
  });

  // ---- Neutral planet production ----

  it('neutral planet heals itself when partly conquered (health < max)', () => {
    const system = new ProductionSystem();
    const neutralRate = PLANET_PRODUCTION[1] / 3;
    const planet = createMockPlanet({
      id: 'p1', x: 0, y: 0, faction: 'neutral', upgradeLevel: 1,
      health: 20, maxHealth: 40, productionRate: neutralRate, absorbedCount: 0,
      isOrbiting: false, originalNeutralHealth: 40, colonizer: 'enemy_a',
    });

    const state = createMockGameState({
      planets: new Map([['p1', planet]]),
    });

    // Simulate enough time for 1 production tick  (1 / rate seconds)
    const dt = 1 / neutralRate + 0.001;
    system.update(dt, state);

    // Planet should have healed by 1
    expect(planet.health).toBe(21);
    // No particles spawned (healing, not defending)
    expect(state.particles.filter(p => p.alive).length).toBe(0);
  });

  it('neutral planet clears colonizer when healed back to full', () => {
    const system = new ProductionSystem();
    const neutralRate = PLANET_PRODUCTION[1] / 3;
    const planet = createMockPlanet({
      id: 'p1', x: 0, y: 0, faction: 'neutral', upgradeLevel: 1,
      health: 39, maxHealth: 40, productionRate: neutralRate, absorbedCount: 0,
      isOrbiting: false, originalNeutralHealth: 40, colonizer: 'enemy_a',
    });

    const state = createMockGameState({
      planets: new Map([['p1', planet]]),
    });

    // One tick heals the last point
    const dt = 1 / neutralRate + 0.001;
    system.update(dt, state);

    expect(planet.health).toBe(40);
    expect(planet.colonizer).toBeNull();
  });

  it('fully healed neutral planet spawns a neutral orbiting defender', () => {
    const system = new ProductionSystem();
    const neutralRate = PLANET_PRODUCTION[1] / 3;
    const planet = createMockPlanet({
      id: 'p1', x: 0, y: 0, faction: 'neutral', upgradeLevel: 1,
      health: 40, maxHealth: 40, productionRate: neutralRate, absorbedCount: 0,
      isOrbiting: false, originalNeutralHealth: 40,
    });

    const state = createMockGameState({
      planets: new Map([['p1', planet]]),
    });

    const dt = 1 / neutralRate + 0.001;
    system.update(dt, state);

    const alive = state.particles.filter(p => p.alive);
    expect(alive.length).toBe(1);
    expect(alive[0].faction).toBe('neutral');
    expect(alive[0].mode).toBe('orbiting');
    expect(alive[0].homePlanetId).toBe('p1');
  });

  // ---- Neutral surprise attacks ----

  it('neutral planet launches 35 traveling attackers when it has 40+ defenders', () => {
    const system = new ProductionSystem();
    const neutralPlanet = createMockPlanet({
      id: 'n1', x: 0, y: 0, faction: 'neutral', upgradeLevel: 1,
      health: 40, maxHealth: 40, productionRate: 0, absorbedCount: 0, isOrbiting: false,
    });
    const targetPlanet = createMockPlanet({
      id: 'p1', x: 500, y: 0, faction: 'player', upgradeLevel: 1,
      health: 40, maxHealth: 40, productionRate: 1, absorbedCount: 0, isOrbiting: false,
    });

    const state = createMockGameState({
      planets: new Map([['n1', neutralPlanet], ['p1', targetPlanet]]),
    });

    // Pre-load 40 neutral defenders
    for (let i = 0; i < 40; i++) {
      state.particles.push(createMockParticle({
        id: i, x: 0, y: 0, vx: 0, vy: 0,
        faction: 'neutral', mode: 'orbiting', strength: 1,
        homePlanetId: 'n1', alive: true,
      }));
    }

    system.update(0, state);

    const travelers = state.particles.filter(p => p.alive && p.mode === 'traveling');
    expect(travelers.length).toBe(35);
    expect(travelers[0].targetPlanetId).toBe('p1');
    // Still 5 defenders remain orbiting
    const orbiters = state.particles.filter(p => p.alive && p.mode === 'orbiting');
    expect(orbiters.length).toBe(5);
  });

  it('neutral surprise attack uses traveling not an invalid mode', () => {
    const system = new ProductionSystem();
    const neutralPlanet = createMockPlanet({
      id: 'n1', x: 0, y: 0, faction: 'neutral', upgradeLevel: 1,
      health: 40, maxHealth: 40, productionRate: 0, absorbedCount: 0, isOrbiting: false,
    });
    const targetPlanet = createMockPlanet({
      id: 'p1', x: 200, y: 0, faction: 'enemy_a', upgradeLevel: 1,
      health: 40, maxHealth: 40, productionRate: 1, absorbedCount: 0, isOrbiting: false,
    });

    const state = createMockGameState({
      planets: new Map([['n1', neutralPlanet], ['p1', targetPlanet]]),
    });

    for (let i = 0; i < 40; i++) {
      state.particles.push(createMockParticle({
        id: i, faction: 'neutral', mode: 'orbiting', homePlanetId: 'n1', alive: true,
      }));
    }

    system.update(0, state);

    const validModes = ['orbiting', 'traveling', 'combat', 'stationed'];
    for (const p of state.particles.filter(p => p.alive)) {
      expect(validModes).toContain(p.mode);
    }
  });

  it('does not trigger attack if planet has fewer than 40 defenders', () => {
    const system = new ProductionSystem();
    const neutralPlanet = createMockPlanet({
      id: 'n1', x: 0, y: 0, faction: 'neutral', upgradeLevel: 1,
      health: 40, maxHealth: 40, productionRate: 0, absorbedCount: 0, isOrbiting: false,
    });
    const targetPlanet = createMockPlanet({
      id: 'p1', x: 200, y: 0, faction: 'player', upgradeLevel: 1,
      health: 40, maxHealth: 40, productionRate: 1, absorbedCount: 0, isOrbiting: false,
    });

    const state = createMockGameState({
      planets: new Map([['n1', neutralPlanet], ['p1', targetPlanet]]),
    });

    // Only 39 defenders — below threshold
    for (let i = 0; i < 39; i++) {
      state.particles.push(createMockParticle({
        id: i, faction: 'neutral', mode: 'orbiting', homePlanetId: 'n1', alive: true,
      }));
    }

    system.update(0, state);

    const travelers = state.particles.filter(p => p.alive && p.mode === 'traveling');
    expect(travelers.length).toBe(0);
  });

  it('does not attack if no non-neutral planet exists', () => {
    const system = new ProductionSystem();
    const neutralPlanet = createMockPlanet({
      id: 'n1', x: 0, y: 0, faction: 'neutral', upgradeLevel: 1,
      health: 40, maxHealth: 40, productionRate: 0, absorbedCount: 0, isOrbiting: false,
    });

    const state = createMockGameState({
      planets: new Map([['n1', neutralPlanet]]),
    });

    for (let i = 0; i < 40; i++) {
      state.particles.push(createMockParticle({
        id: i, faction: 'neutral', mode: 'orbiting', homePlanetId: 'n1', alive: true,
      }));
    }

    system.update(0, state);

    // All particles should remain orbiting — no valid target
    const travelers = state.particles.filter(p => p.alive && p.mode === 'traveling');
    expect(travelers.length).toBe(0);
  });
});
