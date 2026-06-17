// ============================================================
// CombatSystem.ts — Particle-planet interaction & win condition
// ============================================================

import type { GameState, ParticleData, PlanetData } from '../types';
import { PLANET_RADIUS } from '../types';
import type { EventBus } from '../core/EventBus';

/**
 * Handles particle-planet collision resolution:
 *   - Friendly: particle absorbed → increment absorbedCount (upgrade fuel).
 *   - Enemy/Neutral: deplete planet.particles by 1, kill particle.
 *     If planet depleted to 0:
 *       neutral  → captured by particle's faction, particles = 0.
 *       enemy    → reverts to neutral, particles = 0.
 * Emits 'planet:captured' and 'game:over' events as appropriate.
 */
export class CombatSystem {
  update(state: GameState, eventBus: EventBus): void {
    const planets = Array.from(state.planets.values());
    let anyDied   = false;

    for (const particle of state.particles) {
      if (!particle.alive) continue;
      if (particle.mode !== 'traveling' && particle.mode !== 'combat') continue;

      for (const planet of planets) {
        const dx   = planet.x - particle.x;
        const dy   = planet.y - particle.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const planetRadius = PLANET_RADIUS[planet.upgradeLevel];

        if (dist > planetRadius) continue; // Not close enough.

        if (particle.faction === planet.faction) {
          // ---- Friendly absorption ----
          particle.alive = false;
          anyDied = true;
          planet.absorbedCount += 1;
        } else {
          // ---- Enemy / Neutral interaction ----
          particle.alive   = false;
          anyDied          = true;
          planet.particles = Math.max(0, planet.particles - 1);

          if (planet.particles <= 0) {
            this._capturePlanet(planet, particle, state, eventBus);
          }
        }

        // Only one planet interaction per particle per tick.
        break;
      }
    }

    // ---- Prune dead particles ----
    if (anyDied) {
      state.particles = state.particles.filter((p) => p.alive);
    }

    // ---- Win condition ----
    this._checkWinCondition(state, eventBus);
  }

  // ---- Private ----

  private _capturePlanet(
    planet: PlanetData,
    attackParticle: ParticleData,
    state: GameState,
    eventBus: EventBus
  ): void {
    const oldFaction = planet.faction;

    if (oldFaction === 'neutral') {
      // Neutral → attacker's faction.
      planet.faction   = attackParticle.faction;
      planet.particles = 0;
    } else {
      // Enemy planet fully depleted → becomes neutral.
      planet.faction   = 'neutral';
      planet.particles = 0;
    }

    // Kill all orbiting particles that belonged to the old faction on this planet.
    for (const p of state.particles) {
      if (p.homePlanetId === planet.id && p.faction === oldFaction && p.mode === 'orbiting') {
        p.alive = false;
      }
    }

    eventBus.emit('planet:captured', {
      planetId:   planet.id,
      newFaction: planet.faction,
    });
  }

  private _checkWinCondition(state: GameState, eventBus: EventBus): void {
    if (state.winner) return; // Already over.

    // Collect all factions that have at least one planet OR live attacking particle.
    const livingFactions = new Set<string>();

    for (const planet of state.planets.values()) {
      if (planet.faction !== 'neutral') {
        livingFactions.add(planet.faction);
      }
    }

    for (const p of state.particles) {
      if (p.alive && p.faction !== 'neutral' && (p.mode === 'traveling' || p.mode === 'combat')) {
        livingFactions.add(p.faction);
      }
    }

    // Need exactly 1 surviving non-neutral faction across planets + in-flight particles.
    if (livingFactions.size !== 1) return;

    const winner = Array.from(livingFactions)[0];

    // Double-check: the winner must actually own at least one planet.
    let ownsAPlanet = false;
    for (const planet of state.planets.values()) {
      if (planet.faction === winner) { ownsAPlanet = true; break; }
    }
    if (!ownsAPlanet) return;

    state.winner = winner as any;
    state.running = false;
    eventBus.emit('game:over', { winner: state.winner! });
  }

}
