import { Graphics, Container } from 'pixi.js';
import type { GameState, PlanetData } from '../types';

export class FogRenderer {
  private container: Container;
  private fogGfx: Graphics;
  private holeGfx: Graphics;
  private currentOpacity: number = 0;

  constructor(parent: Container) {
    this.container = new Container();
    this.container.zIndex = 100; // Above everything except UI
    
    // In PixiJS v8, isRenderGroup isolates blending so 'erase' doesn't erase the background
    (this.container as any).isRenderGroup = true;
    parent.addChild(this.container);

    this.fogGfx = new Graphics();
    this.container.addChild(this.fogGfx);

    this.holeGfx = new Graphics();
    this.holeGfx.blendMode = 'erase';
    this.container.addChild(this.holeGfx);
  }

  public render(state: GameState, worldWidth: number, worldHeight: number, elapsedTime: number): void {
    const isFogEnabled = state.fogOfWarConfig?.enabled;
    
    if (!isFogEnabled) {
      this.fogGfx.clear();
      this.holeGfx.clear();
      return;
    }

    // Fog transitions from 0 to 1 over 2 seconds, starting at t=5s
    if (elapsedTime < 5) {
      this.currentOpacity = 0;
    } else {
      const p = Math.min((elapsedTime - 5) / 2, 1);
      this.currentOpacity = p; // target opacity is 1
    }

    if (this.currentOpacity <= 0) {
      this.fogGfx.clear();
      this.holeGfx.clear();
      return;
    }

    // Use alpha hack to guarantee isolated render group fallback if isRenderGroup isn't supported natively
    this.container.alpha = this.currentOpacity * 0.999;

    this.fogGfx.clear();
    const margin = 5000;
    this.fogGfx.rect(-margin, -margin, worldWidth + margin * 2, worldHeight + margin * 2);
    this.fogGfx.fill({ color: 0x111116, alpha: 1 }); // Alpha handled by container

    this.holeGfx.clear();
    for (const planet of state.planets.values()) {
      if (planet.faction === 'player') {
        const radius = this.getVisionRadius(planet.upgradeLevel);
        this.holeGfx.circle(planet.x, planet.y, radius);
      }
    }
    this.holeGfx.fill({ color: 0xffffff, alpha: 1 });
  }

  private getVisionRadius(level: number): number {
    if (level === 1) return 500;
    if (level === 2) return 850;
    return 1300; // level 3
  }

  public destroy(): void {
    this.container.destroy({ children: true });
  }
}

