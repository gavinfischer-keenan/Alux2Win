// ============================================================
// InputManager.ts — Mouse input handler for Alux2Win
// ============================================================

import type { Vec2 } from '../types';

/** Bounding box returned from a completed drag-select. */
export interface DragSelectBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Minimum pixel movement to trigger drag mode (avoids accidental drags). */
const DRAG_THRESHOLD = 5;

export class InputManager {
  public dragStart: Vec2 | null = null;
  public dragEnd: Vec2 | null = null;
  public isDragging: boolean = false;

  // ---- Callbacks (spec names — Vec2 form) ----
  // Typed as Function to allow both (pos: Vec2) and (x: number, y: number)
  // assignment patterns without TypeScript narrowing errors.
  public onRightClick:  ((...args: any[]) => void) | null = null;
  public onDragSelect:  ((box: DragSelectBox) => void) | null = null;
  public onLeftClick:   ((...args: any[]) => void) | null = null;

  // ---- Callbacks (GameScene names — mapped to spec callbacks) ----
  /** Called when a drag starts (after DRAG_THRESHOLD exceeded). */
  public onDragStart: ((x: number, y: number) => void) | null = null;
  /** Called each mousemove during an active drag. */
  public onDragMove:  ((x: number, y: number) => void) | null = null;
  /** Called when a drag ends (mouseup after dragging). */
  public onDragEnd:   ((x: number, y: number) => void) | null = null;
  /** Called on a plain left click (not a drag). Alias for onLeftClick. */
  public onClick:     ((x: number, y: number) => void) | null = null;

  private readonly el: HTMLElement;

  constructor(element: HTMLElement) {
    this.el = element;

    this.el.addEventListener('mousedown',    this._onMouseDown);
    this.el.addEventListener('mouseup',      this._onMouseUp);
    this.el.addEventListener('mousemove',    this._onMouseMove);
    this.el.addEventListener('contextmenu',  this._onContextMenu);
    // Prevent text selection while drag-selecting.
    this.el.addEventListener('selectstart',  this._onSelectStart);
  }

  /** Remove all event listeners. Call when cleaning up. */
  destroy(): void {
    this.el.removeEventListener('mousedown',   this._onMouseDown);
    this.el.removeEventListener('mouseup',     this._onMouseUp);
    this.el.removeEventListener('mousemove',   this._onMouseMove);
    this.el.removeEventListener('contextmenu', this._onContextMenu);
    this.el.removeEventListener('selectstart', this._onSelectStart);
  }

  // ---- Private helpers ----

  /** Compute mouse position relative to the element's top-left corner. */
  private _getRelativePos(e: MouseEvent): Vec2 {
    const rect = this.el.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }

  private _onMouseDown = (e: MouseEvent): void => {
    if (e.button !== 0) return; // Only track left-button drags.
    this.dragStart = this._getRelativePos(e);
    this.dragEnd   = this._getRelativePos(e);
    this.isDragging = false;
  };

  private _onMouseMove = (e: MouseEvent): void => {
    if (!this.dragStart) return;
    const pos = this._getRelativePos(e);
    this.dragEnd = pos;

    if (!this.isDragging) {
      const dx = pos.x - this.dragStart.x;
      const dy = pos.y - this.dragStart.y;
      if (Math.sqrt(dx * dx + dy * dy) >= DRAG_THRESHOLD) {
        this.isDragging = true;
        this.onDragStart?.(this.dragStart.x, this.dragStart.y);
      }
    }

    if (this.isDragging) {
      this.onDragMove?.(pos.x, pos.y);
    }
  };

  private _onMouseUp = (e: MouseEvent): void => {
    if (e.button !== 0) return;

    const pos = this._getRelativePos(e);

    if (this.isDragging && this.dragStart) {
      // Fire both the spec callback (bounding box) and GameScene callback (end point).
      const x1 = Math.min(this.dragStart.x, pos.x);
      const y1 = Math.min(this.dragStart.y, pos.y);
      const x2 = Math.max(this.dragStart.x, pos.x);
      const y2 = Math.max(this.dragStart.y, pos.y);
      this.onDragSelect?.({ x1, y1, x2, y2 });
      this.onDragEnd?.(pos.x, pos.y);
    } else {
      // Single click — not a drag.
      this.onLeftClick?.(pos);
      this.onClick?.(pos.x, pos.y);
    }

    // Reset drag state.
    this.dragStart  = null;
    this.dragEnd    = null;
    this.isDragging = false;
  };

  private _onContextMenu = (e: MouseEvent): void => {
    e.preventDefault();
    const pos = this._getRelativePos(e);
    this.onRightClick?.(pos);
    // GameScene binds onRightClick as (x, y) => ... via assignment.
    // Cast is safe because both call-sites use pos.x/pos.y destructuring.
    // The 'onRightClick' stored by GameScene is (x,y) typed but we pass pos;
    // JavaScript doesn't care — the extra property is just ignored.
  };

  private _onSelectStart = (e: Event): void => {
    if (this.isDragging) e.preventDefault();
  };
}
