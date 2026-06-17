// ============================================================
// SelectionBox.ts — Drag-select rectangle visual for Alux2Win
// ============================================================

import { Container, Graphics } from 'pixi.js';

export class SelectionBoxEntity {
  private readonly graphics: Graphics;

  constructor(layer: Container) {
    this.graphics = new Graphics();
    layer.addChild(this.graphics);
  }

  /**
   * Draw a drag-select box from (x1,y1) to (x2,y2).
   * Coordinates should already be normalised (x1 ≤ x2, y1 ≤ y2).
   */
  draw(x1: number, y1: number, x2: number, y2: number): void {
    const g = this.graphics;
    g.clear();

    const w = x2 - x1;
    const h = y2 - y1;
    if (w < 1 || h < 1) return;

    // ---- Semi-transparent fill ----
    g.rect(x1, y1, w, h)
      .fill({ color: 0xffffff, alpha: 0.06 });

    // ---- Solid border ----
    g.rect(x1, y1, w, h)
      .stroke({ color: 0xffffff, alpha: 0.7, width: 1 });

    // ---- Corner accents (small bright corner ticks) ----
    const tickLen = Math.min(10, w * 0.2, h * 0.2);
    const ca = 0.95;
    const cw = 1.5;

    // Top-left
    g.moveTo(x1, y1 + tickLen).lineTo(x1, y1).lineTo(x1 + tickLen, y1)
      .stroke({ color: 0xffffff, alpha: ca, width: cw });

    // Top-right
    g.moveTo(x2 - tickLen, y1).lineTo(x2, y1).lineTo(x2, y1 + tickLen)
      .stroke({ color: 0xffffff, alpha: ca, width: cw });

    // Bottom-left
    g.moveTo(x1, y2 - tickLen).lineTo(x1, y2).lineTo(x1 + tickLen, y2)
      .stroke({ color: 0xffffff, alpha: ca, width: cw });

    // Bottom-right
    g.moveTo(x2 - tickLen, y2).lineTo(x2, y2).lineTo(x2, y2 - tickLen)
      .stroke({ color: 0xffffff, alpha: ca, width: cw });
  }

  /** Remove the selection box from view. */
  clear(): void {
    this.graphics.clear();
  }

  destroy(): void {
    this.graphics.destroy();
  }
}
