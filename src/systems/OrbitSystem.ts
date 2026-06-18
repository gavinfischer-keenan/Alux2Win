// ============================================================
// OrbitSystem.ts — Updates orbiting PLANETS (not particles)
// ============================================================

import type { GameState } from '../types';

/**
 * Moves planets that orbit a fixed centre point.
 * Simple angle-integration; no forces involved.
 */
export class OrbitSystem {
  update(dt: number, state: GameState): void {
    for (const planet of state.planets.values()) {
      if (!planet.isOrbiting) continue;

      // All orbit fields are guaranteed non-null when isOrbiting=true.
      const orbitCenterX = planet.orbitCenterX ?? 0;
      const orbitCenterY = planet.orbitCenterY ?? 0;
      const orbitRadiusX = planet.orbitRadius  ?? 0;
      const orbitRadiusY = planet.orbitShape === 'ellipse' ? (planet.orbitRadiusY ?? orbitRadiusX) : orbitRadiusX;
      const orbitSpeed   = planet.orbitSpeed   ?? 0;

      planet.orbitAngle = ((planet.orbitAngle ?? 0) + orbitSpeed * dt);

      planet.x = orbitCenterX + orbitRadiusX * Math.cos(planet.orbitAngle);
      planet.y = orbitCenterY + orbitRadiusY * Math.sin(planet.orbitAngle);
    }
  }
}
