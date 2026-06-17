// ============================================================
// AsteroidSystem.ts — Asteroid hazard simulation for Alux2Win
// ============================================================
//
// Manages the single-asteroid-at-a-time hazard:
//   • Spawns one asteroid at a time from a random world edge
//   • Moves it each tick; applies a visual spin angle
//   • Bounces off planets (resetting them to neutral) and kills
//     orbiting particles on contact
//   • Kills particles that collide with it, incrementing hitCount
//   • Destroys the asteroid after 20 total hits
//   • Respawns after a 5-second delay
// ============================================================

import type { AsteroidData, GameState, ParticleData } from '../types';
import { PLANET_RADIUS } from '../types';

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

// ── Utility helpers ─────────────────────────────────────────

function dist(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

// ── AsteroidSystem ──────────────────────────────────────────

export class AsteroidSystem {
  /** Monotonically increasing ID counter for asteroid instances. */
  private _nextId = 0;

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

          // Asteroid knocks the planet down 2 levels.
          // A fully upgraded planet (Level 3) drops to Level 1 but survives.
          // Lesser planets (Level 1, 2) drop below Level 1 and are lost to neutral.
          if (planet.upgradeLevel === 3) {
            planet.upgradeLevel  = 1;
            planet.absorbedCount = 0;
            planet.bonusHealth   = 0;
            // Cap internal particles to the new level 1 capacity
            planet.particles     = Math.min(planet.particles, 40); // PLANET_CAPACITY[1]
          } else {
            // Reset planet to neutral level-1 state.
            planet.faction       = 'neutral';
            planet.particles     = 0;
            planet.absorbedCount = 0;
            planet.upgradeLevel  = 1;
            planet.bonusHealth   = 0;
          }

          // Kill all orbiting particles that call this planet home.
          for (const p of state.particles) {
            if (p.alive && p.homePlanetId === planet.id && p.mode === 'orbiting') {
              p.alive = false;
            }
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
      outerParticleLoop: for (const particle of state.particles) {
        if (!particle.alive)  continue;
        // Particles sheltered inside a plasma storm are immune.
        if (particle.inStorm) continue;

        const pd = dist(asteroid.x, asteroid.y, particle.x, particle.y);
        if (pd < hitRadius) {
          particle.alive = false;
          asteroid.hitCount++;

          if (asteroid.hitCount >= MAX_HIT_COUNT) {
            this._destroyAsteroid(asteroid, state);
            break outerParticleLoop;
          }
        }
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
   * Edge codes: 0 = top, 1 = right, 2 = bottom, 3 = left.
   */
  private _spawnAsteroid(state: GameState): void {
    const { worldWidth: W, worldHeight: H } = state;
    const edge = Math.floor(Math.random() * 4) as 0 | 1 | 2 | 3;

    // ── Spawn position — 50 px outside the chosen edge ──────
    let spawnX: number;
    let spawnY: number;

    switch (edge) {
      case 0: // top
        spawnX = Math.random() * W;
        spawnY = -50;
        break;
      case 1: // right
        spawnX = W + 50;
        spawnY = Math.random() * H;
        break;
      case 2: // bottom
        spawnX = Math.random() * W;
        spawnY = H + 50;
        break;
      case 3: // left
      default:
        spawnX = -50;
        spawnY = Math.random() * H;
        break;
    }

    // ── Random target inside the central 50 % of the world ──
    const targetX = W * 0.25 + Math.random() * (W * 0.5);
    const targetY = H * 0.25 + Math.random() * (H * 0.5);

    // ── Direction vector (normalised) ────────────────────────
    const dx  = targetX - spawnX;
    const dy  = targetY - spawnY;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;

    const speed  = SPEED_MIN  + Math.random() * SPEED_RANGE;
    const radius = RADIUS_MIN + Math.random() * RADIUS_RANGE;

    const asteroid: AsteroidData = {
      id:       `asteroid_${++this._nextId}`,
      x:        spawnX,
      y:        spawnY,
      vx:       (dx / len) * speed,
      vy:       (dy / len) * speed,
      radius,
      hitCount: 0,
      alive:    true,
      angle:    Math.random() * Math.PI * 2,
    };

    state.asteroids.push(asteroid);
  }
}
