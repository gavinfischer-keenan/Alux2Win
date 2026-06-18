// ============================================================
// SpeedZoneRenderer.ts - Speed zone visual entity for LUX
// ============================================================
//
// Renders all active speed zones each frame using PixiJS v8's
// Graphics builder API.  A single Graphics object is cleared
// and redrawn every frame.
//
// Visual design:
//   Speed-up zones → soft teal nebula blob
//   Slow-down zones → soft amber nebula blob
//
// Each zone gets 5 concentric circle fills (no dots, no strokes)
// plus 3 wisp tendrils for an organic feel.
// ============================================================

import { Container, Graphics } from 'pixi.js';
import type { SpeedZoneData } from '../types';

// -- Speedup palette -----------------------------------------------------------
const SPEEDUP_OUTER = 0x00bcd4;
const SPEEDUP_CORE  = 0x4dd0e1;

// -- Slowdown palette ----------------------------------------------------------
const SLOWDOWN_OUTER = 0xff6f00;
const SLOWDOWN_CORE  = 0xffb300;

// -- Renderer -----------------------------------------------------------------

export class SpeedZoneRenderer {
  /** Single re-used Graphics object; cleared and redrawn every frame. */
  private readonly graphics: Graphics;

  /**
   * @param layer  The world-space Container to add the Graphics object to.
   *               Typically the plasmaStorms layer (hazard, behind planets).
   */
  constructor(layer: Container) {
    this.graphics = new Graphics();
    layer.addChild(this.graphics);
  }

  /**
   * Clear and redraw all speed zone visuals for the current frame.
   * Call once per render tick, passing state.speedZones.
   */
  render(zones: SpeedZoneData[]): void {
    const g = this.graphics;
    g.clear();

    for (const zone of zones) {
      const { x, y, radius, type, pulseAngle } = zone;

      // Choose colour palette based on zone type.
      const isSpeedup = type === 'speedup';
      const cOuter = isSpeedup ? SPEEDUP_OUTER : SLOWDOWN_OUTER;
      const cCore  = isSpeedup ? SPEEDUP_CORE  : SLOWDOWN_CORE;

      // Breathing scale
      const breath = 1.0 + 0.07 * Math.sin(pulseAngle * 1.1);

      // -- 5 concentric soft nebula layers (no strokes, no dots) --------
      // Layer 1: 1.0x — outermost, very faint
      g.circle(x, y, radius * breath * 1.0)
        .fill({ color: cOuter, alpha: 0.04 });

      // Layer 2: 0.75x
      g.circle(x, y, radius * breath * 0.75)
        .fill({ color: cOuter, alpha: 0.07 });

      // Layer 3: 0.55x
      g.circle(x, y, radius * breath * 0.55)
        .fill({ color: cCore, alpha: 0.11 });

      // Layer 4: 0.35x
      g.circle(x, y, radius * breath * 0.35)
        .fill({ color: cCore, alpha: 0.14 });

      // Layer 5: 0.15x — dense core
      g.circle(x, y, radius * breath * 0.15)
        .fill({ color: cCore, alpha: 0.18 });

      // -- 3 wisp tendrils at 120° apart, rotating slowly ---------------
      const wispBaseAngle = pulseAngle / 10;
      for (let i = 0; i < 3; i++) {
        const wispAngle = wispBaseAngle + i * ((Math.PI * 2) / 3);
        const wispDist  = radius * breath * 0.65;
        const wx = x + Math.cos(wispAngle) * wispDist;
        const wy = y + Math.sin(wispAngle) * wispDist;
        g.ellipse(wx, wy, radius * 0.4, radius * 0.08)
          .fill({ color: cCore, alpha: 0.12 });
      }
    }
  }

  /**
   * Remove the Graphics object from its parent and free GPU resources.
   * Call when unloading the game scene.
   */
  destroy(): void {
    this.graphics.destroy();
  }
}
