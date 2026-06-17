// ============================================================
// CombatSystem.ts — Particle-planet interaction & win condition
// ============================================================

import type { GameState, ParticleData, PlanetData } from '../types';
import { PLANET_RADIUS } from '../types';
import type { EventBus } from '../core/EventBus';

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

        if (dist > planetRadius) continue;

        if (particle.faction === planet.faction) {
          // ---- Friendly absorption (upgrade fuel) ----
          particle.alive = false;
          anyDied = true;
          // Strength counts toward upgrade (5X = 5 credits)
          planet.absorbedCount += particle.strength;
        } else {
          // ---- Enemy / Neutral interaction ----
          particle.alive = false;
          anyDied = true;

          const dmg = particle.strength; // 1X = 1 dmg, 5X = 5 dmg

          if (planet.bonusHealth > 0) {
            // Deplete bonus health first (the clock-face ring)
            planet.bonusHealth = Math.max(0, planet.bonusHealth - dmg);
          } else {
            // Then deplete stationed particle count
            planet.particles = Math.max(0, planet.particles - dmg);

            if (planet.particles <= 0) {
              this._capturePlanet(planet, particle, state, eventBus);
            }
          }
        }

        break; // one planet interaction per particle per tick
      }
    }

    if (anyDied) {
      state.particles = state.particles.filter(p => p.alive);
    }

    this._checkWinCondition(state, eventBus);
  }

  private _capturePlanet(
    planet: PlanetData,
    attackParticle: ParticleData,
    state: GameState,
    eventBus: EventBus
  ): void {
    const oldFaction = planet.faction;

    if (oldFaction === 'neutral') {
      planet.faction    = attackParticle.faction;
      planet.particles  = 0;
    } else {
      planet.faction    = 'neutral';
      planet.particles  = 0;
    }

    // Reset bonus health on capture
    planet.bonusHealth    = 0;
    planet.maxBonusHealth = 0;

    // Kill orbiting particles that belonged to the old faction on this planet
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
    if (state.winner) return;

    const livingFactions = new Set<string>();

    for (const planet of state.planets.values()) {
      if (planet.faction !== 'neutral') livingFactions.add(planet.faction);
    }

    for (const p of state.particles) {
      if (p.alive && p.faction !== 'neutral' && (p.mode === 'traveling' || p.mode === 'combat')) {
        livingFactions.add(p.faction);
      }
    }

    if (livingFactions.size !== 1) return;

    const winner = Array.from(livingFactions)[0];
    let ownsAPlanet = false;
    for (const planet of state.planets.values()) {
      if (planet.faction === winner) { ownsAPlanet = true; break; }
    }
    if (!ownsAPlanet) return;

    state.winner  = winner as any;
    state.running = false;
    eventBus.emit('game:over', { winner: state.winner! });
  }
}
