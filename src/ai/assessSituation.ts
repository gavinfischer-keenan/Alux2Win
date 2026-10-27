import type { Faction, GameState, PlanetData } from "../types";
import { PLANET_PRODUCTION } from "../types";
import type { AIStrategy, SituationAssessment } from "./AIStrategies";

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
  const myPlanets = Array.from(state.planets.values()).filter(
    (p) => p.faction === faction,
  );
  let myParticles = 0;
  let myProduction = 0;

  for (const p of myPlanets) {
    myProduction += PLANET_PRODUCTION[p.upgradeLevel];
  }

  const enemyFactions = new Map<
    Faction,
    { planets: PlanetData[]; particles: number; production: number }
  >();
  let totalEnemyParticles = 0;
  let bestEnemyProduction = 0;
  let bestEnemyParticles = 0;
  let strongestEnemyFaction: Faction | null = null;

  // Scan planets for enemy data
  for (const planet of state.planets.values()) {
    if (planet.faction === "neutral") continue;
    if (planet.faction === faction) continue;
    if (!enemyFactions.has(planet.faction)) {
      enemyFactions.set(planet.faction, {
        planets: [],
        particles: 0,
        production: 0,
      });
    }
    const entry = enemyFactions.get(planet.faction)!;
    entry.planets.push(planet);
    entry.production += PLANET_PRODUCTION[planet.upgradeLevel];
  }

  // Scan particles
  for (const p of state.particles) {
    if (!p.alive) continue;
    if (p.faction === faction) {
      myParticles += p.strength;
    } else if (p.faction !== "neutral") {
      totalEnemyParticles += p.strength;
      if (enemyFactions.has(p.faction)) {
        enemyFactions.get(p.faction)!.particles += p.strength;
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

  // Collect visible neutrals
  const neutralsAvailable: PlanetData[] = [];
  for (const planet of state.planets.values()) {
    if (
      planet.faction === "neutral" &&
      isPlanetVisible(planet, faction, state)
    ) {
      neutralsAvailable.push(planet);
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
    isVisionBlocked,
    canUpgradeForVision,
  };
}
