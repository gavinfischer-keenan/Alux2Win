import { Graphics, Container } from 'pixi.js';
import type { GameState, PlanetData } from '../types';

export class FogRenderer {
  private container: Container;
  private fogGfx: Graphics;
  private currentOpacity: number = 0;

  constructor(parent: Container) {
    this.container = new Container();
    this.container.zIndex = 100; // Above everything except UI
    parent.addChild(this.container);

    this.fogGfx = new Graphics();
    this.container.addChild(this.fogGfx);
  }

  public render(state: GameState, worldWidth: number, worldHeight: number, elapsedTime: number): void {
    const isFogEnabled = state.fogOfWarConfig?.enabled;
    
    if (!isFogEnabled) {
      this.fogGfx.clear();
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
      return;
    }

    this.fogGfx.clear();
    this.fogGfx.alpha = this.currentOpacity;
    this.fogGfx.beginFill(0x111116, 0.98); // Very dark, almost opaque
    this.fogGfx.drawRect(0, 0, worldWidth, worldHeight);

    // Punch holes for player planets
    for (const planet of state.planets.values()) {
      if (planet.faction === 'player') {
        const radius = this.getVisionRadius(planet.upgradeLevel);
        // @ts-ignore
        this.fogGfx.beginHole();
        this.fogGfx.drawCircle(planet.x, planet.y, radius);
        // @ts-ignore
        this.fogGfx.endHole();
      }
    }

    this.fogGfx.endFill();
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
