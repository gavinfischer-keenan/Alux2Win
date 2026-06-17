import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CombatSystem } from '../CombatSystem';
import { EventBus } from '../../core/EventBus';
import type { GameState, PlanetData, ParticleData } from '../../types';
import { PLANET_RADIUS } from '../../types';

vi.mock('../../core/AudioManager', () => ({
  audioManager: {
    playWarning: vi.fn(),
  },
}));

describe('CombatSystem', () => {
  let system: CombatSystem;
  let state: GameState;
  let eventBus: EventBus;

  beforeEach(() => {
    system = new CombatSystem();
    eventBus = new EventBus();
    state = {
      planets: new Map(),
      particles: [],
      blackHoles: new Map(),
      selectedPlanetIds: new Set(),
      selectedParticleIds: new Set(),
      particleIdCounter: 100,
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
      whiteHoles: [],
    };
  });

  function createPlanet(id: string, x: number, y: number, faction: any, particles: number, bonusHealth: number = 0, inStorm: boolean = false): PlanetData {
    return {
      id,
      x,
      y,
      faction,
      upgradeLevel: 1,
      particles,
      capacity: 20,
      productionRate: 1,
      absorbedCount: 0,
      bonusHealth,
      maxBonusHealth: 10,
      isOrbiting: false,
      inStorm,
      wasInStorm: false,
    };
  }

  function createParticle(id: number, x: number, y: number, faction: any, strength: any = 1, mode: any = 'traveling', inStorm: boolean = false, targetPlanetId?: string): ParticleData {
    return {
      id,
      x,
      y,
      vx: 0,
      vy: 0,
      faction,
      mode,
      strength,
      orbitTimer: 0,
      damage: 0,
      homePlanetId: 'some-planet',
      targetPlanetId,
      alive: true,
      stormTimer: 0,
      inStorm,
      speedMod: 1.0,
      portalCooldown: 0,
      trappedByBH: null,
      deployTimer: 0,
    };
  }

  it('enemy particle should hit planet and deplete particles', () => {
    const planet = createPlanet('p1', 100, 100, 'player', 5);
    state.planets.set(planet.id, planet);

    const radius = PLANET_RADIUS[1];
    const particle = createParticle(1, 100 + radius, 100, 'enemy_a', 1, 'traveling', false, 'p1');
    state.particles.push(particle);

    system.update(state, eventBus);

    expect(state.particles.length).toBe(0); // particle died
    expect(planet.particles).toBe(4); // took 1 damage
  });

  it('friendly particle should absorb and heal inner health', () => {
    const planet = createPlanet('p1', 100, 100, 'player', 5);
    state.planets.set(planet.id, planet);

    const radius = PLANET_RADIUS[1];
    const particle = createParticle(1, 100 + radius, 100, 'player', 1, 'traveling', false, 'p1');
    state.particles.push(particle);

    system.update(state, eventBus);

    // One new orbiting particle is spawned
    expect(state.particles.length).toBe(1);
    expect(state.particles[0].mode).toBe('orbiting');
    expect(planet.particles).toBe(6);
  });

  it('friendly particle should absorb and heal bonus health if full', () => {
    const planet = createPlanet('p1', 100, 100, 'player', 20, 5);
    state.planets.set(planet.id, planet);

    const radius = PLANET_RADIUS[1];
    // 5X particle so we heal bonus health by 5
    const particle = createParticle(1, 100 + radius, 100, 'player', 5, 'traveling', false, 'p1');
    state.particles.push(particle);

    system.update(state, eventBus);

    // It is fully absorbed into bonus health
    expect(state.particles.length).toBe(0);
    expect(planet.bonusHealth).toBe(10);
  });

  it('friendly particle should absorb into upgrade progress if fully healed', () => {
    // Level 1 planet, full health, full bonus health
    const planet = createPlanet('p1', 100, 100, 'player', 20, 10);
    state.planets.set(planet.id, planet);

    const radius = PLANET_RADIUS[1];
    // 5X particle
    const particle = createParticle(1, 100 + radius, 100, 'player', 5, 'traveling', false, 'p1');
    state.particles.push(particle);

    system.update(state, eventBus);

    // It is fully absorbed into upgrade progress
    expect(state.particles.length).toBe(0);
    expect(planet.absorbedCount).toBe(5);
  });

  it('friendly particle should go into orbit if fully upgraded and fully healed', () => {
    // Level 3 planet, full health, full bonus health
    const planet = createPlanet('p1', 100, 100, 'player', 20, 10);
    planet.upgradeLevel = 3;
    state.planets.set(planet.id, planet);

    const radius = PLANET_RADIUS[3];
    // 2X particle
    const particle = createParticle(1, 100 + radius, 100, 'player', 2, 'traveling', false, 'p1');
    state.particles.push(particle);

    system.update(state, eventBus);

    // Converted to 2 orbiting particles
    expect(state.particles.length).toBe(2);
    expect(state.particles[0].mode).toBe('orbiting');
    expect(state.particles[1].mode).toBe('orbiting');
    expect(planet.absorbedCount).toBe(0);
  });

  it('enemy particle should deplete bonus health first', () => {
    const planet = createPlanet('p1', 100, 100, 'player', 10, 5);
    state.planets.set(planet.id, planet);

    const radius = PLANET_RADIUS[1];
    const particle = createParticle(1, 100 + radius, 100, 'enemy_a', 5, 'traveling', false, 'p1');
    state.particles.push(particle);

    system.update(state, eventBus);

    expect(state.particles.length).toBe(0);
    expect(planet.bonusHealth).toBe(0);
    expect(planet.particles).toBe(10); // particles unaffected
  });

  it('planet should be captured if particles <= 0', () => {
    const planet = createPlanet('p1', 100, 100, 'player', 1);
    state.planets.set(planet.id, planet);

    let captureEmitted = false;
    eventBus.on('planet:captured', () => { captureEmitted = true; });

    const radius = PLANET_RADIUS[1];
    const particle = createParticle(1, 100 + radius, 100, 'enemy_a', 5, 'traveling', false, 'p1');
    state.particles.push(particle);

    system.update(state, eventBus);

    expect(planet.particles).toBe(0);
    expect(planet.faction).toBe('neutral'); // player -> neutral first
    expect(captureEmitted).toBe(true);
  });

  it('neutral planet should be captured by faction', () => {
    const planet = createPlanet('p1', 100, 100, 'neutral', 1);
    state.planets.set(planet.id, planet);

    let capturedFaction = '';
    eventBus.on('planet:captured', (data: any) => { capturedFaction = data.newFaction; });

    const radius = PLANET_RADIUS[1];
    const particle = createParticle(1, 100 + radius, 100, 'enemy_a', 1, 'traveling', false, 'p1');
    state.particles.push(particle);

    system.update(state, eventBus);

    expect(planet.particles).toBe(0);
    expect(planet.faction).toBe('enemy_a');
    expect(capturedFaction).toBe('enemy_a');
  });

  it('storm protection should prevent particle interaction if particle is in storm', () => {
    const planet = createPlanet('p1', 100, 100, 'player', 5);
    state.planets.set(planet.id, planet);

    const radius = PLANET_RADIUS[1];
    const particle = createParticle(1, 100 + radius, 100, 'enemy_a', 1, 'traveling', true, 'p1');
    state.particles.push(particle);

    system.update(state, eventBus);

    expect(state.particles.length).toBe(1); // did not die
    expect(planet.particles).toBe(5); // no damage taken
  });

  it('if planet in storm and enemy particle, enemy should join orbit peacefully', () => {
    const planet = createPlanet('p1', 100, 100, 'player', 5);
    planet.inStorm = true; // Planet protected
    state.planets.set(planet.id, planet);

    const radius = PLANET_RADIUS[1];
    const particle = createParticle(1, 100 + radius, 100, 'enemy_a', 1, 'traveling', false, 'p1');
    state.particles.push(particle);

    system.update(state, eventBus);

    expect(state.particles.length).toBe(1);
    expect(state.particles[0].mode).toBe('orbiting');
    expect(state.particles[0].faction).toBe('enemy_a');
    expect(planet.particles).toBe(6); // increased because joined orbit
  });

  it('win condition triggered when only one faction remains', () => {
    const p1 = createPlanet('p1', 100, 100, 'player', 5);
    const p2 = createPlanet('p2', 200, 200, 'neutral', 5);
    state.planets.set(p1.id, p1);
    state.planets.set(p2.id, p2);

    let gameWon = false;
    eventBus.on('game:over', (ev) => {
      gameWon = true;
      expect(ev.winner).toBe('player');
    });

    system.update(state, eventBus);

    expect(state.winner).toBe('player');
    expect(state.running).toBe(false);
    expect(gameWon).toBe(true);
  });
});
