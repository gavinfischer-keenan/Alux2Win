// ============================================================
// BlackHole.ts — Black hole visual entity for LUX
// ============================================================

import { Container, Graphics } from 'pixi.js';
import type { BlackHoleData } from '../types';

/** Number of swirl dots orbiting the core. */
const SWIRL_DOT_COUNT = 12;

export class BlackHoleEntity {
  public data: BlackHoleData;

  private readonly graphics: Graphics;
  private angle: number;

  constructor(data: BlackHoleData, layer: Container) {
    this.data  = data;
    this.angle = 0;

    this.graphics = new Graphics();
    this.graphics.x = data.x;
    this.graphics.y = data.y;
    layer.addChild(this.graphics);

    this._redraw();
  }

  /**
   * Called by GameScene render loop with current BlackHoleData.
   * Syncs data (position may change if BH ever moves) and redraws.
   */
  render(data: BlackHoleData): void {
    this.data = data;
    this.graphics.x = data.x;
    this.graphics.y = data.y;
    this._redraw();
  }

  /**
   * Advance the swirl rotation and redraw.
   * @param dt - Elapsed time in seconds.
   */
  update(dt: number): void {
    // Rotate at ~0.6 rad/sec.
    this.angle += dt * 0.6;
    this._redraw();
  }

  destroy(): void {
    this.graphics.destroy();
  }

  // ---- Private ----

  private _redraw(): void {
    const g = this.graphics;
    const r = this.data.radius;
    g.clear();

    // ---- Outer faint purple influence ring ----
    g.circle(0, 0, this.data.pullRadius)
      .stroke({ color: 0x3a006f, alpha: 0.12, width: 1.5 });

    // ---- Accretion disk rings (concentric, decreasing alpha) ----
    const ringColors = [0x1a0033, 0x2e0057, 0x44008a, 0x5500aa];
    for (let i = 0; i < ringColors.length; i++) {
      const ringR = r * (3.5 - i * 0.6);
      const alpha = 0.18 + i * 0.12;
      g.circle(0, 0, ringR)
        .stroke({ color: ringColors[i], alpha, width: 2 - i * 0.3 });
    }

    // ---- Semi-transparent disk fill (dark purple) ----
    g.circle(0, 0, r * 2.5)
      .fill({ color: 0x0d0020, alpha: 0.55 });

    // ---- Event horizon (near-black core) ----
    g.circle(0, 0, r)
      .fill({ color: 0x050008, alpha: 1 });

    // ---- Rotating swirl dots ----
    for (let i = 0; i < SWIRL_DOT_COUNT; i++) {
      // Two spiral arms — offset by π.
      const armOffset = (i % 2) * Math.PI;
      // Distance from centre oscillates with index to form a spiral.
      const t = i / SWIRL_DOT_COUNT;
      const swirlR = r * (1.4 + t * 1.8);
      const swirlA = this.angle + t * Math.PI * 3 + armOffset;
      const sx = Math.cos(swirlA) * swirlR;
      const sy = Math.sin(swirlA) * swirlR;
      const dotAlpha = 0.6 * (1 - t) + 0.1;

      g.circle(sx, sy, 1.5)
        .fill({ color: 0x9b59f7, alpha: dotAlpha });
    }

    // ---- Inner glow (dim violet) ----
    g.circle(0, 0, r * 1.3)
      .fill({ color: 0x3d0080, alpha: 0.25 });
  }
}
