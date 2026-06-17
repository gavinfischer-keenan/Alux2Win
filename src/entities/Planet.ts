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
  private healthArc:     Graphics;
  private selectionRing: Graphics;
  private label:         Text;

  private lastFaction:      Faction;
  private lastUpgradeLevel: UpgradeLevel;
  private lastParticles:    number;
  private lastSelected:     boolean;
  private ringPhase:        number = 0;

  constructor(data: PlanetData, layer: Container) {
    this.data = data;
    this.lastFaction      = data.faction;
    this.lastUpgradeLevel = data.upgradeLevel;
    this.lastParticles    = data.particles;
    this.lastSelected     = false;

    this.glowGraphics  = new Graphics();
    this.healthArc     = new Graphics();
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

    // Stacking order: glow → healthArc → planet body → selection ring → label
    layer.addChild(this.glowGraphics);
    layer.addChild(this.healthArc);
    layer.addChild(this.graphics);
    layer.addChild(this.selectionRing);
    layer.addChild(this.label);

    this._redraw();
    this.updatePosition();
  }

  get id(): string {
    return this.data.id;
  }

  render(data: PlanetData, selected: boolean): void {
    this.data = data;
    this.updatePosition();
    this.update(selected);
  }

  update(selected: boolean): void {
    const d = this.data;
    const needRedraw =
      d.faction      !== this.lastFaction ||
      d.upgradeLevel !== this.lastUpgradeLevel;

    if (needRedraw) {
      this.lastFaction      = d.faction;
      this.lastUpgradeLevel = d.upgradeLevel;
      this._redraw();
    }

    if (d.particles !== this.lastParticles) {
      this.lastParticles = d.particles;
      this.label.text = String(Math.floor(d.particles));
    }

    // Health arc — redraw every frame (cheap Graphics op)
    this._drawHealthArc();

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

  updatePosition(): void {
    const { x, y } = this.data;
    this.glowGraphics.x  = x;
    this.glowGraphics.y  = y;
    this.healthArc.x     = x;
    this.healthArc.y     = y;
    this.graphics.x      = x;
    this.graphics.y      = y;
    this.selectionRing.x = x;
    this.selectionRing.y = y;
    this.label.x         = x;
    this.label.y         = y;
  }

  destroy(): void {
    this.glowGraphics.destroy();
    this.healthArc.destroy();
    this.graphics.destroy();
    this.selectionRing.destroy();
    this.label.destroy();
  }

  // ---- Private drawing helpers ----

  private _drawHealthArc(): void {
    this.healthArc.clear();
    const d = this.data;
    if (d.maxBonusHealth === 0) return;

    const ratio = Math.max(0, Math.min(1, d.bonusHealth / d.maxBonusHealth));
    if (ratio <= 0) return;

    const radius     = PLANET_RADIUS[d.upgradeLevel] + 6;
    const startAngle = -Math.PI / 2;                          // 12 o'clock
    const endAngle   = startAngle + ratio * Math.PI * 2;      // clockwise
    const color      = ratio < 0.25 ? 0xff8f00 : FACTION_COLORS[d.faction];

    this.healthArc
      .arc(0, 0, radius, startAngle, endAngle)
      .stroke({ color, alpha: 0.85, width: 3 });

    // Subtle track ring (full circle, faint)
    this.healthArc
      .arc(0, 0, radius, 0, Math.PI * 2)
      .stroke({ color: 0xffffff, alpha: 0.08, width: 1 });
  }

  private _redraw(): void {
    const radius = PLANET_RADIUS[this.data.upgradeLevel];
    const color  = FACTION_COLORS[this.data.faction];

    this.glowGraphics.clear();
    this.glowGraphics.circle(0, 0, radius * 2.2).fill({ color, alpha: 0.12 });
    this.glowGraphics.circle(0, 0, radius * 1.5).fill({ color, alpha: 0.08 });

    this.graphics.clear();
    this.graphics.circle(0, 0, radius).fill({ color: 0xffffff, alpha: 0.12 });
    this.graphics.circle(0, 0, radius).fill({ color });
    this.graphics.circle(-radius * 0.25, -radius * 0.25, radius * 0.3).fill({ color: 0xffffff, alpha: 0.25 });

    this.label.text = String(Math.floor(this.data.particles));
  }

  private _drawSelectionRing(): void {
    const radius     = PLANET_RADIUS[this.data.upgradeLevel];
    const ringRadius = radius + 8 + Math.sin(this.ringPhase) * 2;

    this.selectionRing.clear();
    this.selectionRing.circle(0, 0, ringRadius).stroke({ color: 0xffffff, alpha: 0.85, width: 1.5 });
    this.selectionRing.circle(0, 0, ringRadius + 4).stroke({ color: 0xffffff, alpha: 0.25, width: 1 });
  }
}
