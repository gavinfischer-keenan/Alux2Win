import { describe, it, expect, vi, afterEach } from 'vitest';
import { AIController } from '../AIController';
import { assessSituation } from '../assessSituation';
import { STRATEGIES } from '../AIStrategies';
import { scoreRoute, isGammaDangerous, getEffectiveDistanceAndPortal } from '../HazardPathChecker';
import type { GameState, PlanetData, ParticleData } from '../../types';
import { EventBus } from '../../core/EventBus';
import { createMockGameState, createMockParticle, createMockPlanet } from '../../utils/__tests__/TestFactory';

afterEach(() => vi.restoreAllMocks());

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

  it('indexes per-planet orbiting strength and incoming enemies in a single pass', () => {
    const p1 = createMockPlanet({ id: 'p1', faction: 'enemy_a' });
    const p2 = createMockPlanet({ id: 'p2', faction: 'player' });
    const state = createMockGameState({
      planets: new Map([['p1', p1], ['p2', p2]]),
      particles: [
        createMockParticle({ id: 1, faction: 'enemy_a', mode: 'orbiting', homePlanetId: 'p1', strength: 5 }),
        createMockParticle({ id: 2, faction: 'enemy_a', mode: 'orbiting', homePlanetId: 'p1', strength: 1 }),
        createMockParticle({ id: 3, faction: 'player', mode: 'traveling', homePlanetId: 'p2', targetPlanetId: 'p1', strength: 5 }),
        createMockParticle({ id: 4, faction: 'player', mode: 'traveling', homePlanetId: 'p2', targetPlanetId: 'p1', strength: 1, alive: false }),
      ],
    });

    const assessment = assessSituation('enemy_a', state, STRATEGIES.balanced, () => true);
    expect(assessment.orbitingStrengthByPlanet.get('p1')).toBe(6);
    expect(assessment.incomingEnemiesByPlanet.get('p1')?.strength).toBe(5);
    expect(assessment.incomingEnemiesByPlanet.get('p1')?.factions.has('player')).toBe(true);
    expect(assessment.incomingEnemiesByPlanet.get('p1')?.homePlanetIds.has('p2')).toBe(true);
  });

  it('tracks backcap deploy events using simulation time rather than wall clock', () => {
    const ai = new AIController(['enemy_a'], 'hard');
    const enemyBase = createMockPlanet({ id: 'e1', faction: 'enemy_a', x: 0, y: 0 });
    const playerBase = createMockPlanet({ id: 'p1', faction: 'player', x: 300, y: 0, health: 10 });
    const state = createMockGameState({
      planets: new Map([['e1', enemyBase], ['p1', playerBase]]),
    });

    // Record deploy at t=0, then advance simulation by 5s (still valid within 10s window)
    ai.recordDeployEvent('p1', 'player', 40);
    ai.update(5.0, state, () => {});
    const targetWhileFresh = (ai as any)._findBackcapTarget('enemy_a', state);
    expect(targetWhileFresh?.id).toBe('p1');

    // Advance simulation past 12s expiration window without wall-clock sleep
    ai.update(8.0, state, () => {});
    const targetAfterExpiry = (ai as any)._findBackcapTarget('enemy_a', state);
    expect(targetAfterExpiry).toBeNull();
  });

  it('detects gammaRay2 hazards and portal shortcuts accurately', () => {
    const state = createMockGameState({
      gammaRay2: {
        enabled: true,
        timer: 0,
        intervalSeconds: 30,
        path: { x1: 400, y1: 0, x2: 400, y2: 1000, width: 100, targetedPlanetIds: [] },
        firing: true,
        fireProgress: 0.5,
      },
      portals: [
        { id: 'pt1', x: 120, y: 100, pairId: 'alpha', color: 0x00ffff, pulseAngle: 0 },
        { id: 'pt2', x: 1850, y: 100, pairId: 'alpha', color: 0x00ffff, pulseAngle: 0 },
      ],
    });

    expect(isGammaDangerous(state, 400, 500)).toBe(true);
    expect(scoreRoute(state, 0, 500, 400, 500)).toBeLessThan(0);

    const portalRoute = getEffectiveDistanceAndPortal(100, 100, 1900, 100, state);
    expect(portalRoute.entryPortalX).toBe(120);
    expect(portalRoute.entryPortalY).toBe(100);
    expect(portalRoute.effectiveDistance).toBeLessThan(200);
  });

  it('prioritizes Level 1 upgrades when asteroids are enabled and skips gamma-threatened upgrades', () => {
    const ai = new AIController(['enemy_a'], 'hard');
    const lvl1 = createMockPlanet({ id: 'lvl1', faction: 'enemy_a', upgradeLevel: 1, x: 100, y: 100 });
    const lvl2 = createMockPlanet({ id: 'lvl2', faction: 'enemy_a', upgradeLevel: 2, x: 900, y: 100 });
    const state = createMockGameState({
      planets: new Map([['lvl1', lvl1], ['lvl2', lvl2]]),
      asteroidConfig: { enabled: true, damageLevel: 2 },
    });

    const chosenWithAsteroids = (ai as any).findBestPlanetToUpgrade([lvl1, lvl2], 3, 0, state);
    expect(chosenWithAsteroids?.id).toBe('lvl1');

    // Now place lvl1 directly inside an active gamma ray
    state.gammaRay = {
      enabled: true,
      timer: 0,
      intervalSeconds: 30,
      path: { x1: 100, y1: 0, x2: 100, y2: 500, width: 120, targetedPlanetIds: ['lvl1'] },
      firing: true,
      fireProgress: 0.5,
    };
    const chosenSafe = (ai as any).findBestPlanetToUpgrade([lvl1, lvl2], 3, 0, state);
    expect(chosenSafe?.id).toBe('lvl2');
  });
});
