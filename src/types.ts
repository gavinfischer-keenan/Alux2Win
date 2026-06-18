// ============================================================
// SHARED TYPES — LUX
// All interfaces shared across the entire game codebase
// ============================================================

// ---- Factions ----
export type Faction = 'player' | 'enemy_a' | 'enemy_b' | 'neutral';

// ---- Upgrade Levels ----
export type UpgradeLevel = 1 | 2 | 3;

// ---- Particle Strength ----
export type ParticleStrength = 1 | 5;

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
  health: number;
  maxHealth: number;
  productionRate: number;
  absorbedCount: number;
  isOrbiting: boolean;
  orbitShape?: 'circle' | 'ellipse';
  orbitCenterX?: number;
  orbitCenterY?: number;
  orbitRadius?: number;   // Acts as width/X radius for ellipse
  orbitRadiusY?: number;  // Height/Y radius for ellipse
  orbitSpeed?: number;
  orbitAngle?: number;
  // hazard state
  inStorm: boolean;
  wasInStorm: boolean;
  // shield feature
  isShielded?: boolean;
  shieldPoints?: number;
  shieldTimer?: number;
}

// ---- Particle Data (runtime) ----
export type ParticleMode = 'orbiting' | 'traveling' | 'combat' | 'stationed';

export interface ParticleData {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  faction: Faction;
  mode: ParticleMode;
  strength: ParticleStrength;
  orbitTimer: number;
  damage: number;
  homePlanetId: string;
  targetPlanetId?: string;
  targetX?: number;
  targetY?: number;
  waypointX?: number;   // AI-set intermediate waypoint (cleared on arrival)
  waypointY?: number;
  orbitAngle?: number;
  orbitRadius?: number;
  deployTimer?: number;
  alive: boolean;
  // hazard state
  stormTimer: number;      // seconds spent inside storm (not protected)
  inStorm: boolean;        // currently inside a plasma storm
  speedMod: number;        // speed multiplier from SpeedZone (1.0 = normal)
  portalCooldown: number;  // seconds remaining before particle can re-enter a portal
  trappedByBH: string | null; // id of TrappingBlackHole currently holding this particle
}

// ---- Black Hole Data (runtime) ----
export interface BlackHoleData {
  id: string;
  x: number;
  y: number;
  radius: number;
  pullRadius: number;
  pullStrength: number;
}

// ---- Plasma Storm ----
export interface PlasmaStormDef {
  id: string;
  x: number;
  y: number;
  radiusX: number;
  radiusY: number;
  vx: number;
  vy: number;
}

export interface PlasmaStormData {
  id: string;
  x: number;
  y: number;
  radiusX: number;
  radiusY: number;
  vx: number;
  vy: number;
  angle: number;     // slow rotation for visual
}

// ---- Asteroid ----
export interface AsteroidData {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  hitCount: number;
  alive: boolean;
  angle: number;     // visual spin
}

// ---- Gamma Ray ----
export interface GammaRayPath {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width: number;
  targetedPlanetIds: string[];
}

export interface GammaRayState {
  enabled: boolean;
  timer: number;          // seconds until next fire
  intervalSeconds: number;
  path: GammaRayPath | null;
  firing: boolean;        // beam is actively crossing
  fireProgress: number;   // 0..1 — beam sweep progress
}

// ---- Speed Zone ----
export type SpeedZoneType = 'speedup' | 'slowdown';

export interface SpeedZoneDef {
  id: string;
  x: number;
  y: number;
  radius: number;
  width?: number;  // Half-width (defaults to radius)
  height?: number; // Half-height (defaults to radius)
  type: SpeedZoneType;
}

export interface SpeedZoneData extends SpeedZoneDef {
  pulseAngle: number;   // visual animation
}

// ---- Portal ----
export interface PortalDef {
  id: string;
  x: number;
  y: number;
  pairId: string;   // links two portals together
  color: number;    // PixiJS hex color for the pair
}

export interface PortalData extends PortalDef {
  pulseAngle: number;   // visual animation
}

// ---- Trapping Black Hole ----
export interface TrappingBlackHoleDef {
  id: string;
  x: number;
  y: number;
  pullRadius: number;   // attraction range in world px
}

export interface TrappingBlackHoleData extends TrappingBlackHoleDef {
  pulseAngle: number;   // visual animation
}

// ---- White Hole ----
export interface WhiteHoleDef {
  id: string;
  x: number;
  y: number;
}

export interface WhiteHoleData {
  id: string;
  x: number;
  y: number;
  ownerFaction: Faction | null; // faction currently investing
  progress: number;             // 0–80 particles invested (explodes at 80)
  exploded: boolean;
  pulseAngle: number;           // visual animation
}

export interface LevelData {
  version: 1;
  name: string;
  id?: string;               // Unique ID for custom levels
  isCustom?: boolean;        // True if saved from the editor
  category?: string;         // E.g., 'Normal', 'Speed Traps', 'Custom'
  worldWidth: number;
  worldHeight: number;
  planets: PlanetDef[];
  blackHoles: BlackHoleDef[];
  plasmaStorms?:       PlasmaStormDef[];
  asteroidConfig?:     { enabled: boolean };
  gammaRayConfig?:     { enabled: boolean; intervalSeconds?: number };
  speedZones?:         SpeedZoneDef[];
  portals?:            PortalDef[];
  trappingBlackHoles?: TrappingBlackHoleDef[];
  whiteHoles?:         WhiteHoleDef[];
  fogOfWarConfig?:     { enabled: boolean };
}

export interface PlanetDef {
  id: string;
  x: number;
  y: number;
  faction: Faction;
  upgradeLevel: UpgradeLevel;
  startingParticles: number;
  isOrbiting: boolean;
  orbitShape?: 'circle' | 'ellipse';
  orbitCenterX?: number;
  orbitCenterY?: number;
  orbitRadius?: number;
  orbitRadiusY?: number;
  orbitSpeed?: number;
  orbitStartAngle?: number;
  isShielded?: boolean;
}

export interface BlackHoleDef {
  id: string;
  x: number;
  y: number;
  radius: number;
  pullStrength: number;
}

// ---- Hazard Visual Effects ----
export type HazardEffectKind = 'particle_sparkle' | 'planet_shockwave';
export interface HazardEffect {
  id: number;
  kind: HazardEffectKind;
  x: number;
  y: number;
  color: number;     // PixiJS hex
  age: number;       // seconds elapsed
  duration: number;  // total lifetime in seconds
  radius: number;    // for shockwave: max radius; for sparkle: ray length
}

// ---- Game State (used by systems) ----
export interface GameState {
  planets: Map<string, PlanetData>;
  particles: ParticleData[];
  blackHoles: Map<string, BlackHoleData>;
  selectedPlanetIds: Set<string>;
  selectedParticleIds: Set<number>;
  particleIdCounter: number;
  tick: number;
  running: boolean;
  winner: Faction | null;
  worldWidth: number;
  worldHeight: number;
  // hazard systems (populated from level data; empty arrays/defaults if not present)
  plasmaStorms: PlasmaStormData[];
  asteroids: AsteroidData[];
  asteroidRespawnTimer: number;
  gammaRay: GammaRayState;
  // new hazard systems
  speedZones:          SpeedZoneData[];
  portals:             PortalData[];
  trappingBlackHoles:  TrappingBlackHoleData[];
  whiteHoles:          WhiteHoleData[];
  hazardEffects:       HazardEffect[];
  hazardEffectIdCounter: number;
  fogOfWarConfig?:     { enabled: boolean };
}

// ---- Upgrade thresholds ----
export const UPGRADE_THRESHOLDS: Record<UpgradeLevel, number> = {
  1: 0,
  2: 50,   // absorb 50 to reach level 2  (was 25)
  3: 100,  // absorb 100 more to reach level 3  (was 50)
};

export const PLANET_MAX_HEALTH: Record<UpgradeLevel, number> = {
  1: 40,   // was 20
  2: 80,   // was 40
  3: 150,  // was 75
};

export const PLANET_PRODUCTION: Record<UpgradeLevel, number> = {
  1: 0.25,
  2: 2.0,
  3: 5.5,
};

export const PLANET_RADIUS: Record<UpgradeLevel, number> = {
  1: 18,
  2: 28,
  3: 40,
};


export const FACTION_COLORS: Record<Faction, number> = {
  player:  0x4fc3f7,
  enemy_a: 0xef5350,
  enemy_b: 0x66bb6a,
  neutral: 0x78909c,
};

export const FACTION_COLORS_HEX: Record<Faction, string> = {
  player:  '#4fc3f7',
  enemy_a: '#ef5350',
  enemy_b: '#66bb6a',
  neutral: '#78909c',
};

export const WORLD_WIDTH  = 2048;
export const WORLD_HEIGHT = 2048;
export const PARTICLE_RADIUS = 4;
export const PARTICLE_SPEED  = 70;   // px/sec world units
export const COLLISION_DISTANCE = 10; // px, particle-particle annihilation

/** Seconds an orbiting particle may idle before auto-absorbing into its planet. */
export const PARTICLE_ORBIT_AUTO_ABSORB_SECS = 20;

/** Number of orbiting 1X particles that merge into one 5X particle. */
export const COMBO_ORBIT_THRESHOLD = 5;

/** Pixel distance from empty-space target before a traveling particle becomes stationed. */
export const ARRIVE_THRESHOLD = 8;
