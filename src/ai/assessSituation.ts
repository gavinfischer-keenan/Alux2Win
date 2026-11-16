import type { Faction, GameState, PlanetData } from "../types";
import { PLANET_PRODUCTION } from "../types";
import type { AIStrategy, IncomingEnemySummary, SituationAssessment } from "./AIStrategies";

/** Strategic snapshot; visibility is a policy supplied by the controller. */
export function assessSituation(
  faction: Faction,
  state: GameState,
  strategy: AIStrategy,
  isPlanetVisible: (
    target: PlanetData,
    faction: Faction,
    state: GameState,
  ) => boolean,
): SituationAssessment {
  const myPlanets: PlanetData[] = [];
  let myParticles = 0;
  let myProduction = 0;

  const enemyFactions = new Map<
    Faction,
    { planets: PlanetData[]; particles: number; production: number }
  >();
  const neutralsAvailable: PlanetData[] = [];
  let totalEnemyParticles = 0;
  let bestEnemyProduction = 0;
  let bestEnemyParticles = 0;
  let strongestEnemyFaction: Faction | null = null;

  // Single pass over planets: classify owned, enemy, and visible neutral planets
  for (const planet of state.planets.values()) {
    if (planet.faction === faction) {
      myPlanets.push(planet);
      myProduction += PLANET_PRODUCTION[planet.upgradeLevel];
    } else if (planet.faction === "neutral") {
      if (isPlanetVisible(planet, faction, state)) {
        neutralsAvailable.push(planet);
      }
    } else {
      let entry = enemyFactions.get(planet.faction);
      if (!entry) {
        entry = { planets: [], particles: 0, production: 0 };
        enemyFactions.set(planet.faction, entry);
      }
      entry.planets.push(planet);
      entry.production += PLANET_PRODUCTION[planet.upgradeLevel];
    }
  }

  // Single pass over particles: total strength + O(1) per-planet orbiting & incoming indexes
  const orbitingStrengthByPlanet = new Map<string, number>();
  const incomingEnemiesByPlanet = new Map<string, IncomingEnemySummary>();

  for (const p of state.particles) {
    if (!p.alive) continue;

    if (p.mode === "orbiting" && p.homePlanetId) {
      orbitingStrengthByPlanet.set(
        p.homePlanetId,
        (orbitingStrengthByPlanet.get(p.homePlanetId) ?? 0) + p.strength,
      );
    }

    if (p.faction === faction) {
      myParticles += p.strength;
    } else if (p.faction !== "neutral") {
      totalEnemyParticles += p.strength;
      const efEntry = enemyFactions.get(p.faction);
      if (efEntry) {
        efEntry.particles += p.strength;
      }

      if (p.mode === "traveling" && p.targetPlanetId) {
        let incoming = incomingEnemiesByPlanet.get(p.targetPlanetId);
        if (!incoming) {
          incoming = {
            strength: 0,
            factions: new Set<Faction>(),
            homePlanetIds: new Set<string>(),
          };
          incomingEnemiesByPlanet.set(p.targetPlanetId, incoming);
        }
        incoming.strength += p.strength;
        incoming.factions.add(p.faction);
        if (p.homePlanetId) incoming.homePlanetIds.add(p.homePlanetId);
      }
    }
  }

  // Find strongest enemy — track both by particles AND by production separately
  let highestProductionFaction: Faction | null = null;
  let highestProduction = 0;
  for (const [ef, data] of enemyFactions) {
    if (data.particles > bestEnemyParticles) {
      bestEnemyParticles = data.particles;
      strongestEnemyFaction = ef;
    }
    if (data.production > bestEnemyProduction) {
      bestEnemyProduction = data.production;
    }
    if (data.production > highestProduction) {
      highestProduction = data.production;
      highestProductionFaction = ef;
    }
  }

  // Detect vision blockage: fog is on AND this faction can see nothing outside its own planets
  const fogEnabled = state.fogOfWarConfig?.enabled === true;
  let visibleEnemyCount = 0;
  if (fogEnabled) {
    for (const [, data] of enemyFactions) {
      for (const ep of data.planets) {
        if (isPlanetVisible(ep, faction, state)) {
          visibleEnemyCount++;
          break;
        }
      }
    }
  }
  const isVisionBlocked =
    fogEnabled && neutralsAvailable.length === 0 && visibleEnemyCount === 0;

  const canUpgradeForVision =
    isVisionBlocked &&
    myPlanets.some((p) => p.upgradeLevel < strategy.maxUpgrade);

  return {
    myPlanets,
    myParticles,
    myProduction,
    neutralsAvailable,
    totalEnemyParticles,
    bestEnemyProduction,
    bestEnemyParticles,
    strongestEnemyFaction,
    highestProductionFaction,
    productionAdvantage:
      bestEnemyProduction > 0 ? myProduction / bestEnemyProduction : Infinity,
    unitAdvantage:
      bestEnemyParticles > 0 ? myParticles / bestEnemyParticles : Infinity,
    enemyFactions,
    orbitingStrengthByPlanet,
    incomingEnemiesByPlanet,
    isVisionBlocked,
    canUpgradeForVision,
  };
}
