// ============================================================
// CameraController.ts — Pan/zoom camera driving PixiJS worldContainer
// ============================================================

import type { Container } from 'pixi.js';

const PAN_SPEED  = 380;   // screen px/sec via keyboard
const ZOOM_RATE  = 1.8;   // zoom factor per second via keyboard hold
const MIN_ZOOM   = 0.4;   // relative to fit scale
const MAX_ZOOM   = 8.0;

// Extra padding (in screen px) the player can pan beyond the world edge
const PAN_PADDING = 200;

export class CameraController {
  private _wc: Container;

  // Baseline fit values from Renderer._fitWorld()
  private _fitX     = 0;
  private _fitY     = 0;
  private _fitScale = 1;

  // World and screen dimensions
  private _worldW  = 2048;
  private _worldH  = 2048;
  private _screenW = 1280;
  private _screenH = 720;

  // Camera state
  private _zoom  = 1.0;
  private _panX  = 0;
  private _panY  = 0;

  // Middle-click / right-click drag state
  private _isDragging    = false;
  private _dragStartX    = 0;
  private _dragStartY    = 0;
  private _dragPanStartX = 0;
  private _dragPanStartY = 0;
  private _dragButton    = -1;

  // Keyboard state
  private _keysDown = new Set<string>();

  // Element for wheel/mouse events
  private _el: HTMLElement | null = null;

  // ── Bound event handlers ──────────────────────────────────

  private readonly _onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    if (!this._el) return;
    const rect   = this._el.getBoundingClientRect();
    const sx     = e.clientX - rect.left;
    const sy     = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    this._applyZoom(factor, sx, sy);
    this._clampPan();
    this._applyTransform();
  };

  private readonly _onMouseDown = (e: MouseEvent): void => {
    // Middle-click, right-click, or alt+left-click all start a pan drag
    const isMiddle   = e.button === 1;
    const isRight    = e.button === 2;
    const isAltLeft  = e.button === 0 && e.altKey;
    if (!isMiddle && !isRight && !isAltLeft) return;
    e.preventDefault();
    e.stopPropagation();
    this._isDragging    = true;
    this._dragButton    = e.button;
    this._dragStartX    = e.clientX;
    this._dragStartY    = e.clientY;
    this._dragPanStartX = this._panX;
    this._dragPanStartY = this._panY;
    if (this._el) this._el.style.cursor = 'grab';
  };

  private readonly _onMouseMove = (e: MouseEvent): void => {
    if (!this._isDragging) return;
    const dx = e.clientX - this._dragStartX;
    const dy = e.clientY - this._dragStartY;
    this._panX = this._dragPanStartX + dx;
    this._panY = this._dragPanStartY + dy;
    this._clampPan();
    this._applyTransform();
  };

  private readonly _onMouseUp = (e: MouseEvent): void => {
    if (!this._isDragging) return;
    if (e.button === this._dragButton) {
      this._isDragging = false;
      this._dragButton = -1;
      if (this._el) this._el.style.cursor = '';
    }
  };

  private readonly _onContextMenu = (e: MouseEvent): void => {
    // When we're dragging with right-click, suppress context menu
    if (this._isDragging || this._dragButton === 2) e.preventDefault();
  };

  private readonly _onKeyDown = (e: KeyboardEvent): void => {
    this._keysDown.add(e.code);
    if (e.code === 'Home' || e.code === 'KeyR') {
      this.reset();
    }
  };

  private readonly _onKeyUp = (e: KeyboardEvent): void => {
    this._keysDown.delete(e.code);
  };

  // ── Constructor ───────────────────────────────────────────

  constructor(worldContainer: Container) {
    this._wc = worldContainer;
  }

  // ── Public API ────────────────────────────────────────────

  setBaseline(
    fitX: number,
    fitY: number,
    fitScale: number,
    worldW: number,
    worldH: number,
    screenW: number,
    screenH: number,
  ): void {
    this._fitX    = fitX;
    this._fitY    = fitY;
    this._fitScale = fitScale;
    this._worldW  = worldW;
    this._worldH  = worldH;
    this._screenW = screenW;
    this._screenH = screenH;
    this._applyTransform();
  }

  attach(el: HTMLElement): void {
    this._el = el;
    el.addEventListener('wheel',     this._onWheel,     { passive: false });
    el.addEventListener('mousedown', this._onMouseDown);
    el.addEventListener('contextmenu', this._onContextMenu);
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mouseup',   this._onMouseUp);
    document.addEventListener('keydown', this._onKeyDown);
    document.addEventListener('keyup',   this._onKeyUp);
  }

  destroy(): void {
    if (this._el) {
      this._el.removeEventListener('wheel',       this._onWheel);
      this._el.removeEventListener('mousedown',   this._onMouseDown);
      this._el.removeEventListener('contextmenu', this._onContextMenu);
      this._el = null;
    }
    window.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('mouseup',   this._onMouseUp);
    document.removeEventListener('keydown', this._onKeyDown);
    document.removeEventListener('keyup',   this._onKeyUp);
    this._keysDown.clear();
  }

  update(dt: number): void {
    let changed = false;
    const screenCX = this._screenW / 2;
    const screenCY = this._screenH / 2;

    // Keyboard pan
    const panDelta = PAN_SPEED * dt;
    if (this._keysDown.has('ArrowLeft')  || this._keysDown.has('KeyA')) { this._panX += panDelta; changed = true; }
    if (this._keysDown.has('ArrowRight') || this._keysDown.has('KeyD')) { this._panX -= panDelta; changed = true; }
    if (this._keysDown.has('ArrowUp')    || this._keysDown.has('KeyW')) { this._panY += panDelta; changed = true; }
    if (this._keysDown.has('ArrowDown')  || this._keysDown.has('KeyS')) { this._panY -= panDelta; changed = true; }

    // Keyboard zoom
    const zoomFactor = Math.pow(ZOOM_RATE, dt);
    const zoomIn  = this._keysDown.has('Equal') || this._keysDown.has('NumpadAdd')      || this._keysDown.has('BracketRight');
    const zoomOut = this._keysDown.has('Minus')  || this._keysDown.has('NumpadSubtract') || this._keysDown.has('BracketLeft');
    if (zoomIn)  { this._applyZoom(zoomFactor,       screenCX, screenCY); changed = true; }
    if (zoomOut) { this._applyZoom(1 / zoomFactor,   screenCX, screenCY); changed = true; }

    if (changed) {
      this._clampPan();
      this._applyTransform();
    }
  }

  reset(): void {
    this._zoom = 1;
    this._panX = 0;
    this._panY = 0;
    this._applyTransform();
  }

  // ── Private helpers ───────────────────────────────────────

  private _applyZoom(factor: number, sx: number, sy: number): void {
    const oldZoom = this._zoom;
    const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, oldZoom * factor));

    // Compute world-space pivot under screen point
    const worldPivotX = (sx - (this._fitX + this._panX)) / (this._fitScale * oldZoom);
    const worldPivotY = (sy - (this._fitY + this._panY)) / (this._fitScale * oldZoom);

    // Recompute pan so pivot stays under cursor
    this._panX = sx - worldPivotX * (this._fitScale * newZoom) - this._fitX;
    this._panY = sy - worldPivotY * (this._fitScale * newZoom) - this._fitY;

    this._zoom = newZoom;
  }

  private _clampPan(): void {
    const { _fitX: fitX, _fitY: fitY, _fitScale: fitScale, _zoom: zoom,
            _worldW: worldW, _worldH: worldH, _screenW: screenW, _screenH: screenH } = this;

    const totalScale = fitScale * zoom;
    const scaledW    = worldW * totalScale;
    const scaledH    = worldH * totalScale;
    const pad        = PAN_PADDING;

    // X axis — always allow panning with padding
    const minPanX = screenW - scaledW - fitX - pad;
    const maxPanX = -fitX + pad;
    this._panX = Math.max(minPanX, Math.min(maxPanX, this._panX));

    // Y axis — always allow panning with padding
    const minPanY = screenH - scaledH - fitY - pad;
    const maxPanY = -fitY + pad;
    this._panY = Math.max(minPanY, Math.min(maxPanY, this._panY));
  }

  private _applyTransform(): void {
    this._wc.scale.set(this._fitScale * this._zoom);
    this._wc.x = this._fitX + this._panX;
    this._wc.y = this._fitY + this._panY;
  }
}
