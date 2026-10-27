import type { GameState, PlanetData } from "../types";
import { PLANET_RADIUS } from "../types";

/** Resolves overlaps involving an orbiting planet before production/movement. */
export class PlanetCollisionSystem {
  private readonly planets: PlanetData[] = [];
  private readonly destroyed = new Set<string>();
  update(state: GameState): void {
    // -- Planet Collision Check --
    const planetsArr = this.planets;
    planetsArr.length = 0;
    for (const planet of state.planets.values()) planetsArr.push(planet);
    const destroyedPlanetIds = this.destroyed;
    destroyedPlanetIds.clear();

    for (let i = 0; i < planetsArr.length; i++) {
      for (let j = i + 1; j < planetsArr.length; j++) {
        const p1 = planetsArr[i];
        const p2 = planetsArr[j];
        if (!p1.isOrbiting && !p2.isOrbiting) continue; // If both are stationary, they can't collide

        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const distSq = dx * dx + dy * dy;
        const r1 = PLANET_RADIUS[p1.upgradeLevel];
        const r2 = PLANET_RADIUS[p2.upgradeLevel];
        const minDist = r1 + r2;

        if (distSq < minDist * minDist) {
          destroyedPlanetIds.add(p1.id);
          destroyedPlanetIds.add(p2.id);
        }
      }
    }

    if (destroyedPlanetIds.size > 0) {
      // Trigger death effects
      for (let i = 0; i < destroyedPlanetIds.size; i++) {
        state._pendingPlanetHazardDeaths =
          (state._pendingPlanetHazardDeaths ?? 0) + 1;
      }

      // Remove destroyed planets
      for (const id of destroyedPlanetIds) {
        state.planets.delete(id);
        state.selectedPlanetIds.delete(id);
      }

      // Strand orbiting/traveling particles assigned to these planets
      state.particles.forEach((p) => {
        if (
          p.alive &&
          p.homePlanetId &&
          destroyedPlanetIds.has(p.homePlanetId)
        ) {
          p.mode = "stationed";
          // p.homePlanetId = null; // Wait, homePlanetId is string type, 'stationed' particles might need it null. We'll leave it as is or assign it to something invalid. Since they are stationed, the MovementSystem will just stop them.
          p.vx = 0;
          p.vy = 0;
        }
      });
    }
  }
}
