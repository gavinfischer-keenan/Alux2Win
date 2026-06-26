import { describe, it, expect } from 'vitest';
import { GammaRaySystem } from '../GammaRaySystem';
import { ProductionSystem } from '../ProductionSystem';
import type { GammaRayPath } from '../../types';
import { PLANET_PRODUCTION, PLANET_MAX_HEALTH } from '../../types';
import { createMockGameState, createMockParticle, createMockPlanet } from '../../utils/__tests__/TestFactory';

/** Directly trigger the _fire() private method by driving the system to fireProgress >= 1. */
function triggerFire(system: GammaRaySystem, state: ReturnType<typeof createMockGameState>, path: GammaRayPath) {
  state.gammaRay.enabled = true;
  state.gammaRay.firing = true;
  state.gammaRay.fireProgress = 0.99;
  state.gammaRay.path = path;
  // One tick that pushes fireProgress over 1.0 (FIRE_DURATION_SECS = 3)
  system.update(0.04, state); // 0.04 / 3 = +0.013 → total ≥ 1.0
}

describe('GammaRaySystem — planet reset on fire', () => {
  it('resets faction to neutral on gamma fire', () => {
    const system = new GammaRaySystem();
    const planet = createMockPlanet({
      id: 'p1', x: 100, y: 100, faction: 'enemy_a', upgradeLevel: 2,
      health: 80, maxHealth: 80, productionRate: PLANET_PRODUCTION[2], absorbedCount: 10,
      isOrbiting: false,
    });

    const state = createMockGameState({ planets: new Map([['p1', planet]]) });
    const path: GammaRayPath = { x1: 0, y1: 100, x2: 2000, y2: 100, width: 200, targetedPlanetIds: ['p1'] };

    triggerFire(system, state, path);

    expect(planet.faction).toBe('neutral');
  });

  it('resets all faction state fields — not just faction', () => {
    const system = new GammaRaySystem();
    const planet = createMockPlanet({
      id: 'p1', x: 100, y: 100, faction: 'player', upgradeLevel: 3,
      health: 150, maxHealth: 150, productionRate: PLANET_PRODUCTION[3], absorbedCount: 99,
      isOrbiting: false, isShielded: true, shieldPoints: 50, shieldTimer: 7,
      colonizer: 'enemy_a', rebellionBonus: 40, lockoutTimer: 12,
    });

    const state = createMockGameState({ planets: new Map([['p1', planet]]) });
    const path: GammaRayPath = { x1: 0, y1: 100, x2: 2000, y2: 100, width: 200, targetedPlanetIds: ['p1'] };

    triggerFire(system, state, path);

    expect(planet.faction).toBe('neutral');
    expect(planet.upgradeLevel).toBe(1);
    expect(planet.productionRate).toBe(PLANET_PRODUCTION[1]);
    expect(planet.absorbedCount).toBe(0);
    expect(planet.colonizer).toBeNull();
    expect(planet.rebellionBonus).toBe(0);
    expect(planet.lockoutTimer).toBe(10);
    expect(planet.shieldPoints).toBe(0);
    expect(planet.shieldTimer).toBe(0);
    expect(planet.isShielded).toBe(false);
    expect(planet.health).toBe(40);
    expect(planet.maxHealth).toBe(40);
    expect(planet.originalNeutralHealth).toBe(40);
  });

  it('records previousOwner of cleaned planet', () => {
    const system = new GammaRaySystem();
    const planet = createMockPlanet({
      id: 'p1', x: 100, y: 100, faction: 'enemy_b', upgradeLevel: 1,
      health: 40, maxHealth: 40, productionRate: PLANET_PRODUCTION[1], absorbedCount: 0,
      isOrbiting: false,
    });

    const state = createMockGameState({ planets: new Map([['p1', planet]]) });
    const path: GammaRayPath = { x1: 0, y1: 100, x2: 2000, y2: 100, width: 200, targetedPlanetIds: ['p1'] };

    triggerFire(system, state, path);

    expect(planet.previousOwner).toBe('enemy_b');
  });

  it('kills all orbiting particles of the targeted planet', () => {
    const system = new GammaRaySystem();
    const planet = createMockPlanet({
      id: 'p1', x: 100, y: 100, faction: 'player', upgradeLevel: 1,
      health: 40, maxHealth: 40, productionRate: 1, absorbedCount: 0, isOrbiting: false,
    });

    const orb1 = createMockParticle({ id: 1, faction: 'player', mode: 'orbiting', homePlanetId: 'p1', alive: true, x: 110, y: 100 });
    const orb2 = createMockParticle({ id: 2, faction: 'player', mode: 'orbiting', homePlanetId: 'p1', alive: true, x: 90, y: 100 });
    const unrelated = createMockParticle({ id: 3, faction: 'player', mode: 'orbiting', homePlanetId: 'p2', alive: true, x: 500, y: 500 });

    const state = createMockGameState({
      planets: new Map([['p1', planet]]),
      particles: [orb1, orb2, unrelated],
    });

    const path: GammaRayPath = { x1: 0, y1: 100, x2: 2000, y2: 100, width: 200, targetedPlanetIds: ['p1'] };

    triggerFire(system, state, path);

    expect(orb1.alive).toBe(false);
    expect(orb2.alive).toBe(false);
    // Unrelated planet's particle unaffected (not in beam width)
    expect(unrelated.alive).toBe(true);
  });

  it('resets the production accumulator via ProductionSystem when wired up', () => {
    const system = new GammaRaySystem();
    const production = new ProductionSystem();
    system.setProductionSystem(production);

    const planet = createMockPlanet({
      id: 'p1', x: 100, y: 100, faction: 'player', upgradeLevel: 1,
      health: 40, maxHealth: 40, productionRate: 10, absorbedCount: 0, isOrbiting: false,
    });
    const state = createMockGameState({ planets: new Map([['p1', planet]]) });

    // Seed the accumulator by running production for a bit
    production.update(0.05, state); // 0.05 × 10 = 0.5 in accumulator
    // (doesn't produce a particle, just seeds accumulator)

    const path: GammaRayPath = { x1: 0, y1: 100, x2: 2000, y2: 100, width: 200, targetedPlanetIds: ['p1'] };
    triggerFire(system, state, path);

    // After the reset, planet is now neutral — produce a full second at neutral rate
    // If accumulator was reset, it starts fresh and won't produce prematurely
    const neutralRate = PLANET_PRODUCTION[1] / 3;
    production.update(1 / neutralRate - 0.1, state);
    // Should not have produced a particle yet (rate reset)
    const alive = state.particles.filter(p => p.alive);
    expect(alive.length).toBe(0);
  });
});
