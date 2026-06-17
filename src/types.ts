// ============================================================
// SHARED TYPES — Alux2Win
// All interfaces shared across the entire game codebase
// ============================================================

// ---- Factions ----
export type Faction = 'player' | 'enemy_a' | 'enemy_b' | 'neutral';

// ---- Upgrade Levels ----
export type UpgradeLevel = 1 | 2 | 3;

// ---- Scene Names ----
export type SceneName = 'menu' | 'game' | 'editor';

// ---- Vec2 ----
export interface Vec2 {
  x: number;
  y: number;
}

// ---- Planet Data (runtime) ----
export interface PlanetData {
  id: string;
  x: number;
  y: number;
  faction: Faction;
  upgradeLevel: UpgradeLevel;
  particles: number;        // currently stationed
  capacity: number;         // max stationed
  productionRate: number;   // particles/sec
  absorbedCount: number;    // particles absorbed toward next upgrade
  isOrbiting: boolean;
  orbitCenterX?: number;
  orbitCenterY?: number;
  orbitRadius?: number;
  orbitSpeed?: number;      // radians/sec
  orbitAngle?: number;      // current angle (radians)
}

// ---- Particle Data (runtime) ----
export type ParticleMode = 'orbiting' | 'traveling' | 'combat';

export interface ParticleData {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  faction: Faction;
  mode: ParticleMode;
  homePlanetId: string;
  targetPlanetId?: string;
  orbitAngle?: number;
  orbitRadius?: number;
  alive: boolean;
}

// ---- Black Hole Data (runtime) ----
export interface BlackHoleData {
  id: string;
  x: number;
  y: number;
  radius: number;         // destruction radius
  pullRadius: number;     // gravitational influence radius
  pullStrength: number;
}

// ---- Level JSON Schema ----
export interface LevelData {
  version: 1;
  name: string;
  worldWidth: number;
  worldHeight: number;
  planets: PlanetDef[];
  blackHoles: BlackHoleDef[];
}

export interface PlanetDef {
  id: string;
  x: number;
  y: number;
  faction: Faction;
  upgradeLevel: UpgradeLevel;
  startingParticles: number;
  isOrbiting: boolean;
  orbitCenterX?: number;
  orbitCenterY?: number;
  orbitRadius?: number;
  orbitSpeed?: number;
  orbitStartAngle?: number;
}

export interface BlackHoleDef {
  id: string;
  x: number;
  y: number;
  radius: number;
  pullStrength: number;
}

// ---- Game State (used by systems) ----
export interface GameState {
  planets: Map<string, PlanetData>;
  particles: ParticleData[];
  blackHoles: Map<string, BlackHoleData>;
  selectedPlanetIds: Set<string>;
  particleIdCounter: number;
  tick: number;
  running: boolean;
  winner: Faction | null;
}

// ---- Upgrade thresholds ----
export const UPGRADE_THRESHOLDS: Record<UpgradeLevel, number> = {
  1: 0,
  2: 25,  // absorb 25 to reach level 2
  3: 50,  // absorb 50 more to reach level 3
};

export const PLANET_CAPACITY: Record<UpgradeLevel, number> = {
  1: 20,
  2: 40,
  3: 75,
};

export const PLANET_PRODUCTION: Record<UpgradeLevel, number> = {
  1: 0.5,   // particles/sec
  2: 1.2,
  3: 2.5,
};

export const PLANET_RADIUS: Record<UpgradeLevel, number> = {
  1: 18,
  2: 28,
  3: 40,
};

export const FACTION_COLORS: Record<Faction, number> = {
  player: 0x4fc3f7,
  enemy_a: 0xef5350,
  enemy_b: 0x66bb6a,
  neutral: 0x78909c,
};

export const FACTION_COLORS_HEX: Record<Faction, string> = {
  player: '#4fc3f7',
  enemy_a: '#ef5350',
  enemy_b: '#66bb6a',
  neutral: '#78909c',
};

export const WORLD_WIDTH = 2048;
export const WORLD_HEIGHT = 2048;
export const PARTICLE_RADIUS = 4;
export const PARTICLE_SPEED = 60;  // px/sec  (world units — Auralux-style slow pace)
export const COLLISION_DISTANCE = 10; // px, particle-particle annihilation
