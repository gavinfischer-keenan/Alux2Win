// ============================================================
// GammaRayRenderer.ts — Alux2Win
// Renders the gamma-ray warning trail and active beam sweep
// using PixiJS v8 Graphics API (stroke-based, no lineStyle).
// ============================================================

import { Container, Graphics } from 'pixi.js';
import type { GammaRayState } from '../types';

export class GammaRayRenderer {
  private graphics: Graphics;

  constructor(layer: Container) {
    this.graphics = new Graphics();
    layer.addChild(this.graphics);
  }

  // ── Public API ─────────────────────────────────────────────

  render(gammaRay: GammaRayState): void {
    const g = this.graphics;
    g.clear();

    // Nothing to draw if the system is off or no path has been chosen yet.
    if (!gammaRay.enabled || gammaRay.path === null) return;

    const path = gammaRay.path;

    if (gammaRay.firing) {
      this._drawFiringBeam(g, gammaRay);
    } else {
      this._drawWarningTrail(g, gammaRay);
    }
  }

  destroy(): void {
    this.graphics.destroy();
  }

  // ── Private drawing helpers ────────────────────────────────

  /**
   * Warning trail phase: shown from T-60 s until the beam fires.
   * Fades in from very faint to quite visible as the timer approaches 0.
   * A gentle sine pulse adds a subtle "alive" feel.
   */
  private _drawWarningTrail(g: Graphics, gammaRay: GammaRayState): void {
    const path = gammaRay.path!;

    // t = 0 at the start of the warning window, 1 just before firing.
    const t = Math.max(0, Math.min(1, 1 - gammaRay.timer / 60));

    // Pulse — a slow sine oscillation that shifts alpha slightly.
    const pulse = Math.sin(Date.now() * 0.003) * 0.03;

    const trailAlpha = 0.03 + t * 0.22 + pulse;

    // ── Outer glow (wide, faint amber) ─────────────────────────
    g.moveTo(path.x1, path.y1)
      .lineTo(path.x2, path.y2)
      .stroke({ color: 0xfde68a, width: path.width, alpha: Math.max(0, trailAlpha) });

    // ── Bright beam core (narrow, much more opaque) ─────────────
    const coreAlpha = Math.min(1, trailAlpha * 3);
    g.moveTo(path.x1, path.y1)
      .lineTo(path.x2, path.y2)
      .stroke({ color: 0xfef3c7, width: path.width * 0.1, alpha: Math.max(0, coreAlpha) });
  }

  /**
   * Firing phase: the beam sweeps from (x1,y1) toward (x2,y2) over 3 s.
   * Draws three overlapping strokes (outer glow, mid glow, core) plus a
   * circular pulse at the leading edge.
   */
  private _drawFiringBeam(g: Graphics, gammaRay: GammaRayState): void {
    const path = gammaRay.path!;
    const progress = Math.max(0, Math.min(1, gammaRay.fireProgress));

    // Current front position of the sweeping beam.
    const frontX = path.x1 + (path.x2 - path.x1) * progress;
    const frontY = path.y1 + (path.y2 - path.y1) * progress;

    // Only draw if the beam has actually started moving.
    if (progress <= 0) return;

    // ── Layer 1: wide outer glow (amber) ───────────────────────
    g.moveTo(path.x1, path.y1)
      .lineTo(frontX, frontY)
      .stroke({ color: 0xfde68a, width: path.width, alpha: 0.35 });

    // ── Layer 2: bright mid glow (pale yellow) ─────────────────
    g.moveTo(path.x1, path.y1)
      .lineTo(frontX, frontY)
      .stroke({ color: 0xfef9c3, width: path.width * 0.4, alpha: 0.6 });

    // ── Layer 3: searing white core ────────────────────────────
    g.moveTo(path.x1, path.y1)
      .lineTo(frontX, frontY)
      .stroke({ color: 0xffffff, width: path.width * 0.15, alpha: 0.95 });

    // ── Leading-edge pulse circle ──────────────────────────────
    g.circle(frontX, frontY, path.width * 0.6)
      .fill({ color: 0xffffff, alpha: 0.3 });
  }
}
