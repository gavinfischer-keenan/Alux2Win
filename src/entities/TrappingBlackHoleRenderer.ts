// ============================================================
// TrappingBlackHoleRenderer.ts — PixiJS v8 renderer for trapping black holes
// ============================================================
//
// Renders each TrappingBlackHole with five visual layers:
//   1. Outer gravitational-well fog (large translucent dark circle).
//   2. Four concentric event-horizon rings that darken toward the core.
//   3. Twelve swirling dots orbiting the core, animated by pulseAngle.
//   4. Trapped-particle count ring: coloured faction dots around the BH.
//
// All drawing uses the PixiJS v8 Graphics builder API.
// Pattern modelled on PlasmaStormRenderer (single Graphics, cleared each frame).
// ============================================================

import { Container, Graphics } from 'pixi.js';
import type { TrappingBlackHoleData, ParticleData } from '../types';
import { FACTION_COLORS } from '../types';

// -- Palette ------------------------------------------------------------------

/** Gravitational well background fill color. */
const COLOR_WELL        = 0x000000;
const ALPHA_WELL        = 0.18;

/** Gravitational well outer stroke. */
const COLOR_WELL_STROKE = 0x4b0082;
const ALPHA_WELL_STROKE = 0.4;
const WIDTH_WELL_STROKE = 1;

/** Event horizon ring colors, outermost → innermost. */
const RING_COLORS   = [0x1a0030, 0x0d0020, 0x07001a, 0x000010] as const;
/** Event horizon ring radii (px), outermost → innermost. */
const RING_RADII    = [28, 20, 14, 8] as const;
/** Base alpha for the outermost ring; increases toward the core. */
const RING_BASE_ALPHA = 0.15;
const RING_ALPHA_STEP = 0.12;

/** Swirling dot orbit radius from the BH centre. */
const SWIRL_ORBIT_RADIUS = 22;
/** Number of swirling dots. */
const SWIRL_COUNT        = 12;
/** Radius of each swirling dot. */
const SWIRL_DOT_RADIUS   = 2.5;
/** Color of swirling dots. */
const COLOR_SWIRL        = 0x6600cc;
const ALPHA_SWIRL        = 0.5;

/** Radius of the trapped-particle count ring. */
const TRAPPED_RING_RADIUS = 18;
/** Radius of each trapped-particle dot. */
const TRAPPED_DOT_RADIUS  = 3;
const ALPHA_TRAPPED_DOT   = 0.9;

// -- Renderer -----------------------------------------------------------------

export class TrappingBlackHoleRenderer {
  /** Single re-used Graphics object; cleared and redrawn every frame. */
  private readonly graphics: Graphics;

  /**
   * @param layer  The world-space Container to add the Graphics object to.
   *               Should sit above planets but below UI elements.
   */
  constructor(layer: Container) {
    this.graphics = new Graphics();
    layer.addChild(this.graphics);
  }

  /**
   * Clear and redraw all trapping black hole visuals for the current frame.
   *
   * @param bhs       Array of TrappingBlackHoleData from state.trappingBlackHoles.
   * @param particles Full particle array (used to find trapped particles per BH).
   */
  render(bhs: TrappingBlackHoleData[], particles: ParticleData[]): void {
    const g = this.graphics;
    g.clear();

    for (const bh of bhs) {
      const { x, y, pullRadius, pulseAngle } = bh;

      // ---------------------------------------------------------------- 1.
      // Gravitational well: large dark circle filling the pull radius.
      // ---------------------------------------------------------------- //
      g.circle(x, y, pullRadius)
        .fill({ color: COLOR_WELL, alpha: ALPHA_WELL });

      g.circle(x, y, pullRadius)
        .stroke({ color: COLOR_WELL_STROKE, width: WIDTH_WELL_STROKE, alpha: ALPHA_WELL_STROKE });

      // ---------------------------------------------------------------- 2.
      // Event horizon rings: four concentric fills, darkening inward.
      // ---------------------------------------------------------------- //
      for (let i = 0; i < RING_RADII.length; i++) {
        g.circle(x, y, RING_RADII[i])
          .fill({ color: RING_COLORS[i], alpha: RING_BASE_ALPHA + i * RING_ALPHA_STEP });
      }

      // ---------------------------------------------------------------- 3.
      // Swirling dots: 12 small circles orbiting at radius 22, rotated by pulseAngle.
      // ---------------------------------------------------------------- //
      for (let i = 0; i < SWIRL_COUNT; i++) {
        const angle = (i * Math.PI * 2) / SWIRL_COUNT + pulseAngle;
        const sx    = x + Math.cos(angle) * SWIRL_ORBIT_RADIUS;
        const sy    = y + Math.sin(angle) * SWIRL_ORBIT_RADIUS;

        g.circle(sx, sy, SWIRL_DOT_RADIUS)
          .fill({ color: COLOR_SWIRL, alpha: ALPHA_SWIRL });
      }

      // ---------------------------------------------------------------- 4.
      // Trapped-particle count ring: one coloured dot per trapped particle.
      // ---------------------------------------------------------------- //
      const trapped = particles.filter(
        (p) => p.alive && p.trappedByBH === bh.id,
      );

      if (trapped.length > 0) {
        for (let i = 0; i < trapped.length; i++) {
          const angle   = (i / trapped.length) * Math.PI * 2;
          const dotX    = x + Math.cos(angle) * TRAPPED_RING_RADIUS;
          const dotY    = y + Math.sin(angle) * TRAPPED_RING_RADIUS;
          const color   = FACTION_COLORS[trapped[i].faction];

          g.circle(dotX, dotY, TRAPPED_DOT_RADIUS)
            .fill({ color, alpha: ALPHA_TRAPPED_DOT });
        }
      }
    }
  }

  /**
   * Remove the Graphics from its parent and release GPU resources.
   * Call when unloading the game scene.
   */
  destroy(): void {
    this.graphics.destroy();
  }
}
