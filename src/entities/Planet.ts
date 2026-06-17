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
  private _seed:            number;

  constructor(data: PlanetData, layer: Container) {
    this.data = data;
    this.lastFaction      = data.faction;
    this.lastUpgradeLevel = data.upgradeLevel;
    this.lastParticles    = data.particles;
    this.lastSelected     = false;
    this._seed            = Math.random() * 100000;

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

  private _pseudoRandom(seed: number) {
    let s = Math.floor(seed);
    return function() {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };
  }

  private _adjustColor(color: number, factor: number): number {
    const r = (color >> 16) & 0xff;
    const g = (color >> 8) & 0xff;
    const b = color & 0xff;

    const newR = Math.max(0, Math.min(255, Math.floor(r * factor)));
    const newG = Math.max(0, Math.min(255, Math.floor(g * factor)));
    const newB = Math.max(0, Math.min(255, Math.floor(b * factor)));

    return (newR << 16) | (newG << 8) | newB;
  }

  private _redraw(): void {
    const radius = PLANET_RADIUS[this.data.upgradeLevel];
    const color  = FACTION_COLORS[this.data.faction];
    const rand = this._pseudoRandom(this._seed);

    this.glowGraphics.clear();
    
    // Atmospheric glow
    this.glowGraphics.circle(0, 0, radius * 2.2).fill({ color, alpha: 0.08 });
    this.glowGraphics.circle(0, 0, radius * 1.5).fill({ color, alpha: 0.12 });

    // Orbital Rings for Level 3 planets (top-down view)
    if (this.data.upgradeLevel === 3) {
      this.glowGraphics.circle(0, 0, radius * 1.35).stroke({ color: color, alpha: 0.4, width: 2 });
      this.glowGraphics.circle(0, 0, radius * 1.45).stroke({ color: this._adjustColor(color, 1.5), alpha: 0.2, width: 1 });
    }

    this.graphics.clear();
    
    const numFeatures = 4 + this.data.upgradeLevel * 3;

    // Procedural Planet Generation based on Faction
    if (this.data.faction === 'player') {
      // Terran / Water World
      const waterColor = this._adjustColor(color, 0.4);
      const landColor = color;
      const highlightColor = this._adjustColor(color, 1.3);

      this.graphics.circle(0, 0, radius).fill({ color: waterColor });
      
      for (let i = 0; i < numFeatures; i++) {
        const r = radius * (0.2 + rand() * 0.3);
        const d = rand() * (radius - r * 1.05);
        const theta = rand() * Math.PI * 2;
        const cx = d * Math.cos(theta);
        const cy = d * Math.sin(theta);

        this.graphics.circle(cx, cy, r).fill({ color: landColor, alpha: 0.85 });
        this.graphics.circle(cx - r*0.2, cy - r*0.2, r*0.5).fill({ color: highlightColor, alpha: 0.3 });
      }
      
      // Polar Ice caps
      this.graphics.circle(0, -radius * 0.85, radius * 0.3).fill({ color: 0xffffff, alpha: 0.5 });
      this.graphics.circle(0, radius * 0.85, radius * 0.3).fill({ color: 0xffffff, alpha: 0.5 });

    } else if (this.data.faction === 'enemy_a') {
      // Volcanic / Cracked
      this.graphics.circle(0, 0, radius).fill({ color: this._adjustColor(color, 0.25) }); // Dark rock
      
      // Lava Pools
      for (let i = 0; i < numFeatures; i++) {
        const r = radius * (0.1 + rand() * 0.2);
        const d = rand() * (radius - r * 1.05);
        const theta = rand() * Math.PI * 2;
        const cx = d * Math.cos(theta);
        const cy = d * Math.sin(theta);

        this.graphics.circle(cx, cy, r).fill({ color: this._adjustColor(color, 0.8), alpha: 0.9 });
        this.graphics.circle(cx, cy, r*0.5).fill({ color: this._adjustColor(color, 1.6), alpha: 0.9 });
      }

      // Fault lines (jagged cracks)
      for (let i = 0; i < 3; i++) {
         const startAngle = rand() * Math.PI * 2;
         let cx = (radius * 0.8) * Math.cos(startAngle);
         let cy = (radius * 0.8) * Math.sin(startAngle);
         this.graphics.moveTo(cx, cy);
         for(let j=0; j<3; j++) {
            cx += (rand() - 0.5) * radius * 0.9;
            cy += (rand() - 0.5) * radius * 0.9;
            const dist = Math.sqrt(cx*cx + cy*cy);
            if (dist > radius*0.95) {
               cx = (cx / dist) * radius * 0.95;
               cy = (cy / dist) * radius * 0.95;
            }
            this.graphics.lineTo(cx, cy);
         }
         this.graphics.stroke({ color: this._adjustColor(color, 1.5), width: 1.5, alpha: 0.8 });
      }

    } else if (this.data.faction === 'enemy_b') {
      // Bio / Gas Storms
      this.graphics.circle(0, 0, radius).fill({ color: this._adjustColor(color, 0.35) });
      
      // Spores and bio-vines
      for (let i = 0; i < numFeatures + 4; i++) {
        const r = radius * (0.08 + rand() * 0.15);
        const d = rand() * (radius - r * 1.05);
        const theta = rand() * Math.PI * 2;
        const cx = d * Math.cos(theta);
        const cy = d * Math.sin(theta);

        // Vine connecting to center
        this.graphics.moveTo(0, 0);
        this.graphics.lineTo(cx, cy);
        this.graphics.stroke({ color: this._adjustColor(color, 0.6), width: 2, alpha: 0.6 });

        // Spore cluster
        this.graphics.circle(cx, cy, r).fill({ color: this._adjustColor(color, 1.1), alpha: 0.9 });
        this.graphics.circle(cx - r*0.2, cy - r*0.2, r*0.4).fill({ color: this._adjustColor(color, 1.8), alpha: 0.7 });
      }
      
      // Central glowing hive mind
      this.graphics.circle(0, 0, radius * 0.35).fill({ color: this._adjustColor(color, 1.5), alpha: 0.85 });

    } else {
      // Neutral - Barren Moon
      this.graphics.circle(0, 0, radius).fill({ color: color });
      
      // Craters
      for (let i = 0; i < numFeatures + 2; i++) {
        const r = radius * (0.15 + rand() * 0.25);
        const d = rand() * (radius - r * 1.05);
        const theta = rand() * Math.PI * 2;
        const cx = d * Math.cos(theta);
        const cy = d * Math.sin(theta);

        this.graphics.circle(cx, cy, r).fill({ color: this._adjustColor(color, 0.7) });
        this.graphics.circle(cx - r*0.1, cy - r*0.1, r*0.75).fill({ color: this._adjustColor(color, 0.45) });
      }
    }

    // Universal 3D Specular highlights and shading
    this.graphics.circle(-radius * 0.3, -radius * 0.3, radius * 0.4).fill({ color: 0xffffff, alpha: 0.12 });
    this.graphics.circle(-radius * 0.4, -radius * 0.4, radius * 0.15).fill({ color: 0xffffff, alpha: 0.25 });

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
