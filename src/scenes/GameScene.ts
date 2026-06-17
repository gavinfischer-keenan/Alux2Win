// ============================================================
// GameScene.ts — Main gameplay scene for Alux2Win
// Wires all ECS systems, entities, input, AI, and HUD together.
// ============================================================

import type {
  LevelData,
  PlanetDef,
  BlackHoleDef,
  GameState,
  PlanetData,
  BlackHoleData,
  ParticleData,
  Faction,
  UpgradeLevel,
} from '../types';
import {
  PLANET_CAPACITY,
  PLANET_PRODUCTION,
  PLANET_RADIUS,
  PLANET_BONUS_HEALTH,
  FACTION_COLORS_HEX,
  PARTICLE_SPEED,
} from '../types';
import { HUD } from '../ui/HUD';
import { PauseMenu } from '../ui/PauseMenu';
import type { GameSpeed } from '../ui/PauseMenu';
import { CameraController } from '../core/CameraController';
import { audioManager }     from '../core/AudioManager';
import { SettingsStore }    from '../core/SettingsStore';

// ── Engine imports ───────────────────────────────────────────
import { Renderer }        from '../engine/Renderer';
import { EventBus }        from '../engine/EventBus';
import { GameLoop }        from '../engine/GameLoop';
import { InputManager }    from '../engine/InputManager';
import { SpatialHash }     from '../engine/SpatialHash';

// ── System imports ───────────────────────────────────────────
import { OrbitSystem }     from '../systems/OrbitSystem';
import { ProductionSystem } from '../systems/ProductionSystem';
import { MovementSystem }  from '../systems/MovementSystem';
import { GravitySystem }   from '../systems/GravitySystem';
import { CollisionSystem } from '../systems/CollisionSystem';
import { CombatSystem }    from '../systems/CombatSystem';
import { UpgradeSystem }   from '../systems/UpgradeSystem';

// ── AI import ────────────────────────────────────────────────
import { AIController }    from '../ai/AIController';

// ── Entity imports ────────────────────────────────────────────
import { Planet }          from '../entities/Planet';
import { ParticleRenderer } from '../entities/ParticleRenderer';
import { BlackHoleEntity } from '../entities/BlackHoleEntity';

// ── Vec2 for InputManager ────────────────────────────────────
import type { Vec2 } from '../types';

export class GameScene {
  private renderer: Renderer;
  private eventBus: EventBus;
  private gameLoop!: GameLoop;
  private state!: GameState;
  private hud!: HUD;
  private aiController!: AIController;
  private spatialHash!: SpatialHash;
  private inputManager!: InputManager;

  private systems = {
    orbit:      new OrbitSystem(),
    production: new ProductionSystem(),
    movement:   new MovementSystem(),
    gravity:    new GravitySystem(),
    collision:  new CollisionSystem(),
    combat:     new CombatSystem(),
    upgrade:    new UpgradeSystem(),
  };

  private entities: {
    planets:    Map<string, Planet>;
    particles:  ParticleRenderer;
    blackHoles: Map<string, BlackHoleEntity>;
  } = {
    planets:    new Map(),
    particles:  null as unknown as ParticleRenderer,
    blackHoles: new Map(),
  };

  private container!: HTMLElement;
  private hudContainer!: HTMLElement;
  private dragBox: HTMLElement | null = null;
  private resultOverlay: HTMLElement | null = null;
  private pauseMenu: PauseMenu | null = null;
  private cameraController: CameraController | null = null;

  // Pause / speed state
  private _paused   = false;
  private _timeScale: GameSpeed = 1;

  // ESC key handler — stored so it can be removed on destroy
  private _keyHandler: ((e: KeyboardEvent) => void) | null = null;

  // Drag-select bookkeeping
  private _dragStartX = 0;
  private _dragStartY = 0;

  onGameOver: (winner: Faction | null) => void = () => {};

  constructor(renderer: Renderer, eventBus: EventBus) {
    this.renderer = renderer;
    this.eventBus = eventBus;
  }

  // ── Public API ────────────────────────────────────────────

  async loadLevel(levelData: LevelData, uiContainer: HTMLElement): Promise<void> {
    this.container = uiContainer;
    this.state = this.initGameState(levelData);

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
    this.entities.particles = new ParticleRenderer(this.renderer.layers.particles);

    // HUD overlay
    this.hudContainer = document.createElement('div');
    this.hudContainer.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:15;';
    this.container.appendChild(this.hudContainer);
    this.hud = new HUD(this.hudContainer, () => this.togglePause());

    // Pause menu (hidden initially)
    this.pauseMenu = new PauseMenu(this.container, this._timeScale);
    this.pauseMenu.onResume      = () => this.togglePause();
    this.pauseMenu.onSpeedChange = (s) => { this._timeScale = s; };
    this.pauseMenu.onQuitToMenu  = () => {
      this._paused = false;
      this.onGameOver(null);
    };

    // Determine AI factions from level data
    const aiFactions = new Set<Faction>();
    levelData.planets.forEach(p => {
      if (p.faction !== 'player' && p.faction !== 'neutral') {
        aiFactions.add(p.faction);
      }
    });
    this.aiController = new AIController(Array.from(aiFactions));
    this.spatialHash  = new SpatialHash(64);

    // Input — attach to the container (canvas has pointer-events:none so events pass through to it)
    this.inputManager = new InputManager(this.container);
    this.bindInput();

    // Game loop
    this.gameLoop = new GameLoop(
      (dt) => this.update(dt),
      (alpha) => this.render(alpha)
    );

    // ESC key toggles pause
    this._keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') this.togglePause();
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
    this.eventBus.on('game:over', (payload: { winner: Faction }) => {
      this.showResultOverlay(payload.winner);
    });

    // Listen for planet captures for audio feedback
    this.eventBus.on('planet:captured', (payload: { planetId: string; newFaction: string }) => {
      audioManager.playCapture(payload.newFaction);
    });
  }

  start(): void {
    this.state.running = true;
    this.gameLoop.start();
    this.hud.show();
    // Init speed from settings and start audio
    this._timeScale = SettingsStore.get().gameSpeed as typeof this._timeScale;
    audioManager.ensureReady().then(() => audioManager.startAmbient());
  }

  stop(): void {
    this.state.running = false;
    this.gameLoop.stop();
  }

  destroy(): void {
    this.gameLoop?.stop();
    this.inputManager?.destroy();
    if (this._keyHandler) document.removeEventListener('keydown', this._keyHandler);
    this.hud?.destroy();
    this.hudContainer?.remove();
    this.dragBox?.remove();
    this.resultOverlay?.remove();
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

  // ── Game State Init ───────────────────────────────────────

  private initGameState(levelData: LevelData): GameState {
    const planets   = new Map<string, PlanetData>();
    const blackHoles = new Map<string, BlackHoleData>();

    levelData.planets.forEach((def: PlanetDef) => {
      const lvl = def.upgradeLevel as UpgradeLevel;
      const capacity = PLANET_CAPACITY[lvl];
      const data: PlanetData = {
        id: def.id,
        x: def.x,
        y: def.y,
        faction: def.faction,
        upgradeLevel: lvl,
        particles: Math.min(def.startingParticles, capacity),
        capacity,
        productionRate: PLANET_PRODUCTION[lvl],
        absorbedCount: 0,
        bonusHealth:    PLANET_BONUS_HEALTH[lvl],
        maxBonusHealth: PLANET_BONUS_HEALTH[lvl],
        isOrbiting: def.isOrbiting,
        orbitCenterX: def.orbitCenterX,
        orbitCenterY: def.orbitCenterY,
        orbitRadius: def.orbitRadius,
        orbitSpeed: def.orbitSpeed,
        orbitAngle: def.orbitStartAngle ?? 0,
      };
      planets.set(def.id, data);
    });

    levelData.blackHoles.forEach((def: BlackHoleDef) => {
      const data: BlackHoleData = {
        id: def.id,
        x: def.x,
        y: def.y,
        radius: def.radius,
        pullRadius: def.radius * 4,
        pullStrength: def.pullStrength,
      };
      blackHoles.set(def.id, data);
    });

    return {
      planets,
      particles: [],
      blackHoles,
      selectedPlanetIds:   new Set(),
      selectedParticleIds: new Set(),
      particleIdCounter:   0,
      tick:                0,
      running:             false,
      winner:              null,
    };
  }

  // ── Update (Fixed-tick) ───────────────────────────────────

  private update(dt: number): void {
    this.cameraController?.update(dt);
    if (!this.state.running || this.state.winner !== null) return;
    if (this._paused) return;  // freeze all simulation when paused
    this.state.tick++;
    const dt_ = dt * this._timeScale;  // apply speed multiplier
    dt = dt_;

    // Rebuild spatial hash
    this.spatialHash.clear();
    this.state.particles.forEach(p => {
      if (p.alive) this.spatialHash.insert(p);
    });

    // Systems in order
    this.systems.orbit.update(dt, this.state);
    this.systems.production.update(dt, this.state);
    this.systems.movement.update(dt, this.state, this.spatialHash);
    this.systems.gravity.update(dt, this.state);
    this.systems.collision.update(this.state, this.spatialHash);
    this.systems.combat.update(this.state, this.eventBus);
    this.systems.upgrade.update(this.state);

    // Prune dead particles
    this.state.particles = this.state.particles.filter(p => p.alive);

    // AI — callback matches DeployCallback = (fromIds, targetPlanetId) => void
    this.aiController.update(dt, this.state, (fromIds, targetPlanetId) => {
      this._deployParticles(fromIds, targetPlanetId, undefined, undefined);
    });

    // Win condition check
    this.checkWinCondition();

    // HUD update
    this.hud.update(this.state);
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
        }
      } else {
        this.state.selectedPlanetIds.clear();
        this.state.selectedParticleIds.clear();
      }
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

    // Select player particles in box (excluding orbiting)
    for (const p of this.state.particles) {
      if (!p.alive || p.faction !== 'player' || p.mode === 'orbiting') continue;
      if (
        p.x >= worldTL.x && p.x <= worldBR.x &&
        p.y >= worldTL.y && p.y <= worldBR.y
      ) {
        this.state.selectedParticleIds.add(p.id);
      }
    }
  }

  private handleRightClick(screenX: number, screenY: number): void {
    const hasSelection =
      this.state.selectedPlanetIds.size > 0 ||
      this.state.selectedParticleIds.size > 0;
    if (!hasSelection) return;

    const world       = this.renderer.screenToWorld(screenX, screenY);
    const hitPlanetId = this.getPlanetAtWorldPoint(world.x, world.y);

    // Deploy from selected planets
    if (this.state.selectedPlanetIds.size > 0) {
      if (hitPlanetId) {
        this.deployFromSelected(hitPlanetId, undefined, undefined);
      } else {
        this.deployFromSelected(undefined, world.x, world.y);
      }
    }

    // Redeploy selected particles
    if (this.state.selectedParticleIds.size > 0) {
      this._redeploySelectedParticles(
        hitPlanetId ?? undefined,
        hitPlanetId ? undefined : world.x,
        hitPlanetId ? undefined : world.y
      );
    }
  }

  /** Move selected particles to a new target. */
  private _redeploySelectedParticles(
    targetPlanetId?: string,
    targetX?: number,
    targetY?: number
  ): void {
    for (const p of this.state.particles) {
      if (!p.alive || !this.state.selectedParticleIds.has(p.id)) continue;
      p.mode          = 'traveling';
      p.targetPlanetId = targetPlanetId;
      p.targetX        = targetX;
      p.targetY        = targetY;
      p.orbitTimer     = 0;
      p.deployTimer    = 1.5;
      // Set initial velocity toward target
      const destX = targetPlanetId
        ? (this.state.planets.get(targetPlanetId)?.x ?? p.x)
        : (targetX ?? p.x);
      const destY = targetPlanetId
        ? (this.state.planets.get(targetPlanetId)?.y ?? p.y)
        : (targetY ?? p.y);
      const dx = destX - p.x;
      const dy = destY - p.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      p.vx = (dx / len) * PARTICLE_SPEED;
      p.vy = (dy / len) * PARTICLE_SPEED;
    }
    this.state.selectedParticleIds.clear();
  }

  private deployFromSelected(
    targetPlanetId?: string,
    targetX?: number,
    targetY?: number
  ): void {
    this._deployParticles(
      Array.from(this.state.selectedPlanetIds),
      targetPlanetId,
      targetX,
      targetY
    );
  }

  /** Core deploy — used by both player input and AI callback. */
  private _deployParticles(
    sourcePlanetIds: string[],
    targetPlanetId?: string,
    targetX?: number,
    targetY?: number
  ): void {
    let targetPlanet: PlanetData | undefined;
    if (targetPlanetId) targetPlanet = this.state.planets.get(targetPlanetId);

    sourcePlanetIds.forEach(srcId => {
      const src = this.state.planets.get(srcId);
      if (!src) return;
      const count = Math.floor(src.particles / 2);
      if (count === 0) return;
      src.particles -= count;
      audioManager.playLaunch();

      // Find orbiting particles belonging to this planet
      const orbiting = this.state.particles.filter(
        p => p.alive && p.mode === 'orbiting' && p.homePlanetId === srcId
      );

      const toDeploy = orbiting.slice(0, count);

      for (const p of toDeploy) {
        p.mode           = 'traveling';
        p.targetPlanetId = targetPlanetId;
        p.targetX        = targetX;
        p.targetY        = targetY;
        p.orbitTimer     = 0;
        p.deployTimer    = 1.5;

        const destX = targetPlanet ? targetPlanet.x : (targetX ?? p.x);
        const destY = targetPlanet ? targetPlanet.y : (targetY ?? p.y);
        const dx    = destX - p.x;
        const dy    = destY - p.y;
        const len   = Math.sqrt(dx * dx + dy * dy) || 1;

        p.vx = (dx / len) * PARTICLE_SPEED;
        p.vy = (dy / len) * PARTICLE_SPEED;
      }

      // Fallback: spawn new particles if we somehow didn't have enough orbiting ones
      const deficit = count - toDeploy.length;
      for (let i = 0; i < deficit; i++) {
        const angle  = Math.random() * Math.PI * 2;
        const r      = PLANET_RADIUS[src.upgradeLevel] + 2;
        const spawnX = src.x + Math.cos(angle) * r;
        const spawnY = src.y + Math.sin(angle) * r;

        const destX = targetPlanet ? targetPlanet.x : (targetX ?? src.x);
        const destY = targetPlanet ? targetPlanet.y : (targetY ?? src.y);
        const dx    = destX - spawnX;
        const dy    = destY - spawnY;
        const len   = Math.sqrt(dx * dx + dy * dy) || 1;

        const particle: ParticleData = {
          id:             this.state.particleIdCounter++,
          x:              spawnX,
          y:              spawnY,
          vx:             (dx / len) * PARTICLE_SPEED,
          vy:             (dy / len) * PARTICLE_SPEED,
          faction:        src.faction,
          mode:           'traveling',
          strength:       1,
          orbitTimer:     0,
          deployTimer:    1.5,
          damage:         0,
          homePlanetId:   src.id,
          targetPlanetId: targetPlanetId,
          targetX:        targetX,
          targetY:        targetY,
          alive:          true,
        };
        this.state.particles.push(particle);
      }
    });
  }

  // ── Hit Tests ─────────────────────────────────────────────

  private getPlanetAtPoint(screenX: number, screenY: number): string | null {
    const world = this.renderer.screenToWorld(screenX, screenY);
    return this.getPlanetAtWorldPoint(world.x, world.y);
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

  // ── Result Overlay ────────────────────────────────────────

  private showResultOverlay(winner: Faction | null): void {
    if (this.resultOverlay) return;
    this.stop();
    audioManager.stopAmbient();
    audioManager.playGameOver(winner === 'player');

    const overlay = document.createElement('div');
    overlay.className = 'game-result-overlay';

    const isVictory = winner === 'player';
    const colorHex  = winner ? FACTION_COLORS_HEX[winner] : '#78909c';

    const title = document.createElement('div');
    title.style.cssText = `
      font-family: 'Orbitron', sans-serif;
      font-size: clamp(2rem, 5vw, 3.2rem);
      font-weight: 900;
      color: ${colorHex};
      text-shadow: 0 0 30px ${colorHex}88;
      letter-spacing: 0.12em;
      margin-bottom: 12px;
    `;
    title.textContent = isVictory ? 'VICTORY' : winner ? 'DEFEATED' : 'DRAW';

    const sub = document.createElement('div');
    sub.style.cssText = `
      font-family: 'Rajdhani', sans-serif;
      font-size: 1.1rem;
      color: rgba(255,255,255,0.45);
      letter-spacing: 0.15em;
      margin-bottom: 36px;
    `;
    sub.textContent = isVictory
      ? 'The galaxy is yours.'
      : winner
      ? `${winner.replace('_', ' ').toUpperCase()} has conquered all.`
      : 'All forces have been annihilated.';

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex; gap:16px;';

    const retryBtn = document.createElement('button');
    retryBtn.textContent = '↺  RETRY';
    retryBtn.className = 'btn-primary';
    retryBtn.style.padding = '12px 28px';
    retryBtn.style.fontSize = '13px';
    retryBtn.addEventListener('click', () => {
      this.resultOverlay?.remove();
      this.resultOverlay = null;
      this.onGameOver(winner);
    });

    const menuBtn = document.createElement('button');
    menuBtn.textContent = '⌂  MENU';
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
      this.resultOverlay?.remove();
      this.resultOverlay = null;
      this.onGameOver(null);
    });

    btnRow.appendChild(retryBtn);
    btnRow.appendChild(menuBtn);
    overlay.appendChild(title);
    overlay.appendChild(sub);
    overlay.appendChild(btnRow);
    this.container.appendChild(overlay);
    this.resultOverlay = overlay;
  }
}
