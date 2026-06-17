import { GameState, ParticleData, PlanetData } from './src/types';
import { MovementSystem } from './src/systems/MovementSystem';
import { SpatialHash } from './src/core/SpatialHash';

const state: GameState = {
  planets: new Map(),
  particles: [],
  blackHoles: new Map(),
  selectedPlanetIds: new Set(),
  selectedParticleIds: new Set(),
  particleIdCounter: 0,
  tick: 0,
  running: true,
  winner: null,
};

const spatialHash = new SpatialHash(64);
const ms = new MovementSystem();

// Create 10 stationed particles AT THE EXACT SAME SPOT
for (let i = 0; i < 10; i++) {
  state.particles.push({
    id: i,
    x: 100,
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
}

// Right click to move them
for (const p of state.particles) {
  p.mode = 'traveling';
  p.targetX = 500;
  p.targetY = 100;
  const dx = 500 - p.x;
  const dy = 100 - p.y;
  const len = Math.sqrt(dx*dx + dy*dy) || 1;
  p.vx = (dx / len) * 60;
  p.vy = (dy / len) * 60;
}

spatialHash.clear();
for (const p of state.particles) {
  spatialHash.insert(p);
}

console.log("Before update:", state.particles[0].x, state.particles[0].vx);
ms.update(1/60, state, spatialHash);
console.log("After update 1:", state.particles[0].x, state.particles[0].vx);
