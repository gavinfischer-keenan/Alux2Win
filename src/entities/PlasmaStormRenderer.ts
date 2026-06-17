// ============================================================
// PlasmaStormRenderer.ts - Plasma storm visual entity for Alux2Win
// ============================================================
//
// Renders all active plasma storms each frame using PixiJS v8's
// Graphics builder API.  Each storm gets three concentric ellipse
// layers (outer glow, mid, core) plus an animated inner-ellipse
// offset driven by storm.angle to suggest swirling plasma motion.
// ============================================================

import { Container, Graphics } from 'pixi.js';
import type { PlasmaStormData } from '../types';

// -- Palette -------------------------------------------------------------------

/** Outer glow layer - dark purple, very transparent. */
const COLOR_OUTER  = 0x7c3aed;
const ALPHA_OUTER  = 0.08;

/** Mid layer - bright purple, semi-transparent. */
const COLOR_MID    = 0xa855f7;
const ALPHA_MID    = 0.15;

/** Core/inner layer - light lavender, most opaque of the fills. */
const COLOR_CORE   = 0xd8b4fe;
const ALPHA_CORE   = 0.25;

/** Stroke on the outer edge. */
const COLOR_STROKE = 0xc084fc;
const ALPHA_STROKE = 0.4;
const WIDTH_STROKE = 1.5;

/** How far the inner ellipse drifts to simulate swirling plasma. */
const SWIRL_OFFSET = 5;

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

      // Swirl offsets: shift the core ellipse slightly in a direction driven
      // by the slowly incrementing angle, giving an organic rotation illusion.
      const swirlX = Math.cos(angle) * SWIRL_OFFSET;
      const swirlY = Math.sin(angle) * SWIRL_OFFSET;

      // -- Layer 1: Outer glow (scaled 1.2-) --------------------
      g.ellipse(x, y, radiusX * 1.2, radiusY * 1.2)
        .fill({ color: COLOR_OUTER, alpha: ALPHA_OUTER });

      // -- Outer stroke on the same ellipse ---------------------
      g.ellipse(x, y, radiusX * 1.2, radiusY * 1.2)
        .stroke({ color: COLOR_STROKE, width: WIDTH_STROKE, alpha: ALPHA_STROKE });

      // -- Layer 2: Mid layer (1.0-) -----------------------------
      g.ellipse(x, y, radiusX, radiusY)
        .fill({ color: COLOR_MID, alpha: ALPHA_MID });

      // -- Layer 3: Core/inner ellipse (0.6-, offset for swirl) --
      g.ellipse(
        x + swirlX,
        y + swirlY,
        radiusX * 0.6,
        radiusY * 0.6,
      ).fill({ color: COLOR_CORE, alpha: ALPHA_CORE });
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
