import type { GameState } from "../types";
import type { EventBus } from "../core/EventBus";
import { SpatialHash } from "../core/SpatialHash";
import { PlanetCollisionSystem } from "../systems/PlanetCollisionSystem";
import { advanceHazardEffects } from "./maintenance";
import { OrbitSystem } from "../systems/OrbitSystem";
import { ProductionSystem } from "../systems/ProductionSystem";
import { MovementSystem } from "../systems/MovementSystem";
import { GravitySystem } from "../systems/GravitySystem";
import { CollisionSystem } from "../systems/CollisionSystem";
import { CombatSystem } from "../systems/CombatSystem";
import { UpgradeSystem } from "../systems/UpgradeSystem";
import { AsteroidSystem } from "../systems/AsteroidSystem";
import { GammaRaySystem } from "../systems/GammaRaySystem";
import { SpeedZoneSystem } from "../systems/SpeedZoneSystem";
import { PortalSystem } from "../systems/PortalSystem";
import { TrappingBlackHoleSystem } from "../systems/TrappingBlackHoleSystem";
import { WhiteHoleSystem } from "../systems/WhiteHoleSystem";

export function createSimulationSystems() {
  return {
    planetCollision: new PlanetCollisionSystem(),
    orbit: new OrbitSystem(),
    production: new ProductionSystem(),
    movement: new MovementSystem(),
    gravity: new GravitySystem(),
    collision: new CollisionSystem(),
    combat: new CombatSystem(),
    upgrade: new UpgradeSystem(),
    asteroid: new AsteroidSystem(),
    gammaRay: new GammaRaySystem(),
    speedZone: new SpeedZoneSystem(),
    portal: new PortalSystem(),
    trappingBlackHole: new TrappingBlackHoleSystem(),
    whiteHole: new WhiteHoleSystem(),
  };
}

export type SimulationSystems = ReturnType<typeof createSimulationSystems>;
/** Explicit fixed-tick schedule. AI, tutorials and presentation run after this pipeline. */
export class SimulationPipeline {
  private readonly spatialHash = new SpatialHash(64);
  constructor(readonly systems: SimulationSystems = createSimulationSystems()) {
    systems.gammaRay.setProductionSystem(systems.production);
  }
  update(dt: number, state: GameState, eventBus: EventBus): void {
    // Rebuild spatial hash
    this.spatialHash.clear();
    state.particles.forEach((p) => {
      if (p.alive) this.spatialHash.insert(p);
    });

    // Systems in order
    this.systems.orbit.update(dt, state);

    this.systems.planetCollision.update(state);

    this.systems.production.update(dt, state);
    this.systems.movement.update(dt, state, this.spatialHash);
    this.systems.gravity.update(dt, state);
    this.systems.collision.update(state, this.spatialHash);
    this.systems.combat.update(state, eventBus);
    this.systems.upgrade.update(state);

    // Hazard systems (only active if level enables them)
    if (state.asteroids.length > 0 || state.asteroidRespawnTimer < 9999)
      this.systems.asteroid.update(dt, state);
    if (state.gammaRay.enabled) this.systems.gammaRay.update(dt, state);
    // New hazard systems
    if (state.speedZones.length > 0) this.systems.speedZone.update(dt, state);
    if (state.portals.length > 0) this.systems.portal.update(dt, state);
    if (state.trappingBlackHoles.length > 0)
      this.systems.trappingBlackHole.update(dt, state);
    if (state.whiteHoles.length > 0) this.systems.whiteHole.update(dt, state);

    advanceHazardEffects(state.hazardEffects, dt);
  }
}
