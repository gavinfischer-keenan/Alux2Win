// ============================================================
// Particle.ts — Batch particle renderer for Alux2Win
// ============================================================

import { Container, Graphics } from 'pixi.js';
import { FACTION_COLORS } from '../types';
import type { ParticleData, Faction } from '../types';

const PARTICLE_DRAW_RADIUS = 3;
const PARTICLE_GLOW_RADIUS = 6;
const PARTICLE_GLOW_ALPHA  = 0.3;

/**
 * Renders all game particles in a single Graphics object each frame.
 * Sorted by faction to batch fill-color changes and reduce state switching.
 */
export class ParticleRenderer {
  private readonly graphics: Graphics;
  private _destroyed = false;

  constructor(layer: Container) {
    this.graphics = new Graphics();
    layer.addChild(this.graphics);
  }

  /**
   * Clear and redraw every alive particle.
   * Call once per render frame.
   */
  render(particles: ParticleData[]): void {
    if (this._destroyed) return;

    this.graphics.clear();

    if (particles.length === 0) return;

    // ---- Sort by faction to batch draw calls ----
    const sorted = particles
      .filter((p) => p.alive)
      .sort((a, b) => {
        // Stable ordering: faction string comparison is fine.
        if (a.faction < b.faction) return -1;
        if (a.faction > b.faction) return 1;
        return 0;
      });

    // ---- Draw glow pass (drawn first so core is on top) ----
    let lastGlowFaction: Faction | null = null;

    for (const p of sorted) {
      if (p.mode === 'orbiting') continue; // Orbiting particles skip glow.

      const color = FACTION_COLORS[p.faction];

      if (p.faction !== lastGlowFaction) {
        lastGlowFaction = p.faction;
      }

      this.graphics
        .circle(p.x, p.y, PARTICLE_GLOW_RADIUS)
        .fill({ color, alpha: PARTICLE_GLOW_ALPHA });
    }

    // ---- Draw core pass ----
    let lastFaction: Faction | null = null;

    for (const p of sorted) {
      const color = FACTION_COLORS[p.faction];

      if (p.faction !== lastFaction) {
        lastFaction = p.faction;
      }

      this.graphics
        .circle(p.x, p.y, PARTICLE_DRAW_RADIUS)
        .fill({ color, alpha: 1 });
    }
  }

  destroy(): void {
    this._destroyed = true;
    this.graphics.destroy();
  }
}
