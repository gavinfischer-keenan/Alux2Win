import { Graphics, Container, AlphaFilter } from 'pixi.js';
import type { GameState, PlanetData } from '../types';
import { SettingsStore } from '../core/SettingsStore';
import { FACTION_COLORS } from '../types';

export class FogRenderer {
  private container: Container;
  private fogGfx: Graphics;
  private holeGfx: Graphics;
  private overlayGfx: Graphics;
  private alphaFilter: AlphaFilter;
  private currentOpacity: number = 0;

  constructor(parent: Container) {
    this.container = new Container();
    this.container.zIndex = 100; // Above everything except UI
    
    // Apply an AlphaFilter to force PixiJS to render this container into an offscreen texture.
    // This perfectly isolates the 'erase' blend mode so it only erases the fog overlay,
    // rather than punching straight through the WebGL canvas.
    this.alphaFilter = new AlphaFilter({ alpha: 1 });
    this.container.filters = [this.alphaFilter];
    
    parent.addChild(this.container);

    this.fogGfx = new Graphics();
    this.container.addChild(this.fogGfx);

    this.holeGfx = new Graphics();
    this.holeGfx.blendMode = 'erase';
    this.container.addChild(this.holeGfx);

    // Overlay for detection arcs (drawn above the fog container)
    this.overlayGfx = new Graphics();
    this.overlayGfx.zIndex = 101; 
    parent.addChild(this.overlayGfx);
  }

  public render(state: GameState, worldWidth: number, worldHeight: number, elapsedTime: number): void {
    const isFogEnabled = state.fogOfWarConfig?.enabled;
    
    this.overlayGfx.clear();

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

    // Set the filter alpha for the global opacity
    this.alphaFilter.alpha = this.currentOpacity;

    this.fogGfx.clear();
    const margin = 5000;
    this.fogGfx.rect(-margin, -margin, worldWidth + margin * 2, worldHeight + margin * 2);
    this.fogGfx.fill({ color: 0x111116, alpha: 0.98 }); 

    this.holeGfx.clear();
    const playerPlanets: PlanetData[] = [];
    for (const planet of state.planets.values()) {
      if (planet.faction === 'player') {
        playerPlanets.push(planet);
        const radius = this.getVisionRadius(planet.upgradeLevel);
        this.holeGfx.circle(planet.x, planet.y, radius);
      }
    }
    this.holeGfx.fill({ color: 0xffffff, alpha: 1 });

    // Draw enemy detection arcs for visible enemy planets
    const diff = SettingsStore.get().difficulty;
    const diffMultiplier = diff === 'hard' ? 2.0 : (diff === 'easy' ? 1.0 : 1.25);

    for (const planet of state.planets.values()) {
      if (planet.faction !== 'player' && planet.faction !== 'neutral') {
        // Is the enemy planet visible to the player?
        let isVisible = false;
        for (const pp of playerPlanets) {
          const r = this.getVisionRadius(pp.upgradeLevel);
          const dx = planet.x - pp.x;
          const dy = planet.y - pp.y;
          if (dx * dx + dy * dy <= r * r) {
            isVisible = true;
            break;
          }
        }

        if (isVisible) {
          const enemyR = this.getVisionRadius(planet.upgradeLevel) * diffMultiplier;
          const color = FACTION_COLORS[planet.faction] || 0xffffff;
          
          this.overlayGfx.circle(planet.x, planet.y, enemyR);
          this.overlayGfx.fill({ color, alpha: 0.04 * this.currentOpacity });
          this.overlayGfx.stroke({ color, alpha: 0.2 * this.currentOpacity, width: 3, alignment: 1 });
        }
      }
    }
  }

  private getVisionRadius(level: number): number {
    if (level === 1) return 500;
    if (level === 2) return 850;
    return 1300; // level 3
  }

  public destroy(): void {
    this.container.destroy({ children: true });
    this.overlayGfx.destroy();
  }
}


