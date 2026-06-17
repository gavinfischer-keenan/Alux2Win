// ============================================================
// CombatSystem.ts — Particle-planet interaction & win condition
// ============================================================

import type { GameState, ParticleData, PlanetData } from '../types';
import { PLANET_RADIUS } from '../types';
import type { EventBus } from '../core/EventBus';
import { audioManager } from '../core/AudioManager';

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

        // The interaction distance is increased by 40 (the aggro radius)
        if (dist > planetRadius + 40) continue;

        // Plasma storm protection: skip all combat if particle is in storm
        if (particle.inStorm) continue;
        // If planet is in storm and enemy particle: convert to orbiting instead of attacking
        if (planet.inStorm && particle.faction !== planet.faction) {
          // Enemy arrives at storm-protected planet: join orbit peacefully, fight deferred
          particle.mode = 'orbiting';
          particle.targetPlanetId = undefined;
          particle.targetX = undefined;
          particle.targetY = undefined;
          particle.orbitAngle = Math.atan2(particle.y - planet.y, particle.x - planet.x);
          particle.orbitRadius = PLANET_RADIUS[planet.upgradeLevel] * 1.8;
          particle.homePlanetId = planet.id;
          planet.particles++;
          break;
        }

        if (particle.faction === planet.faction) {
          // Skip friendly absorption if particle was just deployed
          if (particle.deployTimer !== undefined && particle.deployTimer > 0) {
            continue;
          }
          // ---- Friendly absorption (upgrade fuel or heal) ----
          particle.alive = false;
          anyDied = true;
          
          let healAmount: number = particle.strength;

          // 1. Heal inner health (orbiting particles)
          while (healAmount > 0 && planet.particles < planet.capacity) {
            healAmount -= 1;
            planet.particles += 1;
            
            const orbitAngle  = Math.random() * Math.PI * 2;
            const orbitRadius = PLANET_RADIUS[planet.upgradeLevel] * 1.8;
            const orbitSpeed = 1.2;
            state.particles.push({
              id:             ++state.particleIdCounter,
              x:              planet.x + orbitRadius * Math.cos(orbitAngle),
              y:              planet.y + orbitRadius * Math.sin(orbitAngle),
              vx:             -Math.sin(orbitAngle) * orbitRadius * orbitSpeed,
              vy:             Math.cos(orbitAngle) * orbitRadius * orbitSpeed,
              faction:        planet.faction,
              mode:           'orbiting',
              strength:       1,
              orbitTimer:     0,
              damage:         0,
              homePlanetId:   planet.id,
              orbitAngle,
              orbitRadius,
              alive:          true,
              stormTimer:     0,
              inStorm:        false,
              speedMod:       1.0,
              portalCooldown: 0,
              trappedByBH:    null,
            });
          }

          // 2. Heal outer shield (bonus health)
          if (planet.bonusHealth < planet.maxBonusHealth) {
            const needed = planet.maxBonusHealth - planet.bonusHealth;
            if (healAmount <= needed) {
              planet.bonusHealth += healAmount;
              healAmount = 0;
            } else {
              planet.bonusHealth = planet.maxBonusHealth;
              healAmount -= needed;
            }
          }

          // 3. Remaining strength goes to upgrade
          if (healAmount > 0) {
            planet.absorbedCount += healAmount;
          }
        } else {
          // ---- Enemy / Neutral interaction ----
          particle.alive = false;
          anyDied = true;

          if (planet.faction === 'player') {
            audioManager.playWarning();
          }

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

