import { describe, it, expect } from 'vitest';
import { ProductionSystem } from '../ProductionSystem';
import type { GameState, PlanetData, ParticleData } from '../../types';
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
});
