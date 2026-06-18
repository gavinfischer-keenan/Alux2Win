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
      if (
        particle.mode !== 'traveling' &&
        particle.mode !== 'combat' &&
        particle.mode !== 'stationed'
      ) continue;

      for (const planet of planets) {
        const dx   = planet.x - particle.x;
        const dy   = planet.y - particle.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const planetRadius = PLANET_RADIUS[planet.upgradeLevel];

        // The interaction distance is increased by 40 (the aggro radius)
        if (dist > planetRadius + 40) continue;

        // Plasma storm protection: skip all combat if particle is in storm
        if (particle.inStorm) continue;

        // Determine if this planet is a valid target for this particle:
        // 1. Particle is explicitly targeting this planet, OR
        // 2. Particle has a location target (move-to-point) and is within
        //    100px of that point — treat any planet nearby as engageable.
        const hasExplicitTarget = particle.targetPlanetId === planet.id;
        let nearDestination = false;
        if (!particle.targetPlanetId && particle.targetX !== undefined && particle.targetY !== undefined) {
          const ldx = particle.targetX - particle.x;
          const ldy = particle.targetY - particle.y;
          if (ldx * ldx + ldy * ldy <= 10000) { // 100^2
            nearDestination = true;
          }
        }

        if (!hasExplicitTarget && !nearDestination) {
          continue;
        }

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
          break;
        }

        if (particle.faction === planet.faction) {
          // Require particle to actually reach the planet surface for friendly interaction
          if (dist > planetRadius + 5) {
            continue;
          }

          const healthFull = planet.health >= planet.maxHealth;
          const upgradeFull = planet.upgradeLevel >= 3;

          if (healthFull && upgradeFull) {
            // ---- Planet is full — unit joins orbit as a live defender ----
            const orbitAngle  = Math.random() * Math.PI * 2;
            const orbitRadius = PLANET_RADIUS[planet.upgradeLevel] * 1.8;
            const orbitSpeed  = 1.2;

            particle.mode           = 'orbiting';
            particle.targetPlanetId = undefined;
            particle.targetX        = undefined;
            particle.targetY        = undefined;
            particle.orbitAngle     = orbitAngle;
            particle.orbitRadius    = orbitRadius;
            particle.homePlanetId   = planet.id;
            particle.orbitTimer     = 0;
            particle.vx = -Math.sin(orbitAngle) * orbitRadius * orbitSpeed;
            particle.vy =  Math.cos(orbitAngle) * orbitRadius * orbitSpeed;
          } else {
            // ---- Consume particle: heal health → upgrade fuel ----
            particle.alive = false;
            anyDied = true;

            let healAmount: number = particle.strength;

            // 1. Repair health
            if (healAmount > 0 && planet.health < planet.maxHealth) {
              const needed = planet.maxHealth - planet.health;
              if (healAmount <= needed) {
                planet.health += healAmount;
                healAmount = 0;
              } else {
                planet.health = planet.maxHealth;
                healAmount -= needed;
              }
            }

            // 2. Any remaining → upgrade fuel
            if (healAmount > 0 && planet.upgradeLevel < 3) {
              planet.absorbedCount += healAmount;
            }
          }
        } else {
          // ---- Enemy / Neutral interaction ----
          if (planet.faction === 'player') {
            audioManager.playWarning();
          }

          let dmg: number = particle.strength; // 1X = 1 dmg, 5X = 5 dmg

          // 1. Fight orbiting defenders first
          for (let i = 0; i < state.particles.length && dmg > 0; i++) {
            const def = state.particles[i];
            if (def.alive && def.mode === 'orbiting' && def.homePlanetId === planet.id && def.faction === planet.faction) {
               if (dmg >= def.strength) {
                 dmg -= def.strength;
                 def.alive = false;
                 anyDied = true;
               } else {
                 dmg = 0; // Attacker completely absorbed by stronger defender
               }
            }
          }

          if (dmg < particle.strength) {
             particle.alive = false;
             anyDied = true;
          }

          // 2. Any remaining damage hits the planet health (or shields first)
          if (dmg > 0) {
            particle.alive = false;
            anyDied = true;
            
            // Shield absorbs damage first
            if (planet.isShielded && (planet.shieldPoints ?? 0) > 0) {
              const absorbed = Math.min(dmg, planet.shieldPoints!);
              planet.shieldPoints! -= absorbed;
              dmg -= absorbed;

              if (planet.faction === 'player') {
                audioManager.playShieldDamage();
              }
            }

            if (dmg > 0) {
              planet.health -= dmg;

              if (planet.health <= 0) {
                this._capturePlanet(planet, particle, state, eventBus);
              }
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

    // Instantly reset health & level to base
    planet.upgradeLevel = 1;
    planet.maxHealth = 40;
    planet.health = planet.maxHealth;
    planet.absorbedCount = 0;
    planet.productionRate = 0.5;
    planet.shieldPoints = 0;
    planet.shieldTimer = 0;

    if (oldFaction === 'neutral') {
      planet.faction = attackParticle.faction;
    } else {
      planet.faction = 'neutral';
    }

    if (planet.faction === 'player') {
      audioManager.playPlanetCapture();
    }

    // Kill orbiting particles that belonged to the old faction on this planet
    for (const p of state.particles) {
      if (p.homePlanetId === planet.id && p.faction === oldFaction && p.mode === 'orbiting') {
        p.alive = false;
      }
    }

    eventBus.emit('planet:captured', {
      planetId:   planet.id,
      newFaction: planet.faction,
      oldFaction: oldFaction,
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

