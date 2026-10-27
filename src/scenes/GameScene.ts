import {issueDeploymentOrder} from '../simulation/deployment';
import {Graphics} from 'pixi.js';
import {createGameState} from '../simulation/createGameState';
import {SimulationPipeline} from '../simulation/SimulationPipeline';
import {compactAliveParticles} from '../simulation/maintenance';
import {SubscriptionScope} from '../core/SubscriptionScope';
import {renderUnitGraph} from '../ui/renderUnitGraph';
// ============================================================
// GameScene.ts — Main gameplay scene for LUX
// Wires all ECS systems, entities, input, AI, and HUD together.
// ============================================================

import type {
  LevelData,
  GameState,
  PlanetData,
  ParticleData,
  Faction,
  UpgradeLevel,
} from '../types';
import {
  PLANET_RADIUS,
  FACTION_COLORS_HEX,
  PARTICLE_SPEED,
} from '../types';
import { HUD } from '../ui/HUD';
import { PauseMenu } from '../ui/PauseMenu';
import type { GameSpeed } from '../ui/PauseMenu';
import { CameraController } from '../core/CameraController';
import { audioManager }     from '../core/AudioManager';
import { SettingsStore }    from '../core/SettingsStore';
import { HighScoreStore }   from '../core/HighScoreStore';
import type { GameStats }   from '../core/HighScoreStore';

// ── Core imports ─────────────────────────────────────────────
import { Renderer }        from '../core/Renderer';
import { EventBus }        from '../core/EventBus';
import { GameLoop }        from '../core/GameLoop';
import { InputManager }    from '../core/InputManager';

// ── System imports ───────────────────────────────────────────


// ── AI import ────────────────────────────────────────────────
import { AIController }    from '../ai/AIController';

// ── Tutorial import ──────────────────────────────────────
import { TutorialController } from '../tutorial/TutorialController';

// ── Entity imports ────────────────────────────────────────────
import { Planet }                       from '../entities/Planet';
import { ParticleRenderer }             from '../entities/Particle';
import { BlackHoleEntity }              from '../entities/BlackHole';

import { AsteroidRenderer }             from '../entities/AsteroidEntity';
import { GammaRayRenderer }             from '../entities/GammaRayRenderer';
import { SpeedZoneRenderer }            from '../entities/SpeedZoneRenderer';
import { PortalRenderer }               from '../entities/PortalRenderer';
import { TrappingBlackHoleRenderer }    from '../entities/TrappingBlackHoleRenderer';
import { WhiteHoleRenderer }            from '../entities/WhiteHoleRenderer';
import { FogRenderer }                  from '../entities/FogRenderer';

// ── Vec2 for InputManager ────────────────────────────────────
import type { Vec2 } from '../types';

export class GameScene {
  private renderer: Renderer;
  private eventBus: EventBus;
  private gameLoop!: GameLoop;
  private state!: GameState;
  private hud!: HUD;
  private aiController!: AIController;
  private inputManager!: InputManager;

  private readonly simulation = new SimulationPipeline();

  private entities: {
    planets:             Map<string, Planet>;
    particles:           ParticleRenderer;
    blackHoles:          Map<string, BlackHoleEntity>;
    asteroids:           AsteroidRenderer;
    gammaRay:            GammaRayRenderer;
    speedZones:          SpeedZoneRenderer;
    portals:             PortalRenderer;
    trappingBlackHoles:  TrappingBlackHoleRenderer;
    whiteHoles:          WhiteHoleRenderer;
    fog:                 FogRenderer;
  } = {
    planets:             new Map(),
    particles:           null as unknown as ParticleRenderer,
    blackHoles:          new Map(),
    asteroids:           null as unknown as AsteroidRenderer,
    gammaRay:            null as unknown as GammaRayRenderer,
    speedZones:          null as unknown as SpeedZoneRenderer,
    portals:             null as unknown as PortalRenderer,
    trappingBlackHoles:  null as unknown as TrappingBlackHoleRenderer,
    whiteHoles:          null as unknown as WhiteHoleRenderer,
    fog:                 null as unknown as FogRenderer,
  };

  private container!: HTMLElement;
  private hudContainer!: HTMLElement;
  private dragBox: HTMLElement | null = null;
  private resultOverlay: HTMLElement | null = null;
  private pauseMenu: PauseMenu | null = null;
  private cameraController: CameraController | null = null;
  private _planetTooltip: HTMLElement | null = null;
  private _mouseMoveHandler: ((e: MouseEvent) => void) | null = null;

  // Selection count badge
  private _selectionBadge: HTMLElement | null = null;

  // Effects renderer (sparkles + shockwaves)
  private _effectsGraphics: import('pixi.js').Graphics | null = null;

  // Repeat-last-action state
  private _lastRightClickTime = 0;
  private _lastAction: {
    selBoxWorld: { x1: number; y1: number; x2: number; y2: number } | null;
    selPlanetIds: Set<string>;
    selParticleIds: Set<number>;
    targetPlanetId?: string;
    targetX?: number;
    targetY?: number;
  } | null = null;

  // Tutorial mode
  private _isTutorial = false;
  private _tutorialId = 'basics';
  private tutorialController: TutorialController | null = null;

  // Pause / speed state
  private _paused   = false;
  private _timeScale: GameSpeed = 1;

  // ESC key handler — stored so it can be removed on destroy
  private _keyHandler: ((e: KeyboardEvent) => void) | null = null;

  // Drag-select bookkeeping
  private _dragStartX = 0;
  private _dragStartY = 0;
  private _lastSelBoxWorld: { x1: number; y1: number; x2: number; y2: number } | null = null;

  // Stats tracking
  private _levelId       = 'unknown';
  private _elapsedTime   = 0;
  private _peakParticles = 0;
  private _peakPlanets   = 0;
  private _isDestroyed = false;
  private readonly subscriptions = new SubscriptionScope();

  /** Unit-count history: sampled every ~2s during gameplay, one entry per sample. */
  private _statsHistory: { time: number; counts: Map<string, number> }[] = [];
  private _statsTimer = 0;
  private static readonly STATS_SAMPLE_INTERVAL = 2; // seconds

  onGameOver: (winner: Faction | null) => void = () => {};

  private isEditorTest: boolean;

  constructor(renderer: Renderer, eventBus: EventBus, isEditorTest: boolean = false) {
    this.renderer = renderer;
    this.eventBus = eventBus;
    this.isEditorTest = isEditorTest;
  }

  // ── Public API ────────────────────────────────────────────

  async loadLevel(levelData: LevelData, uiContainer: HTMLElement, isTutorial = false, tutorialId = 'basics'): Promise<void> {
    this._isTutorial = isTutorial;
    this._tutorialId = tutorialId;
    this.container = uiContainer;
    this.state = createGameState(levelData);
    this._levelId = (levelData as any).id ?? 'level_unknown';
    this._elapsedTime   = 0;
    this._peakParticles = 0;
    this._peakPlanets   = 0;
    this._statsHistory  = [];
    this._statsTimer    = 0;

    // Inform renderer of world dimensions
    this.renderer.setWorldSize(levelData.worldWidth, levelData.worldHeight);

    // Create planet entities
    this.state.planets.forEach(planetData => {
      const planet = new Planet(planetData, this.renderer.layers.planets);
      this.entities.planets.set(planetData.id, planet);
    });

    // Create black hole entities
    this.state.blackHoles.forEach(bhData => {
      const bh = new BlackHoleEntity(bhData, this.renderer.layers.blackHoles);
      this.entities.blackHoles.set(bhData.id, bh);
    });

    // Particle renderer (batched)
    this.entities.particles    = new ParticleRenderer(this.renderer.layers.particles);
    // Hazard renderers
    this.entities.asteroids    = new AsteroidRenderer(this.renderer.layers.asteroids);
    this.entities.gammaRay     = new GammaRayRenderer(this.renderer.layers.gammaRay);
    // New hazard renderers
    this.entities.speedZones         = new SpeedZoneRenderer(this.renderer.layers.speedZones);
    this.entities.portals            = new PortalRenderer(this.renderer.layers.portals);
    this.entities.trappingBlackHoles = new TrappingBlackHoleRenderer(this.renderer.layers.trappingBlackHoles);
    this.entities.whiteHoles         = new WhiteHoleRenderer(this.renderer.layers.whiteHoles);
    this.entities.fog                = new FogRenderer(this.renderer.getWorldContainer());

    // Wire production system into gamma ray so planet resets flush accumulators


    // Hazard effects renderer (sparkles + shockwaves)
    {
      this._effectsGraphics = new Graphics();
      this.renderer.layers.particles.addChild(this._effectsGraphics); }

    // Determine AI factions from level data
    const aiFactions = new Set<Faction>();
    levelData.planets.forEach(p => {
      if (p.faction !== 'player' && p.faction !== 'neutral') {
        aiFactions.add(p.faction);
      }
    });

    // HUD overlay
    this.hudContainer = document.createElement('div');
    this.hudContainer.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:15;';
    this.container.appendChild(this.hudContainer);
    
    // Only pass active factions to the HUD
    const activeFactions: Faction[] = ['player', ...Array.from(aiFactions)];
    this.hud = new HUD(this.hudContainer, () => this.togglePause(), activeFactions);
    this.hud.onSpeedChange = (s) => { this._setSpeed(s); };
    this.hud.loadRecords(this._levelId);

    // Pause menu (hidden initially)
    this.pauseMenu = new PauseMenu(this.container, this._timeScale, this.isEditorTest);
    this.pauseMenu.onResume      = () => this.togglePause();
    this.pauseMenu.onSpeedChange = (s) => { this._setSpeed(s); };
    this.pauseMenu.onQuitToMenu  = () => {
      this._paused = false;
      this.onGameOver(null);
    };

    // In tutorial mode, the TutorialController handles enemy faction directly
    // — spin up a no-op AIController with an empty faction list.
    this.aiController = new AIController(
      isTutorial ? [] : Array.from(aiFactions),
      SettingsStore.get().difficulty
    );
    this.aiController.subscribeEvents(this.eventBus);
    
    // Pass AI sub-roles to the HUD for development
    Array.from(aiFactions).forEach(f => {
      const subRole = this.aiController.getSubRole(f);
      if (subRole) {
        this.hud.setFactionSubRole(f, subRole);
      }
    });



    // Create tutorial controller if needed (after hudContainer is set up below)
    // We do this after the HUD is attached so we can layer on top of it.

    // Input — attach to the container (canvas has pointer-events:none so events pass through to it)
    this.inputManager = new InputManager(this.container);
    this.bindInput();

    // Game loop
    this.gameLoop = new GameLoop(
      (dt) => this.update(dt),
      (alpha) => this.render(alpha)
    );

    // ESC key toggles pause; [ ] steps speed down/up
    const SPEEDS: GameSpeed[] = [0.5, 1, 2, 3];
    this._keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { this.togglePause(); return; }
      if (e.key === '[') {
        const idx = SPEEDS.indexOf(this._timeScale);
        if (idx > 0) this._setSpeed(SPEEDS[idx - 1]);
      }
      if (e.key === ']') {
        const idx = SPEEDS.indexOf(this._timeScale);
        if (idx < SPEEDS.length - 1) this._setSpeed(SPEEDS[idx + 1]);
      }
    };
    document.addEventListener('keydown', this._keyHandler);

    // Camera
    const fit = this.renderer.getFitTransform();
    this.cameraController = new CameraController(this.renderer.getWorldContainer());
    this.cameraController.setBaseline(
      fit.x, fit.y, fit.scale,
      levelData.worldWidth, levelData.worldHeight,
      this.renderer.getWidth(), this.renderer.getHeight()
    );
    this.cameraController.attach(this.container);

    // Listen for game:over emitted by CombatSystem
    this.subscriptions.add(this.eventBus.on('game:over', (payload: { winner: Faction | null }) => {
      this.showResultOverlay(payload.winner);
    }));

    // Listen for early player elimination
    this.subscriptions.add(this.eventBus.on('player:eliminated', () => {
      this.showResultOverlay(null, { isEarlyDeath: true });
    }));

    // Listen for planet captures for audio feedback
    this.subscriptions.add(this.eventBus.on('planet:captured', (payload: { planetId: string; newFaction: string }) => {
      audioManager.playCapture(payload.newFaction);
    }));

    // Attach tutorial controller (must be after hudContainer is available)
    if (isTutorial) {
      this.tutorialController = new TutorialController(
        this._tutorialId,
        this.hudContainer,
        (planetId) => this.getPlanetScreenPosById(planetId),
      );
      // Wire up the exit callback so EXIT button returns to menu
      this.tutorialController.setExitCallback(() => {
        this.onGameOver(null);
      });
    }

    // Planet hover tooltip
    this._buildPlanetTooltip();

    // Selection count badge
    this._buildSelectionBadge();
  }

  start(): void {
    this.state.running = true;
    this.gameLoop.start();
    this.hud.show();
    // Always start at 1× regardless of persisted settings
    this._setSpeed(1);
    audioManager.ensureReady().then(() => audioManager.startAmbient());
  }

  stop(): void {
    this.state.running = false;
    this.gameLoop.stop();
  }

  destroy(): void {
    if (this._isDestroyed) return;
    this._isDestroyed = true;
    this.subscriptions.dispose();
    this.aiController?.destroy();
    this.gameLoop?.stop();
    this.inputManager?.destroy();
    if (this._keyHandler) document.removeEventListener('keydown', this._keyHandler);
    if (this._mouseMoveHandler) this.container?.removeEventListener('mousemove', this._mouseMoveHandler);
    this.tutorialController?.destroy();
    this.tutorialController = null;
    this.hud?.destroy();
    this.hudContainer?.remove();
    this.dragBox?.remove();
    this.resultOverlay?.remove();
    this._planetTooltip?.remove();
    this.pauseMenu?.destroy();
    this.pauseMenu = null;
    this.cameraController?.destroy();
    this.cameraController = null;
    audioManager.stopAmbient();

    this.entities.planets.forEach(p => p.destroy());
    this.entities.planets.clear();
    this.entities.blackHoles.forEach(bh => bh.destroy());
    this.entities.blackHoles.clear();
    this.entities.particles?.destroy();
    this.entities.asteroids?.destroy();
    this.entities.gammaRay?.destroy();
    this.entities.speedZones?.destroy();
    this.entities.portals?.destroy();
    this.entities.trappingBlackHoles?.destroy();
    this.entities.whiteHoles?.destroy();
    this.entities.fog?.destroy();
  }

  // ── Pause / Speed ─────────────────────────────────────────

  togglePause(): void {
    // Don't allow pause after game is over
    if (this.state?.winner !== null && this.state?.winner !== undefined) return;

    this._paused = !this._paused;
    this.hud.setPaused(this._paused);

    if (this._paused) {
      this.pauseMenu?.show();
    } else {
      this.pauseMenu?.hide();
    }
  }

  /** Single source of truth for speed changes — syncs _timeScale, HUD strip, and PauseMenu. */
  private _setSpeed(speed: GameSpeed): void {
    this._timeScale = speed;
    this.hud?.setSpeed(speed);
    this.pauseMenu?.syncSpeed(speed);
    SettingsStore.update({ gameSpeed: speed });
  }

  // ── Game State Init ───────────────────────────────────────

  // ── Update (Fixed-tick) ───────────────────────────────────

  private update(dt: number): void {
    if (this._isDestroyed || !this.state.running) return;

    this.cameraController?.update(dt);
    if (this.state.winner !== null) return;
    if (this._paused) return;  // freeze all simulation when paused
    this.state.tick++;
    const dt_ = dt * this._timeScale;  // apply speed multiplier
    dt = dt_;

    // Track elapsed time and peak stats
    this._elapsedTime += dt;
    let playerParticles = 0;
    for (const p of this.state.particles) if (p.alive && p.faction === 'player') playerParticles++;
    let playerPlanets = 0;
    for (const p of this.state.planets.values()) if (p.faction === 'player') playerPlanets++;
    if (playerParticles > this._peakParticles) this._peakParticles = playerParticles;
    if (playerPlanets   > this._peakPlanets)   this._peakPlanets   = playerPlanets;

    // Sample unit counts for end-game graph
    this._statsTimer += dt;
    if (this._statsTimer >= GameScene.STATS_SAMPLE_INTERVAL) {
      this._statsTimer -= GameScene.STATS_SAMPLE_INTERVAL;
      const counts = new Map<string, number>();
      for (const p of this.state.particles) {
        if (!p.alive || p.faction === 'neutral') continue;
        counts.set(p.faction, (counts.get(p.faction) ?? 0) + p.strength);
      }
      this._statsHistory.push({ time: this._elapsedTime, counts });
    }

    this.simulation.update(dt, this.state, this.eventBus);

    // Process pending hazard death audio signals
    const pendingPlanet   = this.state._pendingPlanetHazardDeaths ?? 0;
    const pendingParticle = this.state._pendingParticleHazardDeaths ?? 0;
    if (pendingPlanet > 0) {
      for (let i = 0; i < pendingPlanet; i++) audioManager.playPlanetHazardDeath();
      this.state._pendingPlanetHazardDeaths = 0;
    }
    if (pendingParticle > 0) {
      audioManager.playParticleHazardDeath(); // batched — plays at most once per 3s
      this.state._pendingParticleHazardDeaths = 0;
    }

    // Prune dead particles
    compactAliveParticles(this.state.particles);

    // AI - callback matches DeployCallback signature
    this.aiController.update(dt, this.state, (fromIds, targetPlanetId, stationedParticleIds, waypointX, waypointY, fraction) => {
      this._deployParticles(fromIds, targetPlanetId, stationedParticleIds, undefined, undefined, waypointX, waypointY, fraction);
    });

    // Tutorial controller (scripted enemy + overlay steps)
    if (this._isTutorial && this.tutorialController) {
      this.tutorialController.update(dt, this.state, (fromIds, targetPlanetId) => {
        this._deployParticles(fromIds, targetPlanetId, undefined, undefined);
      });
    }

    // Win condition check
    this.checkWinCondition();

    // HUD update
    this.hud.update(this.state);
    this.hud.updateTimer(this._elapsedTime);
    this.hud.tick(performance.now());
  }

  // ── Render (Interpolated) ─────────────────────────────────

  private render(_alpha: number): void {
    this.entities.planets.forEach((entity, id) => {
      const data = this.state.planets.get(id);
      if (data) entity.render(data, this.state.selectedPlanetIds.has(id));
    });
    this.entities.blackHoles.forEach((entity, id) => {
      const data = this.state.blackHoles.get(id);
      if (data) entity.render(data);
    });
    this.entities.particles.render(this.state.particles);
    // Hazard renderers
    this.entities.asteroids.render(this.state.asteroids);
    const activeRays = [this.state.gammaRay];
    if (this.state.gammaRay2) activeRays.push(this.state.gammaRay2);
    this.entities.gammaRay.render(activeRays);
    // New hazard renderers
    if (this.state.speedZones.length > 0)
      this.entities.speedZones.render(this.state.speedZones);
    if (this.state.portals.length > 0)
      this.entities.portals.render(this.state.portals);
    if (this.state.trappingBlackHoles.length > 0)
      this.entities.trappingBlackHoles.render(this.state.trappingBlackHoles, this.state.particles);
    if (this.state.whiteHoles.length > 0)
      this.entities.whiteHoles.render(this.state.whiteHoles);
    this._renderHazardEffects();
    // Draw Fog
    this.entities.fog.render(this.state, this.state.worldWidth, this.state.worldHeight, this._elapsedTime);
  }

  private _renderHazardEffects(): void {
    if (!this._effectsGraphics) return;
    const g = this._effectsGraphics;
    g.clear();

    for (const fx of this.state.hazardEffects) {
      const t = Math.min(1, fx.age / fx.duration); // 0 → 1 over lifetime
      const alpha = 1 - t;                         // fades out

      if (fx.kind === 'particle_sparkle') {
        // 5-ray starburst at particle's death position
        const rayLen = fx.radius * (1 - t * 0.5);
        for (let i = 0; i < 5; i++) {
          const angle = (i / 5) * Math.PI * 2;
          const ex = fx.x + Math.cos(angle) * rayLen;
          const ey = fx.y + Math.sin(angle) * rayLen;
          g.moveTo(fx.x, fx.y)
           .lineTo(ex, ey)
           .stroke({ color: fx.color, width: 1.5, alpha: alpha * 0.9 });
        }
        // Center flash dot
        g.circle(fx.x, fx.y, 3 * (1 - t))
         .fill({ color: 0xffffff, alpha: alpha * 0.8 });

      } else if (fx.kind === 'planet_shockwave') {
        // Expanding ring shockwave
        const r = fx.radius * t;
        g.circle(fx.x, fx.y, r)
         .stroke({ color: fx.color, width: 3 * (1 - t) + 1, alpha: alpha * 0.7 });
        // Secondary inner ring
        if (t > 0.1) {
          g.circle(fx.x, fx.y, r * 0.65)
           .stroke({ color: 0xffffff, width: 1.5 * (1 - t), alpha: alpha * 0.4 });
        }
      }
    }
  }

  // ── Input Binding ─────────────────────────────────────────

  private bindInput(): void {
    // Drag-select (after DRAG_THRESHOLD movement)
    this.inputManager.onDragStart = (x: number, y: number) => {
      this._dragStartX = x;
      this._dragStartY = y;
      this.showDragBox(x, y, x, y);
    };

    this.inputManager.onDragMove = (x: number, y: number) => {
      this.updateDragBox(this._dragStartX, this._dragStartY, x, y);
    };

    this.inputManager.onDragEnd = (x: number, y: number) => {
      this.hideDragBox();
      const minX = Math.min(this._dragStartX, x);
      const maxX = Math.max(this._dragStartX, x);
      const minY = Math.min(this._dragStartY, y);
      const maxY = Math.max(this._dragStartY, y);
      this.handleDragSelect(minX, minY, maxX, maxY);
    };

    // Plain click (no drag) — InputManager calls onRightClick with Vec2
    this.inputManager.onRightClick = (pos: Vec2) => {
      this.handleRightClick(pos.x, pos.y);
    };

    // Single left click (no drag)
    this.inputManager.onClick = (x: number, y: number) => {
      const hit = this.getPlanetAtPoint(x, y);
      if (hit) {
        const planet = this.state.planets.get(hit)!;
        if (planet.faction === 'player') {
          this.state.selectedPlanetIds.clear();
          this.state.selectedParticleIds.clear();
          this.state.selectedPlanetIds.add(hit);
          audioManager.playSelect();
        }
      } else {
        this.state.selectedPlanetIds.clear();
        this.state.selectedParticleIds.clear();
      }
      this._updateSelectionBadge();
    };
  }

  // ── Drag Selection Box ────────────────────────────────────

  private showDragBox(x1: number, y1: number, x2: number, y2: number): void {
    if (!this.dragBox) {
      this.dragBox = document.createElement('div');
      this.dragBox.className = 'drag-select-box';
      this.container.appendChild(this.dragBox);
    }
    this.updateDragBox(x1, y1, x2, y2);
    this.dragBox.style.display = 'block';
  }

  private updateDragBox(x1: number, y1: number, x2: number, y2: number): void {
    if (!this.dragBox) return;
    this.dragBox.style.left   = `${Math.min(x1, x2)}px`;
    this.dragBox.style.top    = `${Math.min(y1, y2)}px`;
    this.dragBox.style.width  = `${Math.abs(x2 - x1)}px`;
    this.dragBox.style.height = `${Math.abs(y2 - y1)}px`;
  }

  private hideDragBox(): void {
    if (this.dragBox) this.dragBox.style.display = 'none';
  }

  // ── Selection / Deploy ────────────────────────────────────

  private handleDragSelect(x1: number, y1: number, x2: number, y2: number): void {
    this.state.selectedPlanetIds.clear();
    this.state.selectedParticleIds.clear();
    const worldTL = this.renderer.screenToWorld(x1, y1);
    const worldBR = this.renderer.screenToWorld(x2, y2);

    // Save world box for repeat-last-action
    this._lastSelBoxWorld = { x1: worldTL.x, y1: worldTL.y, x2: worldBR.x, y2: worldBR.y };

    // Select player planets in box
    this.state.planets.forEach((planet, id) => {
      if (planet.faction !== 'player') return;
      if (
        planet.x >= worldTL.x && planet.x <= worldBR.x &&
        planet.y >= worldTL.y && planet.y <= worldBR.y
      ) {
        this.state.selectedPlanetIds.add(id);
      }
    });

    // Select player particles in box
    for (const p of this.state.particles) {
      if (!p.alive || p.faction !== 'player') continue;
      if (
        p.x >= worldTL.x && p.x <= worldBR.x &&
        p.y >= worldTL.y && p.y <= worldBR.y
      ) {
        this.state.selectedParticleIds.add(p.id);
      }
    }

    if (this.state.selectedPlanetIds.size > 0 || this.state.selectedParticleIds.size > 0) {
      audioManager.playSelect();
    }
    this._updateSelectionBadge();
  }

  private handleRightClick(screenX: number, screenY: number): void {
    const now = performance.now();
    const timeSinceLastClick = now - this._lastRightClickTime;
    const isDoubleClick = timeSinceLastClick < 380;
    this._lastRightClickTime = now;

    // ── Double right-click: replay last action ──────────────────────────────
    if (isDoubleClick && this._lastAction) {
      const la = this._lastAction;

      // Re-apply selection: try the saved world box first
      this.state.selectedPlanetIds.clear();
      this.state.selectedParticleIds.clear();

      if (la.selBoxWorld) {
        const { x1, y1, x2, y2 } = la.selBoxWorld;
        this.state.planets.forEach((planet, id) => {
          if (planet.faction !== 'player') return;
          if (planet.x >= x1 && planet.x <= x2 && planet.y >= y1 && planet.y <= y2) {
            this.state.selectedPlanetIds.add(id);
          }
        });
        for (const p of this.state.particles) {
          if (!p.alive || p.faction !== 'player') continue;
          if (p.x >= x1 && p.x <= x2 && p.y >= y1 && p.y <= y2) {
            this.state.selectedParticleIds.add(p.id);
          }
        }
      }

      // Fallback: use saved IDs if box gave nothing
      if (this.state.selectedPlanetIds.size === 0 && this.state.selectedParticleIds.size === 0) {
        la.selPlanetIds.forEach(id => {
          if (this.state.planets.has(id)) this.state.selectedPlanetIds.add(id);
        });
        la.selParticleIds.forEach(id => {
          if (this.state.particles.find(p => p.alive && p.id === id)) {
            this.state.selectedParticleIds.add(id);
          }
        });
      }

      if (this.state.selectedPlanetIds.size > 0 || this.state.selectedParticleIds.size > 0) {
        if (this.state.selectedPlanetIds.size > 0) {
          this.deployFromSelected(la.targetPlanetId, la.targetX, la.targetY);
        }
        if (this.state.selectedParticleIds.size > 0) {
          this._redeploySelectedParticles(la.targetPlanetId, la.targetX, la.targetY);
        }
        audioManager.playCommand();
        this._updateSelectionBadge();
      }
      return;
    }

    // ── Normal right-click ──────────────────────────────────────────────────
    const hasSelection =
      this.state.selectedPlanetIds.size > 0 ||
      this.state.selectedParticleIds.size > 0;
    if (!hasSelection) return;

    const world       = this.renderer.screenToWorld(screenX, screenY);
    let hitPlanetId   = this.getPlanetAtWorldPoint(world.x, world.y);

    // If we didn't click exactly on a planet, snap to the nearest one within 100px
    if (!hitPlanetId) {
      let bestDistSq = 100 * 100;
      this.state.planets.forEach((p, id) => {
        const dx = p.x - world.x;
        const dy = p.y - world.y;
        const dSq = dx * dx + dy * dy;
        if (dSq < bestDistSq) {
          bestDistSq = dSq;
          hitPlanetId = id;
        }
      });
    }

    const targetPlanetId = hitPlanetId ?? undefined;
    const targetX = hitPlanetId ? undefined : world.x;
    const targetY = hitPlanetId ? undefined : world.y;

    // Save this action for potential double-click replay
    this._lastAction = {
      selBoxWorld: this._lastSelBoxWorld,
      selPlanetIds: new Set(this.state.selectedPlanetIds),
      selParticleIds: new Set(this.state.selectedParticleIds),
      targetPlanetId,
      targetX,
      targetY,
    };

    // Deploy from selected planets
    if (this.state.selectedPlanetIds.size > 0) {
      this.deployFromSelected(targetPlanetId, targetX, targetY);
      audioManager.playCommand();
    }

    // Redeploy selected particles
    if (this.state.selectedParticleIds.size > 0) {
      this._redeploySelectedParticles(targetPlanetId, targetX, targetY);
      audioManager.playCommand();
    }
  }

  /** Move selected particles to a new target. */
  private _redeploySelectedParticles(
    targetPlanetId?: string,
    targetX?: number,
    targetY?: number
  ): void {
    this._deploySpecificParticles(Array.from(this.state.selectedParticleIds), targetPlanetId, targetX, targetY);
    this.state.selectedParticleIds.clear();
  }

  private _deploySpecificParticles(
    particleIds: number[],
    targetPlanetId?: string,
    targetX?: number,
    targetY?: number,
    waypointX?: number,
    waypointY?: number
  ): void {
    const idSet = new Set(particleIds);
    for (const p of this.state.particles) {
      if (!p.alive || !idSet.has(p.id)) continue;

      p.mode           = 'traveling';
      p.targetPlanetId = targetPlanetId;
      p.targetX        = targetX;
      p.targetY        = targetY;
      p.waypointX      = waypointX;
      p.waypointY      = waypointY;
      p.orbitTimer     = 0;
      p.deployTimer    = 0;
      // Steer toward waypoint first if set, else toward real target
      const destX = waypointX ?? (targetPlanetId
        ? (this.state.planets.get(targetPlanetId)?.x ?? p.x)
        : (targetX ?? p.x));
      const destY = waypointY ?? (targetPlanetId
        ? (this.state.planets.get(targetPlanetId)?.y ?? p.y)
        : (targetY ?? p.y));
      const dx = destX - p.x;
      const dy = destY - p.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      p.vx = (dx / len) * PARTICLE_SPEED;
      p.vy = (dy / len) * PARTICLE_SPEED;
    }
  }

  private deployFromSelected(targetPlanetId?: string, targetX?: number, targetY?: number): void {
    let fromIds = Array.from(this.state.selectedPlanetIds);
    if (fromIds.length === 0) return;

    this._deployParticles(
      fromIds,
      targetPlanetId,
      undefined,  // stationedParticleIds
      targetX,
      targetY
    );
  }

  /** Core deploy — used by both player input and AI callback. */
  private _deployParticles(
    sourcePlanetIds: string[], targetPlanetId?: string, stationedParticleIds?: number[],
    targetX?: number, targetY?: number, waypointX?: number, waypointY?: number, fraction?: number
  ): void {
    const donorIds = new Set(sourcePlanetIds);
    const explicitIds = new Set(stationedParticleIds ?? []);
    for (const p of this.state.particles) if (p.alive && p.mode === 'orbiting' && explicitIds.has(p.id)) donorIds.add(p.homePlanetId);
    const before = new Map<string, number>();
    for (const id of donorIds) {
      let strength = 0;
      for (const p of this.state.particles) if (p.alive && p.mode === 'orbiting' && p.homePlanetId === id) strength += p.strength;
      before.set(id, strength);
    }
    const launched = issueDeploymentOrder(this.state, {
      sourcePlanetIds, targetPlanetId, stationedParticleIds, targetX, targetY, waypointX, waypointY, fraction,
    });
    for (const id of donorIds) {
      const source = this.state.planets.get(id);
      if (source && launched.some(p => p.homePlanetId === id)) {
        audioManager.playLaunch();
        this.aiController.recordDeployEvent(id, source.faction, before.get(id) ?? 0);
      }
    }
  }

  // ── Hit Tests ─────────────────────────────────────────────

  private getPlanetAtPoint(screenX: number, screenY: number): string | null {
    const world = this.renderer.screenToWorld(screenX, screenY);
    return this.getPlanetAtWorldPoint(world.x, world.y);
  }

  /** Returns the screen-space centre of a planet by id (used by TutorialController for arrows). */
  private getPlanetScreenPosById(planetId: string): { x: number; y: number } | null {
    const planet = this.state?.planets.get(planetId);
    if (!planet) return null;
    return this.renderer.worldToScreen(planet.x, planet.y);
  }

  private getPlanetAtWorldPoint(wx: number, wy: number): string | null {
    let best: string | null = null;
    let bestDist = Infinity;
    this.state.planets.forEach((planet, id) => {
      const r  = PLANET_RADIUS[planet.upgradeLevel] + 8;
      const dx = planet.x - wx;
      const dy = planet.y - wy;
      const d  = Math.sqrt(dx * dx + dy * dy);
      if (d <= r && d < bestDist) { bestDist = d; best = id; }
    });
    return best;
  }

  private checkWinCondition(): void {
    // CombatSystem handles the normal win via EventBus + state.winner.
    // GameScene only needs to catch the draw case (all factions eliminated).
    if (this.state.winner !== null) return;

    const livingFactions = new Set<Faction>();
    this.state.planets.forEach(p => {
      if (p.faction !== 'neutral') livingFactions.add(p.faction);
    });
    this.state.particles.forEach(p => {
      if (p.alive && p.faction !== 'neutral') livingFactions.add(p.faction);
    });

    if (livingFactions.size === 0) {
      // Draw — all factions wiped out simultaneously.
      this.state.winner = 'neutral' as Faction; // sentinel for "draw"
      this.showResultOverlay(null);
    }
    // Normal single-winner case is already handled by CombatSystem via EventBus.
  }

  // ── Planet Tooltip ────────────────────────────────────────

  private _buildPlanetTooltip(): void {
    const tip = document.createElement('div');
    tip.id = 'planet-tooltip';
    tip.style.cssText = `
      position: absolute;
      display: none;
      pointer-events: none;
      z-index: 30;
      background: rgba(10, 18, 30, 0.92);
      border: 1px solid rgba(79, 195, 247, 0.25);
      border-radius: 10px;
      padding: 10px 14px;
      min-width: 170px;
      backdrop-filter: blur(8px);
      font-family: 'Rajdhani', sans-serif;
      color: rgba(255,255,255,0.9);
      font-size: 12px;
      line-height: 1.7;
      box-shadow: 0 4px 24px rgba(0,0,0,0.5);
    `;
    this.container.appendChild(tip);
    this._planetTooltip = tip;

    this._mouseMoveHandler = (e: MouseEvent) => {
      if (!this.state || this.state.winner !== null) {
        tip.style.display = 'none';
        return;
      }
      const rect = this.container.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const planetId = this.getPlanetAtPoint(sx, sy);

      if (!planetId) {
        tip.style.display = 'none';
        return;
      }

      const p = this.state.planets.get(planetId);
      if (!p) { tip.style.display = 'none'; return; }

      // Position tooltip near cursor, keep on screen
      const OFFSET = 18;
      let tx = sx + OFFSET;
      let ty = sy + OFFSET;
      if (tx + 200 > rect.width)  tx = sx - 200 - OFFSET;
      if (ty + 160 > rect.height) ty = sy - 160 - OFFSET;
      tip.style.left = `${tx}px`;
      tip.style.top  = `${ty}px`;

      // Build content
      const totalHealth = p.health;
      const maxHealth   = p.maxHealth;
      const healthPct   = maxHealth > 0 ? Math.round((totalHealth / maxHealth) * 100) : 100;
      const healthColor = healthPct > 60 ? '#80e8ff' : healthPct > 30 ? '#ff8c42' : '#ff3333';

      const levelNames  = ['', 'I', 'II', 'III'];
      const levelColors = ['', '#8a8a8a', '#c8a820', '#ffd700'];
      const lvl = p.upgradeLevel;

      const factionLabel = p.faction === 'player'  ? 'Yours'   :
                           p.faction === 'neutral' ? 'Neutral' :
                           p.faction.replace(/_/g, ' ');

      let upgradeHtml = '';
      if (lvl < 3 && p.faction !== 'neutral') {
        const thresholds: Record<number, number> = { 1: 50, 2: 100 };
        const threshold = thresholds[lvl] ?? 100;
        const unitsNeeded = Math.max(0, Math.ceil(threshold - p.absorbedCount));
        const upgradePct = Math.round(Math.min(1, p.absorbedCount / threshold) * 100);
        const upgradeColor = upgradePct >= 80 ? '#ffd700' : 'rgba(255,215,0,0.7)';
        upgradeHtml = `
          <div style="margin-top:5px;padding-top:5px;border-top:1px solid rgba(255,255,255,0.08)">
            <span style="color:rgba(255,255,255,0.4);font-size:10px;text-transform:uppercase;letter-spacing:0.1em">⬡ Upgrade ring</span><br>
            <span style="color:${upgradeColor};font-weight:600">${upgradePct}% to Level ${lvl + 1}</span>
            <span style="color:rgba(255,255,255,0.45);font-size:10px"> (${unitsNeeded} units needed)</span>
          </div>`;
      } else if (lvl === 3) {
        upgradeHtml = `
          <div style="margin-top:5px;padding-top:5px;border-top:1px solid rgba(255,255,255,0.08)">
            <span style="color:#ffd700;font-size:10px">✦ MAX LEVEL</span>
          </div>`;
      }

      let shieldHtml = '';
      if (p.isShielded) {
        const shieldPoints = p.shieldPoints ?? 0;
        shieldHtml = `
          <div style="margin-top:5px;padding-top:5px;border-top:1px solid rgba(255,255,255,0.08)">
            <span style="color:rgba(255,255,255,0.4);font-size:10px;text-transform:uppercase;letter-spacing:0.1em">🛡️ Shield Level</span><br>
            <span style="color:#00e5ff;font-weight:600">${shieldPoints} Units</span>
          </div>`;
      }

      tip.innerHTML = `
        <div style="font-family:'Orbitron',sans-serif;font-size:11px;font-weight:700;
                    color:${levelColors[lvl]};letter-spacing:0.1em;margin-bottom:4px">
          Level ${levelNames[lvl]} &nbsp;<span style="color:rgba(255,255,255,0.3);font-size:9px">${factionLabel.toUpperCase()}</span>
        </div>
        <div>
          <span style="color:rgba(255,255,255,0.4);font-size:10px;text-transform:uppercase;letter-spacing:0.1em">◉ Health ring</span><br>
          <span style="color:${healthColor};font-weight:600">${healthPct}%</span>
          &nbsp;<span style="color:rgba(255,255,255,0.3);font-size:10px">${p.health} / ${p.maxHealth} structural</span>
        </div>
        ${upgradeHtml}
        ${shieldHtml}
      `;

      tip.style.display = 'block';
    };

    this.container.addEventListener('mousemove', this._mouseMoveHandler);
  }

  // ── Selection Count Badge ─────────────────────────────────

  private _buildSelectionBadge(): void {
    const badge = document.createElement('div');
    badge.id = 'selection-badge';
    badge.style.cssText = `
      position: absolute;
      top: 72px;
      left: 12px;
      display: none;
      pointer-events: none;
      z-index: 25;
      background: rgba(10, 18, 30, 0.88);
      border: 1px solid rgba(79, 195, 247, 0.3);
      border-radius: 8px;
      padding: 6px 12px;
      font-family: 'Rajdhani', sans-serif;
      color: rgba(255,255,255,0.95);
      font-size: 13px;
      font-weight: 600;
      letter-spacing: 0.05em;
      backdrop-filter: blur(6px);
      box-shadow: 0 2px 12px rgba(0,0,0,0.4);
      transition: opacity 0.15s ease;
    `;
    this.container.appendChild(badge);
    this._selectionBadge = badge;
  }

  private _updateSelectionBadge(): void {
    const badge = this._selectionBadge;
    if (!badge || !this.state) return;

    const planetsSelected = this.state.selectedPlanetIds.size;
    const particlesDirect = this.state.selectedParticleIds.size;

    // Count orbiting defenders on selected planets
    let defending = 0;
    if (planetsSelected > 0) {
      for (const p of this.state.particles) {
        if (p.alive && p.mode === 'orbiting' && this.state.selectedPlanetIds.has(p.homePlanetId)) {
          defending++;
        }
      }
    }

    const total = particlesDirect + defending;
    if (total === 0 && planetsSelected === 0) {
      badge.style.display = 'none';
      return;
    }

    badge.style.display = 'block';
    let html = `⬡ <span style="color:#4fc3f7">${total}</span> selected`;
    if (particlesDirect > 0 && defending > 0) {
      html += `<br><span style="color:rgba(255,255,255,0.4);font-size:10px">${particlesDirect} free · ${defending} defending</span>`;
    } else if (defending > 0) {
      html += `<br><span style="color:rgba(255,255,255,0.4);font-size:10px">${defending} defending</span>`;
    }
    badge.innerHTML = html;
  }

  // ── Result Overlay ────────────────────────────────────────

  private showResultOverlay(winner: Faction | null, options?: { isEarlyDeath?: boolean }): void {
    if (this.resultOverlay) return;
    this.stop();
    audioManager.stopAmbient();
    audioManager.playGameOver(winner === 'player');

    const isEarlyDeath = options?.isEarlyDeath ?? false;
    const isVictory = winner === 'player';
    const colorHex  = isVictory ? '#4fc3f7' : (winner || isEarlyDeath) ? '#ef5350' : '#78909c';

    // Gather final stats
    const finalParticles = this.state.particles.filter(p => p.alive && p.faction === 'player').length;
    const finalPlanets   = [...this.state.planets.values()].filter(p => p.faction === 'player').length;
    const stats: GameStats = {
      elapsedTime:   this._elapsedTime,
      peakParticles: this._peakParticles,
      peakPlanets:   this._peakPlanets,
      finalParticles,
      finalPlanets,
    };

    // Save high score on victory
    let isNewRecord = false;
    let prevBest: number | null = null;
    if (isVictory) {
      const prev = HighScoreStore.getBest(this._levelId);
      prevBest   = prev?.bestTime ?? null;
      isNewRecord = HighScoreStore.submit(this._levelId, this._elapsedTime);
    }

    const overlay = document.createElement('div');
    overlay.className = 'game-result-overlay';
    overlay.style.cssText = `
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-start;
      padding: 32px 20px 40px;
      overflow-y: auto;
      background: rgba(0,0,0,0.78);
      backdrop-filter: blur(12px);
      z-index: 100;
      animation: fadeIn 0.4s ease;
    `;

    // Title
    const title = document.createElement('div');
    title.style.cssText = `
      font-family: 'Orbitron', sans-serif;
      font-size: clamp(2rem, 5vw, 3.4rem);
      font-weight: 900;
      color: ${colorHex};
      text-shadow: 0 0 40px ${colorHex}88;
      letter-spacing: 0.15em;
      margin-bottom: 8px;
      animation: pulse-glow 2s ease-in-out infinite;
    `;
    title.textContent = isVictory ? '⚡ VICTORY' : (winner || isEarlyDeath) ? '☠ YOU DIED' : '💀 ANNIHILATED';

    // Subtitle
    const sub = document.createElement('div');
    sub.style.cssText = `
      font-family: 'Rajdhani', sans-serif;
      font-size: 1rem;
      color: rgba(255,255,255,0.4);
      letter-spacing: 0.2em;
      text-transform: uppercase;
      margin-bottom: 32px;
      text-align: center;
    `;
    sub.textContent = isVictory
      ? 'The galaxy bows before you.'
      : isEarlyDeath
      ? 'Your forces have been eliminated, but the war rages on.'
      : winner
      ? `${winner.replace(/_/g, ' ').toUpperCase()} has crushed you into dust.`
      : 'All forces have been annihilated.';

    // Stats card
    const statsCard = document.createElement('div');
    statsCard.style.cssText = `
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 16px;
      padding: 24px 40px;
      margin-bottom: 28px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px 40px;
      min-width: 380px;
    `;

    const addStat = (label: string, value: string, highlight = false) => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex; flex-direction:column; align-items:center;';
      const lbl = document.createElement('div');
      lbl.textContent = label;
      lbl.style.cssText = `
        font-family: 'Rajdhani', sans-serif;
        font-size: 0.7rem;
        color: rgba(255,255,255,0.35);
        letter-spacing: 0.2em;
        text-transform: uppercase;
        margin-bottom: 4px;
      `;
      const val = document.createElement('div');
      val.textContent = value;
      val.style.cssText = `
        font-family: 'Orbitron', sans-serif;
        font-size: 1.1rem;
        font-weight: 700;
        color: ${highlight ? colorHex : 'rgba(255,255,255,0.85)'};
        text-shadow: ${highlight ? `0 0 12px ${colorHex}88` : 'none'};
      `;
      row.appendChild(lbl);
      row.appendChild(val);
      statsCard.appendChild(row);
    };

    addStat('TIME', HighScoreStore.formatTime(stats.elapsedTime), isVictory);
    addStat('PEAK UNITS', stats.peakParticles.toString());
    addStat('PEAK PLANETS', stats.peakPlanets.toString());
    addStat('FINAL UNITS', stats.finalParticles.toString());

    // High score block (victory only)
    if (isVictory) {
      const hsRow = document.createElement('div');
      hsRow.style.cssText = 'grid-column: 1 / -1; text-align:center; padding-top:8px; border-top:1px solid rgba(255,255,255,0.08); margin-top:4px;';
      if (isNewRecord) {
        hsRow.innerHTML = `<span style="font-family:'Orbitron',sans-serif;font-size:0.85rem;color:#ffd54f;letter-spacing:0.1em;">🏆 NEW BEST TIME!</span>`;
      } else if (prevBest !== null) {
        hsRow.innerHTML = `<span style="font-family:'Rajdhani',sans-serif;font-size:0.8rem;color:rgba(255,255,255,0.35);letter-spacing:0.1em;">BEST: ${HighScoreStore.formatTime(prevBest)}</span>`;
      }
      statsCard.appendChild(hsRow);
    }

    // Buttons
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex; gap:16px; flex-wrap: wrap; justify-content: center; max-width: 400px;';

    const retryBtn = document.createElement('button');
    retryBtn.textContent = '↺  RETRY';
    retryBtn.className = 'btn-primary';
    retryBtn.style.padding = '12px 28px';
    retryBtn.style.fontSize = '13px';
    retryBtn.addEventListener('click', () => {
      audioManager.playClick();
      this.resultOverlay?.remove();
      this.resultOverlay = null;
      this.onGameOver(winner);
    });

    const menuBtn = document.createElement('button');
    menuBtn.textContent = this.isEditorTest ? '✎  EDIT' : '⌂  MENU';
    menuBtn.style.cssText = `
      padding: 12px 28px;
      background: rgba(255,255,255,0.08);
      color: rgba(255,255,255,0.7);
      border: 1px solid rgba(255,255,255,0.15);
      border-radius: 8px;
      font-family: 'Orbitron', sans-serif;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.08em;
      cursor: pointer;
      transition: background 0.2s;
    `;
    menuBtn.addEventListener('mouseenter', () => { menuBtn.style.background = 'rgba(255,255,255,0.14)'; });
    menuBtn.addEventListener('mouseleave', () => { menuBtn.style.background = 'rgba(255,255,255,0.08)'; });
    menuBtn.addEventListener('click', () => {
      audioManager.playClick();
      this.resultOverlay?.remove();
      this.resultOverlay = null;
      this.onGameOver(null);
    });

    btnRow.appendChild(retryBtn);
    btnRow.appendChild(menuBtn);

    if (isEarlyDeath) {
      const watchBtn = document.createElement('button');
      watchBtn.textContent = '👁 WATCH THE REST OF THE FIGHT';
      watchBtn.style.cssText = `
        padding: 12px 28px;
        background: rgba(100,200,255,0.1);
        color: #4fc3f7;
        border: 1px solid rgba(79,195,247,0.3);
        border-radius: 8px;
        font-family: 'Orbitron', sans-serif;
        font-size: 13px;
        font-weight: 700;
        letter-spacing: 0.08em;
        cursor: pointer;
        transition: background 0.2s;
        width: 100%;
        margin-top: 8px;
      `;
      watchBtn.addEventListener('mouseenter', () => { watchBtn.style.background = 'rgba(100,200,255,0.2)'; });
      watchBtn.addEventListener('mouseleave', () => { watchBtn.style.background = 'rgba(100,200,255,0.1)'; });
      watchBtn.addEventListener('click', () => {
        audioManager.playClick();
        this.resultOverlay?.remove();
        this.resultOverlay = null;
        this.state!.running = true; // explicitly set state back to running
        this.start();
      });
      btnRow.appendChild(watchBtn);
    }
    // ── Unit-count graph ────────────────────────────────────────────────────
    const graphCanvas = renderUnitGraph(this._statsHistory);
    if (graphCanvas) {
      graphCanvas.style.cssText = `
        margin-bottom: 24px;
        border-radius: 12px;
        border: 1px solid rgba(255,255,255,0.1);
        display: block;
        max-width: 100%;
      `;
    }

    overlay.appendChild(title);
    overlay.appendChild(sub);
    if (graphCanvas) overlay.appendChild(graphCanvas);
    overlay.appendChild(statsCard);
    overlay.appendChild(btnRow);
    this.container.appendChild(overlay);
    this.resultOverlay = overlay;
  }

  // ── Unit-count graph renderer ─────────────────────────────────────────────


}
