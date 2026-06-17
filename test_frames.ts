import { GameState } from './src/types';
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
    mode: 'traveling', // ALREADY traveling
    strength: 1,
    orbitTimer: 0,
    damage: 0,
    alive: true,
    targetX: 500,
    targetY: 100,
  });
}

for (let frame = 0; frame < 5; frame++) {
  spatialHash.clear();
  for (const p of state.particles) {
    spatialHash.insert(p);
  }
  
  ms.update(1/60, state, spatialHash);
  console.log(`Frame ${frame}: x=${state.particles[0].x.toFixed(2)}, y=${state.particles[0].y.toFixed(2)}, vx=${state.particles[0].vx.toFixed(2)}, vy=${state.particles[0].vy.toFixed(2)}`);
}
