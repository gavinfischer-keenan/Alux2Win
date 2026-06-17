import { GameScene } from './src/scenes/GameScene';
import { Renderer } from './src/engine/Renderer';
import { EventBus } from './src/engine/EventBus';
import { LevelData } from './src/types';

// Mock dependencies
const mockRenderer = {
  layers: { planets: {}, particles: {}, blackHoles: {} },
  setWorldSize: () => {},
  getFitTransform: () => ({ x: 0, y: 0, scale: 1 }),
  getWorldContainer: () => ({}),
  getWidth: () => 800,
  getHeight: () => 600,
  screenToWorld: (x: number, y: number) => ({ x, y }),
} as unknown as Renderer;

const eventBus = new EventBus();

const scene = new GameScene(mockRenderer, eventBus);

const state = {
  planets: new Map(),
  particles: [] as any[],
  blackHoles: new Map(),
  selectedPlanetIds: new Set<string>(),
  selectedParticleIds: new Set<number>(),
  particleIdCounter: 0,
  tick: 0,
  running: true,
  winner: null,
};
(scene as any).state = state;

for (let i = 0; i < 5; i++) {
  state.particles.push({
    id: i,
    x: 100 + i,
    y: 100,
    vx: 0,
    vy: 0,
    faction: 'player',
    mode: 'stationed',
    strength: 1,
    orbitTimer: 0,
    damage: 0,
    alive: true,
  });
  state.selectedParticleIds.add(i);
}

console.log("Before click, particle 0 mode:", state.particles[0].mode, "vx:", state.particles[0].vx);

(scene as any)._redeploySelectedParticles(undefined, 500, 100);

console.log("After click, particle 0 mode:", state.particles[0].mode, "targetX:", state.particles[0].targetX, "vx:", state.particles[0].vx);

// Run one update tick
(scene as any).spatialHash = new (require('./src/core/SpatialHash').SpatialHash)(64);
// Mock systems
(scene as any).systems = {
  orbit: { update: () => {} },
  production: { update: () => {} },
  movement: new (require('./src/systems/MovementSystem').MovementSystem)(),
  gravity: { update: () => {} },
  collision: { update: () => {} },
  combat: { update: () => {} },
  upgrade: { update: () => {} },
};
(scene as any).aiController = { update: () => {} };
(scene as any).hud = { update: () => {}, tick: () => {} };

(scene as any).update(1/60);

console.log("After update, particle 0 mode:", state.particles[0].mode, "vx:", state.particles[0].vx, "x:", state.particles[0].x);
