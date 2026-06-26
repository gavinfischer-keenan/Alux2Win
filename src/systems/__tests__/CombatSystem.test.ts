import { describe, it, expect, vi } from 'vitest';
import { CombatSystem } from '../CombatSystem';
import type { GameState, ParticleData, PlanetData } from '../../types';
import { PLANET_MAX_HEALTH, PLANET_PRODUCTION } from '../../types';
import { EventBus } from '../../core/EventBus';
import { createMockGameState, createMockParticle, createMockPlanet } from '../../utils/__tests__/TestFactory';

describe('CombatSystem', () => {
  it('friendly particle heals planet health if below max', () => {
    const system = new CombatSystem();
    const eventBus = new EventBus();
    const planet = createMockPlanet({
      id: 'p1', x: 100, y: 100, faction: 'player', upgradeLevel: 1,
      health: 10, maxHealth: 50, productionRate: 1, absorbedCount: 0,
      isOrbiting: false,
    });
    const particle = createMockParticle({
      id: 1, x: 100, y: 100, vx: 0, vy: 0,
      faction: 'player', mode: 'traveling', targetPlanetId: 'p1',
      alive: true, strength: 5, homePlanetId: 'p2'
    });

    const state = createMockGameState({
      planets: new Map([['p1', planet]]),
      particles: [particle],
    });

    system.update(state, eventBus);

    expect(particle.alive).toBe(false);
    expect(planet.health).toBe(15);
  });

  it('enemy particle damages planet health', () => {
    const system = new CombatSystem();
    const eventBus = new EventBus();
    const planet = createMockPlanet({
      id: 'p1', x: 100, y: 100, faction: 'player', upgradeLevel: 1,
      health: 10, maxHealth: 50, productionRate: 1, absorbedCount: 0,
      isOrbiting: false,
    });
    const particle = createMockParticle({
      id: 1, x: 100, y: 100, vx: 0, vy: 0,
      faction: 'enemy_a', mode: 'traveling', targetPlanetId: 'p1',
      alive: true, strength: 5, homePlanetId: 'p2'
    });

    const state = createMockGameState({
      planets: new Map([['p1', planet]]),
      particles: [particle],
    });

    system.update(state, eventBus);

    expect(particle.alive).toBe(false);
    expect(planet.health).toBe(5);
  });

  it('enemy particle captures planet when health drops to 0', () => {
    const system = new CombatSystem();
    const eventBus = new EventBus();
    const emitSpy = vi.spyOn(eventBus, 'emit');

    const planet = createMockPlanet({
      id: 'p1', x: 100, y: 100, faction: 'player', upgradeLevel: 2,
      health: 2, maxHealth: 50, productionRate: 1, absorbedCount: 10,
      isOrbiting: false,
    });
    const particle = createMockParticle({
      id: 1, x: 100, y: 100, vx: 0, vy: 0,
      faction: 'enemy_a', mode: 'traveling', targetPlanetId: 'p1',
      alive: true, strength: 5, homePlanetId: 'p2'
    });

    const state = createMockGameState({
      planets: new Map([['p1', planet]]),
      particles: [particle],
    });

    system.update(state, eventBus);

    expect(particle.alive).toBe(false);
    expect(planet.health).toBe(60); // 40 (base) + 20 (rebellion bonus)
    expect(planet.faction).toBe('neutral');
    expect(planet.upgradeLevel).toBe(1); // Downgraded on capture
    expect(planet.absorbedCount).toBe(0); // Reset on capture
    expect(emitSpy).toHaveBeenCalledWith('planet:captured', { planetId: 'p1', newFaction: 'neutral', oldFaction: 'player' });
  });

  it('shield absorbs damage from enemy particle', () => {
    const system = new CombatSystem();
    const eventBus = new EventBus();

    const planet = createMockPlanet({
      id: 'p1', x: 100, y: 100, faction: 'player', upgradeLevel: 1,
      health: 10, maxHealth: 50, productionRate: 1, absorbedCount: 0,
      isOrbiting: false,
      isShielded: true, shieldPoints: 100
    });
    const particle = createMockParticle({
      id: 1, x: 100, y: 100, vx: 0, vy: 0,
      faction: 'enemy_a', mode: 'traveling', targetPlanetId: 'p1',
      alive: true, strength: 5, homePlanetId: 'p2'
    });

    const state = createMockGameState({
      planets: new Map([['p1', planet]]),
      particles: [particle],
    });

    system.update(state, eventBus);

    expect(particle.alive).toBe(false);
    expect(planet.health).toBe(10); // Health unchanged
    expect(planet.shieldPoints).toBe(95); // Shield took the 5 damage
  });

  // ---- Colonizer conflict: two players fighting over a neutral ----

  it('second attacker reverses colonizer progress by healing the neutral planet', () => {
    const system = new CombatSystem();
    const eventBus = new EventBus();

    // Neutral planet partly conquered by enemy_a (health reduced)
    const planet = createMockPlanet({
      id: 'p1', x: 100, y: 100, faction: 'neutral', upgradeLevel: 1,
      health: 20, maxHealth: 40, productionRate: 1, absorbedCount: 0,
      isOrbiting: false, colonizer: 'enemy_a', originalNeutralHealth: 40,
    });
    // Player hits the partly-conquered neutral — should heal it back toward 40
    const particle = createMockParticle({
      id: 1, x: 100, y: 100, vx: 0, vy: 0,
      faction: 'player', mode: 'traveling', targetPlanetId: 'p1',
      alive: true, strength: 3, homePlanetId: 'p2',
    });

    const state = createMockGameState({
      planets: new Map([['p1', planet]]),
      particles: [particle],
    });

    system.update(state, eventBus);

    // Planet healed by 3
    expect(planet.health).toBe(23);
    // Still neutral — not captured
    expect(planet.faction).toBe('neutral');
    // Colonizer still enemy_a (player didn't overcome them yet)
    expect(planet.colonizer).toBe('enemy_a');
  });

  it('colonizer is wiped when second attacker fully heals the neutral back to cap', () => {
    const system = new CombatSystem();
    const eventBus = new EventBus();

    const planet = createMockPlanet({
      id: 'p1', x: 100, y: 100, faction: 'neutral', upgradeLevel: 1,
      health: 38, maxHealth: 40, productionRate: 1, absorbedCount: 0,
      isOrbiting: false, colonizer: 'enemy_a', originalNeutralHealth: 40,
    });
    const particle = createMockParticle({
      id: 1, x: 100, y: 100, vx: 0, vy: 0,
      faction: 'player', mode: 'traveling', targetPlanetId: 'p1',
      alive: true, strength: 5, homePlanetId: 'p2',
    });

    const state = createMockGameState({
      planets: new Map([['p1', planet]]),
      particles: [particle],
    });

    system.update(state, eventBus);

    // Planet fully healed (capped at 40)
    expect(planet.health).toBe(40);
    // Colonizer wiped out
    expect(planet.colonizer).toBeNull();
    // Still neutral — nobody captured it
    expect(planet.faction).toBe('neutral');
  });

  // ---- Lockout timer ----

  it('particle is killed if planet is locked out and particle is not previous owner', () => {
    const system = new CombatSystem();
    const eventBus = new EventBus();

    const planet = createMockPlanet({
      id: 'p1', x: 100, y: 100, faction: 'neutral', upgradeLevel: 1,
      health: 40, maxHealth: 40, productionRate: 1, absorbedCount: 0,
      isOrbiting: false, lockoutTimer: 5, previousOwner: 'enemy_a',
    });
    const particle = createMockParticle({
      id: 1, x: 100, y: 100, vx: 0, vy: 0,
      faction: 'player', mode: 'traveling', targetPlanetId: 'p1',
      alive: true, strength: 1, homePlanetId: 'p2',
    });

    const state = createMockGameState({
      planets: new Map([['p1', planet]]),
      particles: [particle],
    });

    system.update(state, eventBus);

    // Player particle killed — lockout in force
    expect(particle.alive).toBe(false);
    // Planet health unchanged
    expect(planet.health).toBe(40);
  });

  it('previous owner particle passes lockout and colonizes normally', () => {
    const system = new CombatSystem();
    const eventBus = new EventBus();

    const planet = createMockPlanet({
      id: 'p1', x: 100, y: 100, faction: 'neutral', upgradeLevel: 1,
      health: 40, maxHealth: 40, productionRate: 1, absorbedCount: 0,
      isOrbiting: false, lockoutTimer: 5, previousOwner: 'player',
      originalNeutralHealth: 40,
    });
    const particle = createMockParticle({
      id: 1, x: 100, y: 100, vx: 0, vy: 0,
      faction: 'player', mode: 'traveling', targetPlanetId: 'p1',
      alive: true, strength: 1, homePlanetId: 'p2',
    });

    const state = createMockGameState({
      planets: new Map([['p1', planet]]),
      particles: [particle],
    });

    system.update(state, eventBus);

    // Previous owner gets through — health reduced
    expect(planet.health).toBe(39);
    expect(planet.colonizer).toBe('player');
  });

  // ---- Orbiting defenders fight before planet health ----

  it('attacking particle fights orbiting defenders first, destroying them', () => {
    const system = new CombatSystem();
    const eventBus = new EventBus();

    const planet = createMockPlanet({
      id: 'p1', x: 100, y: 100, faction: 'player', upgradeLevel: 1,
      health: 40, maxHealth: 40, productionRate: 1, absorbedCount: 0, isOrbiting: false,
    });
    const defender = createMockParticle({
      id: 1, x: 100, y: 100, vx: 0, vy: 0,
      faction: 'player', mode: 'orbiting', strength: 1,
      homePlanetId: 'p1', alive: true,
    });
    const attacker = createMockParticle({
      id: 2, x: 100, y: 100, vx: 0, vy: 0,
      faction: 'enemy_a', mode: 'traveling', targetPlanetId: 'p1',
      alive: true, strength: 1, homePlanetId: 'p2',
    });

    const state = createMockGameState({
      planets: new Map([['p1', planet]]),
      particles: [defender, attacker],
    });

    system.update(state, eventBus);

    // Both destroyed in combat — defender and attacker cancel out
    expect(defender.alive).toBe(false);
    expect(attacker.alive).toBe(false);
    // Planet health untouched
    expect(planet.health).toBe(40);
  });

  // ---- Win condition ----

  it('emits game:over with winner when only one faction remains', () => {
    const system = new CombatSystem();
    const eventBus = new EventBus();
    const emitSpy = vi.spyOn(eventBus, 'emit');

    const planet = createMockPlanet({
      id: 'p1', x: 0, y: 0, faction: 'player', upgradeLevel: 1,
      health: 40, maxHealth: 40, productionRate: 1, absorbedCount: 0, isOrbiting: false,
    });

    const state = createMockGameState({
      planets: new Map([['p1', planet]]),
      particles: [],
    });

    system.update(state, eventBus);

    expect(state.winner).toBe('player');
    expect(emitSpy).toHaveBeenCalledWith('game:over', { winner: 'player' });
  });
});
