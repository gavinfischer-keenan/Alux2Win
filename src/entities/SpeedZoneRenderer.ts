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
  /** Re-used Graphics object for the backgrounds. */
  private readonly graphics: Graphics;
  /** Re-used Graphics object for the wavy lines. */
  private readonly wavesGraphics: Graphics;
  /** Dedicated Graphics object to act as the mask. */
  private readonly maskGraphics: Graphics;

  /**
   * @param layer  The world-space Container to add the Graphics object to.
   *               Typically the plasmaStorms layer (hazard, behind planets).
   */
  constructor(layer: Container) {
    this.graphics = new Graphics();
    this.wavesGraphics = new Graphics();
    this.maskGraphics = new Graphics();
    
    layer.addChild(this.graphics);
    layer.addChild(this.wavesGraphics);
    layer.addChild(this.maskGraphics); // Add to layer so it gets transform updates
    
    // Mask the waves so they stay strictly within the polygon boundaries.
    this.wavesGraphics.mask = this.maskGraphics;
  }

  /**
   * Clear and redraw all speed zone visuals for the current frame.
   * Call once per render tick, passing state.speedZones.
   */
  render(zones: SpeedZoneData[]): void {
    const g = this.graphics;
    const wg = this.wavesGraphics;
    const mg = this.maskGraphics;
    
    g.clear();
    wg.clear();
    mg.clear();

    for (const zone of zones) {
      // Calculate bounding box
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const p of zone.points) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
      const hw = (maxX - minX) / 2;
      const hh = (maxY - minY) / 2;
      const x = minX + hw;
      const y = minY + hh;

      // Choose colour palette based on zone type.
      const isSpeedup = zone.type === 'speedup';
      const cOuter = isSpeedup ? SPEEDUP_OUTER : SLOWDOWN_OUTER;
      const cCore  = isSpeedup ? SPEEDUP_CORE  : SLOWDOWN_CORE;

      // -- Polygon Background -----------------------------------------------
      g.poly(zone.points)
        .fill({ color: cOuter, alpha: 0.15 })
        .stroke({ color: cCore, width: 2, alpha: 0.6 });
        
      // -- Mask -------------------------------------------------------------
      mg.poly(zone.points).fill({ color: 0xffffff });

      // -- Wavy Lines (flowing horizontal) -----------------------------
      const numLines = 6;
      const spacing = (hh * 2) / numLines;
      const amplitude = hh * 0.08;
      const frequency = 0.05;
      
      const flowSpeed = isSpeedup ? 8.0 : -2.0; 
      const phaseOffset = zone.pulseAngle * flowSpeed;

      for (let i = 0; i < numLines; i++) {
        const lineY = (y - hh) + spacing * (i + 0.5);
        const startX = x - hw;
        
        wg.moveTo(startX, lineY + Math.sin(phaseOffset + startX * frequency) * amplitude);
        
        // draw smooth wave across the box
        const segments = 15;
        const segmentWidth = (hw * 2) / segments;
        for (let j = 1; j <= segments; j++) {
          const px = startX + j * segmentWidth;
          const py = lineY + Math.sin(phaseOffset + px * frequency) * amplitude;
          wg.lineTo(px, py);
        }
        wg.stroke({ color: cCore, width: 2.5, alpha: 0.4 });
      }
    }
  }

  /**
   * Remove the Graphics object from its parent and free GPU resources.
   * Call when unloading the game scene.
   */
  destroy(): void {
    this.graphics.destroy();
    this.wavesGraphics.destroy();
    this.maskGraphics.destroy();
  }
}
