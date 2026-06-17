// ============================================================
// Planet.ts — Planet rendering entity for Alux2Win
// ============================================================

import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { FACTION_COLORS, PLANET_RADIUS } from '../types';
import type { PlanetData, Faction, UpgradeLevel } from '../types';

export class Planet {
  public data: PlanetData;

  private graphics:      Graphics;
  private glowGraphics:  Graphics;
  private selectionRing: Graphics;
  private label:         Text;

  /** Track last-drawn state to avoid redundant redraws. */
  private lastFaction:      Faction;
  private lastUpgradeLevel: UpgradeLevel;
  private lastParticles:    number;
  private lastSelected:     boolean;

  /** Animated selection-ring pulse phase (0–2π). */
  private ringPhase: number = 0;

  constructor(data: PlanetData, layer: Container) {
    this.data = data;
    this.lastFaction      = data.faction;
    this.lastUpgradeLevel = data.upgradeLevel;
    this.lastParticles    = data.particles;
    this.lastSelected     = false;

    // ---- Create display objects ----
    this.glowGraphics  = new Graphics();
    this.graphics      = new Graphics();
    this.selectionRing = new Graphics();

    const style = new TextStyle({
      fontFamily: 'monospace',
      fontSize:   11,
      fill:       0xffffff,
      align:      'center',
    });
    this.label = new Text({ text: '', style });
    this.label.anchor.set(0.5, 0.5);

    // Stack: glow behind planet, label on top.
    layer.addChild(this.glowGraphics);
    layer.addChild(this.graphics);
    layer.addChild(this.selectionRing);
    layer.addChild(this.label);

    this._redraw();
    this.updatePosition();
  }

  get id(): string {
    return this.data.id;
  }

  /**
   * Called by GameScene each render frame.
   * Syncs the data reference (planet may have moved via OrbitSystem),
   * then delegates to update().
   */
  render(data: PlanetData, selected: boolean): void {
    this.data = data;
    this.updatePosition();
    this.update(selected);
  }

  /**
   * Called every frame.
   * Redraws if faction/upgradeLevel changed; updates label and selection ring.
   */
  update(selected: boolean): void {
    const d = this.data;
    const needRedraw =
      d.faction      !== this.lastFaction      ||
      d.upgradeLevel !== this.lastUpgradeLevel;

    if (needRedraw) {
      this.lastFaction      = d.faction;
      this.lastUpgradeLevel = d.upgradeLevel;
      this._redraw();
    }

    // Update label text if particle count changed.
    if (d.particles !== this.lastParticles) {
      this.lastParticles = d.particles;
      this.label.text = String(Math.floor(d.particles));
    }

    // Selection ring animation.
    if (selected !== this.lastSelected) {
      this.lastSelected = selected;
      if (!selected) {
        this.selectionRing.clear();
        this.selectionRing.visible = false;
      } else {
        this.selectionRing.visible = true;
      }
    }

    if (selected) {
      this.ringPhase = (this.ringPhase + 0.05) % (Math.PI * 2);
      this._drawSelectionRing();
    }
  }

  /** Synchronise graphics positions with data coordinates. */
  updatePosition(): void {
    const { x, y } = this.data;
    this.glowGraphics.x  = x;
    this.glowGraphics.y  = y;
    this.graphics.x      = x;
    this.graphics.y      = y;
    this.selectionRing.x = x;
    this.selectionRing.y = y;
    this.label.x         = x;
    this.label.y         = y;
  }

  destroy(): void {
    this.glowGraphics.destroy();
    this.graphics.destroy();
    this.selectionRing.destroy();
    this.label.destroy();
  }

  // ---- Private drawing helpers ----

  private _redraw(): void {
    const radius = PLANET_RADIUS[this.data.upgradeLevel];
    const color  = FACTION_COLORS[this.data.faction];

    // ---- Glow (soft outer halo) ----
    this.glowGraphics.clear();
    const glowRadius = radius * 2.2;
    this.glowGraphics
      .circle(0, 0, glowRadius)
      .fill({ color, alpha: 0.12 });

    const midGlowRadius = radius * 1.5;
    this.glowGraphics
      .circle(0, 0, midGlowRadius)
      .fill({ color, alpha: 0.08 });

    // ---- Planet body ----
    this.graphics.clear();

    // Slightly lighter rim for depth.
    this.graphics
      .circle(0, 0, radius)
      .fill({ color: 0xffffff, alpha: 0.12 });

    // Main fill.
    this.graphics
      .circle(0, 0, radius)
      .fill({ color });

    // Specular highlight — small bright circle offset toward top-left.
    const hlRadius = radius * 0.3;
    const hlOffset = radius * 0.25;
    this.graphics
      .circle(-hlOffset, -hlOffset, hlRadius)
      .fill({ color: 0xffffff, alpha: 0.25 });

    // ---- Label ----
    this.label.text = String(Math.floor(this.data.particles));
  }

  private _drawSelectionRing(): void {
    const radius = PLANET_RADIUS[this.data.upgradeLevel];
    const ringRadius = radius + 8 + Math.sin(this.ringPhase) * 2;

    this.selectionRing.clear();
    this.selectionRing
      .circle(0, 0, ringRadius)
      .stroke({ color: 0xffffff, alpha: 0.85, width: 1.5 });

    // Outer pulse ring.
    const outerRadius = ringRadius + 4;
    this.selectionRing
      .circle(0, 0, outerRadius)
      .stroke({ color: 0xffffff, alpha: 0.25, width: 1 });
  }
}
