// ============================================================
// Planet.ts — Planet rendering entity for LUX
// ============================================================

import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { FACTION_COLORS, PLANET_RADIUS, UPGRADE_THRESHOLDS } from '../types';
import type { PlanetData, Faction, UpgradeLevel } from '../types';

// ---- Color helpers ----

/** Unpack a 0xRRGGBB integer into [r, g, b] each 0..255 */
function hexToRgb(hex: number): [number, number, number] {
  return [(hex >> 16) & 0xff, (hex >> 8) & 0xff, hex & 0xff];
}

/** Pack [r, g, b] (0..255) back into a 0xRRGGBB integer */
function rgbToHex(r: number, g: number, b: number): number {
  return ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff);
}

/** Return a brightened/dimmed version of a colour. factor 0..1 darkens, >1 brightens. */
function scaleColor(hex: number, factor: number): number {
  let [r, g, b] = hexToRgb(hex);
  r = Math.min(255, Math.round(r * factor));
  g = Math.min(255, Math.round(g * factor));
  b = Math.min(255, Math.round(b * factor));
  return rgbToHex(r, g, b);
}

/** Blend between two hex colours. t=0 → a, t=1 → b */
function lerpColor(a: number, b: number, t: number): number {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return rgbToHex(
    Math.round(ar + (br - ar) * t),
    Math.round(ag + (bg - ag) * t),
    Math.round(ab + (bb - ab) * t),
  );
}

/**
 * Returns the planet fill color based on faction + upgrade level.
 * Level 1 = dim (40%), Level 2 = medium (68%), Level 3 = full vivid
 */
function planetFillColor(faction: Faction, upgradeLevel: UpgradeLevel): number {
  const base = FACTION_COLORS[faction];
  if (faction === 'neutral') return scaleColor(base, 0.7);
  const brightness = [0, 0.38, 0.65, 1.0][upgradeLevel]; // index 0 unused
  return scaleColor(base, brightness);
}

export class Planet {
  public data: PlanetData;

  private graphics:      Graphics;
  private glowGraphics:  Graphics;
  private healthArc:     Graphics;
  private upgradeArc:    Graphics;
  private shieldGraphics:Graphics;
  private selectionRing: Graphics;
  private label:         Text;
  private levelLabel:    Text;

  private lastFaction:      Faction;
  private lastUpgradeLevel: UpgradeLevel;
  private lastHealth:       number;
  private lastSelected:     boolean;
  private ringPhase:        number = 0;

  constructor(data: PlanetData, layer: Container) {
    this.data = data;
    this.lastFaction      = data.faction;
    this.lastUpgradeLevel = data.upgradeLevel;
    this.lastHealth       = data.health;
    this.lastSelected     = false;

    this.glowGraphics  = new Graphics();
    this.healthArc     = new Graphics();
    this.upgradeArc    = new Graphics();
    this.shieldGraphics= new Graphics();
    this.graphics      = new Graphics();
    this.selectionRing = new Graphics();

    const countStyle = new TextStyle({
      fontFamily: 'monospace',
      fontSize:   11,
      fill:       0xffffff,
      align:      'center',
    });
    this.label = new Text({ text: '', style: countStyle });
    this.label.anchor.set(0.5, 0.5);

    const levelStyle = new TextStyle({
      fontFamily: 'monospace',
      fontSize:   8,
      fill:       0xffd700,
      align:      'center',
    });
    this.levelLabel = new Text({ text: '', style: levelStyle });
    this.levelLabel.anchor.set(0.5, 0);

    // Stacking order: glow → healthArc → upgradeArc → planet body → shieldGraphics → selection ring → labels
    layer.addChild(this.glowGraphics);
    layer.addChild(this.healthArc);
    layer.addChild(this.upgradeArc);
    layer.addChild(this.graphics);
    layer.addChild(this.shieldGraphics);
    layer.addChild(this.selectionRing);
    layer.addChild(this.label);
    layer.addChild(this.levelLabel);

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
    this.updatePosition();

    const needRedraw =
      d.faction      !== this.lastFaction ||
      d.upgradeLevel !== this.lastUpgradeLevel;

    if (needRedraw) {
      this.lastFaction      = d.faction;
      this.lastUpgradeLevel = d.upgradeLevel;
      this._redraw();
    }

    if (d.health !== this.lastHealth) {
      this.lastHealth = d.health;
      this.label.text = String(Math.floor(d.health));
    }

    // Rings redraw every frame
    this._drawHealthRing();
    this._drawUpgradeRing();
    this._drawShield();

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

  private _drawShield(): void {
    const d = this.data;
    this.shieldGraphics.clear();
    
    if (d.isShielded) {
      const shieldPoints = d.shieldPoints ?? 0;
      const baseRadius = PLANET_RADIUS[d.upgradeLevel] + 4;
      
      // Calculate shield intensity based on shield points
      // We'll cap the visual intensity increase at 20 points, but it keeps absorbing damage.
      const intensity = Math.min(shieldPoints / 20, 1.0);
      const alpha = 0.4 + (intensity * 0.6);
      const strokeWidth = 2 + (intensity * 4);
      
      this.shieldGraphics
        .circle(0, 0, baseRadius)
        .stroke({ color: 0x00e5ff, width: strokeWidth, alpha: alpha, alignment: 0.5 });
    }
  }

  updatePosition(): void {
    const { x, y } = this.data;
    const r = PLANET_RADIUS[this.data.upgradeLevel];

    this.glowGraphics.x  = x;
    this.glowGraphics.y  = y;
    this.healthArc.x     = x;
    this.healthArc.y     = y;
    this.upgradeArc.x    = x;
    this.upgradeArc.y    = y;
    this.shieldGraphics.x= x;
    this.shieldGraphics.y= y;
    this.graphics.x      = x;
    this.graphics.y      = y;
    this.selectionRing.x = x;
    this.selectionRing.y = y;
    this.label.x         = x;
    this.label.y         = y - 2;
    // Level pips sit just below the particle count
    this.levelLabel.x    = x;
    this.levelLabel.y    = y + r + 4;
  }

  destroy(): void {
    this.glowGraphics.destroy();
    this.healthArc.destroy();
    this.upgradeArc.destroy();
    this.shieldGraphics.destroy();
    this.graphics.destroy();
    this.selectionRing.destroy();
    this.label.destroy();
    this.levelLabel.destroy();
  }

  // ---- Private drawing helpers ----

  /**
   * Health ring — a 270° arc (gap at the bottom) always drawn around the planet.
   * Full health = solid green. Depletes clockwise, colour shifts orange → red.
   */
  private _drawHealthRing(): void {
    this.healthArc.clear();
    const d = this.data;
    const radius = PLANET_RADIUS[d.upgradeLevel] + 5;

    const totalHealth = d.health;
    const maxHealth   = d.maxHealth;
    const healthRatio = maxHealth > 0 ? Math.max(0, Math.min(1, totalHealth / maxHealth)) : 1;

    // 270° span, leaving a gap at the bottom
    const SPAN       = Math.PI * 1.5;
    const startAngle = -Math.PI * 1.25;
    const endAngle   = startAngle + SPAN;

    // Track (dim background arc)
    this.healthArc
      .arc(0, 0, radius, startAngle, endAngle)
      .stroke({ color: 0xffffff, alpha: 0.08, width: 2 });

    if (healthRatio > 0) {
      const fillEnd = startAngle + SPAN * healthRatio;
      // Teal-white health ring: bright teal at full, dims toward red when critical
      // Keeps it visually separate from the gold upgrade ring
      const color =
        healthRatio > 0.5 ? 0x80e8ff :   // healthy — icy teal
        healthRatio > 0.25 ? 0xff8c42 :  // wounded — amber
        0xff3333;                          // critical — red

      this.healthArc
        .moveTo(Math.cos(startAngle) * radius, Math.sin(startAngle) * radius)
        .arc(0, 0, radius, startAngle, fillEnd)
        .stroke({ color, alpha: 0.9, width: 3 });
    }
  }

  /**
   * Upgrade progress ring — gold ring just outside the health ring.
   * Fills clockwise from 0% → 100% of the upgrade threshold.
   * Pulses when above 80% progress. Hidden on max-level planets.
   */
  private _drawUpgradeRing(): void {
    this.upgradeArc.clear();
    const d = this.data;
    if (d.upgradeLevel >= 3) return;
    if (d.faction === 'neutral') return;

    const nextLevel = (d.upgradeLevel + 1) as UpgradeLevel;
    const threshold = UPGRADE_THRESHOLDS[nextLevel];
    const ratio     = Math.max(0, Math.min(1, d.absorbedCount / threshold));
    if (ratio === 0) return;

    const radius = PLANET_RADIUS[d.upgradeLevel] + 10;
    const SPAN       = Math.PI * 1.5;
    const startAngle = -Math.PI * 1.25;

    // Track (very dim)
    this.upgradeArc
      .arc(0, 0, radius, startAngle, startAngle + SPAN)
      .stroke({ color: 0xffd700, alpha: 0.12, width: 1.5 });

    // Progress fill
    const fillEnd = startAngle + SPAN * ratio;
    const pulse   = ratio > 0.8 ? 0.7 + 0.3 * Math.sin(Date.now() / 150) : 1.0;
    this.upgradeArc
      .arc(0, 0, radius, startAngle, fillEnd)
      .stroke({ color: 0xffd700, alpha: 0.85 * pulse, width: ratio > 0.8 ? 3 : 2 });
  }

  private _redraw(): void {
    const d      = this.data;
    const radius = PLANET_RADIUS[d.upgradeLevel];
    const base   = FACTION_COLORS[d.faction];
    const fill   = planetFillColor(d.faction, d.upgradeLevel);

    this.glowGraphics.clear();

    // Atmospheric glow — uses base faction colour regardless of level
    this.glowGraphics.circle(0, 0, radius * 2.2).fill({ color: base, alpha: 0.07 });
    this.glowGraphics.circle(0, 0, radius * 1.5).fill({ color: base, alpha: 0.11 });

    // Orbital ring accent for L3
    if (d.upgradeLevel === 3) {
      this.glowGraphics
        .circle(0, 0, radius * 1.35)
        .stroke({ color: base, alpha: 0.45, width: 2 });
    }

    this.graphics.clear();

    // Planet body — shaded fill based on level
    this.graphics.circle(0, 0, radius).fill({ color: fill });

    // Bright highlight spot (top-left) for L2+ to add depth
    if (d.upgradeLevel >= 2 && d.faction !== 'neutral') {
      const highlightColor = lerpColor(fill, 0xffffff, d.upgradeLevel === 3 ? 0.55 : 0.3);
      this.graphics.circle(-radius * 0.28, -radius * 0.28, radius * 0.35)
        .fill({ color: highlightColor, alpha: 0.5 });
    }

    // Level pip dots below particle count label
    const pipText = d.upgradeLevel === 1 ? '•' : d.upgradeLevel === 2 ? '••' : '•••';
    this.levelLabel.text = pipText;
    // Gold for L3, lighter gold for L2, dim for L1
    const pipColor =
      d.upgradeLevel === 3 ? 0xffd700 :
      d.upgradeLevel === 2 ? 0xc8a820 : 0x706040;
    (this.levelLabel.style as TextStyle).fill = pipColor;

    // Health count label
    this.label.text = String(Math.floor(d.health));
  }

  private _drawSelectionRing(): void {
    const radius     = PLANET_RADIUS[this.data.upgradeLevel];
    const ringRadius = radius + 14 + Math.sin(this.ringPhase) * 2;

    this.selectionRing.clear();
    this.selectionRing.circle(0, 0, ringRadius).stroke({ color: 0xffffff, alpha: 0.85, width: 1.5 });
    this.selectionRing.circle(0, 0, ringRadius + 4).stroke({ color: 0xffffff, alpha: 0.25, width: 1 });
  }

}
