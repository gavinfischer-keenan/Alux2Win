// ============================================================
// GammaRayRenderer.ts — LUX
// Renders the gamma-ray warning trail and active beam sweep
// using PixiJS v8 Graphics API (stroke-based, no lineStyle).
//
// Warning trail is RED (not amber) and has two phases:
//   First 30 s: very subtle / barely visible (gentle hint)
//   Last 30 s:  ramps up to near-full intensity with urgency
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
   * Warning trail phase — shown from T-60 s until the beam fires.
   *
   * Two-phase opacity:
   *   T-60 → T-30  (phase 0): extremely faint — just a whisper of red.
   *   T-30 → T-0   (phase 1): ramps up quickly to near-full intensity.
   *
   * Colors shifted to red/crimson to match the danger aesthetic.
   */
  private _drawWarningTrail(g: Graphics, gammaRay: GammaRayState): void {
    const path = gammaRay.path!;

    // How far into the 30-second "final countdown" window are we?
    // urgency = 0 when path first appears (timer ≈ 60), 1 just before firing.
    const urgency = Math.max(0, Math.min(1, 1 - gammaRay.timer / 30));

    // Slow pulse for the "alive" feel.
    const pulse = Math.sin(Date.now() * 0.003) * 0.025;

    // Phase A (first 30 s): timer > 30  → urgency = 0 (timer of 30+ maps to urgency 0)
    // Phase B (last 30 s):  timer 0-30  → urgency 0→1
    //
    // Outer glow alpha:
    //   Phase A: 0.012 + small pulse (extremely faint)
    //   Phase B: ramp from 0.012 → 0.28
    const outerAlpha = Math.max(0, gammaRay.timer > 30
      ? 0.012 + pulse * 0.5          // phase A: whisper
      : 0.012 + urgency * 0.27 + pulse); // phase B: build

    // Bright core alpha: much more visible, but still faint in phase A.
    const coreAlpha = Math.max(0, gammaRay.timer > 30
      ? 0.018 + pulse
      : 0.018 + urgency * 0.52 + pulse);

    // ── Outer glow (wide, blood-red) ───────────────────────
    g.moveTo(path.x1, path.y1)
      .lineTo(path.x2, path.y2)
      .stroke({ color: 0xcc1100, width: path.width, alpha: outerAlpha });

    // ── Mid glow (narrower, brighter crimson) ───────────────
    const midAlpha = Math.max(0, gammaRay.timer > 30
      ? 0.014 + pulse * 0.6
      : 0.014 + urgency * 0.38 + pulse);
    g.moveTo(path.x1, path.y1)
      .lineTo(path.x2, path.y2)
      .stroke({ color: 0xff2200, width: path.width * 0.45, alpha: midAlpha });

    // ── Bright beam core (narrow, hot orange-red) ────────────
    g.moveTo(path.x1, path.y1)
      .lineTo(path.x2, path.y2)
      .stroke({ color: 0xff6030, width: path.width * 0.09, alpha: Math.min(1, coreAlpha) });
  }

  /**
   * Firing phase: the beam sweeps from (x1,y1) toward (x2,y2) over 3 s.
   * Draws three overlapping strokes (outer glow, mid glow, core) in red/white
   * plus edge distortion strokes, beam flicker, afterimage fade, and an
   * impact bloom at the terminus.
   */
  private _drawFiringBeam(g: Graphics, gammaRay: GammaRayState): void {
    const path = gammaRay.path!;
    const progress = Math.max(0, Math.min(1, gammaRay.fireProgress));

    // Current front position of the sweeping beam.
    const frontX = path.x1 + (path.x2 - path.x1) * progress;
    const frontY = path.y1 + (path.y2 - path.y1) * progress;

    if (progress <= 0) return;

    // Beam flicker multiplier — small random variation each frame.
    const flicker = 0.85 + Math.random() * 0.15;

    // Afterimage fade: when beam is almost done, fade quickly.
    const afterimage = progress > 0.95 ? (1 - progress) * 20 : 1.0;

    // Combined alpha scale.
    const alphaScale = flicker * afterimage;

    // -- Perpendicular direction for edge distortion ----------------------
    // Beam direction vector (normalised).
    const bdx = frontX - path.x1;
    const bdy = frontY - path.y1;
    const bLen = Math.sqrt(bdx * bdx + bdy * bdy) || 1;
    // Perpendicular unit vector.
    const perpX = -bdy / bLen;
    const perpY =  bdx / bLen;

    // ── Edge distortion: 6 thin writhing strokes laterally offset ─────
    for (let i = 0; i < 6; i++) {
      const lateralOffset = Math.sin(progress * 20 + i) * 12;
      const ox = perpX * lateralOffset;
      const oy = perpY * lateralOffset;
      g.moveTo(path.x1 + ox, path.y1 + oy)
        .lineTo(frontX + ox, frontY + oy)
        .stroke({ color: 0xff3300, width: 8, alpha: 0.15 * alphaScale });
    }

    // ── Layer 1: wide outer glow (dark red) ────────────────────────────
    g.moveTo(path.x1, path.y1)
      .lineTo(frontX, frontY)
      .stroke({ color: 0xcc1100, width: path.width, alpha: 0.38 * alphaScale });

    // ── Layer 2: bright mid glow (vivid red) ───────────────────────────
    g.moveTo(path.x1, path.y1)
      .lineTo(frontX, frontY)
      .stroke({ color: 0xff3300, width: path.width * 0.4, alpha: 0.65 * alphaScale });

    // ── Layer 3: searing white-hot core ────────────────────────────────
    g.moveTo(path.x1, path.y1)
      .lineTo(frontX, frontY)
      .stroke({ color: 0xffffff, width: path.width * 0.15, alpha: 0.95 * alphaScale });

    // ── Leading-edge pulse circle ──────────────────────────────────────
    g.circle(frontX, frontY, path.width * 0.6)
      .fill({ color: 0xff4422, alpha: 0.35 * alphaScale });

    // ── Bright core pulse ──────────────────────────────────────────────
    g.circle(frontX, frontY, path.width * 0.2)
      .fill({ color: 0xffffff, alpha: 0.55 * alphaScale });

    // ── Impact bloom at terminus: 3 concentric expanding rings ─────────
    g.circle(frontX, frontY, path.width * (0.5 + progress * 0.4))
      .fill({ color: 0xff4400, alpha: 0.5 * alphaScale });
    g.circle(frontX, frontY, path.width * 0.8)
      .fill({ color: 0xff4400, alpha: 0.3 * alphaScale });
    g.circle(frontX, frontY, path.width * 1.1)
      .fill({ color: 0xff4400, alpha: 0.12 * alphaScale });
  }
}
