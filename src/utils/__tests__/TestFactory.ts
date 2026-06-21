import {
  GameState,
  ParticleData,
  PlanetData,
  BlackHoleData,
  SpeedZoneData,
  PortalData,
  WhiteHoleData,
  TrappingBlackHoleData,
  AsteroidData,
  Faction,
  ParticleMode,
  UpgradeLevel
} from '../../types';

export function createMockGameState(overrides: Partial<GameState> = {}): GameState {
  return {
    planets: new Map<string, PlanetData>(),
    particles: [],
    blackHoles: new Map<string, BlackHoleData>(),
    selectedPlanetIds: new Set<string>(),
    selectedParticleIds: new Set<number>(),
    particleIdCounter: 1,
    tick: 0,
    running: true,
    winner: null,
    worldWidth: 2000,
    worldHeight: 2000,
    asteroids: [],
    asteroidRespawnTimer: 0,
    gammaRay: {
      enabled: false,
      timer: 0,
      intervalSeconds: 60,
      path: null,
      firing: false,
      fireProgress: 0,
    },
    speedZones: [],
    portals: [],
    trappingBlackHoles: [],
    whiteHoles: [],
    hazardEffects: [],
    hazardEffectIdCounter: 1,
    ...overrides
  };
}

export function createMockParticle(overrides: Partial<ParticleData> = {}): ParticleData {
  return {
    id: 1,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    faction: 'player' as Faction,
    mode: 'orbiting' as ParticleMode,
    strength: 1,
    orbitTimer: 0,
    damage: 0,
    homePlanetId: 'p1',
    alive: true,
    speedMod: 1.0,
    portalCooldown: 0,
    trappedByBH: null,
    ...overrides
  };
}

export function createMockPlanet(overrides: Partial<PlanetData> = {}): PlanetData {
  return {
    id: 'p1',
    x: 100,
    y: 100,
    faction: 'player' as Faction,
    upgradeLevel: 1 as UpgradeLevel,
    health: 40,
    maxHealth: 40,
    productionRate: 1,
    absorbedCount: 0,
    isOrbiting: false,
    ...overrides
  };
}
