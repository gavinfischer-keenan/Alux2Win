// ============================================================
// Particle.ts — Batch particle renderer for Alux2Win
// ============================================================

import { Container, Graphics } from 'pixi.js';
import { FACTION_COLORS } from '../types';
import type { ParticleData } from '../types';

const PARTICLE_1X_RADIUS  = 3;
const PARTICLE_5X_RADIUS  = 7;   // larger — represents 5 combined units
const PARTICLE_GLOW_ALPHA = 0.3;
const PARTICLE_5X_GLOW_R  = 12;  // 5X glow ring radius
const PARTICLE_1X_GLOW_R  = 6;

export class ParticleRenderer {
  private readonly graphics: Graphics;
  private _destroyed = false;

  constructor(layer: Container) {
    this.graphics = new Graphics();
    layer.addChild(this.graphics);
  }

  render(particles: ParticleData[]): void {
    if (this._destroyed) return;
    this.graphics.clear();
    if (particles.length === 0) return;

    const time = Date.now() / 1000;

    // Sort: faction first, then 1X before 5X so 5X draws on top
    const sorted = particles
      .filter(p => p.alive)
      .sort((a, b) => {
        if (a.faction < b.faction) return -1;
        if (a.faction > b.faction) return  1;
        return a.strength - b.strength; // 1 before 5
      });

    // ---- Glow pass (behind cores) ----
    for (const p of sorted) {
      if (p.mode === 'orbiting' || p.mode === 'stationed') continue;

      const color    = FACTION_COLORS[p.faction];
      const is5X     = p.strength === 5;
      const glowR    = is5X ? PARTICLE_5X_GLOW_R : PARTICLE_1X_GLOW_R;
      const glowAlpha = is5X
        ? PARTICLE_GLOW_ALPHA * (0.7 + 0.3 * Math.sin(time * 3 + p.id))
        : PARTICLE_GLOW_ALPHA;

      this.graphics.circle(p.x, p.y, glowR).fill({ color, alpha: glowAlpha });
    }

    // ---- Core pass ----
    for (const p of sorted) {
      const color = FACTION_COLORS[p.faction];
      const is5X  = p.strength === 5;

      if (is5X) {
        // 5X: larger filled circle
        const pulse = 0.92 + 0.08 * Math.sin(time * 2.5 + p.id * 0.7);
        const r = PARTICLE_5X_RADIUS * pulse;
        this.graphics.circle(p.x, p.y, r).fill({ color, alpha: 1 });

        // Dark center dot to distinguish from planet
        this.graphics.circle(p.x, p.y, 2).fill({ color: 0x000000, alpha: 0.5 });

        // Thin outer ring
        this.graphics
          .circle(p.x, p.y, r + 2.5)
          .stroke({ color, alpha: 0.45, width: 1.2 });
      } else {
        // 1X: standard small circle
        this.graphics.circle(p.x, p.y, PARTICLE_1X_RADIUS).fill({ color, alpha: 1 });
      }
    }
  }

  destroy(): void {
    this._destroyed = true;
    this.graphics.destroy();
  }
}
