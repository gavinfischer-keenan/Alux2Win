// ============================================================
// PlasmaStormRenderer.ts - Plasma storm visual entity for LUX
// ============================================================
//
// Renders all active plasma storms each frame using PixiJS v8's
// Graphics builder API.  Organic layered ellipses with breathing,
// color-shifting wisps, and no hard borders.
// ============================================================

import { Container, Graphics } from 'pixi.js';
import type { PlasmaStormData } from '../types';

// -- Renderer -----------------------------------------------------------------

export class PlasmaStormRenderer {
  /** Single re-used Graphics object; cleared and redrawn every frame. */
  private readonly graphics: Graphics;

  /**
   * @param layer  The world-space Container to add the Graphics object to.
   *               This should be a layer that sits above planets but below UI.
   */
  constructor(layer: Container) {
    this.graphics = new Graphics();
    layer.addChild(this.graphics);
  }

  /**
   * Clear and redraw all storm visuals for the current frame.
   * Call this once per render tick, passing the current state.plasmaStorms array.
   */
  render(storms: PlasmaStormData[]): void {
    const g = this.graphics;
    g.clear();

    for (const storm of storms) {
      const { x, y, radiusX, radiusY, angle } = storm;

      // Slow color shift between purple and indigo
      const t = (Math.sin(angle * 0.15) + 1) / 2;
      const color = t < 0.5 ? 0x7c3aed : 0x6366f1;

      // Breathing scale applied to all layer radii
      const breathScale = 1.0 + 0.06 * Math.sin(angle * 1.3);
      const rx = radiusX * breathScale;
      const ry = radiusY * breathScale;

      // Edge flicker adds a tiny random bump to the outer alpha
      const flickerOuter = Math.random() * 0.012;

      // -- 4 concentric soft ellipse layers (no strokes) ----------------
      // Layer 1: 1.25x — very faint outer glow
      g.ellipse(x, y, rx * 1.25, ry * 1.25)
        .fill({ color, alpha: 0.06 + flickerOuter });

      // Layer 2: 1.0x
      g.ellipse(x, y, rx, ry)
        .fill({ color: 0x8b5cf6, alpha: 0.10 });

      // Layer 3: 0.75x
      g.ellipse(x, y, rx * 0.75, ry * 0.75)
        .fill({ color: 0xa78bfa, alpha: 0.16 });

      // Layer 4: 0.45x — dense core
      g.ellipse(x, y, rx * 0.45, ry * 0.45)
        .fill({ color: 0xc4b5fd, alpha: 0.20 });

      // -- 4 wisp tendrils at storm radius * 0.85, rotating slowly ------
      const wispDist = radiusX * 0.85 * breathScale;
      const wispBaseAngle = angle / 7;
      for (let i = 0; i < 4; i++) {
        const wispAngle = wispBaseAngle + i * (Math.PI / 2);
        const wx = x + Math.cos(wispAngle) * wispDist;
        const wy = y + Math.sin(wispAngle) * wispDist;
        // Small filled ellipse wisp (width=8, height=3)
        g.ellipse(wx, wy, 8, 3)
          .fill({ color: 0xddd6fe, alpha: 0.18 });
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
