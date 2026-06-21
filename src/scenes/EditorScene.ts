// ============================================================
// EditorScene.ts — Visual Level Editor scene for LUX
// Allows placing/moving planets, black holes, speed zones,
// portals, trapping black holes, and white holes; editing
// properties, and exporting/testing levels.
// ============================================================

import { Graphics, Container, Text } from 'pixi.js';
import type {
  PlanetData,
  BlackHoleData,
  PlanetDef,
  BlackHoleDef,
  LevelData,
  Faction,
  UpgradeLevel,
  SpeedZoneDef, SpeedZoneData, SpeedZoneType,
  PortalDef, PortalData,
  TrappingBlackHoleDef, TrappingBlackHoleData,
  WhiteHoleDef, WhiteHoleData, GammaRayPath,
} from '../types';
import {
  PLANET_RADIUS,
  PLANET_MAX_HEALTH,
  PLANET_PRODUCTION,
  FACTION_COLORS,
  FACTION_COLORS_HEX,
} from '../types';
import { Renderer }        from '../engine/Renderer';
import { EventBus }        from '../engine/EventBus';
import { EditorSidebar, EditorTool } from '../ui/EditorSidebar';
import { PropertiesPanel } from '../ui/PropertiesPanel';
import { LevelStore }      from '../core/LevelStore';

// ── Helper to build a default new planet ─────────────────────
function defaultPlanet(id: string, x: number, y: number): PlanetData {
  return {
    id,
    x,
    y,
    faction: 'neutral',
    upgradeLevel: 1 as UpgradeLevel,
    health: PLANET_MAX_HEALTH[1],
    maxHealth: PLANET_MAX_HEALTH[1],
    productionRate: PLANET_PRODUCTION[1],
    absorbedCount: 0,
    isOrbiting: false,
    isShielded: false,
    shieldPoints: 0,
    shieldTimer: 0,
  };
}

function defaultBlackHole(id: string, x: number, y: number): BlackHoleData {
  return { id, x, y, radius: 30, pullRadius: 140, pullStrength: 1.0 };
}

function defaultSpeedZone(id: string, points: {x: number, y: number}[]): SpeedZoneData {
  return { id, type: 'speedup', points, pulseAngle: 0 };
}

function defaultPortal(id: string, x: number, y: number, pairId: string, color: number): PortalData {
  return { id, x, y, pairId, color, pulseAngle: 0 };
}

function defaultTrappingBH(id: string, x: number, y: number): TrappingBlackHoleData {
  return { id, x, y, pullRadius: 300, pulseAngle: 0 };
}

function defaultWhiteHole(id: string, x: number, y: number): WhiteHoleData {
  return { id, x, y, ownerFaction: null, progress: 0, exploded: false, pulseAngle: 0 };
}

interface EditState {
  planets:             Map<string, PlanetData>;
  blackHoles:          Map<string, BlackHoleData>;
  speedZones:          Map<string, SpeedZoneData>;
  portals:             Map<string, PortalData>;
  trappingBlackHoles:  Map<string, TrappingBlackHoleData>;
  whiteHoles:          Map<string, WhiteHoleData>;
  selectedEntityId:    string | null;
  tool:                EditorTool;
  nextPlanetId:        number;
  nextBhId:            number;
  nextSpeedZoneId:     number;
  nextPortalId:        number;
  nextTBHId:           number;
  nextWhiteHoleId:     number;
  nextPortalPairId:    number;
  pendingPortalPairId: string | null;
  levelName:           string;
  category?:           string;
  worldWidth:          number;
  worldHeight:         number;
  fogOfWarConfig?:     { enabled: boolean };
  gammaRayConfig?:     { 
    enabled: boolean; 
    intervalSeconds?: number; 
    targetMode?: 'random' | 'locked'; 
    lockedPath?: GammaRayPath; 
    hasSecondRay?: boolean;
    intervalSeconds2?: number;
    lockedPath2?: GammaRayPath;
  };
  asteroidConfig?:     { enabled: boolean; damageLevel?: 1 | 2 | 3 };
}

export class EditorScene {
  private renderer: Renderer;
  private eventBus: EventBus;
  private sidebar!: EditorSidebar;
  private propertiesPanel!: PropertiesPanel;

  private editState: EditState = {
    planets:             new Map(),
    blackHoles:          new Map(),
    speedZones:          new Map(),
    portals:             new Map(),
    trappingBlackHoles:  new Map(),
    whiteHoles:          new Map(),
    selectedEntityId:    null,
    tool:                'select',
    nextPlanetId:        1,
    nextBhId:            1,
    nextSpeedZoneId:     1,
    nextPortalId:        1,
    nextTBHId:           1,
    nextWhiteHoleId:     1,
    nextPortalPairId:    1,
    pendingPortalPairId: null,
    levelName:           'Untitled',
    worldWidth:          2048,
    worldHeight:         2048,
  };

  private editorGfx!: Graphics;
  private editorContainer!: Container;
  private labelContainer!: Container;
  private uiContainer!: HTMLElement;

  // Drag/move state
  private dragEntity: string | null = null;
  private dragOffsetX = 0;
  private dragOffsetY = 0;
  private isDragging  = false;

  // Bound event listeners
  private _onMouseDown!: (e: MouseEvent) => void;
  private _onMouseMove!: (e: MouseEvent) => void;
  private _onMouseUp!:   (e: MouseEvent) => void;
  private _onContextMenu!: (e: MouseEvent) => void;
  private _onKeyDown!: (e: KeyboardEvent) => void;
  private _lastClickTime: number = 0;
  private placingSpeedZonePoints: {x: number, y: number}[] = [];
  private _onRaf!: number;

  onBack: () => void = () => {};
  onTestLevel: (levelData: LevelData) => void = () => {};

  constructor(renderer: Renderer, eventBus: EventBus) {
    this.renderer = renderer;
    this.eventBus = eventBus;
  }

  // ── Public API ────────────────────────────────────────────

  show(container: HTMLElement): void {
    this.uiContainer = container;
    this.lastTime = 0;

    // PixiJS rendering layer for editor graphics
    this.editorContainer = new Container();
    this.renderer.getWorldContainer().addChild(this.editorContainer);
    this.editorGfx     = new Graphics();
    this.labelContainer = new Container();
    this.editorContainer.addChild(this.editorGfx);
    this.editorContainer.addChild(this.labelContainer);

    // Sidebar
    this.sidebar = new EditorSidebar(container);
    this.sidebar.onToolChange = (tool) => { this.editState.tool = tool; this.updateCursor(); };
    this.sidebar.onBack       = () => this.onBack();
    this.sidebar.onSaveLevel  = () => this.showSaveOverlay();
    this.sidebar.onLoadLevel  = () => this.showLoadOverlay();
    this.sidebar.onTestLevel  = () => this.testLevel();
    (this.sidebar as any).onLevelNameChange = (name: string) => { this.editState.levelName = name; };
    (this.sidebar as any).onFogChange = (enabled: boolean) => { this.editState.fogOfWarConfig = enabled ? { enabled: true } : undefined; };
    (this.sidebar as any).onGammaRayChange = (enabled: boolean) => { this.editState.gammaRayConfig = enabled ? { enabled: true, intervalSeconds: 30 } : undefined; };
    (this.sidebar as any).onAsteroidsChange = (enabled: boolean) => { this.editState.asteroidConfig = enabled ? { enabled: true } : undefined; };

    // Properties panel
    this.propertiesPanel = new PropertiesPanel(container);
    this.propertiesPanel.onPlanetChange    = (id, changes) => this.updatePlanetProperty(id, changes);
    this.propertiesPanel.onBlackHoleChange = (id, changes) => this.updateBlackHoleProperty(id, changes);
    this.propertiesPanel.onSpeedZoneChange  = (id, changes) => this.updateSpeedZoneProperty(id, changes);
    this.propertiesPanel.onPortalChange     = (id, changes) => this.updatePortalProperty(id, changes);
    this.propertiesPanel.onTrappingBHChange = (id, changes) => this.updateTrappingBHProperty(id, changes);
    this.propertiesPanel.onLevelSettingsChange = (changes) => {
      Object.assign(this.editState, changes);
    };
    this.propertiesPanel.onDeselect        = () => this.selectEntity(null);
    this.propertiesPanel.onDeleteEntity    = (id) => {
      this.deleteEntity(id);
      this.propertiesPanel.hide();
    };

    // Cursor style
    this.updateCursor();

    // Bind mouse events to canvas
    this.bindCanvasEvents();

    // Show level settings by default
    this.selectEntity(null);

    // Start render loop
    this._onRaf = requestAnimationFrame(this.rafLoop);
  }

  hide(): void {
    cancelAnimationFrame(this._onRaf);
    this.unbindCanvasEvents();
    this.renderer.canvas.style.cursor = 'default';
    this.renderer.stage.removeChild(this.editorContainer);
    this.editorContainer.destroy({ children: true });
    this.sidebar?.destroy();
    this.propertiesPanel?.destroy();
  }

  destroy(): void {
    this.hide();
  }

  // ── Render Loop ───────────────────────────────────────────

  private lastTime = 0;

  private rafLoop = (timestamp: number): void => {
    if (!this.lastTime) this.lastTime = timestamp;
    const dt = Math.min((timestamp - this.lastTime) / 1000, 0.1);
    this.lastTime = timestamp;

    this.updateEditor(dt);
    this.renderEditor();
    this._onRaf = requestAnimationFrame(this.rafLoop);
  };

  private updateEditor(dt: number): void {
    // Update orbiting planets
    this.editState.planets.forEach(planet => {
      if (planet.isOrbiting) {
        // Pause the orbit animation if this planet is currently being edited
        if (this.editState.selectedEntityId !== planet.id) {
          const orbitSpeed   = planet.orbitSpeed ?? 0.3;
          planet.orbitAngle = ((planet.orbitAngle ?? 0) + orbitSpeed * dt);
        }
        const orbitCenterX = planet.orbitCenterX ?? planet.x;
        const orbitCenterY = planet.orbitCenterY ?? planet.y;
        const orbitRadiusX = planet.orbitRadius ?? 120;
        const orbitRadiusY = planet.orbitShape === 'ellipse' ? (planet.orbitRadiusY ?? orbitRadiusX) : orbitRadiusX;

        planet.x = orbitCenterX + orbitRadiusX * Math.cos(planet.orbitAngle ?? 0);
        planet.y = orbitCenterY + orbitRadiusY * Math.sin(planet.orbitAngle ?? 0);
      }
    });

    // Update animations for other elements in editor
    this.editState.speedZones.forEach(sz => {
      sz.pulseAngle = (sz.pulseAngle ?? 0) + 0.8 * dt;
    });
    this.editState.portals.forEach(p => {
      p.pulseAngle = (p.pulseAngle ?? 0) + 1.0 * dt;
    });
    this.editState.trappingBlackHoles.forEach(tbh => {
      tbh.pulseAngle = (tbh.pulseAngle ?? 0) + 0.9 * dt;
    });
    this.editState.whiteHoles.forEach(wh => {
      wh.pulseAngle = (wh.pulseAngle ?? 0) + 1.0 * dt;
    });
  }

  private renderEditor(): void {
    const gfx = this.editorGfx;
    gfx.clear();

    // ── World boundary ────────────────────────────────────
    gfx.rect(0, 0, this.editState.worldWidth, this.editState.worldHeight);
    gfx.stroke({ color: 0x4fc3f7, alpha: 0.12, width: 2 });

    // ── Grid ──────────────────────────────────────────────
    this.drawGrid(gfx);

    // ── Black Holes ───────────────────────────────────────
    this.editState.blackHoles.forEach(bh => {
      this.drawBlackHole(gfx, bh);
    });

    // ── Planets ───────────────────────────────────────────
    this.editState.planets.forEach(planet => {
      this.drawPlanet(gfx, planet);
    });

    // ── Speed Zones ───────────────────────────────────────
    this.editState.speedZones.forEach(sz => {
      this.drawSpeedZone(gfx, sz);
    });

    // ── Portals ───────────────────────────────────────────
    this.editState.portals.forEach(portal => {
      this.drawPortal(gfx, portal);
    });

    // ── Trapping Black Holes ──────────────────────────────
    this.editState.trappingBlackHoles.forEach(tbh => {
      this.drawTrappingBH(gfx, tbh);
    });

    // ── White Holes ───────────────────────────────────────
    this.editState.whiteHoles.forEach(wh => {
      this.drawWhiteHole(gfx, wh);
    });

    // ── Gamma Ray ─────────────────────────────────────────
    this.drawGammaRay(gfx);

    // ── Placing Speed Zone Poly ───────────────────────────
    if (this.editState.tool === 'place_speedzone' && this.placingSpeedZonePoints.length > 0) {
      const pts = this.placingSpeedZonePoints;
      gfx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) {
        gfx.lineTo(pts[i].x, pts[i].y);
      }
      gfx.stroke({ color: 0x22c55e, alpha: 0.8, width: 2 });
      for (const p of pts) {
        gfx.circle(p.x, p.y, 4).fill({ color: 0xffffff });
      }
    }

    // ── Labels ────────────────────────────────────────────
    this.updateLabels();
  }

  private drawGammaRay(gfx: Graphics): void {
    const config = this.editState.gammaRayConfig;
    if (!config || !config.enabled || config.targetMode !== 'locked') return;

    if (!config.lockedPath) {
      config.lockedPath = { x1: 100, y1: this.editState.worldHeight / 2, x2: this.editState.worldWidth - 100, y2: this.editState.worldHeight / 2, width: 320, targetedPlanetIds: [] };
    }

    const { x1, y1, x2, y2 } = config.lockedPath;

    // Draw the main path line
    gfx.moveTo(x1, y1);
    gfx.lineTo(x2, y2);
    gfx.stroke({ color: 0xff0000, alpha: 0.15, width: config.lockedPath.width || 320 });
    gfx.moveTo(x1, y1);
    gfx.lineTo(x2, y2);
    gfx.stroke({ color: 0xff0000, alpha: 0.6, width: 4 });

    // Draw handles
    const isSelected = this.editState.selectedEntityId === 'gammaRayHandle1' || this.editState.selectedEntityId === 'gammaRayHandle2';
    const handleAlpha = isSelected ? 1.0 : 0.6;

    gfx.circle(x1, y1, 16).fill({ color: 0xff4444, alpha: handleAlpha }).stroke({ color: 0xffffff, alpha: handleAlpha, width: 2 });
    gfx.circle(x2, y2, 16).fill({ color: 0xff4444, alpha: handleAlpha }).stroke({ color: 0xffffff, alpha: handleAlpha, width: 2 });

    if (config.hasSecondRay) {
      if (!config.lockedPath2) {
        config.lockedPath2 = { x1: 200, y1: this.editState.worldHeight / 3, x2: this.editState.worldWidth - 200, y2: this.editState.worldHeight / 3, width: 320, targetedPlanetIds: [] };
      }
      const p2 = config.lockedPath2;
      gfx.moveTo(p2.x1, p2.y1);
      gfx.lineTo(p2.x2, p2.y2);
      gfx.stroke({ color: 0xff0000, alpha: 0.15, width: p2.width || 320 });
      gfx.moveTo(p2.x1, p2.y1);
      gfx.lineTo(p2.x2, p2.y2);
      gfx.stroke({ color: 0xff0000, alpha: 0.6, width: 4 });

      const isSelected2 = this.editState.selectedEntityId === 'gammaRayHandle3' || this.editState.selectedEntityId === 'gammaRayHandle4';
      const handleAlpha2 = isSelected2 ? 1.0 : 0.6;

      gfx.circle(p2.x1, p2.y1, 16).fill({ color: 0xff8844, alpha: handleAlpha2 }).stroke({ color: 0xffffff, alpha: handleAlpha2, width: 2 });
      gfx.circle(p2.x2, p2.y2, 16).fill({ color: 0xff8844, alpha: handleAlpha2 }).stroke({ color: 0xffffff, alpha: handleAlpha2, width: 2 });
    }
  }

  private drawGrid(gfx: Graphics): void {
    const GRID = 128;
    const W = this.editState.worldWidth;
    const H = this.editState.worldHeight;
    gfx.setStrokeStyle({ color: 0xffffff, alpha: 0.04, width: 1 });
    for (let x = 0; x <= W; x += GRID) {
      gfx.moveTo(x, 0);
      gfx.lineTo(x, H);
      gfx.stroke();
    }
    for (let y = 0; y <= H; y += GRID) {
      gfx.moveTo(0, y);
      gfx.lineTo(W, y);
      gfx.stroke();
    }
  }

  private drawPlanet(gfx: Graphics, planet: PlanetData): void {
    const r     = PLANET_RADIUS[planet.upgradeLevel];
    const color = FACTION_COLORS[planet.faction];
    const isSelected = planet.id === this.editState.selectedEntityId;

    // Orbit path (dashed approximation)
    if (planet.isOrbiting && planet.orbitCenterX !== undefined && planet.orbitRadius !== undefined) {
      const rx = planet.orbitRadius;
      const ry = planet.orbitShape === 'ellipse' ? (planet.orbitRadiusY ?? rx) : rx;
      this.drawDashedOrbit(gfx, planet.orbitCenterX, planet.orbitCenterY!, rx, ry, 32, 0x4fc3f7, 0.2);
    }

    // Planet body
    gfx.circle(planet.x, planet.y, r);
    gfx.fill({ color, alpha: 0.85 });

    // Outer glow ring
    gfx.circle(planet.x, planet.y, r + 4);
    gfx.stroke({ color, alpha: 0.3, width: 2 });

    // Fog of War Vision Rings
    if (this.editState.fogOfWarConfig?.enabled) {
      // Player vision radii for level 1, 2, and 3
      const radii = [250, 425, 650];
      radii.forEach((visionRadius, index) => {
        gfx.circle(planet.x, planet.y, visionRadius);
        // Dimmer for larger radii, using dashed-like or faint solid
        const alpha = 0.4 - (index * 0.1);
        gfx.stroke({ color: 0xffffff, alpha, width: 2 });
      });
    }

    // Selection ring
    if (isSelected) {
      gfx.circle(planet.x, planet.y, r + 10);
      gfx.stroke({ color: 0xffee00, alpha: 0.9, width: 2 });
    }

    // Upgrade level indicator dots
    for (let i = 0; i < planet.upgradeLevel; i++) {
      const angle = (i / 3) * Math.PI * 2 - Math.PI / 2;
      const dx = Math.cos(angle) * (r - 5);
      const dy = Math.sin(angle) * (r - 5);
      gfx.circle(planet.x + dx, planet.y + dy, 2.5);
      gfx.fill({ color: 0xffffff, alpha: 0.7 });
    }
  }

  private drawBlackHole(gfx: Graphics, bh: BlackHoleData): void {
    const isSelected = bh.id === this.editState.selectedEntityId;

    // Pull radius (influence zone)
    gfx.circle(bh.x, bh.y, bh.pullRadius);
    if (isSelected) {
      gfx.fill({ color: 0x9c27b0, alpha: 0.06 });
      gfx.stroke({ color: 0xe040fb, alpha: 0.6, width: 2 });
    } else {
      gfx.stroke({ color: 0x9c27b0, alpha: 0.22, width: 1.2 });
    }

    // Core swirl rings
    [1.0, 0.75, 0.5, 0.3].forEach((scale, i) => {
      gfx.circle(bh.x, bh.y, bh.radius * scale);
      gfx.fill({ color: 0x0d0d1a, alpha: 1 });
      gfx.stroke({ color: 0x7b1fa2, alpha: 0.6 - i * 0.12, width: 1.5 });
    });

    // Destruction radius
    gfx.circle(bh.x, bh.y, bh.radius);
    gfx.stroke({ color: 0xce93d8, alpha: 0.5, width: 1.5 });

    // Selection ring
    if (isSelected) {
      gfx.circle(bh.x, bh.y, bh.radius + 12);
      gfx.stroke({ color: 0xffee00, alpha: 0.9, width: 2 });
    }
  }

  private drawSpeedZone(gfx: Graphics, sz: SpeedZoneData): void {
    const isSelected = sz.id === this.editState.selectedEntityId;
    const color = sz.type === 'speedup' ? 0x22c55e : 0xef4444;

    if (sz.points && sz.points.length >= 3) {
      gfx.poly(sz.points);
      gfx.fill({ color, alpha: 0.06 });
      gfx.poly(sz.points);
      gfx.stroke({ color, alpha: 0.5, width: isSelected ? 2.5 : 1.5 });
      
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const p of sz.points) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
      const hw = (maxX - minX) / 2;
      const hh = (maxY - minY) / 2;
      const cx = minX + hw;
      const cy = minY + hh;

      gfx.circle(cx, cy, 8);
      gfx.fill({ color, alpha: 0.7 });

      if (isSelected) {
        gfx.rect(minX - 8, minY - 8, maxX - minX + 16, maxY - minY + 16);
        gfx.stroke({ color: 0xffee00, alpha: 0.9, width: 2 });
      }
    }
  }

  private drawPortal(gfx: Graphics, portal: PortalData): void {
    const isSelected = portal.id === this.editState.selectedEntityId;
    const color = portal.color;

    // Outer glow
    gfx.circle(portal.x, portal.y, 40);
    gfx.fill({ color, alpha: 0.1 });
    // Main ring
    gfx.circle(portal.x, portal.y, 32);
    gfx.fill({ color, alpha: 0.2 });
    // Core
    gfx.circle(portal.x, portal.y, 18);
    gfx.fill({ color: 0xffffff, alpha: 0.5 });
    // Stroke
    gfx.circle(portal.x, portal.y, 40);
    gfx.stroke({ color, alpha: 0.9, width: isSelected ? 3 : 2 });

    if (isSelected) {
      gfx.circle(portal.x, portal.y, 52);
      gfx.stroke({ color: 0xffee00, alpha: 0.9, width: 2 });
    }
  }

  private drawTrappingBH(gfx: Graphics, tbh: TrappingBlackHoleData): void {
    const isSelected = tbh.id === this.editState.selectedEntityId;

    // Pull radius zone fill & stroke
    gfx.circle(tbh.x, tbh.y, tbh.pullRadius);
    if (isSelected) {
      gfx.fill({ color: 0x9933ff, alpha: 0.06 });
      gfx.stroke({ color: 0xd500f9, alpha: 0.6, width: 2 });
    } else {
      gfx.fill({ color: 0x000000, alpha: 0.12 });
      gfx.stroke({ color: 0x6600cc, alpha: 0.35, width: 1.2 });
    }

    // Core fill
    gfx.circle(tbh.x, tbh.y, 28);
    gfx.fill({ color: 0x0d0d1a, alpha: 1 });
    // Core stroke
    gfx.circle(tbh.x, tbh.y, 28);
    gfx.stroke({ color: 0x9933ff, alpha: 0.8, width: 2 });

    if (isSelected) {
      gfx.circle(tbh.x, tbh.y, 44);
      gfx.stroke({ color: 0xffee00, alpha: 0.9, width: 2 });
    }
  }

  private drawWhiteHole(gfx: Graphics, wh: WhiteHoleData): void {
    const isSelected = wh.id === this.editState.selectedEntityId;

    // Corona glow
    gfx.circle(wh.x, wh.y, 36);
    gfx.fill({ color: 0xfffde7, alpha: 0.12 });
    // Core star
    gfx.circle(wh.x, wh.y, 22);
    gfx.fill({ color: 0xffffff, alpha: 0.9 });
    // Core stroke
    gfx.circle(wh.x, wh.y, 22);
    gfx.stroke({ color: 0xfff9e0, alpha: 0.6, width: 2 });

    if (isSelected) {
      gfx.circle(wh.x, wh.y, 38);
      gfx.stroke({ color: 0xffee00, alpha: 0.9, width: 2 });
    }
  }

  private drawDashedOrbit(
    gfx: Graphics,
    cx: number, cy: number, radiusX: number, radiusY: number,
    segments: number,
    color: number, alpha: number
  ): void {
    const step = (Math.PI * 2) / segments;
    for (let i = 0; i < segments; i++) {
      if (i % 2 === 0) continue; // skip every other for dash effect
      const a1 = i * step;
      const a2 = (i + 1) * step;
      gfx.moveTo(cx + Math.cos(a1) * radiusX, cy + Math.sin(a1) * radiusY);
      gfx.lineTo(cx + Math.cos(a2) * radiusX, cy + Math.sin(a2) * radiusY);
      gfx.stroke({ color, alpha, width: 1 });
    }
  }

  private updateLabels(): void {
    // Remove old labels
    this.labelContainer.removeChildren();

    // Planet labels
    this.editState.planets.forEach(planet => {
      const colorHex = FACTION_COLORS_HEX[planet.faction];
      const label = new Text({
        text: `${planet.faction.charAt(0).toUpperCase()} L${planet.upgradeLevel}`,
        style: {
          fontFamily: 'Orbitron',
          fontSize: 8,
          fill: colorHex,
          align: 'center',
        },
      });
      label.anchor.set(0.5, 0.5);
      label.x = planet.x;
      label.y = planet.y + PLANET_RADIUS[planet.upgradeLevel] + 12;
      this.labelContainer.addChild(label);
    });

    // Speed Zone labels
    this.editState.speedZones.forEach(sz => {
      const label = new Text({
        text: sz.type === 'speedup' ? '⚡+' : '🐌-',
        style: {
          fontFamily: 'sans-serif',
          fontSize: 11,
          fill: sz.type === 'speedup' ? '#22c55e' : '#ef4444',
          align: 'center',
        },
      });
      label.anchor.set(0.5, 0.5);
      if (sz.points && sz.points.length > 0) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const p of sz.points) {
          if (p.x < minX) minX = p.x;
          if (p.y < minY) minY = p.y;
          if (p.x > maxX) maxX = p.x;
          if (p.y > maxY) maxY = p.y;
        }
        label.x = minX + (maxX - minX) / 2;
        label.y = minY + (maxY - minY) / 2;
      }
      this.labelContainer.addChild(label);
    });

    // Portal labels (show pairId)
    this.editState.portals.forEach(portal => {
      const colorHex = '#' + portal.color.toString(16).padStart(6, '0');
      const label = new Text({
        text: portal.pairId,
        style: {
          fontFamily: 'monospace',
          fontSize: 9,
          fill: colorHex,
          align: 'center',
        },
      });
      label.anchor.set(0.5, 0.5);
      label.x = portal.x;
      label.y = portal.y + 52;
      this.labelContainer.addChild(label);
    });

    // Trapping BH labels
    this.editState.trappingBlackHoles.forEach(tbh => {
      const label = new Text({
        text: 'TBH',
        style: {
          fontFamily: 'monospace',
          fontSize: 9,
          fill: '#9933ff',
          align: 'center',
        },
      });
      label.anchor.set(0.5, 0.5);
      label.x = tbh.x;
      label.y = tbh.y;
      this.labelContainer.addChild(label);
    });

    // White Hole labels
    this.editState.whiteHoles.forEach(wh => {
      const label = new Text({
        text: 'WH',
        style: {
          fontFamily: 'monospace',
          fontSize: 9,
          fill: '#fffde7',
          align: 'center',
        },
      });
      label.anchor.set(0.5, 0.5);
      label.x = wh.x;
      label.y = wh.y + 30;
      this.labelContainer.addChild(label);
    });
  }

  // ── Canvas Event Binding ───────────────────────────────────

  private bindCanvasEvents(): void {
    const target = this.uiContainer;

    this._onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const now = performance.now();
      const isDouble = (now - this._lastClickTime) < 300;
      this._lastClickTime = now;

      const { x, y } = this.canvasToWorld(e);
      if (isDouble && this.editState.tool === 'place_speedzone') {
        this.finishPlacingPolygon();
      } else {
        this.handleCanvasClick(x, y, e.shiftKey);
      }
    };

    this._onMouseMove = (e: MouseEvent) => {
      if (this.dragEntity && this.isDragging) {
        const { x, y } = this.canvasToWorld(e);
        this.moveEntity(this.dragEntity, x - this.dragOffsetX, y - this.dragOffsetY);
        this.updateCursor();
      }
    };

    this._onMouseUp = (e: MouseEvent) => {
      if (e.button === 0) {
        this.isDragging  = false;
        this.dragEntity  = null;
      }
    };

    this._onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      const { x, y } = this.canvasToWorld(e);
      this.handleCanvasRightClick(x, y);
    };

    this._onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        if (this.editState.tool === 'place_speedzone') {
          this.finishPlacingPolygon();
        }
      }
    };

    target.addEventListener('mousedown',   this._onMouseDown);
    target.addEventListener('mousemove',   this._onMouseMove);
    target.addEventListener('mouseup',     this._onMouseUp);
    target.addEventListener('contextmenu', this._onContextMenu);
    window.addEventListener('keydown',     this._onKeyDown);
  }

  private unbindCanvasEvents(): void {
    const target = this.uiContainer;
    target.removeEventListener('mousedown',   this._onMouseDown);
    target.removeEventListener('mousemove',   this._onMouseMove);
    target.removeEventListener('mouseup',     this._onMouseUp);
    target.removeEventListener('contextmenu', this._onContextMenu);
    window.removeEventListener('keydown',     this._onKeyDown);
  }

  private canvasToWorld(e: MouseEvent): { x: number; y: number } {
    const rect = this.renderer.canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    return this.renderer.screenToWorld(screenX, screenY);
  }

  private updateCursor(): void {
    const cursors: Record<EditorTool, string> = {
      select:           'default',
      place_planet:     'crosshair',
      place_blackhole:  'crosshair',
      place_speedzone:  'crosshair',
      place_portal:     'crosshair',
      place_trappingbh: 'crosshair',
      place_whitehole:  'crosshair',
      delete:           'not-allowed',
    };
    this.uiContainer.style.cursor = cursors[this.editState.tool];
  }

  // ── Click Handlers ─────────────────────────────────────────

  private handleCanvasClick(wx: number, wy: number, _shift: boolean): void {
    const tool = this.editState.tool;

    if (tool === 'place_planet')     { this.placePlanet(wx, wy);     return; }
    if (tool === 'place_blackhole')  { this.placeBlackHole(wx, wy);  return; }
    if (tool === 'place_speedzone')  { this.placeSpeedZone(wx, wy);  return; }
    if (tool === 'place_portal')     { this.placePortal(wx, wy);     return; }
    if (tool === 'place_trappingbh') { this.placeTrappingBH(wx, wy); return; }
    if (tool === 'place_whitehole')  { this.placeWhiteHole(wx, wy);  return; }

    if (tool === 'delete') {
      const hit = this.hitTestEntity(wx, wy);
      if (hit) this.deleteEntity(hit);
      return;
    }

    // Select tool
    const hit = this.hitTestEntity(wx, wy);
    if (hit !== this.editState.selectedEntityId) {
      this.selectEntity(hit);
    }
    if (hit) {
      // Begin drag — find entity position
      const ex = this.getEntityX(hit);
      const ey = this.getEntityY(hit);
      this.dragEntity   = hit;
      this.dragOffsetX  = wx - ex;
      this.dragOffsetY  = wy - ey;
      this.isDragging   = true;
    } else {
      this.selectEntity(null);
    }
  }

  private handleCanvasRightClick(wx: number, wy: number): void {
    if (this.editState.tool === 'place_speedzone') {
      this.finishPlacingPolygon();
      return;
    }
    const hit = this.hitTestEntity(wx, wy);
    if (hit) {
      this.deleteEntity(hit);
    }
  }

  private finishPlacingPolygon(): void {
    if (this.placingSpeedZonePoints.length >= 3) {
      const id = `sz${this.editState.nextSpeedZoneId++}`;
      const sz = defaultSpeedZone(id, [...this.placingSpeedZonePoints]);
      this.editState.speedZones.set(id, sz);
      this.selectEntity(id);
    }
    this.placingSpeedZonePoints = [];
  }

  /** Get x position of any entity by id */
  private getEntityX(id: string): number {
    if (id === 'gammaRayHandle1') return this.editState.gammaRayConfig?.lockedPath?.x1 ?? 0;
    if (id === 'gammaRayHandle2') return this.editState.gammaRayConfig?.lockedPath?.x2 ?? 0;
    if (id === 'gammaRayHandle3') return this.editState.gammaRayConfig?.lockedPath2?.x1 ?? 0;
    if (id === 'gammaRayHandle4') return this.editState.gammaRayConfig?.lockedPath2?.x2 ?? 0;

    return this.editState.planets.get(id)?.x
      ?? this.editState.blackHoles.get(id)?.x
      ?? this.editState.speedZones.get(id)?.points?.[0]?.x
      ?? this.editState.portals.get(id)?.x
      ?? this.editState.trappingBlackHoles.get(id)?.x
      ?? this.editState.whiteHoles.get(id)?.x
      ?? 0;
  }

  /** Get y position of any entity by id */
  private getEntityY(id: string): number {
    if (id === 'gammaRayHandle1') return this.editState.gammaRayConfig?.lockedPath?.y1 ?? 0;
    if (id === 'gammaRayHandle2') return this.editState.gammaRayConfig?.lockedPath?.y2 ?? 0;
    if (id === 'gammaRayHandle3') return this.editState.gammaRayConfig?.lockedPath2?.y1 ?? 0;
    if (id === 'gammaRayHandle4') return this.editState.gammaRayConfig?.lockedPath2?.y2 ?? 0;

    return this.editState.planets.get(id)?.y
      ?? this.editState.blackHoles.get(id)?.y
      ?? this.editState.speedZones.get(id)?.points?.[0]?.y
      ?? this.editState.portals.get(id)?.y
      ?? this.editState.trappingBlackHoles.get(id)?.y
      ?? this.editState.whiteHoles.get(id)?.y
      ?? 0;
  }

  // ── Entity Operations ─────────────────────────────────────

  private selectEntity(id: string | null): void {
    this.editState.selectedEntityId = id;
    if (!id) { this.propertiesPanel.showLevelSettings(this.editState); return; }
    const planet = this.editState.planets.get(id);
    if (planet) { this.propertiesPanel.showPlanet(planet); return; }
    const bh = this.editState.blackHoles.get(id);
    if (bh) { this.propertiesPanel.showBlackHole(bh); return; }
    const sz = this.editState.speedZones.get(id);
    if (sz) { this.propertiesPanel.showSpeedZone(sz); return; }
    const portal = this.editState.portals.get(id);
    if (portal) { this.propertiesPanel.showPortal(portal); return; }
    const tbh = this.editState.trappingBlackHoles.get(id);
    if (tbh) { this.propertiesPanel.showTrappingBH(tbh); return; }
    const wh = this.editState.whiteHoles.get(id);
    if (wh) { this.propertiesPanel.showWhiteHole(wh); return; }
  }

  private placePlanet(wx: number, wy: number): void {
    const id = `ep${this.editState.nextPlanetId++}`;
    const planet = defaultPlanet(id, Math.round(wx), Math.round(wy));
    this.editState.planets.set(id, planet);
    this.selectEntity(id);
  }

  private placeBlackHole(wx: number, wy: number): void {
    const id = `bh${this.editState.nextBhId++}`;
    const bh = defaultBlackHole(id, Math.round(wx), Math.round(wy));
    this.editState.blackHoles.set(id, bh);
    this.selectEntity(id);
  }

  private placeSpeedZone(wx: number, wy: number): void {
    this.placingSpeedZonePoints.push({ x: Math.round(wx), y: Math.round(wy) });
  }

  private placePortal(wx: number, wy: number): void {
    // Portals come in pairs. First click creates pair id, second click completes pair.
    const pairId = this.editState.pendingPortalPairId
      ?? `pair_${this.editState.nextPortalPairId++}`;

    const PORTAL_COLORS = [0x00ff88, 0xff8800, 0xff00ff, 0x00ffff, 0xffff00, 0xff4444];
    let color = PORTAL_COLORS[(this.editState.nextPortalPairId - 1) % PORTAL_COLORS.length];

    // If this is the second portal of the pair, inherit the color from the first
    if (this.editState.pendingPortalPairId !== null) {
      for (const p of this.editState.portals.values()) {
        if (p.pairId === pairId) { color = p.color; break; }
      }
    }

    const id = `portal${this.editState.nextPortalId++}`;
    const portal = defaultPortal(id, Math.round(wx), Math.round(wy), pairId, color);
    this.editState.portals.set(id, portal);

    // Toggle pending pair state
    if (this.editState.pendingPortalPairId === null) {
      this.editState.pendingPortalPairId = pairId; // wait for second click
    } else {
      this.editState.pendingPortalPairId = null; // pair complete
    }

    this.selectEntity(id);
  }

  private placeTrappingBH(wx: number, wy: number): void {
    const id = `tbh${this.editState.nextTBHId++}`;
    const tbh = defaultTrappingBH(id, Math.round(wx), Math.round(wy));
    this.editState.trappingBlackHoles.set(id, tbh);
    this.selectEntity(id);
  }

  private placeWhiteHole(wx: number, wy: number): void {
    const id = `wh${this.editState.nextWhiteHoleId++}`;
    const wh = defaultWhiteHole(id, Math.round(wx), Math.round(wy));
    this.editState.whiteHoles.set(id, wh);
    this.selectEntity(id);
  }

  private deleteEntity(id: string): void {
    this.editState.planets.delete(id);
    this.editState.blackHoles.delete(id);
    this.editState.speedZones.delete(id);
    this.editState.portals.delete(id);
    this.editState.trappingBlackHoles.delete(id);
    this.editState.whiteHoles.delete(id);
    if (this.editState.selectedEntityId === id) {
      this.editState.selectedEntityId = null;
      this.propertiesPanel.hide();
    }
  }

  private deleteSelected(): void {
    if (this.editState.selectedEntityId) {
      this.deleteEntity(this.editState.selectedEntityId);
    }
  }

  private moveEntity(id: string, nx: number, ny: number): void {
    if (id.startsWith('gammaRayHandle')) {
      if (id === 'gammaRayHandle1' || id === 'gammaRayHandle2') {
        const p = this.editState.gammaRayConfig?.lockedPath;
        if (p) {
          if (id === 'gammaRayHandle1') { p.x1 = Math.round(nx); p.y1 = Math.round(ny); }
          if (id === 'gammaRayHandle2') { p.x2 = Math.round(nx); p.y2 = Math.round(ny); }
        }
      } else {
        const p2 = this.editState.gammaRayConfig?.lockedPath2;
        if (p2) {
          if (id === 'gammaRayHandle3') { p2.x1 = Math.round(nx); p2.y1 = Math.round(ny); }
          if (id === 'gammaRayHandle4') { p2.x2 = Math.round(nx); p2.y2 = Math.round(ny); }
        }
      }
      return;
    }

    const planet = this.editState.planets.get(id);
    if (planet) {
      if (planet.isOrbiting && planet.orbitCenterX !== undefined && planet.orbitCenterY !== undefined) {
        const dx = Math.round(nx) - planet.x;
        const dy = Math.round(ny) - planet.y;
        planet.orbitCenterX += dx;
        planet.orbitCenterY += dy;
      }
      planet.x = Math.round(nx);
      planet.y = Math.round(ny);
      if (this.editState.selectedEntityId === id) {
        this.propertiesPanel.showPlanet({ ...planet });
      }
      return;
    }
    const bh = this.editState.blackHoles.get(id);
    if (bh) {
      bh.x = Math.round(nx);
      bh.y = Math.round(ny);
      if (this.editState.selectedEntityId === id) {
        this.propertiesPanel.showBlackHole({ ...bh });
      }
      return;
    }
    const sz = this.editState.speedZones.get(id);
    if (sz && sz.points && sz.points.length > 0) {
      const dx = Math.round(nx) - sz.points[0].x;
      const dy = Math.round(ny) - sz.points[0].y;
      for (const p of sz.points) {
        p.x += dx;
        p.y += dy;
      }
      if (this.editState.selectedEntityId === id) {
        this.propertiesPanel.showSpeedZone({ ...sz });
      }
      return;
    }
    const portal = this.editState.portals.get(id);
    if (portal) {
      portal.x = Math.round(nx);
      portal.y = Math.round(ny);
      if (this.editState.selectedEntityId === id) {
        this.propertiesPanel.showPortal({ ...portal });
      }
      return;
    }
    const tbh = this.editState.trappingBlackHoles.get(id);
    if (tbh) {
      tbh.x = Math.round(nx);
      tbh.y = Math.round(ny);
      if (this.editState.selectedEntityId === id) {
        this.propertiesPanel.showTrappingBH({ ...tbh });
      }
      return;
    }
    const wh = this.editState.whiteHoles.get(id);
    if (wh) {
      wh.x = Math.round(nx);
      wh.y = Math.round(ny);
      if (this.editState.selectedEntityId === id) {
        this.propertiesPanel.showWhiteHole({ ...wh });
      }
    }
  }

  private updatePlanetProperty(planetId: string, changes: Partial<PlanetDef>): void {
    const planet = this.editState.planets.get(planetId);
    if (!planet) return;

    if (changes.faction !== undefined)         planet.faction = changes.faction as Faction;
    if (changes.upgradeLevel !== undefined) {
      planet.upgradeLevel  = changes.upgradeLevel as UpgradeLevel;
      planet.maxHealth     = PLANET_MAX_HEALTH[planet.upgradeLevel];
      planet.productionRate = PLANET_PRODUCTION[planet.upgradeLevel];
    }
    if (changes.startingParticles !== undefined) planet.health = changes.startingParticles;
    if (changes.isShielded !== undefined)        planet.isShielded = changes.isShielded;
    if (changes.isOrbiting !== undefined) {
      planet.isOrbiting = changes.isOrbiting;
      if (planet.isOrbiting) {
        if (planet.orbitCenterX === undefined) planet.orbitCenterX = planet.x;
        if (planet.orbitRadius === undefined) planet.orbitRadius = 120;
        if (planet.orbitRadiusY === undefined) planet.orbitRadiusY = 120;
        if (planet.orbitSpeed === undefined) planet.orbitSpeed = 0.3;
        if (planet.orbitAngle === undefined) planet.orbitAngle = Math.PI / 2;
        if (planet.orbitCenterY === undefined) planet.orbitCenterY = planet.y - (planet.orbitRadiusY ?? planet.orbitRadius ?? 120);
      }
    }
    if (changes.orbitShape !== undefined)        planet.orbitShape = changes.orbitShape;
    if (changes.orbitSpeed !== undefined)        planet.orbitSpeed = changes.orbitSpeed;
    if (changes.orbitCenterX !== undefined)      planet.orbitCenterX = changes.orbitCenterX;
    if (changes.orbitCenterY !== undefined)      planet.orbitCenterY = changes.orbitCenterY;

    // Radius setting + clamping
    if (changes.orbitRadius !== undefined || changes.orbitRadiusY !== undefined) {
      if (changes.orbitRadius !== undefined) planet.orbitRadius = changes.orbitRadius;
      if (changes.orbitRadiusY !== undefined) planet.orbitRadiusY = changes.orbitRadiusY;

      // Clamp to keep within world bounds
      if (planet.orbitCenterX !== undefined && planet.orbitCenterY !== undefined) {
        if (planet.orbitRadius !== undefined) {
          const maxRx1 = planet.orbitCenterX;
          const maxRx2 = this.editState.worldWidth - planet.orbitCenterX;
          planet.orbitRadius = Math.min(planet.orbitRadius, Math.max(50, Math.min(maxRx1, maxRx2)));
        }
        if (planet.orbitRadiusY !== undefined) {
          const maxRy1 = planet.orbitCenterY;
          const maxRy2 = this.editState.worldHeight - planet.orbitCenterY;
          planet.orbitRadiusY = Math.min(planet.orbitRadiusY, Math.max(50, Math.min(maxRy1, maxRy2)));
        }
      }
    }
  }

  private updateBlackHoleProperty(bhId: string, changes: Partial<BlackHoleData>): void {
    const bh = this.editState.blackHoles.get(bhId);
    if (!bh) return;
    Object.assign(bh, changes);
  }

  private updateSpeedZoneProperty(id: string, changes: Partial<SpeedZoneDef>): void {
    const sz = this.editState.speedZones.get(id);
    if (!sz) return;
    if (changes.type   !== undefined) sz.type   = changes.type as SpeedZoneType;
  }

  private updatePortalProperty(id: string, changes: Partial<PortalDef>): void {
    const p = this.editState.portals.get(id);
    if (!p) return;
    if (changes.pairId !== undefined) p.pairId = changes.pairId;
    if (changes.color  !== undefined) p.color  = changes.color;
  }

  private updateTrappingBHProperty(id: string, changes: Partial<TrappingBlackHoleDef>): void {
    const tbh = this.editState.trappingBlackHoles.get(id);
    if (!tbh) return;
    if (changes.pullRadius !== undefined) tbh.pullRadius = changes.pullRadius;
  }

  // ── Hit Testing ───────────────────────────────────────────

  private hitTestEntity(wx: number, wy: number): string | null {
    let best: string | null = null;
    let bestDist = Infinity;

    // Test Gamma Ray handles
    if (this.editState.gammaRayConfig?.enabled && this.editState.gammaRayConfig?.targetMode === 'locked') {
      if (this.editState.gammaRayConfig?.lockedPath) {
        const p = this.editState.gammaRayConfig.lockedPath;
        const d1 = Math.sqrt((p.x1 - wx) ** 2 + (p.y1 - wy) ** 2);
        if (d1 <= 20 && d1 < bestDist) { bestDist = d1; best = 'gammaRayHandle1'; }
        const d2 = Math.sqrt((p.x2 - wx) ** 2 + (p.y2 - wy) ** 2);
        if (d2 <= 20 && d2 < bestDist) { bestDist = d2; best = 'gammaRayHandle2'; }
      }
      if (this.editState.gammaRayConfig?.hasSecondRay && this.editState.gammaRayConfig?.lockedPath2) {
        const p2 = this.editState.gammaRayConfig.lockedPath2;
        const d3 = Math.sqrt((p2.x1 - wx) ** 2 + (p2.y1 - wy) ** 2);
        if (d3 <= 20 && d3 < bestDist) { bestDist = d3; best = 'gammaRayHandle3'; }
        const d4 = Math.sqrt((p2.x2 - wx) ** 2 + (p2.y2 - wy) ** 2);
        if (d4 <= 20 && d4 < bestDist) { bestDist = d4; best = 'gammaRayHandle4'; }
      }
    }

    // Test planets
    this.editState.planets.forEach((planet, id) => {
      const r  = PLANET_RADIUS[planet.upgradeLevel] + 10;
      const dx = planet.x - wx;
      const dy = planet.y - wy;
      const d  = Math.sqrt(dx * dx + dy * dy);
      if (d <= r && d < bestDist) { bestDist = d; best = id; }
    });

    // Test black holes
    this.editState.blackHoles.forEach((bh, id) => {
      const r  = bh.radius + 10;
      const dx = bh.x - wx;
      const dy = bh.y - wy;
      const d  = Math.sqrt(dx * dx + dy * dy);
      if (d <= r && d < bestDist) { bestDist = d; best = id; }
    });

    // Test speed zones — click within rectangular bounds
    this.editState.speedZones.forEach((sz, id) => {
      let inside = false;
      const pts = sz.points || [];
      const n = pts.length;
      if (n >= 3) {
        for (let i = 0, j = n - 1; i < n; j = i++) {
          const xi = pts[i].x, yi = pts[i].y;
          const xj = pts[j].x, yj = pts[j].y;
          const intersect = ((yi > wy) !== (yj > wy)) &&
                            (wx < (xj - xi) * (wy - yi) / (yj - yi) + xi);
          if (intersect) inside = !inside;
        }
      }
      if (inside) {
        bestDist = 0; // It's inside the polygon, so distance is essentially 0
        best = id;
      }
    });

    // Test portals — click within 45px
    this.editState.portals.forEach((p, id) => {
      const dx = p.x - wx;
      const dy = p.y - wy;
      const d  = Math.sqrt(dx * dx + dy * dy);
      if (d <= 45 && d < bestDist) { bestDist = d; best = id; }
    });

    // Test trapping black holes — 60px grab radius
    this.editState.trappingBlackHoles.forEach((tbh, id) => {
      const dx = tbh.x - wx;
      const dy = tbh.y - wy;
      const d  = Math.sqrt(dx * dx + dy * dy);
      if (d <= 60 && d < bestDist) { bestDist = d; best = id; }
    });

    // Test white holes — click within 35px
    this.editState.whiteHoles.forEach((wh, id) => {
      const dx = wh.x - wx;
      const dy = wh.y - wy;
      const d  = Math.sqrt(dx * dx + dy * dy);
      if (d <= 35 && d < bestDist) { bestDist = d; best = id; }
    });

    return best;
  }

  // ── Export / Import ────────────────────────────────────────────────

  private exportLevel(overrideData?: LevelData): void {
    const levelData = overrideData || this.buildLevelData();
    const json = JSON.stringify(levelData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `${levelData.name.replace(/\s+/g, '_').toLowerCase() || 'level'}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  private testLevel(): void {
    const levelData = this.buildLevelData();
    this.onTestLevel(levelData);
  }

  private buildLevelData(): LevelData {
    const planets: PlanetDef[] = [];
    this.editState.planets.forEach(p => {
      planets.push({
        id:               p.id,
        x:                p.x,
        y:                p.y,
        faction:          p.faction,
        upgradeLevel:     p.upgradeLevel,
        startingParticles: Math.min(p.health, p.maxHealth),
        isOrbiting:       p.isOrbiting,
        orbitCenterX:     p.orbitCenterX,
        orbitCenterY:     p.orbitCenterY,
        orbitRadius:      p.orbitRadius,
        orbitSpeed:       p.orbitSpeed,
        orbitStartAngle:  p.orbitAngle,
        isShielded:       p.isShielded,
      });
    });

    const blackHoles: BlackHoleDef[] = [];
    this.editState.blackHoles.forEach(bh => {
      blackHoles.push({
        id:           bh.id,
        x:            bh.x,
        y:            bh.y,
        radius:       bh.radius,
        pullStrength: bh.pullStrength,
      });
    });

    const speedZones: SpeedZoneDef[] = [];
    this.editState.speedZones.forEach(sz => {
      speedZones.push({
        id: sz.id,
        points: sz.points,
        type: sz.type,
      });
    });

    const portals: PortalDef[] = [];
    this.editState.portals.forEach(p => {
      portals.push({ id: p.id, x: p.x, y: p.y, pairId: p.pairId, color: p.color });
    });

    const trappingBlackHoles: TrappingBlackHoleDef[] = [];
    this.editState.trappingBlackHoles.forEach(tbh => {
      trappingBlackHoles.push({ id: tbh.id, x: tbh.x, y: tbh.y, pullRadius: tbh.pullRadius });
    });

    const whiteHoles: WhiteHoleDef[] = [];
    this.editState.whiteHoles.forEach(wh => {
      whiteHoles.push({ id: wh.id, x: wh.x, y: wh.y });
    });

    return {
      version:     1,
      name:        this.editState.levelName || 'Untitled',
      worldWidth:  this.editState.worldWidth,
      worldHeight: this.editState.worldHeight,
      fogOfWarConfig: this.editState.fogOfWarConfig,
      gammaRayConfig: this.editState.gammaRayConfig,
      asteroidConfig: this.editState.asteroidConfig,
      planets,
      blackHoles,
      speedZones:          speedZones.length > 0          ? speedZones          : undefined,
      portals:             portals.length > 0             ? portals             : undefined,
      trappingBlackHoles:  trappingBlackHoles.length > 0  ? trappingBlackHoles  : undefined,
      whiteHoles:          whiteHoles.length > 0          ? whiteHoles          : undefined,
    };
  }

  private evaluateLevel(): { category: string, players: number, particles: number } {
    let category = 'Custom';
    const hasSpeedZones = this.editState.speedZones.size > 0;
    const hasPortals = this.editState.portals.size > 0;
    const hasBH = this.editState.blackHoles.size > 0 || this.editState.trappingBlackHoles.size > 0;
    const hasWhiteHoles = this.editState.whiteHoles.size > 0;

    const hazardCounts = {
      speedZones: hasSpeedZones ? 1 : 0,
      portals: hasPortals ? 1 : 0,
      bh: hasBH ? 1 : 0,
      whiteHoles: hasWhiteHoles ? 1 : 0,
    };
    
    const activeHazardTypes = Object.entries(hazardCounts).filter(([_, count]) => count > 0).map(([k, _]) => k);

    if (activeHazardTypes.length === 1) {
      if (activeHazardTypes[0] === 'speedZones') category = 'Speed Traps';
      else if (activeHazardTypes[0] === 'portals') category = 'Portals';
      else if (activeHazardTypes[0] === 'bh') category = 'Black Holes';
      else if (activeHazardTypes[0] === 'whiteHoles') category = 'White Holes';
    } else if (activeHazardTypes.length === 2) {
      category = 'Dual Hazard Universes';
    } else if (activeHazardTypes.length === 3) {
      category = 'Triple Hazard Universes';
    } else {
      category = 'Custom';
    }

    const uniqueFactions = new Set<string>();
    let totalNeutralCapacity = 0;
    this.editState.planets.forEach(p => {
      if (p.faction !== 'neutral') {
        uniqueFactions.add(p.faction);
      } else {
        totalNeutralCapacity += PLANET_MAX_HEALTH[p.upgradeLevel];
      }
    });

    let players = uniqueFactions.size;
    if (players < 2) players = 2;

    let particles = 50;
    if (players > 0) {
       particles = Math.round(totalNeutralCapacity / 2 / players);
    }
    if (particles < 10) particles = 10;
    
    return { category, players, particles };
  }

  private showSaveOverlay(): void {
    const { category, players, particles } = this.evaluateLevel();
    
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: absolute;
      top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(10, 10, 26, 0.6);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 100;
    `;

    const dialog = document.createElement('div');
    dialog.style.cssText = `
      background: rgba(20, 20, 40, 0.85);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      padding: 24px;
      width: 400px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      font-family: 'Rajdhani', sans-serif;
      color: white;
    `;

    const title = document.createElement('h2');
    title.textContent = 'Save / Export Level';
    title.style.cssText = 'margin: 0; text-align: center; font-size: 24px;';
    dialog.appendChild(title);

    const form = document.createElement('div');
    form.style.cssText = 'display: flex; flex-direction: column; gap: 12px;';

    const createInput = (labelText: string, initialValue: string) => {
      const wrapper = document.createElement('div');
      wrapper.style.display = 'flex';
      wrapper.style.flexDirection = 'column';
      const label = document.createElement('label');
      label.textContent = labelText;
      label.style.fontSize = '12px';
      label.style.color = 'rgba(255,255,255,0.6)';
      const input = document.createElement('input');
      input.value = initialValue;
      input.style.cssText = 'background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.2); color: white; padding: 6px; border-radius: 4px; font-family: inherit;';
      wrapper.appendChild(label);
      wrapper.appendChild(input);
      return { wrapper, input };
    };

    const nameField = createInput('Level Name', this.editState.levelName);
    form.appendChild(nameField.wrapper);

    const catWrapper = document.createElement('div');
    catWrapper.style.display = 'flex';
    catWrapper.style.flexDirection = 'column';
    const catLabel = document.createElement('label');
    catLabel.textContent = 'Category';
    catLabel.style.fontSize = '12px';
    catLabel.style.color = 'rgba(255,255,255,0.6)';
    
    const catSelect = document.createElement('select');
    catSelect.style.cssText = 'background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.2); color: white; padding: 6px; border-radius: 4px; font-family: inherit;';
    
    const groups = [
      { label: 'Core', options: ['Intro Missions'] },
      { label: 'Single Hazard Universes', options: ['Asteroids', 'Gamma Rays', 'Speed Traps', 'Portals', 'Black Holes', 'White Holes', 'Shielded Planets', 'Fog of War'] },
      { label: 'Multi Hazard Universes', options: ['Dual Hazard Universes', 'Triple Hazard Universes'] },
      { label: 'Other', options: ['Custom'] }
    ];

    groups.forEach(g => {
      const optgroup = document.createElement('optgroup');
      optgroup.label = g.label;
      optgroup.style.background = 'rgba(20,20,40,1)';
      g.options.forEach(optName => {
        const option = document.createElement('option');
        option.value = optName;
        option.textContent = optName;
        optgroup.appendChild(option);
      });
      catSelect.appendChild(optgroup);
    });

    // Default to the previously saved category or the newly guessed one
    catSelect.value = this.editState.category || category;
    
    catWrapper.appendChild(catLabel);
    catWrapper.appendChild(catSelect);
    form.appendChild(catWrapper);

    const info = document.createElement('div');
    info.style.cssText = 'font-size: 14px; color: rgba(255,255,255,0.8); margin-top: 8px;';
    info.innerHTML = `Suggested Players: <strong>${players}</strong><br>Suggested Starting Particles: <strong>${particles}</strong>`;
    form.appendChild(info);

    dialog.appendChild(form);

    const btnContainer = document.createElement('div');
    btnContainer.style.cssText = 'display: flex; gap: 8px; margin-top: 16px; justify-content: flex-end;';

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = 'padding: 8px 16px; background: rgba(255,255,255,0.1); border: none; color: white; border-radius: 4px; cursor: pointer;';
    cancelBtn.onclick = () => overlay.remove();

    const exportBtn = document.createElement('button');
    exportBtn.textContent = 'Save to Local (Browser + JSON)';
    exportBtn.style.cssText = 'padding: 8px 16px; background: rgba(79, 195, 247, 0.3); border: 1px solid #4fc3f7; color: #4fc3f7; border-radius: 4px; cursor: pointer;';
    exportBtn.onclick = () => {
      this.editState.levelName = nameField.input.value;
      this.editState.category = catSelect.value || 'Custom';
      const ld = this.buildLevelData();
      ld.category = this.editState.category;
      LevelStore.saveLevel(ld);
      this.exportLevel(ld);
      if ((this.sidebar as any).setLevelName) {
        (this.sidebar as any).setLevelName(this.editState.levelName);
      }
      overlay.remove();
    };

    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Save to Source Code';
    saveBtn.style.cssText = 'padding: 8px 16px; background: rgba(34, 197, 94, 0.3); border: 1px solid #22c55e; color: #22c55e; border-radius: 4px; cursor: pointer;';
    saveBtn.onclick = () => {
      this.editState.levelName = nameField.input.value;
      this.editState.category = catSelect.value || 'Custom';
      const ld = this.buildLevelData();
      ld.category = this.editState.category;
      
      const originalText = saveBtn.textContent;
      saveBtn.textContent = 'Saving...';
      
      fetch('/api/save-level', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ld)
      })
      .then(res => res.json())
      .then(res => {
        if (res.success) {
          if ((this.sidebar as any).setLevelName) {
            (this.sidebar as any).setLevelName(this.editState.levelName);
          }
          overlay.remove();
          alert('Level successfully saved to src/levels/' + res.file + '!');
        } else {
          alert('Error saving to source: ' + res.error);
          saveBtn.textContent = originalText;
        }
      })
      .catch(err => {
        alert('Network error saving to source: ' + err);
        saveBtn.textContent = originalText;
      });
    };

    btnContainer.appendChild(cancelBtn);
    btnContainer.appendChild(exportBtn);
    btnContainer.appendChild(saveBtn);
    dialog.appendChild(btnContainer);

    overlay.appendChild(dialog);
    this.uiContainer.appendChild(overlay);
  }

  private showLoadOverlay(): void {
    const levels = LevelStore.loadLevels();

    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: absolute;
      top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(10, 10, 26, 0.6);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 100;
    `;

    const dialog = document.createElement('div');
    dialog.style.cssText = `
      background: rgba(20, 20, 40, 0.85);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      padding: 24px;
      width: 500px;
      max-height: 80%;
      display: flex;
      flex-direction: column;
      gap: 16px;
      font-family: 'Rajdhani', sans-serif;
      color: white;
    `;

    const title = document.createElement('h2');
    title.textContent = 'Load Custom Level';
    title.style.cssText = 'margin: 0; text-align: center; font-size: 24px;';
    dialog.appendChild(title);

    const list = document.createElement('div');
    list.style.cssText = 'display: flex; flex-direction: column; gap: 8px; overflow-y: auto; flex: 1; padding-right: 8px;';

    if (levels.length === 0) {
      const noLevels = document.createElement('div');
      noLevels.textContent = 'No custom levels found in local storage.';
      noLevels.style.textAlign = 'center';
      noLevels.style.color = 'rgba(255,255,255,0.5)';
      list.appendChild(noLevels);
    } else {
      levels.forEach(ld => {
        const item = document.createElement('div');
        item.style.cssText = `
          display: flex; justify-content: space-between; align-items: center;
          padding: 12px; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1);
          border-radius: 6px; cursor: pointer; transition: background 0.1s;
        `;
        item.onmouseenter = () => item.style.background = 'rgba(255,255,255,0.1)';
        item.onmouseleave = () => item.style.background = 'rgba(0,0,0,0.3)';
        
        const info = document.createElement('div');
        info.innerHTML = `<strong>${ld.name}</strong><br><span style="font-size:12px;color:rgba(255,255,255,0.5)">Category: ${ld.category || 'Custom'}</span>`;
        item.appendChild(info);

        const loadBtn = document.createElement('button');
        loadBtn.textContent = 'Load';
        loadBtn.style.cssText = 'padding: 6px 12px; background: #fbc02d; border: none; color: black; border-radius: 4px; cursor: pointer; font-family: inherit; font-weight: bold;';
        loadBtn.onclick = (e) => {
          e.stopPropagation();
          this.loadLevelData(ld);
          overlay.remove();
        };
        item.onclick = () => loadBtn.click();
        
        const delBtn = document.createElement('button');
        delBtn.textContent = 'Delete';
        delBtn.style.cssText = 'padding: 6px 12px; background: #ef5350; border: none; color: white; border-radius: 4px; cursor: pointer; font-family: inherit; margin-left: 8px;';
        delBtn.onclick = (e) => {
          e.stopPropagation();
          if (ld.id) LevelStore.deleteLevel(ld.id);
          item.remove();
        };

        const btnRow = document.createElement('div');
        btnRow.appendChild(loadBtn);
        btnRow.appendChild(delBtn);
        item.appendChild(btnRow);
        
        list.appendChild(item);
      });
    }

    dialog.appendChild(list);

    const btnContainer = document.createElement('div');
    btnContainer.style.cssText = 'display: flex; justify-content: center; margin-top: 16px;';
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = 'padding: 8px 32px; background: rgba(255,255,255,0.1); border: none; color: white; border-radius: 4px; cursor: pointer; font-family: inherit;';
    cancelBtn.onclick = () => overlay.remove();
    btnContainer.appendChild(cancelBtn);

    dialog.appendChild(btnContainer);
    overlay.appendChild(dialog);
    this.uiContainer.appendChild(overlay);
  }

  public loadLevelData(ld: LevelData): void {
    this.editState.planets.clear();
    this.editState.blackHoles.clear();
    this.editState.speedZones.clear();
    this.editState.portals.clear();
    this.editState.trappingBlackHoles.clear();
    this.editState.whiteHoles.clear();
    this.editState.selectedEntityId = null;
    this.propertiesPanel.hide();

    this.editState.levelName = ld.name;
    this.editState.worldWidth = ld.worldWidth;
    this.editState.worldHeight = ld.worldHeight;
    this.editState.fogOfWarConfig = ld.fogOfWarConfig;
    
    if ((this.sidebar as any).setLevelName) {
      (this.sidebar as any).setLevelName(ld.name);
    }
    if ((this.sidebar as any).setFogEnabled) {
      (this.sidebar as any).setFogEnabled(ld.fogOfWarConfig?.enabled ?? false);
    }
    if ((this.sidebar as any).setGammaEnabled) {
      (this.sidebar as any).setGammaEnabled(ld.gammaRayConfig?.enabled ?? false);
    }
    if ((this.sidebar as any).setAsteroidsEnabled) {
      (this.sidebar as any).setAsteroidsEnabled(ld.asteroidConfig?.enabled ?? false);
    }

    let maxPid = 0, maxBhId = 0, maxSzId = 0, maxPortalId = 0, maxTbhId = 0, maxWhId = 0;

    ld.planets.forEach(p => {
      this.editState.planets.set(p.id, {
        ...defaultPlanet(p.id, p.x, p.y),
        faction: p.faction,
        upgradeLevel: p.upgradeLevel,
        health: p.startingParticles,
        maxHealth: PLANET_MAX_HEALTH[p.upgradeLevel],
        productionRate: PLANET_PRODUCTION[p.upgradeLevel],
        isOrbiting: !!p.isOrbiting,
        orbitCenterX: p.orbitCenterX,
        orbitCenterY: p.orbitCenterY,
        orbitRadius: p.orbitRadius,
        orbitSpeed: p.orbitSpeed,
        orbitAngle: p.orbitStartAngle,
        isShielded: !!p.isShielded,
        shieldPoints: 0,
        shieldTimer: 0,
      });
      const num = parseInt(p.id.replace(/\\D/g, ''), 10);
      if (!isNaN(num) && num > maxPid) maxPid = num;
    });

    ld.blackHoles.forEach(bh => {
      this.editState.blackHoles.set(bh.id, {
        ...defaultBlackHole(bh.id, bh.x, bh.y),
        radius: bh.radius,
        pullStrength: bh.pullStrength,
      });
      const num = parseInt(bh.id.replace(/\\D/g, ''), 10);
      if (!isNaN(num) && num > maxBhId) maxBhId = num;
    });

    if (ld.speedZones) {
      ld.speedZones.forEach(sz => {
        this.editState.speedZones.set(sz.id, {
          ...defaultSpeedZone(sz.id, sz.points),
          type: sz.type,
        });
        const num = parseInt(sz.id.replace(/\\D/g, ''), 10);
        if (!isNaN(num) && num > maxSzId) maxSzId = num;
      });
    }

    if (ld.portals) {
      ld.portals.forEach(p => {
        this.editState.portals.set(p.id, {
          ...defaultPortal(p.id, p.x, p.y, p.pairId, p.color),
        });
        const num = parseInt(p.id.replace(/\\D/g, ''), 10);
        if (!isNaN(num) && num > maxPortalId) maxPortalId = num;
      });
    }

    if (ld.trappingBlackHoles) {
      ld.trappingBlackHoles.forEach(tbh => {
        this.editState.trappingBlackHoles.set(tbh.id, {
          ...defaultTrappingBH(tbh.id, tbh.x, tbh.y),
          pullRadius: tbh.pullRadius,
        });
        const num = parseInt(tbh.id.replace(/\\D/g, ''), 10);
        if (!isNaN(num) && num > maxTbhId) maxTbhId = num;
      });
    }

    if (ld.whiteHoles) {
      ld.whiteHoles.forEach(wh => {
        this.editState.whiteHoles.set(wh.id, {
          ...defaultWhiteHole(wh.id, wh.x, wh.y),
        });
        const num = parseInt(wh.id.replace(/\\D/g, ''), 10);
        if (!isNaN(num) && num > maxWhId) maxWhId = num;
      });
    }

    this.editState.nextPlanetId = maxPid + 1;
    this.editState.nextBhId = maxBhId + 1;
    this.editState.nextSpeedZoneId = maxSzId + 1;
    this.editState.nextPortalId = maxPortalId + 1;
    this.editState.nextTBHId = maxTbhId + 1;
    this.editState.nextWhiteHoleId = maxWhId + 1;
  }
}
