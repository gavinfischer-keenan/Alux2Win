// ============================================================
// WhiteHoleSystem.ts — White Hole game logic for LUX
// ============================================================
//
// White holes accumulate particles from a single faction.
// Once 80 strength worth of particles have been absorbed they
// explode, spraying 300 new particles of the owning faction
// outward.  Particles from an opposing faction reduce the
// stored progress instead of adding to it.
// ============================================================

import type { GameState, ParticleData } from '../types';
import { PARTICLE_SPEED } from '../types';
import { audioManager } from '../core/AudioManager';

export class WhiteHoleSystem {
  // ---- Public entry point -------------------------------------------------

  update(dt: number, state: GameState): void {
    // 1. Tick pulse animation for all white holes.
    for (const wh of state.whiteHoles) {
      wh.pulseAngle += 1.0 * dt;
    }

    // 2. Remove any white holes that already exploded on a previous tick.
    state.whiteHoles = state.whiteHoles.filter(wh => !wh.exploded);

    // 3. Check traveling / combat particles against every live white hole.
    for (const p of state.particles) {
      if (!p.alive) continue;
      if (p.mode !== 'traveling' && p.mode !== 'combat') continue;

      for (let wi = 0; wi < state.whiteHoles.length; wi++) {
        const wh = state.whiteHoles[wi];
        if (wh.exploded) continue;

        // Skip particles that were just spawned by this white hole
        // (deployTimer > 0 acts as a re-absorption cooldown).
        if (p.deployTimer !== undefined && p.deployTimer > 0) continue;

        const dx   = p.x - wh.x;
        const dy   = p.y - wh.y;
        const distSq = dx * dx + dy * dy;

        if (distSq < 900) { // 30 * 30
          this._absorb(p, wi, state);
          p.alive = false;
          break; // each particle only interacts with one white hole
        }
      }
    }
  }

  // ---- Private helpers ----------------------------------------------------

  private _absorb(p: ParticleData, whIndex: number, state: GameState): void {
    const wh = state.whiteHoles[whIndex];

    if (wh.ownerFaction === null || wh.ownerFaction === p.faction) {
      // Same faction (or unclaimed) — add progress.
      wh.ownerFaction = p.faction;
      wh.progress    += p.strength;

      if (wh.progress >= 80) {
        this._explode(whIndex, state);
      }
    } else {
      // Opposing faction — reduce progress.
      wh.progress -= p.strength;

      if (wh.progress <= 0) {
        // Fully neutralised: reset ownership.
        wh.progress      = 0;
        wh.ownerFaction  = null;
      }
    }
  }

  private _explode(index: number, state: GameState): void {
    const wh = state.whiteHoles[index];
    if (!wh) return;

    audioManager.playWhiteHoleExplosion();

    wh.exploded = true;

    // Spawn 300 particles for the owning faction fanning out from the
    // white hole position.  deployTimer prevents them from immediately
    // re-entering the (now exploded) white hole or any adjacent one.
    for (let i = 0; i < 300; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = PARTICLE_SPEED * (0.5 + Math.random() * 0.5);

      state.particles.push({
        id:            ++state.particleIdCounter,
        x:             wh.x + Math.cos(angle) * 30,
        y:             wh.y + Math.sin(angle) * 30,
        vx:            Math.cos(angle) * speed,
        vy:            Math.sin(angle) * speed,
        faction:       wh.ownerFaction!,
        mode:          'traveling',
        strength:      1,
        orbitTimer:    0,
        damage:        0,
        homePlanetId:  'whiteholes_explosion',
        alive:         true,
        stormTimer:    0,
        inStorm:       false,
        speedMod:      1.0,
        portalCooldown: 0,
        trappedByBH:   null,
        deployTimer:   2.0, // brief cooldown so they don't immediately re-absorb
      });
    }

    // The white hole itself is filtered out at the top of the next update().
  }
}
