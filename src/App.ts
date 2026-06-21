// ============================================================
// App.ts — Top-level application state machine for LUX
// Manages scene transitions: Menu → Game → Editor → Menu
// ============================================================

import type { LevelData, SceneName, Faction } from './types';

import { Renderer }        from './core/Renderer';
import { EventBus }        from './core/EventBus';
import { MainMenuScene }   from './scenes/MainMenuScene';
import { GameScene }       from './scenes/GameScene';
import { EditorScene }     from './scenes/EditorScene';

export class App {
  private renderer!: Renderer;
  private eventBus!: EventBus;

  private currentScene: SceneName = 'menu';
  private menuScene:   MainMenuScene | null = null;
  private gameScene:   GameScene | null = null;
  private editorScene: EditorScene | null = null;

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

    this.showMenu();
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
