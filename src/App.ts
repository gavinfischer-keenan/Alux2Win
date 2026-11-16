// ============================================================
// App.ts — Top-level application state machine for LUX
// Manages scene transitions: Menu → Game → Editor → Menu
// ============================================================

import type { LevelData, SceneName, Faction } from './types';

import { Renderer }        from './core/Renderer';
import { EventBus }        from './core/EventBus';
import { audioManager }    from './core/AudioManager';
import { SettingsStore }   from './core/SettingsStore';
import { LevelStore }      from './core/LevelStore';
import { MainMenuScene, type PlayableLevelEntry } from './scenes/MainMenuScene';
import { GameScene }       from './scenes/GameScene';
import { EditorScene }     from './scenes/EditorScene';
import { CommandPalette, type CommandItem } from './ui/CommandPalette';
import { ShortcutsModal }  from './ui/ShortcutsModal';
import { isTypingInInput } from './ui/KeyboardShortcuts';
import { generateRandomLevel } from './utils/RandomLevelGenerator';

export class App {
  private renderer!: Renderer;
  private eventBus!: EventBus;

  private currentScene: SceneName = 'menu';
  private menuScene:   MainMenuScene | null = null;
  private gameScene:   GameScene | null = null;
  private editorScene: EditorScene | null = null;

  private commandPalette!: CommandPalette;
  private shortcutsModal!: ShortcutsModal;
  private cachedPlayableLevels: PlayableLevelEntry[] = [];

  private container: HTMLElement;

  /** Active level — kept so test-level retry works after editor changes. */
  private activeLevel: LevelData | null = null;
  private activeIsTutorial = false;
  private activeTutorialId = 'basics';
  private returnToEditorLevel: LevelData | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  // ── Initialisation ────────────────────────────────────────

  async init(): Promise<void> {
    // Create Renderer and boot PixiJS
    this.renderer = new Renderer();
    await this.renderer.init(this.container);

    // Event bus (note: payloads are objects, e.g. { scene: 'menu' })
    this.eventBus = new EventBus();

    // Allow any scene to force a scene switch via bus
    this.eventBus.on('scene:change', (payload: { scene: SceneName }) => {
      this.onSceneChange(payload.scene);
    });

    // NOTE: 'game:over' is intentionally NOT handled here.
    // GameScene catches it internally and calls this.onGameOver() which
    // routes back to showMenu(). Handling it here too caused the menu
    // to appear on top of a still-running game.

    // Level editor test-level via bus
    this.eventBus.on('level:load', (payload: { levelData: LevelData }) => {
      this.startGame(payload.levelData);
    });

    // Sync persisted audio volume
    audioManager.setVolume(SettingsStore.get().masterVolume);

    // Initialize global Command Palette (Cmd/Ctrl+K) and Shortcuts ('?') modal
    this.commandPalette = new CommandPalette(() => this.buildCommandItems());
    this.shortcutsModal = new ShortcutsModal(() => this.commandPalette.open());
    window.addEventListener('keydown', this.handleGlobalKeyDown, true);

    this.showMenu();
  }

  private readonly handleGlobalKeyDown = (e: KeyboardEvent): void => {
    // Cmd/Ctrl+K toggles Command Palette from anywhere
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      e.stopPropagation();
      this.shortcutsModal.close();
      this.commandPalette.toggle();
      return;
    }

    if (e.key === 'Escape') {
      if (this.commandPalette.openState) {
        e.preventDefault();
        e.stopPropagation();
        this.commandPalette.close();
        return;
      }
      if (this.shortcutsModal.openState) {
        e.preventDefault();
        e.stopPropagation();
        this.shortcutsModal.close();
        return;
      }
    }

    // Never fire shortcuts while typing in inputs, selects, or textareas
    if (isTypingInInput(e)) return;

    if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
      e.preventDefault();
      e.stopPropagation();
      this.commandPalette.close();
      this.shortcutsModal.toggle();
      return;
    }

    if (this.commandPalette.openState || this.shortcutsModal.openState) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    const lower = e.key.toLowerCase();
    if (lower === 'm') {
      e.preventDefault();
      this.toggleMuteAudio();
      return;
    }
    if (lower === 'e') {
      if (this.currentScene === 'menu') {
        e.preventDefault();
        this.openEditor();
      } else if (this.currentScene === 'editor' && this.editorScene) {
        e.preventDefault();
        this.editorScene.triggerTestLevel();
      }
    }
  };

  private toggleMuteAudio(): void {
    const muted = audioManager.toggleMute();
    if (!muted) {
      SettingsStore.update({ masterVolume: audioManager.getVolume() });
    }
  }

  private buildCommandItems(): CommandItem[] {
    const items: CommandItem[] = [];

    // ── Pages & Navigation ───────────────────────────────────
    items.push(
      {
        id: 'page:menu',
        title: 'Main Menu',
        subtitle: 'Return to galaxy selection',
        category: 'Page',
        keywords: ['home', 'galaxies', 'menu'],
        run: () => this.onSceneChange('menu'),
      },
      {
        id: 'page:editor',
        title: 'Level Editor',
        subtitle: 'Create, edit, and export custom star systems',
        category: 'Page',
        shortcut: 'E',
        keywords: ['build', 'map', 'create', 'custom'],
        run: () => this.openEditor(),
      },
      {
        id: 'page:settings',
        title: 'Settings',
        subtitle: 'Game speed, master volume, AI challenge difficulty',
        category: 'Page',
        keywords: ['options', 'audio', 'volume', 'difficulty'],
        run: () => {
          if (this.currentScene !== 'menu') {
            this.destroyGame();
            this.destroyEditor();
            this.showMenu();
          }
          this.menuScene?.openSettingsPanel();
        },
      },
      {
        id: 'page:shortcuts',
        title: 'Keyboard Shortcuts',
        subtitle: 'View all keyboard shortcuts and controls',
        category: 'Page',
        shortcut: '?',
        keywords: ['help', 'keys', 'hotkeys', 'controls'],
        run: () => this.shortcutsModal.open(),
      },
      {
        id: 'page:galaxy-tutorial',
        title: 'Galaxy: Tutorial',
        subtitle: 'Commander Training & cosmic hazard tutorials',
        category: 'Page',
        keywords: ['learn', 'guide', 'basics'],
        run: () => {
          if (this.currentScene !== 'menu') {
            this.destroyGame();
            this.destroyEditor();
            this.showMenu();
          }
          this.menuScene?.openGalaxyByName('Tutorial');
        },
      },
      {
        id: 'page:galaxy-single-hazard',
        title: 'Galaxy: Single Hazard Universes',
        subtitle: 'Asteroids, Gamma Rays, Portals, Black Holes, White Holes, Shields, Fog',
        category: 'Page',
        keywords: ['hazards', 'anomalies'],
        run: () => {
          if (this.currentScene !== 'menu') {
            this.destroyGame();
            this.destroyEditor();
            this.showMenu();
          }
          this.menuScene?.openGalaxyByName('Single Hazard Universes');
        },
      },
      {
        id: 'page:galaxy-multi',
        title: 'Galaxy: Real Life...Many Hazards',
        subtitle: 'Skirmishes and multi-hazard challenges',
        category: 'Page',
        keywords: ['skirmish', 'missions', 'many'],
        run: () => {
          if (this.currentScene !== 'menu') {
            this.destroyGame();
            this.destroyEditor();
            this.showMenu();
          }
          this.menuScene?.openGalaxyByName('Real Life...Many Hazards');
        },
      },
      {
        id: 'action:play-random',
        title: 'Play Random Generated System',
        subtitle: 'Generate a fresh procedural galaxy and launch',
        category: 'Action',
        keywords: ['procedural', 'new game', 'random'],
        run: () => this.startGame(generateRandomLevel(), false),
      },
    );

    // ── Context-Sensitive In-Game Actions ────────────────────
    if (this.currentScene === 'game' && this.gameScene) {
      const gs = this.gameScene;
      items.push(
        {
          id: 'game:pause',
          title: gs.isPaused() ? 'Resume Game' : 'Pause Game',
          subtitle: 'Toggle gameplay simulation pause',
          category: 'Action',
          shortcut: 'Space',
          run: () => gs.togglePause(),
        },
        {
          id: 'game:restart',
          title: 'Restart Current Level',
          subtitle: 'Start this star system over from the beginning',
          category: 'Action',
          keywords: ['retry', 'reset'],
          run: () => {
            if (this.activeLevel) {
              this.startGame(this.activeLevel, this.activeIsTutorial, this.activeTutorialId);
            }
          },
        },
        {
          id: 'game:select-all',
          title: 'Select All Player Units',
          subtitle: 'Select all owned planets and stationed fleets',
          category: 'Action',
          shortcut: 'A',
          run: () => gs.selectAllPlayerUnits(),
        },
        {
          id: 'game:clear-selection',
          title: 'Clear Selection',
          subtitle: 'Deselect all planets and units',
          category: 'Action',
          shortcut: 'D',
          run: () => gs.clearSelection(),
        },
        {
          id: 'game:repeat-order',
          title: 'Repeat Last Order',
          subtitle: 'Re-issue previous fleet deployment',
          category: 'Action',
          shortcut: 'R',
          run: () => gs.repeatLastAction(),
        },
        {
          id: 'game:reset-camera',
          title: 'Reset Camera View',
          subtitle: 'Center and fit the entire star system',
          category: 'Action',
          shortcut: 'C',
          run: () => gs.resetCamera(),
        },
        {
          id: 'game:speed-0.5',
          title: 'Set Game Speed: ½×',
          category: 'Action',
          shortcut: '1',
          run: () => gs.setGameSpeed(0.5),
        },
        {
          id: 'game:speed-1',
          title: 'Set Game Speed: 1×',
          category: 'Action',
          shortcut: '2',
          run: () => gs.setGameSpeed(1),
        },
        {
          id: 'game:speed-2',
          title: 'Set Game Speed: 2×',
          category: 'Action',
          shortcut: '3',
          run: () => gs.setGameSpeed(2),
        },
        {
          id: 'game:speed-3',
          title: 'Set Game Speed: 3×',
          category: 'Action',
          shortcut: '4',
          run: () => gs.setGameSpeed(3),
        },
      );
    }

    // ── Context-Sensitive Editor Actions ─────────────────────
    if (this.currentScene === 'editor' && this.editorScene) {
      const es = this.editorScene;
      items.push(
        { id: 'editor:tool-select', title: 'Editor Tool: Select / Move', category: 'Action', shortcut: 'S', run: () => es.setTool('select') },
        { id: 'editor:tool-planet', title: 'Editor Tool: Place Planet', category: 'Action', shortcut: 'P', run: () => es.setTool('place_planet') },
        { id: 'editor:tool-bh', title: 'Editor Tool: Place Black Hole', category: 'Action', shortcut: 'B', run: () => es.setTool('place_blackhole') },
        { id: 'editor:tool-speed', title: 'Editor Tool: Place Speed Zone', category: 'Action', shortcut: 'Z', run: () => es.setTool('place_speedzone') },
        { id: 'editor:tool-portal', title: 'Editor Tool: Place Portal', category: 'Action', shortcut: 'O', run: () => es.setTool('place_portal') },
        { id: 'editor:tool-tbh', title: 'Editor Tool: Place Trapping BH', category: 'Action', shortcut: 'T', run: () => es.setTool('place_trappingbh') },
        { id: 'editor:tool-wh', title: 'Editor Tool: Place White Hole', category: 'Action', shortcut: 'H', run: () => es.setTool('place_whitehole') },
        { id: 'editor:tool-delete', title: 'Editor Tool: Delete Entity', category: 'Action', shortcut: 'X', run: () => es.setTool('delete') },
        { id: 'editor:save', title: 'Editor: Save / Export Level', category: 'Action', run: () => es.saveLevelModal() },
        { id: 'editor:load', title: 'Editor: Load Custom Level', category: 'Action', run: () => es.loadLevelModal() },
        { id: 'editor:test', title: 'Editor: Test Current Level', category: 'Action', shortcut: 'E', run: () => es.triggerTestLevel() },
      );
    }

    // ── Global Audio & Difficulty Actions ────────────────────
    items.push(
      {
        id: 'audio:toggle-mute',
        title: audioManager.isMuted() ? 'Audio: Unmute Sound' : 'Audio: Mute Sound',
        subtitle: 'Toggle master audio output',
        category: 'Action',
        shortcut: 'M',
        keywords: ['sound', 'volume', 'mute', 'unmute'],
        run: () => this.toggleMuteAudio(),
      },
      {
        id: 'diff:easy',
        title: 'AI Difficulty: Easy',
        subtitle: 'Passive Turtle AI',
        category: 'Action',
        run: () => SettingsStore.update({ difficulty: 'easy' }),
      },
      {
        id: 'diff:normal',
        title: 'AI Difficulty: Normal',
        subtitle: 'Balanced adaptive roles',
        category: 'Action',
        run: () => SettingsStore.update({ difficulty: 'normal' }),
      },
      {
        id: 'diff:hard',
        title: 'AI Difficulty: Hard',
        subtitle: 'Aggressive tactical AI',
        category: 'Action',
        run: () => SettingsStore.update({ difficulty: 'hard' }),
      },
    );

    // ── Playable Levels (Built-in & Custom) ──────────────────
    const levelPool = this.menuScene ? this.menuScene.getAllPlayableLevels() : this.cachedPlayableLevels;
    const seenIds = new Set<string>();
    for (const lvl of levelPool) {
      seenIds.add(lvl.id);
      items.push({
        id: `level:${lvl.id}`,
        title: `Play: ${lvl.name}`,
        subtitle: lvl.category,
        category: 'Level',
        keywords: [lvl.category, lvl.name, 'play', 'mission'],
        run: () => this.startGame(lvl.levelData, lvl.isTutorial, lvl.tutorialId ?? 'basics'),
      });
    }

    for (const custom of LevelStore.loadLevels()) {
      const cid = `custom:${custom.id ?? custom.name}`;
      if (seenIds.has(cid)) continue;
      items.push({
        id: `level:${cid}`,
        title: `Play Custom: ${custom.name}`,
        subtitle: custom.category || 'Custom',
        category: 'Level',
        keywords: ['custom', custom.name],
        run: () => this.startGame(custom, false),
      });
    }

    return items;
  }

  // ── Scene: Main Menu ──────────────────────────────────────

  private showMenu(): void {
    this.destroyMenu();
    this.currentScene = 'menu';
    this.menuScene    = new MainMenuScene(this.container);

    this.menuScene.onPlay = (levelData: LevelData, isTutorial = false, tutorialId = 'basics') => {
      this.startGame(levelData, isTutorial, tutorialId);
    };
    this.menuScene.onOpenEditor = (level?: LevelData) => {
      this.openEditor(level);
    };
    this.menuScene.onOpenCommandPalette = () => {
      this.commandPalette.open();
    };
    this.menuScene.onOpenShortcuts = () => {
      this.shortcutsModal.open();
    };

    this.cachedPlayableLevels = this.menuScene.getAllPlayableLevels();
    this.menuScene.show();
  }

  private destroyMenu(): void {
    this.menuScene?.destroy();
    this.menuScene = null;
  }

  // ── Scene: Game ───────────────────────────────────────────

  private startGame(levelData: LevelData, isTutorial = false, tutorialId = 'basics'): void {
    this.activeLevel = levelData;
    this.activeIsTutorial = isTutorial;
    this.activeTutorialId = tutorialId;
    this.destroyMenu();
    this.destroyEditor();

    this.currentScene = 'game';
    this.gameScene    = new GameScene(this.renderer, this.eventBus, !!this.returnToEditorLevel);
    this.gameScene.onOpenShortcuts = () => {
      this.shortcutsModal.open();
    };

    this.gameScene.onGameOver = (_winner: Faction | null) => {
      this.destroyGame();
      if (this.returnToEditorLevel) {
        const ld = this.returnToEditorLevel;
        this.returnToEditorLevel = null;
        this.openEditor(ld);
      } else {
        this.showMenu();
      }
    };

    this.gameScene.loadLevel(levelData, this.container, isTutorial, tutorialId)
      .then(() => {
        this.gameScene!.start();
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[App] loadLevel failed:', msg, err);
        alert(`Failed to start game:\n${msg}`);
        this.destroyGame();
        this.showMenu();
      });
  }

  private destroyGame(): void {
    this.gameScene?.destroy();
    this.gameScene = null;
  }

  // ── Scene: Editor ─────────────────────────────────────────

  private openEditor(initialData?: LevelData): void {
    this.destroyMenu();
    this.destroyGame();

    this.currentScene = 'editor';
    this.editorScene  = new EditorScene(this.renderer, this.eventBus);

    this.editorScene.onBack = () => {
      this.destroyEditor();
      this.showMenu();
    };
    this.editorScene.onTestLevel = (levelData: LevelData) => {
      this.returnToEditorLevel = levelData;
      this.destroyEditor();
      this.startGame(levelData);
    };

    this.editorScene.show(this.container);
    if (initialData) {
      this.editorScene.loadLevelData(initialData);
    }
  }

  private destroyEditor(): void {
    this.editorScene?.destroy();
    this.editorScene = null;
  }

  // ── Cross-scene Event Handler ─────────────────────────────

  private onSceneChange(scene: SceneName): void {
    switch (scene) {
      case 'menu':
        this.destroyGame();
        this.destroyEditor();
        if (this.returnToEditorLevel) {
          const ld = this.returnToEditorLevel;
          this.returnToEditorLevel = null;
          this.openEditor(ld);
        } else {
          this.showMenu();
        }
        break;
      case 'game':
        if (this.activeLevel) this.startGame(this.activeLevel, this.activeIsTutorial, this.activeTutorialId);
        break;
      case 'editor':
        this.destroyGame();
        this.destroyMenu();
        this.openEditor();
        break;
    }
  }
}
