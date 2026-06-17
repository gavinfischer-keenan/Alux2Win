// ============================================================
// AsteroidEntity.ts — PixiJS v8 asteroid visual renderer
// ============================================================
//
// AsteroidRenderer owns a single Graphics object that is cleared
// and redrawn every frame for all alive asteroids.
//
// Visual layers per asteroid (back → front):
//   1. Danger glow   — red radial halo that grows with hitCount
//   2. Rocky body    — irregular 8-sided polygon, grey-brown tones
//   3. Stroke rim    — lighter grey edge outline
//   4. Glowing core  — small warm-yellow circle
//
// The "rocky" silhouette is produced by modulating each vertex's
// radius with a fixed sinusoidal offset seeded by vertex index and
// a constant derived from the asteroid's numeric ID suffix.  This
// makes the shape stable across frames (no noise per-tick jitter)
// while still looking unique per asteroid.
// ============================================================

import { Container, Graphics } from 'pixi.js';
import type { AsteroidData } from '../types';

/** Number of vertices in the asteroid polygon. */
const SIDES = 8;

/** Maximum cumulative hits used for the danger-tint calculation. */
const MAX_HITS = 20;

/**
 * Derive a small stable numeric seed from an asteroid's string id.
 * The id format is "asteroid_<n>"; we parse the trailing number.
 * Falls back to 0 for unexpected formats.
 */
function seedFromId(id: string): number {
  const parts = id.split('_');
  const n = parseInt(parts[parts.length - 1], 10);
  return isNaN(n) ? 0 : n;
}

export class AsteroidRenderer {
  private readonly _graphics: Graphics;

  constructor(layer: Container) {
    this._graphics = new Graphics();
    layer.addChild(this._graphics);
  }

  /**
   * Called every render frame.  Clears and redraws all alive asteroids.
   *
   * @param asteroids The current list of AsteroidData from GameState.
   */
  render(asteroids: AsteroidData[]): void {
    const g = this._graphics;
    g.clear();

    for (const asteroid of asteroids) {
      if (!asteroid.alive) continue;
      this._drawAsteroid(g, asteroid);
    }
  }

  destroy(): void {
    this._graphics.destroy();
  }

  // ── Private drawing helpers ──────────────────────────────────

  private _drawAsteroid(g: Graphics, asteroid: AsteroidData): void {
    const { x, y, radius, angle, hitCount, id } = asteroid;

    // ── 1. Danger glow (red halo behind the rock) ─────────────
    const dangerT = Math.min(hitCount / MAX_HITS, 1);
    if (dangerT > 0) {
      g.circle(x, y, radius * 1.4)
       .fill({ color: 0xef4444, alpha: dangerT * 0.35 });
    }

    // ── 2. Rocky polygon ──────────────────────────────────────
    //
    // Build 8 irregular vertices around (x, y) rotated by `angle`.
    // Each vertex's radius is perturbed using a fixed sinusoidal
    // function of its index and the asteroid's seed — same values
    // every frame, so the shape is stable while still looking rough.
    const seed   = seedFromId(id);
    const points: number[] = [];

    for (let i = 0; i < SIDES; i++) {
      const baseAngle = (i / SIDES) * Math.PI * 2 + angle;
      // Stable per-vertex perturbation: varies 0.7 → 1.0 of radius.
      const perturbation = 0.7 + 0.3 * Math.abs(Math.sin(i * 2.3 + seed * 0.7 + 1.1));
      const r = radius * perturbation;
      points.push(
        x + Math.cos(baseAngle) * r,
        y + Math.sin(baseAngle) * r,
      );
    }

    // Fill — darker grey-brown tinted slightly redder under damage.
    // Interpolate from 0x9ca3af (slate-grey) toward 0xb07070 (warm-red).
    const fillR = Math.round(0x9c + (0xb0 - 0x9c) * dangerT);
    const fillG = Math.round(0xa3 + (0x70 - 0xa3) * dangerT);
    const fillB = Math.round(0xaf + (0x70 - 0xaf) * dangerT);
    const fillColor = (fillR << 16) | (fillG << 8) | fillB;

    g.poly(points).fill({ color: fillColor, alpha: 1 });

    // ── 3. Stroke rim — lighter edge ─────────────────────────
    g.poly(points).stroke({ color: 0xd1d5db, width: 1.5, alpha: 0.55 });

    // ── 4. Warm core glow ─────────────────────────────────────
    // A subtle amber circle at the asteroid centre.
    g.circle(x, y, radius * 0.28)
     .fill({ color: 0xfbbf24, alpha: 0.18 });

    // ── 5. Crack detail lines (subtle, only when damaged) ─────
    // Two short lines emanating from the centre for flavour.
    if (dangerT > 0.25) {
      const crackAlpha = (dangerT - 0.25) * 0.6;
      const crackLen   = radius * 0.65;

      // First crack — angled to the upper-right of the asteroid.
      const crack1Angle = angle + Math.PI * 0.15;
      g.moveTo(x, y)
       .lineTo(
         x + Math.cos(crack1Angle) * crackLen,
         y + Math.sin(crack1Angle) * crackLen,
       )
       .stroke({ color: 0x111827, width: 1, alpha: crackAlpha });

      // Second crack — angled toward the lower-left.
      const crack2Angle = angle + Math.PI * 0.85;
      g.moveTo(x, y)
       .lineTo(
         x + Math.cos(crack2Angle) * crackLen,
         y + Math.sin(crack2Angle) * crackLen,
       )
       .stroke({ color: 0x111827, width: 1, alpha: crackAlpha });
    }
  }
}
