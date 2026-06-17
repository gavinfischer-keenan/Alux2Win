// ============================================================
// EditorScene.ts — Visual Level Editor scene for Alux2Win
// Allows placing/moving planets and black holes, editing
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

interface EditState {
  planets:         Map<string, PlanetData>;
  blackHoles:      Map<string, BlackHoleData>;
  selectedEntityId: string | null;
  tool:            EditorTool;
  nextPlanetId:    number;
  nextBhId:        number;
  levelName:       string;
  worldWidth:      number;
  worldHeight:     number;
}

export class EditorScene {
  private renderer: Renderer;
  private eventBus: EventBus;
  private sidebar!: EditorSidebar;
  private propertiesPanel!: PropertiesPanel;

  private editState: EditState = {
    planets:         new Map(),
    blackHoles:      new Map(),
    selectedEntityId: null,
    tool:            'select',
    nextPlanetId:    1,
    nextBhId:        1,
    levelName:       'Untitled',
    worldWidth:      2048,
    worldHeight:     2048,
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
    this.sidebar.onToolChange = (tool) => { this.editState.tool = tool; };
    this.sidebar.onBack       = () => this.onBack();
    this.sidebar.onSaveLevel  = () => this.exportLevel();
    this.sidebar.onTestLevel  = () => this.testLevel();
    this.sidebar.onLevelNameChange = (name) => { this.editState.levelName = name; };

    // Properties panel
    this.propertiesPanel = new PropertiesPanel(container);
    this.propertiesPanel.onPlanetChange   = (id, changes) => this.updatePlanetProperty(id, changes);
    this.propertiesPanel.onBlackHoleChange = (id, changes) => this.updateBlackHoleProperty(id, changes);
    this.propertiesPanel.onDeleteEntity   = (id) => {
      this.deleteEntity(id);
      this.propertiesPanel.hide();
    };

    // Cursor style container
    this.renderer.canvas.style.cursor = 'crosshair';

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
      select:         'default',
      place_planet:   'crosshair',
      place_blackhole: 'crosshair',
      delete:         'not-allowed',
    };
    this.renderer.canvas.style.cursor = cursors[this.editState.tool];
  }

  // ── Click Handlers ─────────────────────────────────────────

  private handleCanvasClick(wx: number, wy: number, _shift: boolean): void {
    const tool = this.editState.tool;

    if (tool === 'place_planet') {
      this.placePlanet(wx, wy);
      return;
    }

    if (tool === 'place_blackhole') {
      this.placeBlackHole(wx, wy);
      return;
    }

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
      // Begin drag
      const planet = this.editState.planets.get(hit);
      const bh     = this.editState.blackHoles.get(hit);
      const ex = planet ? planet.x : bh!.x;
      const ey = planet ? planet.y : bh!.y;
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

  // ── Entity Operations ─────────────────────────────────────

  private selectEntity(id: string | null): void {
    this.editState.selectedEntityId = id;
    if (!id) { this.propertiesPanel.hide(); return; }
    const planet = this.editState.planets.get(id);
    if (planet) { this.propertiesPanel.showPlanet(planet); return; }
    const bh = this.editState.blackHoles.get(id);
    if (bh) { this.propertiesPanel.showBlackHole(bh); }
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

  private deleteEntity(id: string): void {
    this.editState.planets.delete(id);
    this.editState.blackHoles.delete(id);
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
      // Refresh properties panel if open
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

  // ── Hit Testing ───────────────────────────────────────────

  private hitTestEntity(wx: number, wy: number): string | null {
    // Test planets
    let best: string | null = null;
    let bestDist = Infinity;
    this.editState.planets.forEach((planet, id) => {
      const r  = PLANET_RADIUS[planet.upgradeLevel] + 10;
      const dx = planet.x - wx;
      const dy = planet.y - wy;
      const d  = Math.sqrt(dx * dx + dy * dy);
      if (d <= r && d < bestDist) { bestDist = d; best = id; }
    });
    if (best) return best;

    // Test black holes
    this.editState.blackHoles.forEach((bh, id) => {
      const r  = bh.radius + 10;
      const dx = bh.x - wx;
      const dy = bh.y - wy;
      const d  = Math.sqrt(dx * dx + dy * dy);
      if (d <= r && d < bestDist) { bestDist = d; best = id; }
    });

    return best;
  }

  // ── Export ────────────────────────────────────────────────

  private exportLevel(): void {
    const levelData = this.buildLevelData();
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

    return {
      version:     1,
      name:        this.editState.levelName || 'Untitled',
      worldWidth:  this.editState.worldWidth,
      worldHeight: this.editState.worldHeight,
      planets,
      blackHoles,
    };
  }
}




