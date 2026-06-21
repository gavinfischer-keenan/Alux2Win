import { describe, it, expect, vi } from 'vitest';
import { AIController } from '../AIController';
import type { GameState, PlanetData, ParticleData } from '../../types';
import { EventBus } from '../../core/EventBus';
import { createMockGameState, createMockParticle, createMockPlanet } from '../../utils/__tests__/TestFactory';

describe('AIController', () => {
  it('initializes and respects evaluation timer', () => {
    const ai = new AIController(['enemy_a'], 'normal');
    const state = createMockGameState();
    const eventBus = new EventBus();
    const deploySpy = vi.fn();

    // The first update should trigger an evaluation immediately because timer starts at 0
    ai.update(10.0, state, deploySpy);
    
    // With 0 planets, it won't actually deploy anything, but let's check it doesn't crash
    expect(deploySpy).not.toHaveBeenCalled();
  });

  it('deploys particles to conquer a neutral planet', () => {
    const ai = new AIController(['enemy_a'], 'hard'); // Hard uses berserker, blitzkrieg, etc., which expand fast
    const eventBus = new EventBus();
    const deploySpy = vi.fn();

    const planetAI = createMockPlanet({
      id: 'p1', x: 0, y: 0, faction: 'enemy_a', upgradeLevel: 1,
      health: 60, maxHealth: 60, productionRate: 10, absorbedCount: 0,
      isOrbiting: false,
    });

    const planetNeutral = createMockPlanet({
      id: 'p2', x: 100, y: 100, faction: 'neutral', upgradeLevel: 1,
      health: 10, maxHealth: 60, productionRate: 10, absorbedCount: 0,
      isOrbiting: false,
    });

    const state = createMockGameState({
      planets: new Map([['p1', planetAI], ['p2', planetNeutral]]),
    });

    // Give the AI plenty of particles to trigger expansion
    for (let i = 0; i < 50; i++) {
      state.particles.push(createMockParticle({
        id: i, x: 0, y: 0, vx: 0, vy: 0,
        faction: 'enemy_a', mode: 'orbiting', strength: 1,
        homePlanetId: 'p1', alive: true
      }));
    }

    ai.update(10.0, state, deploySpy);

    // It should deploy particles to the neutral planet
    expect(deploySpy).toHaveBeenCalled();
    const callArgs = deploySpy.mock.calls[0];
    expect(callArgs[0]).toContain('p1'); // from
    expect(callArgs[1]).toBe('p2'); // target
  });

  it('deploys particles to attack player planet', () => {
    const ai = new AIController(['enemy_a'], 'hard');
    const eventBus = new EventBus();
    const deploySpy = vi.fn();

    const planetAI = createMockPlanet({
      id: 'p1', x: 0, y: 0, faction: 'enemy_a', upgradeLevel: 3,
      health: 60, maxHealth: 60, productionRate: 10, absorbedCount: 0,
      isOrbiting: false,
    });

    const planetPlayer = createMockPlanet({
      id: 'p2', x: 100, y: 100, faction: 'player', upgradeLevel: 1,
      health: 10, maxHealth: 60, productionRate: 10, absorbedCount: 0,
      isOrbiting: false,
    });

    const state = createMockGameState({
      planets: new Map([['p1', planetAI], ['p2', planetPlayer]]),
    });

    // Give the AI a massive amount of particles to force an attack logic (aggressionRatio high)
    for (let i = 0; i < 100; i++) {
      state.particles.push(createMockParticle({
        id: i, x: 0, y: 0, vx: 0, vy: 0,
        faction: 'enemy_a', mode: 'orbiting', strength: 1,
        homePlanetId: 'p1', alive: true
      }));
    }

    ai.update(10.0, state, deploySpy);

    expect(deploySpy).toHaveBeenCalled();
    const callArgs = deploySpy.mock.calls[0];
    expect(callArgs[0]).toContain('p1'); // from
    expect(callArgs[1]).toBe('p2'); // target
  });
});
