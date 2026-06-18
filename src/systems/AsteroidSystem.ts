// ============================================================
// AsteroidSystem.ts — Asteroid hazard simulation for LUX
// ============================================================
//
// Manages the single-asteroid-at-a-time hazard:
//   • Spawns one asteroid at a time from a random world edge
//   • Avoids aiming at occupied (non-neutral) planets where possible
//   • Moves it each tick; applies a visual spin angle
//   • Bounces off planets (resetting them to neutral) and kills
//     orbiting particles on contact
//   • Kills particles that collide with it, incrementing hitCount
//   • Destroys the asteroid after 20 total hits
//   • Respawns after a 5-second delay
// ============================================================

import type { AsteroidData, GameState, ParticleData } from '../types';
import { PLANET_RADIUS, FACTION_COLORS, PLANET_MAX_HEALTH, PLANET_PRODUCTION } from '../types';
import { audioManager } from '../core/AudioManager';

/** Maximum cumulative hits before an asteroid is destroyed. */
const MAX_HIT_COUNT = 20;

/** Seconds until a new asteroid spawns after the previous one is gone. */
const RESPAWN_DELAY = 5;

/** Pixels outside world bounds before an out-of-bounds kill is triggered. */
const OOB_MARGIN = 150;

/** Minimum speed of a spawned asteroid in px/s. */
const SPEED_MIN = 75;   // was 150 — halved for better pacing

/** Additional random speed range added on top of SPEED_MIN. */
const SPEED_RANGE = 50; // was 100

/** Minimum asteroid radius in px. */
const RADIUS_MIN = 14;

/** Additional random radius range. */
const RADIUS_RANGE = 10;

/** Visual spin rate in radians per second. */
const SPIN_RATE = 1.5;

/**
 * How many alternative target points to try before giving up on safety.
 * We try to find a trajectory that doesn't pass near any occupied planet.
 */
const MAX_SAFE_ATTEMPTS = 15;

/**
 * The clearance distance we require between the asteroid trajectory line
 * and the centre of any occupied (non-neutral) planet.
 * asteroid.radius (≈14-24) + planet radius (18-40) + generous buffer = 120 px.
 */
const OCCUPIED_CLEARANCE = 120;

// ── Utility helpers ─────────────────────────────────────────

function dist(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Perpendicular distance from point (px, py) to the infinite line defined
 * by (ax, ay) → (bx, by). Returns Infinity if the line has zero length.
 */
function perpDist(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return Infinity;
  return Math.abs((px - ax) * dy - (py - ay) * dx) / len;
}

/**
 * Returns the minimum perpendicular clearance between the trajectory
 * (spawnX,spawnY) → (targetX,targetY) and every occupied planet.
 * Higher = safer.
 */
function minClearanceToOccupied(
  spawnX: number, spawnY: number,
  targetX: number, targetY: number,
  state: GameState,
): number {
  let minClear = Infinity;
  for (const planet of state.planets.values()) {
    if (planet.faction === 'neutral') continue; // neutrals are fair game
    const d = perpDist(planet.x, planet.y, spawnX, spawnY, targetX, targetY);
    const planetR = PLANET_RADIUS[planet.upgradeLevel];
    // Effective clearance subtracts planet radius and asteroid radius
    const effective = d - planetR - RADIUS_MIN;
    if (effective < minClear) minClear = effective;
  }
  return minClear; // Infinity means no occupied planets in world
}

// ── AsteroidSystem ──────────────────────────────────────────

export class AsteroidSystem {
  /** Monotonically increasing ID counter for asteroid instances. */
  private _nextId = 0;

  /**
   * Safe targeting is used ONLY for the very first asteroid spawn.
   * After that we revert to fully random — hazards should be real threats.
   */
  private _firstSpawnDone = false;

  /**
   * Main update tick.  Call once per frame before rendering.
   *
   * @param dt    Elapsed time in seconds since last frame.
   * @param state Mutable game state.
   */
  update(dt: number, state: GameState): void {
    // ── Spawn logic ──────────────────────────────────────────
    if (state.asteroids.length === 0) {
      state.asteroidRespawnTimer -= dt;
      if (state.asteroidRespawnTimer <= 0) {
        this._spawnAsteroid(state);
        state.asteroidRespawnTimer = RESPAWN_DELAY;
      }
      // Nothing else to update yet.
      return;
    }

    // ── Process each active asteroid ─────────────────────────
    for (const asteroid of state.asteroids) {
      if (!asteroid.alive) continue;

      // ── Movement ─────────────────────────────────────────
      asteroid.x     += asteroid.vx * dt;
      asteroid.y     += asteroid.vy * dt;
      asteroid.angle += SPIN_RATE * dt;

      // ── Out-of-bounds check ───────────────────────────────
      if (
        asteroid.x < -OOB_MARGIN ||
        asteroid.x > state.worldWidth  + OOB_MARGIN ||
        asteroid.y < -OOB_MARGIN ||
        asteroid.y > state.worldHeight + OOB_MARGIN
      ) {
        asteroid.alive = false;
        state.asteroidRespawnTimer = RESPAWN_DELAY;
        continue;
      }

      // ── Planet collisions ─────────────────────────────────
      for (const planet of state.planets.values()) {
        const planetR    = PLANET_RADIUS[planet.upgradeLevel];
        const d          = dist(asteroid.x, asteroid.y, planet.x, planet.y);
        const combinedR  = asteroid.radius + planetR;

        if (d < combinedR) {
          // Normalised vector from planet centre → asteroid centre.
          const rawLen = d > 0 ? d : 0.001; // guard zero-division
          const nx = (asteroid.x - planet.x) / rawLen;
          const ny = (asteroid.y - planet.y) / rawLen;

          // Reflect velocity: v' = v − 2(v·n)n
          const dot    = asteroid.vx * nx + asteroid.vy * ny;
          asteroid.vx -= 2 * dot * nx;
          asteroid.vy -= 2 * dot * ny;

          // Push asteroid out of overlap so it doesn't re-trigger next frame.
          const overlap = combinedR - d + 1;
          asteroid.x += nx * overlap;
          asteroid.y += ny * overlap;

          // Asteroid knocks the planet down 1 level.
          // Level 3 -> 2. Level 2 -> 1. Level 1 -> lost to neutral.
          // Planet death shockwave effect
          state.hazardEffects.push({
            id:       ++state.hazardEffectIdCounter,
            kind:     'planet_shockwave',
            x:        planet.x,
            y:        planet.y,
            color:    FACTION_COLORS[planet.faction] ?? 0xffffff,
            age:      0,
            duration: 0.6,
            radius:   PLANET_RADIUS[planet.upgradeLevel] * 3.5,
          });
          (state as any)._pendingPlanetHazardDeaths = ((state as any)._pendingPlanetHazardDeaths ?? 0) + 1;

          if (planet.upgradeLevel === 3) {
            planet.upgradeLevel  = 2;
            planet.absorbedCount = 0;
            planet.maxHealth     = PLANET_MAX_HEALTH[2];
            planet.productionRate = PLANET_PRODUCTION[2];
            planet.health        = Math.min(planet.health, planet.maxHealth);
          } else if (planet.upgradeLevel === 2) {
            planet.upgradeLevel  = 1;
            planet.absorbedCount = 0;
            planet.maxHealth     = PLANET_MAX_HEALTH[1];
            planet.productionRate = PLANET_PRODUCTION[1];
            planet.health        = Math.min(planet.health, planet.maxHealth);
          } else {
            // Reset planet to neutral level-1 state.
            planet.faction       = 'neutral';
            planet.absorbedCount = 0;
            planet.upgradeLevel  = 1;
            planet.maxHealth     = PLANET_MAX_HEALTH[1];
            planet.productionRate = PLANET_PRODUCTION[1];
            planet.health        = planet.maxHealth;
            planet.shieldPoints  = 0;
            planet.shieldTimer   = 0;
          }

          // Kill all orbiting particles that call this planet home.
          let particlesKilledByPlanetHit = 0;
          for (const p of state.particles) {
            if (p.alive && p.homePlanetId === planet.id && p.mode === 'orbiting') {
              state.hazardEffects.push({
                id:       ++state.hazardEffectIdCounter,
                kind:     'particle_sparkle',
                x:        p.x,
                y:        p.y,
                color:    FACTION_COLORS[p.faction] ?? 0xffffff,
                age:      0,
                duration: 0.15,
                radius:   10,
              });
              p.alive = false;
              particlesKilledByPlanetHit++;
            }
          }
          if (particlesKilledByPlanetHit > 0) {
            (state as any)._pendingParticleHazardDeaths = ((state as any)._pendingParticleHazardDeaths ?? 0) + particlesKilledByPlanetHit;
          }

          // Accumulate damage.
          asteroid.hitCount++;

          if (asteroid.hitCount >= MAX_HIT_COUNT) {
            this._destroyAsteroid(asteroid, state);
            break; // stop checking planets — asteroid is gone
          }
        }
      }

      if (!asteroid.alive) continue;

      // ── Particle collisions ───────────────────────────────
      const hitRadius = asteroid.radius + 4;
      let particlesKilledByAsteroid = 0;
      outerParticleLoop: for (const particle of state.particles) {
        if (!particle.alive)  continue;
        // Particles sheltered inside a plasma storm are immune.
        if (particle.inStorm) continue;

        const pd = dist(asteroid.x, asteroid.y, particle.x, particle.y);
        if (pd < hitRadius) {
          state.hazardEffects.push({
            id:       ++state.hazardEffectIdCounter,
            kind:     'particle_sparkle',
            x:        particle.x,
            y:        particle.y,
            color:    FACTION_COLORS[particle.faction] ?? 0xffffff,
            age:      0,
            duration: 0.15,
            radius:   10,
          });
          particle.alive = false;
          if (particle.faction === 'player') {
            particlesKilledByAsteroid++;
          }
          asteroid.hitCount++;

          if (asteroid.hitCount >= MAX_HIT_COUNT) {
            this._destroyAsteroid(asteroid, state);
            break outerParticleLoop;
          }
        }
      }
      if (particlesKilledByAsteroid > 0) {
        (state as any)._pendingParticleHazardDeaths = ((state as any)._pendingParticleHazardDeaths ?? 0) + particlesKilledByAsteroid;
      }
    }

    // ── Compact dead entries from state arrays ────────────────
    state.asteroids = state.asteroids.filter((a: AsteroidData) => a.alive);
    state.particles = state.particles.filter((p: ParticleData) => p.alive);

    // Prime the respawn timer if the last asteroid just died.
    if (state.asteroids.length === 0 && state.asteroidRespawnTimer <= 0) {
      state.asteroidRespawnTimer = RESPAWN_DELAY;
    }
  }

  // ── Private helpers ─────────────────────────────────────────

  /** Mark an asteroid as dead and prime the respawn timer. */
  private _destroyAsteroid(asteroid: AsteroidData, state: GameState): void {
    asteroid.alive = false;
    state.asteroidRespawnTimer = RESPAWN_DELAY;
  }

  /**
   * Spawn a new asteroid from a random world edge aimed at the
   * central 50 % of the world at a randomised speed and size.
   *
   * Safety: tries up to MAX_SAFE_ATTEMPTS trajectories and picks
   * the one with the greatest perpendicular clearance from any
   * occupied (non-neutral) planet. If no "safe" trajectory is
   * found (clearance >= OCCUPIED_CLEARANCE) we use the safest
   * candidate anyway — the asteroid will at worst graze space
   * near an occupied planet rather than fly directly at it.
   *
   * Edge codes: 0 = top, 1 = right, 2 = bottom, 3 = left.
   */
  private _spawnAsteroid(state: GameState): void {
    const { worldWidth: W, worldHeight: H } = state;

    const radius = RADIUS_MIN + Math.random() * RADIUS_RANGE;
    const speed  = SPEED_MIN  + Math.random() * SPEED_RANGE;

    let bestSpawnX: number;
    let bestSpawnY: number;
    let bestTargetX: number;
    let bestTargetY: number;

    if (!this._firstSpawnDone) {
      // ── First spawn: pick the safest available trajectory ────
      let bestClearance = -Infinity;
      bestSpawnX = bestSpawnY = bestTargetX = bestTargetY = 0;

      for (let attempt = 0; attempt < MAX_SAFE_ATTEMPTS; attempt++) {
        const { spawnX, spawnY } = this._randomSpawnPoint(W, H);
        const targetX = W * 0.25 + Math.random() * (W * 0.5);
        const targetY = H * 0.25 + Math.random() * (H * 0.5);

        const clearance = minClearanceToOccupied(spawnX, spawnY, targetX, targetY, state);
        if (clearance > bestClearance) {
          bestClearance = clearance;
          bestSpawnX = spawnX; bestSpawnY = spawnY;
          bestTargetX = targetX; bestTargetY = targetY;
        }
        if (clearance >= OCCUPIED_CLEARANCE) break;
      }

      this._firstSpawnDone = true;
    } else {
      // ── Subsequent spawns: fully random (real threat) ────────
      const { spawnX, spawnY } = this._randomSpawnPoint(W, H);
      bestSpawnX  = spawnX;
      bestSpawnY  = spawnY;
      bestTargetX = W * 0.25 + Math.random() * (W * 0.5);
      bestTargetY = H * 0.25 + Math.random() * (H * 0.5);
    }

    // ── Build final velocity vector ───────────────────────────
    const dx  = bestTargetX - bestSpawnX;
    const dy  = bestTargetY - bestSpawnY;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;

    const asteroid: AsteroidData = {
      id:       `asteroid_${++this._nextId}`,
      x:        bestSpawnX,
      y:        bestSpawnY,
      vx:       (dx / len) * speed,
      vy:       (dy / len) * speed,
      radius,
      hitCount: 0,
      alive:    true,
      angle:    Math.random() * Math.PI * 2,
    };

    state.asteroids.push(asteroid);
    audioManager.playAsteroidEnter();
  }

  /** Returns a random spawn point 50 px outside a random world edge. */
  private _randomSpawnPoint(W: number, H: number): { spawnX: number; spawnY: number } {
    const edge = Math.floor(Math.random() * 4) as 0 | 1 | 2 | 3;
    switch (edge) {
      case 0: return { spawnX: Math.random() * W, spawnY: -50 };
      case 1: return { spawnX: W + 50,            spawnY: Math.random() * H };
      case 2: return { spawnX: Math.random() * W, spawnY: H + 50 };
      default: return { spawnX: -50,              spawnY: Math.random() * H };
    }
  }
}
