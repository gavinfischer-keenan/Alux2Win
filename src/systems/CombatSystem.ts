// ============================================================
// CombatSystem.ts — Particle-planet interaction & win condition
// ============================================================

import type { GameState, ParticleData, PlanetData } from '../types';
import { PLANET_RADIUS, PLANET_MAX_HEALTH, PLANET_PRODUCTION } from '../types';
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
        const distSq = dx * dx + dy * dy;
        const planetRadius = PLANET_RADIUS[planet.upgradeLevel];

        // The interaction distance is increased by 40 (the aggro radius)
        const interactionDist = planetRadius + 40;
        if (distSq > interactionDist * interactionDist) continue;
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
        
        if (particle.faction === planet.faction) {
          // Require particle to actually reach the planet surface for friendly interaction
          const friendlyDist = planetRadius + 5;
          if (distSq > friendlyDist * friendlyDist) {
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
          if (planet.lockoutTimer !== undefined && planet.lockoutTimer > 0 && particle.faction !== planet.previousOwner) {
            particle.alive = false;
            anyDied = true;
            // Play deflection sound? Not necessary but could reuse warning
            if (particle.faction === 'player') audioManager.playWarning();
            break;
          }

          if (planet.faction === 'player') {
            audioManager.playWarning();
          }

          let dmg: number = particle.strength; // 1X = 1 dmg, 5X = 5 dmg

          // 1. Fight orbiting defenders first
          for (let i = 0; i < state.particles.length && dmg > 0; i++) {
            const def = state.particles[i];
            if (def.alive && def.mode === 'orbiting' && def.homePlanetId === planet.id && def.faction === planet.faction) {
               if (particle.faction === 'player' || def.faction === 'player') {
                 audioManager.playCombatEngage();
               }
               
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

              if (planet.faction === 'player') {
                audioManager.playPlanetDamage();
              }

              // Determine capture threshold (retake discount)
              let captureThreshold = 0;
              if (planet.faction === 'neutral' && planet.previousOwner === particle.faction && (planet.rebellionBonus || 0) > 0) {
                captureThreshold = 20;
              }

              if (planet.health <= captureThreshold) {
                this._capturePlanet(planet, particle, state, eventBus);
              }
            }
          }
        }

        break; // one planet interaction per particle per tick
      }
    }

    // Do not filter dead particles from state.particles to avoid GC pressure.
    // They will be recycled by ProductionSystem.

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
    planet.absorbedCount = 0;
    planet.productionRate = PLANET_PRODUCTION[1];
    planet.shieldPoints = 0;
    planet.shieldTimer = 0;

    if (oldFaction === 'neutral') {
      planet.faction = attackParticle.faction;
      planet.maxHealth = PLANET_MAX_HEALTH[1]; // Reset to standard health
      planet.health = planet.maxHealth;
    } else {
      planet.faction = 'neutral';
      planet.previousOwner = oldFaction;
      planet.lockoutTimer = 15;
      planet.rebellionBonus = Math.min((planet.rebellionBonus || 0) + 20, 80);
      planet.maxHealth = PLANET_MAX_HEALTH[1] + planet.rebellionBonus;
      planet.health = planet.maxHealth;
    }

    if (planet.faction === 'player') {
      audioManager.playPlanetCapture();
    } else if (planet.faction === 'neutral') {
      if (oldFaction === 'player') {
        audioManager.playPlanetHazardDeath();
      } else if ((oldFaction === 'enemy_a' || oldFaction === 'enemy_b') && attackParticle.faction === 'player') {
        audioManager.playEnemyPlanetDestroy();
      }
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

    // 1. Calculate the minimum cost to capture any available planet
    let minCaptureCost = Infinity;
    for (const planet of state.planets.values()) {
      let defenders = 0;
      for (const p of state.particles) {
        if (p.alive && p.mode === 'orbiting' && p.homePlanetId === planet.id && p.faction === planet.faction) {
          defenders += p.strength;
        }
      }
      const captureCost = defenders + planet.health + (planet.faction === 'neutral' ? 0 : PLANET_MAX_HEALTH[1]);
      if (captureCost < minCaptureCost) {
        minCaptureCost = captureCost;
      }
    }

    const livingFactions = new Set<string>();
    const factionStrength = new Map<string, number>();

    // 2. Factions with at least one planet are alive
    for (const planet of state.planets.values()) {
      if (planet.faction !== 'neutral') {
        livingFactions.add(planet.faction);
      }
    }

    // 3. Tally total strength of wandering particles for each faction
    for (const p of state.particles) {
      if (p.alive && p.faction !== 'neutral' && (p.mode === 'traveling' || p.mode === 'combat' || p.mode === 'stationed')) {
        const current = factionStrength.get(p.faction) || 0;
        factionStrength.set(p.faction, current + p.strength);
      }
    }

    // 4. Factions without a planet are ONLY alive if they can afford the cheapest capture
    for (const [faction, strength] of factionStrength.entries()) {
      if (!livingFactions.has(faction) && strength >= minCaptureCost) {
        livingFactions.add(faction);
      }
    }

    if (!state.playerNotifiedDead && !livingFactions.has('player')) {
      state.playerNotifiedDead = true;
      if (livingFactions.size > 1) {
        state.running = false; // Pause the game for the screen
        eventBus.emit('player:eliminated', {});
      }
    }

    if (livingFactions.size === 0) {
      state.winner = null;
      state.running = false;
      eventBus.emit('game:over', { winner: null });
      return;
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

