// ============================================================
// WhiteHoleRenderer.ts — White Hole visual entity for Alux2Win
// ============================================================
//
// Renders all active white holes each frame using PixiJS v8's
// Graphics builder API.  Each white hole shows:
//   1. A bright core star glow (always visible)
//   2. A rotating 6-point starburst corona
//   3. A faction halo with progress arc dots (when owned)
//   4. Counter-rotating inner faction dots (when owned)
//
// When ownerFaction is null a subtle neutral silver pulse is
// shown instead of the faction-coloured elements.
// ============================================================

import { Container, Graphics } from 'pixi.js';
import type { WhiteHoleData } from '../types';
import { FACTION_COLORS } from '../types';

export class WhiteHoleRenderer {
  /** Single re-used Graphics object; cleared and redrawn every frame. */
  private readonly graphics: Graphics;

  /**
   * @param layer  The world-space Container to add the Graphics object to.
   *               Should sit above planets but below UI.
   */
  constructor(layer: Container) {
    this.graphics = new Graphics();
    layer.addChild(this.graphics);
  }

  /**
   * Clear and redraw all white hole visuals for the current frame.
   * Call once per render tick, passing state.whiteHoles.
   */
  render(whiteHoles: WhiteHoleData[]): void {
    const g = this.graphics;
    g.clear();

    for (const wh of whiteHoles) {
      if (wh.exploded) continue;

      const { x, y, pulseAngle, ownerFaction, progress } = wh;

      // ---- 1. Core star glow (always visible) -----------------------
      g.circle(x, y, 22).fill({ color: 0xffffff, alpha: 0.9 });
      g.circle(x, y, 28).fill({ color: 0xfff9e0, alpha: 0.35 });
      g.circle(x, y, 36).fill({ color: 0xfffde7, alpha: 0.15 });

      // ---- 2. Pulsing outer corona — 6-point rotating starburst -----
      for (let i = 0; i < 6; i++) {
        const starAngle = pulseAngle + (i * Math.PI) / 3;
        const cx = x + Math.cos(starAngle) * 40;
        const cy = y + Math.sin(starAngle) * 40;
        g.circle(cx, cy, 3).fill({ color: 0xfff8dc, alpha: 0.6 });
      }

      if (ownerFaction !== null) {
        // ---- 3. Faction halo ----------------------------------------
        const factionColor = FACTION_COLORS[ownerFaction];

        // Full outer ring.
        g.circle(x, y, 44).stroke({ color: factionColor, width: 3, alpha: 0.8 });

        // Progress arc approximated by filled dots in a ring at radius 52.
        const progressFraction = Math.min(progress / 20, 1);
        const dotCount = Math.round(progressFraction * 16);

        for (let i = 0; i < dotCount; i++) {
          const dotAngle = (i / 16) * Math.PI * 2 - Math.PI / 2;
          const dx = x + Math.cos(dotAngle) * 52;
          const dy = y + Math.sin(dotAngle) * 52;
          g.circle(dx, dy, 4).fill({ color: factionColor, alpha: 0.85 });
        }

        // ---- 4. Counter-rotating inner faction dots (8 dots at r=34) --
        const innerBaseAngle = -pulseAngle * 0.8;
        for (let i = 0; i < 8; i++) {
          const dotAngle = innerBaseAngle + (i / 8) * Math.PI * 2;
          const dx = x + Math.cos(dotAngle) * 34;
          const dy = y + Math.sin(dotAngle) * 34;
          g.circle(dx, dy, 3).fill({ color: factionColor, alpha: 0.5 });
        }
      } else {
        // ---- Neutral state: subtle silver/white pulsing glow ----------
        // A gentle dashed-ring suggestion using small dots.
        const neutralAlpha = 0.2 + Math.abs(Math.sin(pulseAngle * 0.8)) * 0.15;
        g.circle(x, y, 44).stroke({ color: 0xc0c8d8, width: 1.5, alpha: neutralAlpha });

        for (let i = 0; i < 8; i++) {
          const dotAngle = pulseAngle * 0.5 + (i / 8) * Math.PI * 2;
          const dx = x + Math.cos(dotAngle) * 42;
          const dy = y + Math.sin(dotAngle) * 42;
          g.circle(dx, dy, 2.5).fill({ color: 0xe8edf5, alpha: neutralAlpha * 1.2 });
        }
      }
    }
  }

  /**
   * Remove the Graphics from its parent and free GPU resources.
   * Call when unloading the game scene.
   */
  destroy(): void {
    this.graphics.destroy();
  }
}
