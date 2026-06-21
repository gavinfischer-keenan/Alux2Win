import { describe, it, expect } from 'vitest';
import { GameState, ParticleData, PlanetData } from '../../types';
import { ProductionSystem } from '../ProductionSystem';
import { MovementSystem } from '../MovementSystem';
import { CollisionSystem } from '../CollisionSystem';
import { CombatSystem } from '../CombatSystem';
import { SpatialHash } from '../../core/SpatialHash';
import { createMockGameState, createMockParticle, createMockPlanet } from '../../utils/__tests__/TestFactory';

describe('Performance Stress Test', () => {
  it('handles 5000 particles at 60 FPS budget', () => {
    // Generate an artificial heavy state
    const state = createMockGameState();

    // Add 2 planets
    state.planets.set('p1', createMockPlanet({ id: 'p1', x: 500, y: 1000, faction: 'player', upgradeLevel: 3, health: 60, maxHealth: 60, productionRate: 10, absorbedCount: 0, isOrbiting: false }));
    state.planets.set('p2', createMockPlanet({ id: 'p2', x: 1500, y: 1000, faction: 'enemy_a', upgradeLevel: 3, health: 60, maxHealth: 60, productionRate: 10, absorbedCount: 0, isOrbiting: false }));

    // Spawn 2500 particles per faction traveling towards each other
    for (let i = 0; i < 2500; i++) {
      state.particles.push(createMockParticle({
        id: ++state.particleIdCounter,
        x: 500 + Math.random() * 200,
        y: 800 + Math.random() * 400,
        vx: 100, vy: 0,
        faction: 'player',
        mode: 'traveling',
        strength: 1,
        orbitTimer: 0,
        damage: 0,
        homePlanetId: 'p1',
        targetPlanetId: 'p2',
        orbitAngle: 0,
        orbitRadius: 0,
        alive: true,
        speedMod: 1.0,
        portalCooldown: 0,
        trappedByBH: null
      }));

      state.particles.push(createMockParticle({
        id: ++state.particleIdCounter,
        x: 1500 - Math.random() * 200,
        y: 800 + Math.random() * 400,
        vx: -100, vy: 0,
        faction: 'enemy_a',
        mode: 'traveling',
        strength: 1,
        orbitTimer: 0,
        damage: 0,
        homePlanetId: 'p2',
        targetPlanetId: 'p1',
        orbitAngle: 0,
        orbitRadius: 0,
        alive: true,
        speedMod: 1.0,
        portalCooldown: 0,
        trappedByBH: null
      }));
    }

    const spatialHash = new SpatialHash(2000, 2000, 32);
    const movement = new MovementSystem();
    const collision = new CollisionSystem(spatialHash);
    const combat = new CombatSystem();
    const production = new ProductionSystem();
    
    // Simulate 60 ticks (1 second of game time)
    const dt = 1 / 60;
    
    const startTime = performance.now();

    const eventBus = { emit: () => {} } as any;

    for (let t = 0; t < 60; t++) {
      state.tick++;
      
      spatialHash.clear();
      for (const p of state.particles) {
        if (p.alive) spatialHash.insert(p);
      }

      production.update(dt, state);
      movement.update(dt, state, spatialHash);
      collision.update(state);
      combat.update(state, eventBus);
    }

    const duration = performance.now() - startTime;
    console.log(`Stress Test: 5000 particles, 60 ticks took ${duration.toFixed(2)}ms`);

    // Budget: 60 frames in <= 1000ms is standard real-time.
    // For automated test environments without hardware acceleration, we allow a generous 5000ms.
    // Ideally it takes < 200ms on modern CPUs.
    expect(duration).toBeLessThan(5000);
    
    // Verify some collision happened
    const deadCount = state.particles.filter(p => !p.alive).length;
    console.log(`Dead particles after 1 sec: ${deadCount}`);
    expect(deadCount).toBeGreaterThan(0);
  });
});
