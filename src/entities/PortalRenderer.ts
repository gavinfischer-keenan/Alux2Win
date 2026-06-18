// ============================================================
// PortalRenderer.ts - Portal visual entity for LUX
// ============================================================
//
// Renders all active portals each frame using PixiJS v8's Graphics
// builder API.  Each portal gets:
//   - An outer glow circle
//   - A mid-ring fill
//   - A bright inner core
//   - A swirling ring of 8 dots (rotating with pulseAngle)
//   - An outer stroke ring
//   - A counter-rotating inner ring of 5 dots
//
// Paired portals share the same color so players can identify pairs
// at a glance.
// ============================================================

import { Container, Graphics } from 'pixi.js';
import type { PortalData } from '../types';

export class PortalRenderer {
  /** Single re-used Graphics object; cleared and redrawn every frame. */
  private readonly graphics: Graphics;

  /**
   * @param layer  The world-space Container to add the Graphics object to.
   *               This should sit above planets but below UI.
   */
  constructor(layer: Container) {
    this.graphics = new Graphics();
    layer.addChild(this.graphics);
  }

  /**
   * Clear and redraw all portal visuals for the current frame.
   * Call this once per render tick, passing the current state.portals array.
   */
  render(portals: PortalData[]): void {
    const g = this.graphics;
    g.clear();

    for (const portal of portals) {
      const { x, y, color, pulseAngle } = portal;

      // -- Layer 1: Outer glow (very transparent) ----------------
      g.circle(x, y, 40).fill({ color, alpha: 0.08 });

      // -- Layer 2: Mid ring fill --------------------------------
      g.circle(x, y, 32).fill({ color, alpha: 0.15 });

      // -- Layer 3: Bright inner core ---------------------------
      g.circle(x, y, 20).fill({ color: 0xffffff, alpha: 0.4 });

      // -- Layer 4: Outer stroke ring ---------------------------
      g.circle(x, y, 40).stroke({ color, width: 2, alpha: 0.6 });

      // -- Layer 5: Swirling ring of 8 dots (radius 28) ---------
      //    Rotates forward with pulseAngle.
      for (let i = 0; i < 8; i++) {
        const dotAngle = pulseAngle + (i * Math.PI) / 4;
        const cx = x + Math.cos(dotAngle) * 28;
        const cy = y + Math.sin(dotAngle) * 28;
        g.circle(cx, cy, 3).fill({ color, alpha: 0.8 });
      }

      // -- Layer 6: Counter-rotating inner ring of 5 dots (radius 15) --
      //    Rotates backward at 1.5× speed for the vortex contrast effect.
      const innerAngle = -pulseAngle * 1.5;
      for (let i = 0; i < 5; i++) {
        const dotAngle = innerAngle + (i * Math.PI * 2) / 5;
        const cx = x + Math.cos(dotAngle) * 15;
        const cy = y + Math.sin(dotAngle) * 15;
        g.circle(cx, cy, 2.5).fill({ color: 0xffffff, alpha: 0.7 });
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
