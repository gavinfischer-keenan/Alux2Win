// ============================================================
// SpeedZoneRenderer.ts - Speed zone visual entity for Alux2Win
// ============================================================
//
// Renders all active speed zones each frame using PixiJS v8's
// Graphics builder API.  A single Graphics object is cleared
// and redrawn every frame.
//
// Visual design:
//   Speed-up zones → dim swirling GREEN fog
//   Slow-down zones → dim swirling RED fog
//
// Each zone gets three concentric circle fills (outer glow, mid,
// core) plus six animated swirl dots at radius*0.7 from centre,
// rotated by zone.pulseAngle, and a subtle stroke on the rim.
// ============================================================

import { Container, Graphics } from 'pixi.js';
import type { SpeedZoneData } from '../types';

// -- Speedup palette -----------------------------------------------------------
const SPEEDUP_OUTER  = 0x22c55e;
const SPEEDUP_MID    = 0x4ade80;
const SPEEDUP_CORE   = 0x86efac;
const SPEEDUP_SWIRL  = 0x4ade80;
const SPEEDUP_STROKE = 0x22c55e;

// -- Slowdown palette ----------------------------------------------------------
const SLOWDOWN_OUTER  = 0xef4444;
const SLOWDOWN_MID    = 0xf87171;
const SLOWDOWN_CORE   = 0xfca5a5;
const SLOWDOWN_SWIRL  = 0xf87171;
const SLOWDOWN_STROKE = 0xef4444;

// -- Swirl constants -----------------------------------------------------------
/** Number of small orbiting dots that form the swirl ring. */
const SWIRL_COUNT  = 6;
/** Radius of each individual swirl dot. */
const SWIRL_DOT_R  = 4;
/** Angular spread step between consecutive swirl dots. */
const SWIRL_STEP   = (Math.PI * 2) / SWIRL_COUNT;

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
      const cOuter  = isSpeedup ? SPEEDUP_OUTER  : SLOWDOWN_OUTER;
      const cMid    = isSpeedup ? SPEEDUP_MID    : SLOWDOWN_MID;
      const cCore   = isSpeedup ? SPEEDUP_CORE   : SLOWDOWN_CORE;
      const cSwirl  = isSpeedup ? SPEEDUP_SWIRL  : SLOWDOWN_SWIRL;
      const cStroke = isSpeedup ? SPEEDUP_STROKE : SLOWDOWN_STROKE;

      // -- Layer 1: Outer glow (full radius, very faint) --------
      g.circle(x, y, radius)
        .fill({ color: cOuter, alpha: 0.04 });

      // -- Layer 2: Mid ring (80% radius) -----------------------
      g.circle(x, y, radius * 0.8)
        .fill({ color: cMid, alpha: 0.07 });

      // -- Layer 3: Inner core (50% radius) ---------------------
      g.circle(x, y, radius * 0.5)
        .fill({ color: cCore, alpha: 0.10 });

      // -- Layer 4: Animated swirl dots -------------------------
      // Six small circles in a ring at radius*0.7, offset by pulseAngle.
      const swirlRingR = radius * 0.7;
      for (let i = 0; i < SWIRL_COUNT; i++) {
        const angle  = pulseAngle + i * SWIRL_STEP;
        const dotX   = x + Math.cos(angle) * swirlRingR;
        const dotY   = y + Math.sin(angle) * swirlRingR;
        g.circle(dotX, dotY, SWIRL_DOT_R)
          .fill({ color: cSwirl, alpha: 0.35 });
      }

      // -- Stroke: outer boundary ring --------------------------
      g.circle(x, y, radius)
        .stroke({ color: cStroke, width: 1.5, alpha: 0.25 });
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
