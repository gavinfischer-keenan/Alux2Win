import { describe, it, expect, vi } from 'vitest';
import { CombatSystem } from '../CombatSystem';
import type { GameState, ParticleData, PlanetData } from '../../types';
import { EventBus } from '../../core/EventBus';

describe('CombatSystem', () => {
  it('friendly particle heals planet health if below max', () => {
    const system = new CombatSystem();
    const eventBus = new EventBus();
    const planet: PlanetData = {
      id: 'p1', x: 100, y: 100, faction: 'player', upgradeLevel: 1,
      health: 10, maxHealth: 50, productionRate: 1, absorbedCount: 0,
      isOrbiting: false,
    };
    const particle: ParticleData = {
      id: 'part1', x: 100, y: 100, vx: 0, vy: 0,
      faction: 'player', mode: 'traveling', targetPlanetId: 'p1',
      alive: true, strength: 5, homePlanetId: 'p2'
    };

    const state: GameState = {
      planets: new Map([['p1', planet]]),
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
    };

    system.update(state, eventBus);

    expect(particle.alive).toBe(false);
    expect(planet.health).toBe(15);
  });

  it('enemy particle damages planet health', () => {
    const system = new CombatSystem();
    const eventBus = new EventBus();
    const planet: PlanetData = {
      id: 'p1', x: 100, y: 100, faction: 'player', upgradeLevel: 1,
      health: 10, maxHealth: 50, productionRate: 1, absorbedCount: 0,
      isOrbiting: false,
    };
    const particle: ParticleData = {
      id: 'part1', x: 100, y: 100, vx: 0, vy: 0,
      faction: 'enemy_a', mode: 'traveling', targetPlanetId: 'p1',
      alive: true, strength: 5, homePlanetId: 'p2'
    };

    const state = {
      planets: new Map([['p1', planet]]),
      particles: [particle],
      blackHoles: new Map(),
      speedZones: new Map(),
      portals: new Map(),
      trappingBHs: new Map(),
      whiteHoles: new Map(),
      selectedPlanetIds: new Set<string>(),
      selectedParticleIds: new Set<string>(),
      winner: null,
      running: true,
      timeElapsed: 0,
    } as unknown as GameState;

    system.update(state, eventBus);

    expect(particle.alive).toBe(false);
    expect(planet.health).toBe(5);
  });

  it('enemy particle captures planet when health drops to 0', () => {
    const system = new CombatSystem();
    const eventBus = new EventBus();
    const emitSpy = vi.spyOn(eventBus, 'emit');

    const planet: PlanetData = {
      id: 'p1', x: 100, y: 100, faction: 'player', upgradeLevel: 2,
      health: 2, maxHealth: 50, productionRate: 1, absorbedCount: 10,
      isOrbiting: false,
    };
    const particle: ParticleData = {
      id: 'part1', x: 100, y: 100, vx: 0, vy: 0,
      faction: 'enemy_a', mode: 'traveling', targetPlanetId: 'p1',
      alive: true, strength: 5, homePlanetId: 'p2'
    };

    const state = {
      planets: new Map([['p1', planet]]),
      particles: [particle],
      blackHoles: new Map(),
      speedZones: new Map(),
      portals: new Map(),
      trappingBHs: new Map(),
      whiteHoles: new Map(),
      selectedPlanetIds: new Set<string>(),
      selectedParticleIds: new Set<string>(),
      winner: null,
      running: true,
      timeElapsed: 0,
    } as unknown as GameState;

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

    const planet: PlanetData = {
      id: 'p1', x: 100, y: 100, faction: 'player', upgradeLevel: 1,
      health: 10, maxHealth: 50, productionRate: 1, absorbedCount: 0,
      isOrbiting: false,
      isShielded: true, shieldPoints: 100
    };
    const particle: ParticleData = {
      id: 'part1', x: 100, y: 100, vx: 0, vy: 0,
      faction: 'enemy_a', mode: 'traveling', targetPlanetId: 'p1',
      alive: true, strength: 5, homePlanetId: 'p2'
    };

    const state = {
      planets: new Map([['p1', planet]]),
      particles: [particle],
      blackHoles: new Map(),
      speedZones: new Map(),
      portals: new Map(),
      trappingBHs: new Map(),
      whiteHoles: new Map(),
      selectedPlanetIds: new Set<string>(),
      selectedParticleIds: new Set<string>(),
      winner: null,
      running: true,
      timeElapsed: 0,
    } as unknown as GameState;

    system.update(state, eventBus);

    expect(particle.alive).toBe(false);
    expect(planet.health).toBe(10); // Health unchanged
    expect(planet.shieldPoints).toBe(95); // Shield took the 5 damage
  });
});
