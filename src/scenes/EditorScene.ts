// ============================================================
// EditorScene.ts — Visual Level Editor scene for Alux2Win
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
  WhiteHoleDef, WhiteHoleData,
} from '../types';
import {
  PLANET_RADIUS,
  PLANET_CAPACITY,
  PLANET_PRODUCTION,
  PLANET_BONUS_HEALTH,
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
    particles: 0,
    capacity: PLANET_CAPACITY[1],
    productionRate: PLANET_PRODUCTION[1],
    absorbedCount: 0,
    bonusHealth:    PLANET_BONUS_HEALTH[1],
    maxBonusHealth: PLANET_BONUS_HEALTH[1],
    isOrbiting: false,
    inStorm: false,
    wasInStorm: false,
  };
}

function defaultBlackHole(id: string, x: number, y: number): BlackHoleData {
  return { id, x, y, radius: 30, pullRadius: 140, pullStrength: 1.0 };
}

function defaultSpeedZone(id: string, x: number, y: number): SpeedZoneData {
  return { id, x, y, radius: 150, type: 'speedup', pulseAngle: 0 };
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
  worldWidth:          number;
  worldHeight:         number;
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

    // PixiJS rendering layer for editor graphics
    this.editorContainer = new Container();
    this.renderer.stage.addChild(this.editorContainer);
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
    this.sidebar.onLevelNameChange = (name) => { this.editState.levelName = name; };

    // Properties panel
    this.propertiesPanel = new PropertiesPanel(container);
    this.propertiesPanel.onPlanetChange    = (id, changes) => this.updatePlanetProperty(id, changes);
    this.propertiesPanel.onBlackHoleChange = (id, changes) => this.updateBlackHoleProperty(id, changes);
    this.propertiesPanel.onSpeedZoneChange  = (id, changes) => this.updateSpeedZoneProperty(id, changes);
    this.propertiesPanel.onPortalChange     = (id, changes) => this.updatePortalProperty(id, changes);
    this.propertiesPanel.onTrappingBHChange = (id, changes) => this.updateTrappingBHProperty(id, changes);
    this.propertiesPanel.onDeleteEntity    = (id) => {
      this.deleteEntity(id);
      this.propertiesPanel.hide();
    };

    // Cursor style
    this.updateCursor();

    // Bind mouse events to canvas
    this.bindCanvasEvents();

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

  private rafLoop = (): void => {
    this.renderEditor();
    this._onRaf = requestAnimationFrame(this.rafLoop);
  };

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

    // ── Labels ────────────────────────────────────────────
    this.updateLabels();
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
      this.drawDashedCircle(gfx, planet.orbitCenterX, planet.orbitCenterY!, planet.orbitRadius, 32, 0x4fc3f7, 0.2);
    }

    // Planet body
    gfx.circle(planet.x, planet.y, r);
    gfx.fill({ color, alpha: 0.85 });

    // Outer glow ring
    gfx.circle(planet.x, planet.y, r + 4);
    gfx.stroke({ color, alpha: 0.3, width: 2 });

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
    gfx.stroke({ color: 0x9c27b0, alpha: 0.18, width: 1 });

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

    // Zone circle fill
    gfx.circle(sz.x, sz.y, sz.radius);
    gfx.fill({ color, alpha: 0.06 });
    // Zone circle stroke
    gfx.circle(sz.x, sz.y, sz.radius);
    gfx.stroke({ color, alpha: 0.5, width: isSelected ? 2.5 : 1.5 });

    // Center marker
    gfx.circle(sz.x, sz.y, 8);
    gfx.fill({ color, alpha: 0.7 });

    // Selection ring
    if (isSelected) {
      gfx.circle(sz.x, sz.y, sz.radius + 8);
      gfx.stroke({ color: 0xffee00, alpha: 0.9, width: 2 });
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

    // Pull radius zone fill
    gfx.circle(tbh.x, tbh.y, tbh.pullRadius);
    gfx.fill({ color: 0x000000, alpha: 0.12 });
    // Pull radius zone stroke
    gfx.circle(tbh.x, tbh.y, tbh.pullRadius);
    gfx.stroke({ color: 0x6600cc, alpha: 0.4, width: 1 });

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

  private drawDashedCircle(
    gfx: Graphics,
    cx: number, cy: number, radius: number,
    segments: number,
    color: number, alpha: number
  ): void {
    const step = (Math.PI * 2) / segments;
    for (let i = 0; i < segments; i++) {
      if (i % 2 === 0) continue; // skip every other for dash effect
      const a1 = i * step;
      const a2 = (i + 1) * step;
      gfx.moveTo(cx + Math.cos(a1) * radius, cy + Math.sin(a1) * radius);
      gfx.lineTo(cx + Math.cos(a2) * radius, cy + Math.sin(a2) * radius);
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
      label.x = sz.x;
      label.y = sz.y;
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
    const canvas = this.renderer.canvas;

    this._onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const { x, y } = this.canvasToWorld(e);
      this.handleCanvasClick(x, y, e.shiftKey);
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

    canvas.addEventListener('mousedown',   this._onMouseDown);
    canvas.addEventListener('mousemove',   this._onMouseMove);
    canvas.addEventListener('mouseup',     this._onMouseUp);
    canvas.addEventListener('contextmenu', this._onContextMenu);
  }

  private unbindCanvasEvents(): void {
    const canvas = this.renderer.canvas;
    canvas.removeEventListener('mousedown',   this._onMouseDown);
    canvas.removeEventListener('mousemove',   this._onMouseMove);
    canvas.removeEventListener('mouseup',     this._onMouseUp);
    canvas.removeEventListener('contextmenu', this._onContextMenu);
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
    this.renderer.canvas.style.cursor = cursors[this.editState.tool];
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
    const hit = this.hitTestEntity(wx, wy);
    if (hit) {
      this.deleteEntity(hit);
    }
  }

  /** Get x position of any entity by id */
  private getEntityX(id: string): number {
    return this.editState.planets.get(id)?.x
      ?? this.editState.blackHoles.get(id)?.x
      ?? this.editState.speedZones.get(id)?.x
      ?? this.editState.portals.get(id)?.x
      ?? this.editState.trappingBlackHoles.get(id)?.x
      ?? this.editState.whiteHoles.get(id)?.x
      ?? 0;
  }

  /** Get y position of any entity by id */
  private getEntityY(id: string): number {
    return this.editState.planets.get(id)?.y
      ?? this.editState.blackHoles.get(id)?.y
      ?? this.editState.speedZones.get(id)?.y
      ?? this.editState.portals.get(id)?.y
      ?? this.editState.trappingBlackHoles.get(id)?.y
      ?? this.editState.whiteHoles.get(id)?.y
      ?? 0;
  }

  // ── Entity Operations ─────────────────────────────────────

  private selectEntity(id: string | null): void {
    this.editState.selectedEntityId = id;
    if (!id) { this.propertiesPanel.hide(); return; }
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
    const id = `sz${this.editState.nextSpeedZoneId++}`;
    const sz = defaultSpeedZone(id, Math.round(wx), Math.round(wy));
    this.editState.speedZones.set(id, sz);
    this.selectEntity(id);
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
    const planet = this.editState.planets.get(id);
    if (planet) {
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
    if (sz) {
      sz.x = Math.round(nx);
      sz.y = Math.round(ny);
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
      planet.capacity      = PLANET_CAPACITY[planet.upgradeLevel];
      planet.productionRate = PLANET_PRODUCTION[planet.upgradeLevel];
    }
    if (changes.startingParticles !== undefined) planet.particles = changes.startingParticles;
    if (changes.isOrbiting !== undefined)        planet.isOrbiting = changes.isOrbiting;
    if (changes.orbitRadius !== undefined)       planet.orbitRadius = changes.orbitRadius;
    if (changes.orbitSpeed !== undefined)        planet.orbitSpeed = changes.orbitSpeed;
    if (changes.orbitCenterX !== undefined)      planet.orbitCenterX = changes.orbitCenterX;
    if (changes.orbitCenterY !== undefined)      planet.orbitCenterY = changes.orbitCenterY;
  }

  private updateBlackHoleProperty(bhId: string, changes: Partial<BlackHoleData>): void {
    const bh = this.editState.blackHoles.get(bhId);
    if (!bh) return;
    Object.assign(bh, changes);
  }

  private updateSpeedZoneProperty(id: string, changes: Partial<SpeedZoneDef>): void {
    const sz = this.editState.speedZones.get(id);
    if (!sz) return;
    if (changes.radius !== undefined) sz.radius = changes.radius;
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

    // Test speed zones — click within radius
    this.editState.speedZones.forEach((sz, id) => {
      const dx = sz.x - wx;
      const dy = sz.y - wy;
      const d  = Math.sqrt(dx * dx + dy * dy);
      if (d <= sz.radius && d < bestDist) { bestDist = d; best = id; }
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
        startingParticles: Math.min(p.particles, p.capacity),
        isOrbiting:       p.isOrbiting,
        orbitCenterX:     p.orbitCenterX,
        orbitCenterY:     p.orbitCenterY,
        orbitRadius:      p.orbitRadius,
        orbitSpeed:       p.orbitSpeed,
        orbitStartAngle:  p.orbitAngle,
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
      speedZones.push({ id: sz.id, x: sz.x, y: sz.y, radius: sz.radius, type: sz.type });
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
      planets,
      blackHoles,
      speedZones:          speedZones.length > 0          ? speedZones          : undefined,
      portals:             portals.length > 0             ? portals             : undefined,
      trappingBlackHoles:  trappingBlackHoles.length > 0  ? trappingBlackHoles  : undefined,
      whiteHoles:          whiteHoles.length > 0          ? whiteHoles          : undefined,
    };
  }

  private evaluateLevel(): { category: string, players: number, particles: number } {
    let category = 'Normal';
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

    if (activeHazardTypes.length === 0) {
      category = 'Normal';
    } else if (activeHazardTypes.length === 1) {
      if (activeHazardTypes[0] === 'speedZones') category = 'Speed Traps';
      else if (activeHazardTypes[0] === 'portals') category = 'Portals';
      else if (activeHazardTypes[0] === 'bh') category = 'Black Holes';
      else if (activeHazardTypes[0] === 'whiteHoles') category = 'White Holes';
    } else {
      category = 'Custom';
    }

    const uniqueFactions = new Set<string>();
    let totalNeutralCapacity = 0;
    this.editState.planets.forEach(p => {
      if (p.faction !== 'neutral') {
        uniqueFactions.add(p.faction);
      } else {
        totalNeutralCapacity += PLANET_CAPACITY[p.upgradeLevel];
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
    const catInput = document.createElement('input');
    catInput.value = category;
    catInput.style.cssText = 'background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.2); color: white; padding: 6px; border-radius: 4px; font-family: inherit;';
    catWrapper.appendChild(catLabel);
    catWrapper.appendChild(catInput);
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
    exportBtn.textContent = 'Export to JSON';
    exportBtn.style.cssText = 'padding: 8px 16px; background: rgba(79, 195, 247, 0.3); border: 1px solid #4fc3f7; color: #4fc3f7; border-radius: 4px; cursor: pointer;';
    exportBtn.onclick = () => {
      this.editState.levelName = nameField.input.value;
      const ld = this.buildLevelData();
      ld.category = catInput.value;
      this.exportLevel(ld);
      if ((this.sidebar as any).setLevelName) {
        (this.sidebar as any).setLevelName(this.editState.levelName);
      }
      overlay.remove();
    };

    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Save to Local Storage';
    saveBtn.style.cssText = 'padding: 8px 16px; background: rgba(34, 197, 94, 0.3); border: 1px solid #22c55e; color: #22c55e; border-radius: 4px; cursor: pointer;';
    saveBtn.onclick = () => {
      this.editState.levelName = nameField.input.value;
      const ld = this.buildLevelData();
      ld.category = catInput.value;
      LevelStore.saveLevel(ld);
      if ((this.sidebar as any).setLevelName) {
        (this.sidebar as any).setLevelName(this.editState.levelName);
      }
      overlay.remove();
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

  private loadLevelData(ld: LevelData): void {
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
    
    if ((this.sidebar as any).setLevelName) {
      (this.sidebar as any).setLevelName(ld.name);
    }

    let maxPid = 0, maxBhId = 0, maxSzId = 0, maxPortalId = 0, maxTbhId = 0, maxWhId = 0;

    ld.planets.forEach(p => {
      this.editState.planets.set(p.id, {
        ...defaultPlanet(p.id, p.x, p.y),
        faction: p.faction,
        upgradeLevel: p.upgradeLevel,
        particles: p.startingParticles,
        capacity: PLANET_CAPACITY[p.upgradeLevel],
        productionRate: PLANET_PRODUCTION[p.upgradeLevel],
        isOrbiting: !!p.isOrbiting,
        orbitCenterX: p.orbitCenterX,
        orbitCenterY: p.orbitCenterY,
        orbitRadius: p.orbitRadius,
        orbitSpeed: p.orbitSpeed,
        orbitAngle: p.orbitStartAngle,
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
          ...defaultSpeedZone(sz.id, sz.x, sz.y),
          radius: sz.radius,
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
