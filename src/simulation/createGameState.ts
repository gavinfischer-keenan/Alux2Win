import type {
  LevelData,
  PlanetDef,
  BlackHoleDef,
  PlanetData,
  BlackHoleData,
  GameState,
  Faction,
  UpgradeLevel,
} from "../types";
import { PLANET_MAX_HEALTH, PLANET_PRODUCTION, PLANET_RADIUS } from "../types";

/** Build a fresh simulation; callers may inject a seeded RNG for replay/tests. */
export function createGameState(
  levelData: LevelData,
  random: () => number = Math.random,
): GameState {
  const planets = new Map<string, PlanetData>();
  const blackHoles = new Map<string, BlackHoleData>();

  // Randomize starting locations by mapping original factions to shuffled factions
  const activeFactions = new Set<Faction>();
  levelData.planets.forEach((def: PlanetDef) => {
    if (def.faction !== "neutral") {
      activeFactions.add(def.faction);
    }
  });

  const activeFactionsArr = Array.from(activeFactions);
  const shuffledFactions = [...activeFactionsArr];
  for (let i = shuffledFactions.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffledFactions[i], shuffledFactions[j]] = [
      shuffledFactions[j],
      shuffledFactions[i],
    ];
  }

  const factionMap = new Map<Faction, Faction>();
  for (let i = 0; i < activeFactionsArr.length; i++) {
    factionMap.set(activeFactionsArr[i], shuffledFactions[i]);
  }

  levelData.planets.forEach((def: PlanetDef) => {
    const lvl = def.upgradeLevel as UpgradeLevel;
    const maxHealth = PLANET_MAX_HEALTH[lvl];

    // All planets start fully healed (maxHealth).
    // (Owned planets also use startingParticles to spawn initial orbiting units).
    const initialHealth = maxHealth;

    const mappedFaction = factionMap.get(def.faction) ?? def.faction;

    const data: PlanetData = {
      id: def.id,
      x: def.x,
      y: def.y,
      faction: mappedFaction,
      upgradeLevel: lvl,
      health: initialHealth,
      maxHealth,
      productionRate: PLANET_PRODUCTION[lvl],
      absorbedCount: 0,
      isOrbiting: def.isOrbiting,
      orbitCenterX: def.orbitCenterX,
      orbitCenterY: def.orbitCenterY,
      orbitRadius: def.orbitRadius,
      orbitSpeed: def.orbitSpeed,
      orbitAngle: def.orbitStartAngle ?? 0,
      isShielded: def.isShielded ?? false,
      shieldPoints: 0,
      shieldTimer: 0,
      colonizer: null,
      originalNeutralHealth:
        mappedFaction === "neutral" ? initialHealth : undefined,
    };
    planets.set(def.id, data);
  });

  levelData.blackHoles.forEach((def: BlackHoleDef) => {
    const data: BlackHoleData = {
      id: def.id,
      x: def.x,
      y: def.y,
      radius: def.radius,
      pullRadius: def.radius * 4,
      pullStrength: def.pullStrength,
    };
    blackHoles.set(def.id, data);
  });

  const state: GameState = {
    planets,
    particles: [],
    blackHoles,
    selectedPlanetIds: new Set(),
    selectedParticleIds: new Set(),
    particleIdCounter: 0,
    tick: 0,
    running: false,
    winner: null,
    worldWidth: levelData.worldWidth,
    worldHeight: levelData.worldHeight,
    asteroids: [],
    // Give players 30 seconds to establish themselves before the first asteroid.
    asteroidRespawnTimer: levelData.asteroidConfig?.enabled ? 30 : 9999,
    asteroidConfig: levelData.asteroidConfig,
    gammaRay: {
      enabled: !!levelData.gammaRayConfig?.enabled,
      timer: levelData.gammaRayConfig?.intervalSeconds ?? 60,
      intervalSeconds: levelData.gammaRayConfig?.intervalSeconds ?? 60,
      targetMode: levelData.gammaRayConfig?.targetMode ?? "random",
      lockedPath: levelData.gammaRayConfig?.lockedPath,
      path: null,
      firing: false,
      fireProgress: 0,
    },
    // New hazard systems
    speedZones: (levelData.speedZones ?? []).map((def) => ({
      ...def,
      pulseAngle: 0,
    })),
    portals: (levelData.portals ?? []).map((def) => ({
      ...def,
      pulseAngle: 0,
    })),
    trappingBlackHoles: (levelData.trappingBlackHoles ?? []).map((def) => ({
      ...def,
      pulseAngle: 0,
    })),
    whiteHoles: (levelData.whiteHoles ?? []).map((def) => ({
      ...def,
      ownerFaction: null,
      progress: 0,
      exploded: false,
      pulseAngle: 0,
    })),
    hazardEffects: [],
    hazardEffectIdCounter: 0,
    fogOfWarConfig: levelData.fogOfWarConfig,
  };

  // Spawn default starting particles around home planets.
  // IMPORTANT: use the shuffled spawnFaction (same as the planet) so particle
  // colours always match their home planet from the very first frame.
  levelData.planets.forEach((def) => {
    if (def.faction !== "neutral") {
      const spawnFaction = factionMap.get(def.faction) ?? def.faction;
      const count = def.startingParticles || 20;
      const lvl = def.upgradeLevel as UpgradeLevel;
      for (let i = 0; i < count; i++) {
        const angle = random() * Math.PI * 2;
        const orbitRadius = PLANET_RADIUS[lvl] + 8 + random() * 10;
        state.particles.push({
          id: state.particleIdCounter++,
          x: def.x + Math.cos(angle) * orbitRadius,
          y: def.y + Math.sin(angle) * orbitRadius,
          vx: 0,
          vy: 0,
          faction: spawnFaction,
          mode: "orbiting",
          strength: 1,
          orbitTimer: random() * -5, // slight negative offset so they don't immediately absorb
          damage: 0,
          homePlanetId: def.id,
          orbitAngle: angle,
          orbitRadius: orbitRadius,
          deployTimer: 0,
          alive: true,
          speedMod: 1.0,
          portalCooldown: 0,
          trappedByBH: null,
        });
      }
    }
  });

  return state;
}
