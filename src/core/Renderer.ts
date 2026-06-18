// ============================================================
// Renderer.ts — PixiJS Application wrapper for LUX
// ============================================================

import { Application, Container, Graphics } from 'pixi.js';
import { STAR_COLOR } from '../utils/ColorUtils';
import { randomRange } from '../utils/MathUtils';

/** Named render layers, composited in draw order (back → front). */
export interface RenderLayers {
  background:          Container;  // screen-space, full viewport
  speedZones:          Container;  // world-space (hazard, behind everything)
  plasmaStorms:        Container;  // world-space (hazard, behind planets)
  blackHoles:          Container;  // world-space
  trappingBlackHoles:  Container;  // world-space (new trapping variant)
  whiteHoles:          Container;  // world-space (behind planets)
  orbitPaths:          Container;  // world-space
  portals:             Container;  // world-space (behind planets, above floor)
  planets:             Container;  // world-space
  particles:           Container;  // world-space
  asteroids:           Container;  // world-space (hazard, above particles)
  gammaRay:            Container;  // world-space (hazard, top of world)
  ui:                  Container;  // screen-space (HUD, etc.)
  selectionBox:        Container;  // screen-space
}

const STAR_COUNT = 300;

export class Renderer {
  public app!: Application;
  public layers!: RenderLayers;

  /** The world container — all game-space layers live here, scaled to fit. */
  private _worldContainer!: Container;

  private _worldWidth:  number = 2048;
  private _worldHeight: number = 2048;

  // Cached fit-transform values (updated by _fitWorld)
  private _fitX     = 0;
  private _fitY     = 0;
  private _fitScale = 1;

  // ── Public accessors ────────────────────────────────────────

  /** The raw PixiJS canvas element. */
  get canvas(): HTMLCanvasElement {
    return this.app.canvas as HTMLCanvasElement;
  }

  /** The root PixiJS stage. */
  get stage(): Container {
    return this.app.stage;
  }

  // ── Initialisation ──────────────────────────────────────────

  async init(container: HTMLElement): Promise<void> {
    this.app = new Application();

    await this.app.init({
      resizeTo: container,
      backgroundColor: 0x000008,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });

    // Mount canvas behind all HTML overlays.
    const canvas = this.app.canvas as HTMLCanvasElement;
    canvas.style.cssText =
      'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;';
    container.appendChild(canvas);

    const sw = this.app.screen.width  || window.innerWidth;
    const sh = this.app.screen.height || window.innerHeight;

    // ── Screen-space background (fills viewport, never scaled) ──
    const background = new Container();
    this._buildBackground(background, sw, sh);
    this.app.stage.addChild(background);

    // ── World container — scaled + centered to fit world ────────
    this._worldContainer = new Container();
    this.app.stage.addChild(this._worldContainer);

    // World-space layers (children of worldContainer, in draw order)
    const speedZones         = new Container();
    const plasmaStorms       = new Container();
    const blackHoles         = new Container();
    const trappingBlackHoles = new Container();
    const whiteHoles         = new Container();
    const orbitPaths         = new Container();
    const portals            = new Container();
    const planets            = new Container();
    const particles          = new Container();
    const asteroids          = new Container();
    const gammaRay           = new Container();
    this._worldContainer.addChild(speedZones);
    this._worldContainer.addChild(plasmaStorms);
    this._worldContainer.addChild(blackHoles);
    this._worldContainer.addChild(trappingBlackHoles);
    this._worldContainer.addChild(whiteHoles);
    this._worldContainer.addChild(orbitPaths);
    this._worldContainer.addChild(portals);
    this._worldContainer.addChild(planets);
    this._worldContainer.addChild(particles);
    this._worldContainer.addChild(asteroids);
    this._worldContainer.addChild(gammaRay);

    // Screen-space UI layers (on top of everything, not scaled)
    const ui           = new Container();
    const selectionBox = new Container();
    this.app.stage.addChild(ui);
    this.app.stage.addChild(selectionBox);

    this.layers = {
      background,
      speedZones,
      plasmaStorms,
      blackHoles,
      trappingBlackHoles,
      whiteHoles,
      orbitPaths,
      portals,
      planets,
      particles,
      asteroids,
      gammaRay,
      ui,
      selectionBox,
    };

    // Apply default world fit (2048×2048 → screen)
    this._fitWorld(this._worldWidth, this._worldHeight);
  }

  // ── Public API ──────────────────────────────────────────────

  getWidth():  number { return this.app.screen.width; }
  getHeight(): number { return this.app.screen.height; }

  /** Expose the world container for camera control. */
  getWorldContainer(): Container { return this._worldContainer; }

  /** Returns the cached fit-transform baseline computed by _fitWorld(). */
  getFitTransform(): { x: number; y: number; scale: number } {
    return { x: this._fitX, y: this._fitY, scale: this._fitScale };
  }

  /**
   * Call after loading a level to scale the world container so the
   * entire world fits inside the current viewport (letterboxed).
   */
  setWorldSize(worldWidth: number, worldHeight: number): void {
    this._worldWidth  = worldWidth;
    this._worldHeight = worldHeight;
    this._fitWorld(worldWidth, worldHeight);
  }

  /**
   * Convert viewport-relative screen coordinates → world coordinates,
   * accounting for the world container's scale and position.
   */
  screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
    const wc = this._worldContainer;
    const s  = wc.scale.x || 1;
    return {
      x: (screenX - wc.x) / s,
      y: (screenY - wc.y) / s,
    };
  }

  /**
   * Convert world coordinates → viewport-relative screen coordinates.
   * The inverse of screenToWorld — used to position HTML overlays over game entities.
   */
  worldToScreen(worldX: number, worldY: number): { x: number; y: number } {
    const wc = this._worldContainer;
    const s  = wc.scale.x || 1;
    return {
      x: worldX * s + wc.x,
      y: worldY * s + wc.y,
    };
  }

  destroy(): void {
    this.app.destroy(true, { children: true, texture: true });
  }

  // ── Private helpers ─────────────────────────────────────────

  /**
   * Scale + centre the worldContainer so the entire world fits
   * inside the current viewport (uniform scale, letterboxed).
   */
  private _fitWorld(worldW: number, worldH: number): void {
    if (!this._worldContainer) return;
    const sw = this.app.screen.width  || window.innerWidth;
    const sh = this.app.screen.height || window.innerHeight;

    // Add a small margin so planets near the edge aren't clipped.
    const margin = 40;
    const scale = Math.min(
      (sw - margin * 2) / worldW,
      (sh - margin * 2) / worldH,
    );

    // Cache fit-transform for CameraController baseline.
    this._fitX     = (sw - worldW * scale) / 2;
    this._fitY     = (sh - worldH * scale) / 2;
    this._fitScale = scale;

    this._worldContainer.scale.set(scale);
    // Centre the scaled world in the viewport.
    this._worldContainer.x = this._fitX;
    this._worldContainer.y = this._fitY;
  }

  /**
   * Paint a deep-space background that fills the screen.
   * Stars are scattered across the full viewport.
   */
  private _buildBackground(layer: Container, w: number, h: number): void {
    const bg = new Graphics();

    // Deep space base
    bg.rect(0, 0, w, h).fill({ color: 0x05050f });

    // Subtle vignette — fades from dark navy at edges toward centre.
    const vignetteColor = 0x080820;
    const steps = 8;
    for (let i = 0; i < steps; i++) {
      const t     = i / steps;
      const alpha = 0.22 * (1 - t);
      const mx    = w * 0.45 * t;
      const my    = h * 0.45 * t;
      const rw    = w - mx * 2;
      const rh    = h - my * 2;
      if (rw > 0 && rh > 0) {
        bg.rect(mx, my, rw, rh).fill({ color: vignetteColor, alpha });
      }
    }
    layer.addChild(bg);

    // Stars — varied sizes and brightness for depth
    const stars = new Graphics();
    for (let i = 0; i < STAR_COUNT; i++) {
      const sx         = randomRange(0, w);
      const sy         = randomRange(0, h);
      const brightness = randomRange(0.2, 1.0);
      const radius     = Math.random() < 0.05 ? 1.4 : 0.7; // occasional bright star
      stars.circle(sx, sy, radius).fill({ color: STAR_COLOR, alpha: brightness });
    }
    layer.addChild(stars);
  }
}
