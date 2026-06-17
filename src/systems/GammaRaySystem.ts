// ============================================================
// GammaRaySystem.ts — Alux2Win
// Handles the gamma-ray hazard: warning countdown, path
// generation, beam sweep, and planet reset on fire.
//
// Path selection uses a 3-tier priority to avoid instantly
// punishing players:
//   Tier 1 (preferred): path hits only neutral planets.
//   Tier 2 (acceptable): path hits enemy/neutral but NOT player.
//   Tier 3 (last resort): any path that hits something.
// ============================================================

import {
  type GameState,
  type GammaRayPath,
  type PlanetData,
  PLANET_RADIUS,
} from '../types';

// Maximum retries when generating a path that hits at least one planet.
const MAX_PATH_RETRIES = 50;

// Duration of the firing sweep in seconds.
const FIRE_DURATION_SECS = 3;

// Seconds before firing at which the warning path is shown.
const WARNING_SECS = 60;

export class GammaRaySystem {
  // ── Public API ─────────────────────────────────────────────

  update(dt: number, state: GameState): void {
    if (!state.gammaRay.enabled) return;

    const gr = state.gammaRay;

    // ── Firing phase ──────────────────────────────────────────
    if (gr.firing) {
      gr.fireProgress += dt / FIRE_DURATION_SECS;

      if (gr.fireProgress >= 1.0) {
        // Beam has swept all the way across — apply damage.
        this._fire(state);

        // Reset for next cycle.
        gr.timer        = gr.intervalSeconds;
        gr.path         = null;
        gr.firing       = false;
        gr.fireProgress = 0;
      }
      // While firing, do nothing else this tick.
      return;
    }

    // ── Countdown ─────────────────────────────────────────────
    gr.timer -= dt;

    // Generate the warning path once we enter the warning window.
    if (gr.timer <= WARNING_SECS && gr.path === null) {
      gr.path = this._generateSafePath(state);
    }

    // Begin firing when the countdown expires.
    if (gr.timer <= 0 && !gr.firing) {
      // If somehow we still have no path (e.g. zero planets), generate one
      // last time — even an empty-target path is fine to fire.
      if (gr.path === null) {
        gr.path = this._generateSafePath(state);
      }
      gr.firing       = true;
      gr.fireProgress = 0;
    }
  }

  // ── Private helpers ────────────────────────────────────────

  /**
   * 3-tier path selection:
   *
   * Tier 1 — Preferred: hits neutral planets only (no occupied planets).
   *   Tries up to 30 times.
   *
   * Tier 2 — Acceptable: hits some planets but NONE that belong to the
   *   player faction. (Enemy planets are fair targets — good for the player.)
   *   Tries up to 15 more times.
   *
   * Tier 3 — Last resort: any path with at least one target (or empty).
   *   5 final attempts.
   *
   * This means the gamma ray almost never fires a beam directly
   * through the player's own planets, while still being a meaningful hazard.
   */
  private _generateSafePath(state: GameState): GammaRayPath | null {
    // ── Tier 1: neutral-only targets ──────────────────────────
    for (let i = 0; i < 30; i++) {
      const candidate = this._generatePath(state);
      if (!candidate) continue;
      if (this._countOccupiedTargets(candidate, state) === 0 &&
          candidate.targetedPlanetIds.length > 0) {
        return candidate;
      }
    }

    // ── Tier 2: no player planets in path ─────────────────────
    for (let i = 0; i < 15; i++) {
      const candidate = this._generatePath(state);
      if (!candidate) continue;
      if (!this._hitsPlayerPlanet(candidate, state) &&
          candidate.targetedPlanetIds.length > 0) {
        return candidate;
      }
    }

    // ── Tier 3: last resort — any path (prefer one with targets) ─
    let fallback: GammaRayPath | null = null;
    for (let i = 0; i < MAX_PATH_RETRIES - 45; i++) {
      const candidate = this._generatePath(state);
      if (!candidate) continue;
      if (candidate.targetedPlanetIds.length > 0) return candidate;
      if (!fallback) fallback = candidate;
    }
    return fallback;
  }

  /**
   * Count how many targeted planets in this path are non-neutral
   * (i.e. owned by a player or enemy faction).
   */
  private _countOccupiedTargets(path: GammaRayPath, state: GameState): number {
    return path.targetedPlanetIds.filter(id => {
      const planet = state.planets.get(id);
      return planet && planet.faction !== 'neutral';
    }).length;
  }

  /**
   * Returns true if any targeted planet belongs to the 'player' faction.
   */
  private _hitsPlayerPlanet(path: GammaRayPath, state: GameState): boolean {
    return path.targetedPlanetIds.some(id => {
      const planet = state.planets.get(id);
      return planet?.faction === 'player';
    });
  }

  /**
   * Generate a random straight-line path across the world.
   * Entry edge is random; exit edge is the opposite edge.
   */
  private _generatePath(state: GameState): GammaRayPath | null {
    const { worldWidth: W, worldHeight: H } = state;
    if (W <= 0 || H <= 0) return null;

    // 0 = top, 1 = right, 2 = bottom, 3 = left
    const entryEdge = Math.floor(Math.random() * 4) as 0 | 1 | 2 | 3;
    const exitEdge  = ((entryEdge + 2) % 4) as 0 | 1 | 2 | 3;

    const pointOnEdge = (edge: 0 | 1 | 2 | 3): { x: number; y: number } => {
      switch (edge) {
        case 0: return { x: Math.random() * W, y: 0 };                  // top
        case 1: return { x: W,                 y: Math.random() * H };  // right
        case 2: return { x: Math.random() * W, y: H };                  // bottom
        case 3: return { x: 0,                 y: Math.random() * H };  // left
      }
    };

    const entry = pointOnEdge(entryEdge);
    const exit  = pointOnEdge(exitEdge);

    const PATH_WIDTH = 320; // 4 x large planet diameter (80 px)

    // Identify which planets the beam would hit.
    const targetedPlanetIds: string[] = [];
    const draft: GammaRayPath = {
      x1: entry.x,
      y1: entry.y,
      x2: exit.x,
      y2: exit.y,
      width: PATH_WIDTH,
      targetedPlanetIds,
    };

    for (const planet of state.planets.values()) {
      if (this._checkPathHitsPlanet(draft, planet)) {
        targetedPlanetIds.push(planet.id);
      }
    }

    return draft;
  }

  /**
   * Returns true if the planet centre falls within the beam's half-width
   * plus the planet's own radius (so even a glancing blow registers).
   *
   * Uses the signed perpendicular-distance formula for a line defined by
   * two points, treating the segment as infinite (the path spans edge-to-edge
   * so clamping to segment length is unnecessary in practice).
   */
  private _checkPathHitsPlanet(path: GammaRayPath, planet: PlanetData): boolean {
    const dx = path.x2 - path.x1;
    const dy = path.y2 - path.y1;
    const len = Math.sqrt(dx * dx + dy * dy);

    if (len === 0) return false;

    // Unit normal (perpendicular to the beam direction).
    const nx = -dy / len;
    const ny =  dx / len;

    // Perpendicular distance from the beam axis to the planet centre.
    const dist = Math.abs(
      (planet.x - path.x1) * nx + (planet.y - path.y1) * ny,
    );

    const planetRadius = PLANET_RADIUS[planet.upgradeLevel];
    return dist < path.width / 2 + planetRadius;
  }

  /**
   * Apply the gamma-ray strike: reset all targeted planets to their
   * neutral, level-1 state and kill their orbiting particles.
   */
  private _fire(state: GameState): void {
    const path = state.gammaRay.path;
    if (!path) return;

    for (const planetId of path.targetedPlanetIds) {
      const planet = state.planets.get(planetId);
      if (!planet) continue;

      // Reset planet to a blank neutral state.
      planet.faction       = 'neutral';
      planet.particles     = 0;
      planet.absorbedCount = 0;
      planet.upgradeLevel  = 1;
      planet.bonusHealth   = 0;

      // Kill all particles that call this planet home.
      state.particles
        .filter(p => p.homePlanetId === planetId)
        .forEach(p => { p.alive = false; });
    }

    // Purge dead particles from the global list.
    state.particles = state.particles.filter(p => p.alive);
  }
}
