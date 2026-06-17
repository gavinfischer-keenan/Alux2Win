import { GameLoop } from './src/core/GameLoop';
import { MovementSystem } from './src/systems/MovementSystem';
import { CollisionSystem } from './src/systems/CollisionSystem';
import { SpatialHash } from './src/core/SpatialHash';

// Mock types
const state = {
  planets: new Map(),
  particles: [],
  selectedPlanetIds: new Set(),
  selectedParticleIds: new Set(),
  running: true,
  winner: null
};

// Spawn 2000 particles (1000 player, 1000 enemy)
for (let i = 0; i < 1000; i++) {
  state.particles.push({
    id: `p_${i}`,
    faction: 'player',
    x: Math.random() * 800,
    y: Math.random() * 800,
    vx: (Math.random() - 0.5) * 100,
    vy: (Math.random() - 0.5) * 100,
    mode: 'traveling',
    strength: 1,
    alive: true,
    homePlanetId: 'p1'
  });
  state.particles.push({
    id: `e_${i}`,
    faction: 'enemy_a',
    x: Math.random() * 800 + 400, // offset so they collide in the middle
    y: Math.random() * 800 + 400,
    vx: (Math.random() - 0.5) * 100,
    vy: (Math.random() - 0.5) * 100,
    mode: 'traveling',
    strength: 1,
    alive: true,
    homePlanetId: 'p2'
  });
}

const movement = new MovementSystem();
const collision = new CollisionSystem(new SpatialHash(8192, 8192, 64));
const spatialHash = new SpatialHash(8192, 8192, 64);

console.log("Starting Stress Test with 2000 particles...");
const startMem = process.memoryUsage().heapUsed;
const startTime = performance.now();

let frames = 0;
// Simulate 600 frames (10 seconds at 60fps)
for (let i = 0; i < 600; i++) {
  spatialHash.clear();
  for (const p of state.particles) {
    if (p.alive) spatialHash.insert(p);
  }
  
  // @ts-ignore
  movement.update(1/60, state, spatialHash);
  // @ts-ignore
  collision.update(state, spatialHash);
  
  // Clean up dead
  let aliveCount = 0;
  for (const p of state.particles) {
    if (p.alive) aliveCount++;
  }
  if (aliveCount < state.particles.length) {
    state.particles = state.particles.filter(p => p.alive);
  }
  frames++;
}

const endTime = performance.now();
const endMem = process.memoryUsage().heapUsed;

const elapsedSec = (endTime - startTime) / 1000;
const fps = frames / elapsedSec;

console.log(`\n--- TELEMETRY RESULTS ---`);
console.log(`Particles Surviving: ${state.particles.length} / 2000`);
console.log(`Total Simulation Time for 600 frames: ${elapsedSec.toFixed(3)}s`);
console.log(`Average Simulation Headless FPS: ${fps.toFixed(1)} FPS`);
console.log(`Memory Allocated: ${Math.round((endMem - startMem) / 1024 / 1024)} MB`);
