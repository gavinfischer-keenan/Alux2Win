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
      const { x, y, radius, type, pulseAngle, width, height } = zone;
      const hw = width ?? radius;
      const hh = height ?? radius;

      // Choose colour palette based on zone type.
      const isSpeedup = type === 'speedup';
      const cOuter = isSpeedup ? SPEEDUP_OUTER : SLOWDOWN_OUTER;
      const cCore  = isSpeedup ? SPEEDUP_CORE  : SLOWDOWN_CORE;

      // -- Box Background -----------------------------------------------
      g.rect(x - hw, y - hh, hw * 2, hh * 2)
        .fill({ color: cOuter, alpha: 0.15 })
        .stroke({ color: cCore, width: 2, alpha: 0.6 });

      // -- Wavy Lines (flowing horizontal) -----------------------------
      const numLines = 6;
      const spacing = (hh * 2) / numLines;
      const amplitude = hh * 0.08;
      const frequency = 0.05;
      
      // Speed up zones flow faster and rightwards, slow down flow slower and leftwards
      const flowSpeed = isSpeedup ? 8.0 : -2.0; 
      const phaseOffset = pulseAngle * flowSpeed;

      for (let i = 0; i < numLines; i++) {
        const lineY = (y - hh) + spacing * (i + 0.5);
        const startX = x - hw;
        
        g.moveTo(startX, lineY + Math.sin(phaseOffset + startX * frequency) * amplitude);
        
        // draw smooth wave across the box
        const segments = 15;
        const segmentWidth = (hw * 2) / segments;
        for (let j = 1; j <= segments; j++) {
          const px = startX + j * segmentWidth;
          const py = lineY + Math.sin(phaseOffset + px * frequency) * amplitude;
          g.lineTo(px, py);
        }
        g.stroke({ color: cCore, width: 2.5, alpha: 0.4 });
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
