// ============================================================
// MainMenuScene.ts — Main menu HTML overlay scene for Alux2Win
// Renders on top of the live PixiJS star-background canvas.
// ============================================================

import type { LevelData } from '../types';
import tutorialMovementData from '../levels/tutorial_movement.json';
import skirmishData from '../levels/skirmish.json';
import skirmishData2 from '../levels/skirmish_2.json';
import plasmaStorm1Data from '../levels/plasma_storm_1.json';
import asteroids1Data from '../levels/asteroids_1.json';
import gammaRays1Data from '../levels/gamma_rays_1.json';
import speedTraps1Data from '../levels/speed_traps_1.json';
import portals1Data from '../levels/portals_1.json';
import blackholes1Data from '../levels/blackholes_1.json';
import whiteholes1Data from '../levels/whiteholes_1.json';
import { SettingsStore } from '../core/SettingsStore';
import type { GameSettings } from '../core/SettingsStore';
import { audioManager } from '../core/AudioManager';
import type { GameSpeed } from '../ui/PauseMenu';
import { LevelStore } from '../core/LevelStore';
import { HighScoreStore } from '../core/HighScoreStore';
import { generateRandomLevel } from '../utils/RandomLevelGenerator';

export class MainMenuScene {
  private element: HTMLElement;
  private settingsPanel: HTMLElement | null = null;
  private systemsPanel: HTMLElement | null = null;
  private _mainCard: HTMLElement | null = null;

  onPlay: (levelData: LevelData, isTutorial?: boolean) => void = () => {};
  onOpenEditor: () => void = () => {};

  constructor(container: HTMLElement) {
    this.element = this.createMenu();
    container.appendChild(this.element);
  }

  // ── Public API ────────────────────────────────────────────

  show(): void {
    this.element.style.display = 'flex';
    // Stagger-animate children
    const children = this.element.querySelectorAll<HTMLElement>('.menu-anim-child');
    children.forEach((child, i) => {
      child.style.opacity = '0';
      child.style.transform = 'translateY(16px)';
      setTimeout(() => {
        child.style.transition = 'opacity 0.45s ease, transform 0.45s ease';
        child.style.opacity = '1';
        child.style.transform = 'translateY(0)';
      }, 80 + i * 80);
    });
  }

  hide(): void {
    this.element.style.display = 'none';
  }

  destroy(): void {
    this.element.remove();
  }

  // ── Private ───────────────────────────────────────────────

  private createMenu(): HTMLElement {
    const overlay = document.createElement('div');
    overlay.id = 'main-menu';
    overlay.style.cssText = `
      position: absolute;
      top: 0; left: 0;
      width: 100%; height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      z-index: 20;
      pointer-events: auto;
      user-select: none;
      overflow: hidden;
      padding: 20px;
    `;

    // ── Inner card (Container) ──────────────────────────────
    const card = document.createElement('div');
    card.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 20px;
      padding: 40px;
      background: rgba(0, 0, 10, 0.65);
      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
      border: 1px solid rgba(79, 195, 247, 0.15);
      border-radius: 24px;
      box-shadow: 0 0 60px rgba(79, 195, 247, 0.08), 0 8px 40px rgba(0,0,0,0.6);
      width: 100%;
      max-width: 1200px;
      transition: opacity 0.3s ease, transform 0.3s ease;
    `;
    this._mainCard = card;
    overlay.appendChild(card);

    // ── Header (Title & Aux Buttons) ────────────────────────
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      margin-bottom: 10px;
      flex-wrap: wrap;
      gap: 20px;
    `;
    
    const titleWrapper = document.createElement('div');
    titleWrapper.className = 'menu-anim-child';

    const title = document.createElement('h1');
    title.textContent = 'LUX';
    title.style.cssText = `
      font-family: 'Orbitron', sans-serif;
      font-size: clamp(3rem, 6vw, 4.5rem);
      font-weight: 900;
      color: #4fc3f7;
      letter-spacing: 0.15em;
      line-height: 1;
      animation: title-glow 3s ease-in-out infinite;
      margin: 0;
    `;

    const subtitle = document.createElement('div');
    subtitle.textContent = 'Choose your Galaxy';
    subtitle.style.cssText = `
      font-family: 'Rajdhani', sans-serif;
      font-size: 1.1rem;
      color: rgba(79, 195, 247, 0.55);
      letter-spacing: 0.25em;
      text-transform: uppercase;
      margin-top: 6px;
    `;

    titleWrapper.appendChild(title);
    titleWrapper.appendChild(subtitle);
    header.appendChild(titleWrapper);

    // ── Aux Buttons (Settings, Editor, Import) ──────────────
    const auxContainer = document.createElement('div');
    auxContainer.className = 'menu-anim-child';
    auxContainer.style.cssText = `
      display: flex;
      gap: 12px;
      align-items: center;
    `;

    // Import file input
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json';
    fileInput.style.display = 'none';
    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target!.result as string) as LevelData;
          this.onPlay(data);
        } catch (err) {
          console.error('Failed to parse level JSON:', err);
          alert('Invalid level JSON file.');
        }
      };
      reader.readAsText(file);
      fileInput.value = '';
    });
    auxContainer.appendChild(fileInput);

    const importBtn = this.createAuxButton('📂 IMPORT', '#b0bec5', () => fileInput.click());
    const editorBtn = this.createAuxButton('🛠 EDITOR', '#f59e0b', () => this.onOpenEditor());
    const settingsBtn = this.createAuxButton('⚙ SETTINGS', '#9575cd', () => this.openSettings());

    auxContainer.appendChild(importBtn);
    auxContainer.appendChild(editorBtn);
    auxContainer.appendChild(settingsBtn);

    header.appendChild(auxContainer);
    card.appendChild(header);

    // ── Grid Galaxy View ───────────────────────
    const scrollContainer = document.createElement('div');
    scrollContainer.style.cssText = `
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 20px;
      overflow-y: auto;
      padding: 10px 10px 20px 10px;
      max-height: 65vh;
      width: 100%;
    `;

    const customLevels = LevelStore.loadLevels();
    const customGroups: Record<string, LevelData[]> = {};
    customLevels.forEach(level => {
      const cat = level.category || 'Custom';
      if (!customGroups[cat]) customGroups[cat] = [];
      customGroups[cat].push(level);
    });

    const galaxies = [
      { name: 'Tutorial',      image: '/assets/galaxies/tutorial.png',  locked: false, levels: [tutorialMovementData as LevelData], isTutorial: true },
      { name: 'Normal',        image: '/assets/galaxies/normal.png',    locked: false, levels: [skirmishData as LevelData, skirmishData2 as LevelData, ...(customGroups['Normal'] || [])], isTutorial: false },
      { name: 'Plasma Storms', image: '/assets/galaxies/plasma.png',    locked: false, levels: [plasmaStorm1Data as LevelData, ...(customGroups['Plasma Storms'] || [])],  isTutorial: false },
      { name: 'Asteroids',     image: '/assets/galaxies/asteroid.png',  locked: false, levels: [asteroids1Data as LevelData, ...(customGroups['Asteroids'] || [])],    isTutorial: false },
      { name: 'Gamma Rays',    image: '/assets/galaxies/nebula.png',    locked: false, levels: [gammaRays1Data as LevelData, ...(customGroups['Gamma Rays'] || [])],    isTutorial: false },
      { name: 'Speed Traps',   image: '/assets/galaxies/ice.png',       locked: false, levels: [speedTraps1Data as LevelData, ...(customGroups['Speed Traps'] || [])],   isTutorial: false },
      { name: 'Portals',       image: '/assets/galaxies/lava.png',      locked: false, levels: [portals1Data as LevelData, ...(customGroups['Portals'] || [])],      isTutorial: false },
      { name: 'Black Holes',   image: '/assets/galaxies/void.png',      locked: false, levels: [blackholes1Data as LevelData, ...(customGroups['Black Holes'] || [])],   isTutorial: false },
      { name: 'White Holes',   image: '/assets/galaxies/quantum.png',   locked: false, levels: [whiteholes1Data as LevelData, ...(customGroups['White Holes'] || [])],   isTutorial: false },
      { name: 'Custom',        image: '/assets/galaxies/normal.png',    locked: false, levels: customGroups['Custom'] || [], isTutorial: false },
      { name: 'Random',        image: '/assets/galaxies/quantum.png',   locked: false, levels: [], isTutorial: false },
    ];

    galaxies.forEach((g, idx) => {
      const tile = document.createElement('div');
      tile.className = 'menu-anim-child';
      
      tile.style.cssText = `
        height: 280px;
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 16px;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        cursor: ${g.locked ? 'not-allowed' : 'pointer'};
        transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
        position: relative;
        opacity: ${g.locked ? '0.6' : '1'};
      `;

      if (!g.locked) {
        tile.addEventListener('mouseenter', () => {
          tile.style.transform = 'translateY(-6px)';
          tile.style.boxShadow = '0 12px 24px rgba(79, 195, 247, 0.2)';
          tile.style.borderColor = 'rgba(79, 195, 247, 0.5)';
        });
        tile.addEventListener('mouseleave', () => {
          tile.style.transform = 'translateY(0)';
          tile.style.boxShadow = 'none';
          tile.style.borderColor = 'rgba(255, 255, 255, 0.1)';
        });
        tile.addEventListener('click', () => {
          audioManager.playClick();
          if (g.name === 'Random') {
            const randomLevel = generateRandomLevel();
            this.onPlay(randomLevel, false);
          } else {
            this.openSystemsPanel(g);
          }
        });
      }

      // Thumbnail Image
      const img = document.createElement('img');
      img.src = g.image;
      img.style.cssText = `
        width: 100%;
        height: 280px;
        object-fit: cover;
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        filter: ${g.locked ? 'grayscale(80%)' : 'none'};
      `;
      tile.appendChild(img);

      // Bottom Label
      const labelContainer = document.createElement('div');
      labelContainer.style.cssText = `
        flex: 1;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        background: linear-gradient(0deg, rgba(0,0,0,0.4), transparent);
      `;
      
      const titleLabel = document.createElement('div');
      titleLabel.textContent = g.name;
      titleLabel.style.cssText = `
        font-family: 'Orbitron', sans-serif;
        font-size: 1.2rem;
        font-weight: 700;
        color: ${g.locked ? 'rgba(255,255,255,0.5)' : '#4fc3f7'};
        letter-spacing: 0.1em;
      `;
      labelContainer.appendChild(titleLabel);

      if (g.locked) {
        const soonLabel = document.createElement('div');
        soonLabel.textContent = 'Coming Soon';
        soonLabel.style.cssText = `
          font-family: 'Rajdhani', sans-serif;
          font-size: 0.85rem;
          color: rgba(255,200,100,0.8);
          letter-spacing: 0.15em;
          margin-top: 4px;
        `;
        labelContainer.appendChild(soonLabel);
      }

      tile.appendChild(labelContainer);
      scrollContainer.appendChild(tile);
    });

    card.appendChild(scrollContainer);

    // ── Version text ───────────────────────────────────────
    const version = document.createElement('div');
    version.className = 'menu-anim-child';
    version.textContent = 'v0.2.0';
    version.style.cssText = `
      font-family: 'Rajdhani', sans-serif;
      font-size: 12px;
      color: rgba(255,255,255,0.2);
      letter-spacing: 0.1em;
      margin-top: 10px;
      text-align: right;
      width: 100%;
    `;
    card.appendChild(version);

    return overlay;
  }

  // ── Settings panel ────────────────────────────────────────

  private openSettings(): void {
    if (!this.settingsPanel) {
      this.settingsPanel = this.createSettingsPanel();
      this.element.appendChild(this.settingsPanel);
    }

    const card = this._mainCard!;
    const panel = this.settingsPanel;

    // Slide card left + fade out
    card.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    card.style.opacity = '0';
    card.style.transform = 'translateX(-40px)';
    card.style.pointerEvents = 'none';

    // Show panel, slide in from right
    panel.style.display = 'flex';
    panel.style.opacity = '0';
    panel.style.transform = 'translateX(40px)';
    panel.style.pointerEvents = 'auto';
    // Trigger transition on next frame
    requestAnimationFrame(() => {
      panel.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
      panel.style.opacity = '1';
      panel.style.transform = 'translateX(0)';
    });
  }

  private closeSettings(): void {
    const card = this._mainCard!;
    const panel = this.settingsPanel;
    if (!panel) return;

    // Slide panel out right
    panel.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    panel.style.opacity = '0';
    panel.style.transform = 'translateX(40px)';
    panel.style.pointerEvents = 'none';

    // Slide card back in
    card.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    card.style.opacity = '1';
    card.style.transform = 'translateX(0)';
    card.style.pointerEvents = 'auto';

    setTimeout(() => {
      if (panel) panel.style.display = 'none';
    }, 310);
  }

  private createSettingsPanel(): HTMLElement {
    const panel = document.createElement('div');
    panel.style.cssText = `
      position: absolute;
      display: none;
      flex-direction: column;
      align-items: center;
      gap: 14px;
      padding: 36px 48px 28px;
      background: rgba(0, 0, 10, 0.82);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid rgba(149, 117, 205, 0.22);
      border-radius: 20px;
      box-shadow: 0 0 60px rgba(149, 117, 205, 0.07), 0 8px 48px rgba(0,0,0,0.7);
      min-width: 320px;
      max-height: 90vh;
      overflow-y: auto;
      pointer-events: none;
      opacity: 0;
      transform: translateX(40px);
    `;

    const settings = SettingsStore.get();

    // ── Header row ─────────────────────────────────────────
    const header = document.createElement('div');
    header.style.cssText = 'display:flex; align-items:center; width:100%; gap:12px; margin-bottom:4px;';

    const backBtn = document.createElement('button');
    backBtn.textContent = '← BACK';
    backBtn.style.cssText = `
      background: transparent;
      border: 1px solid rgba(149,117,205,0.35);
      border-radius: 6px;
      color: rgba(149,117,205,0.8);
      font-family: 'Orbitron', sans-serif;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
      cursor: pointer;
      padding: 6px 10px;
      transition: border-color 0.15s, color 0.15s;
      flex-shrink: 0;
    `;
    backBtn.addEventListener('mouseenter', () => {
      backBtn.style.borderColor = 'rgba(149,117,205,0.7)';
      backBtn.style.color = '#b39ddb';
    });
    backBtn.addEventListener('mouseleave', () => {
      backBtn.style.borderColor = 'rgba(149,117,205,0.35)';
      backBtn.style.color = 'rgba(149,117,205,0.8)';
    });
    backBtn.addEventListener('click', () => {
      audioManager.playClick();
      this.closeSettings();
    });

    const panelTitle = document.createElement('div');
    panelTitle.textContent = 'SETTINGS';
    panelTitle.style.cssText = `
      font-family: 'Orbitron', sans-serif;
      font-size: 1.1rem;
      font-weight: 900;
      color: #b39ddb;
      letter-spacing: 0.2em;
      text-shadow: 0 0 16px rgba(149,117,205,0.4);
      flex: 1;
      text-align: center;
    `;

    header.appendChild(backBtn);
    header.appendChild(panelTitle);
    panel.appendChild(header);

    // ── Separator ──────────────────────────────────────────
    const sep = document.createElement('div');
    sep.style.cssText = `
      width: 90%; height: 1px;
      background: linear-gradient(90deg, transparent, rgba(149,117,205,0.35), transparent);
      margin-bottom: 4px;
    `;
    panel.appendChild(sep);

    // ── Game Speed ─────────────────────────────────────────
    panel.appendChild(this._makeSectionLabel('GAME SPEED'));

    const speedRow = document.createElement('div');
    speedRow.style.cssText = 'display:flex; gap:8px; width:100%;';

    const speeds: Array<{ label: string; value: GameSpeed }> = [
      { label: '½×', value: 0.5 },
      { label: '1×', value: 1 },
      { label: '2×', value: 2 },
      { label: '3×', value: 3 },
    ];

    let currentSpeed = settings.gameSpeed;
    const speedBtns = new Map<number, HTMLButtonElement>();

    const applySpeedStyles = (val: number) => {
      speedBtns.forEach((b, v) => {
        const active = v === val;
        b.style.background   = active ? 'rgba(149,117,205,0.25)' : 'rgba(255,255,255,0.06)';
        b.style.borderColor  = active ? 'rgba(149,117,205,0.75)' : 'rgba(255,255,255,0.12)';
        b.style.color        = active ? '#b39ddb'                : 'rgba(255,255,255,0.55)';
        b.style.boxShadow    = active ? '0 0 12px rgba(149,117,205,0.3)' : 'none';
      });
    };

    for (const { label, value } of speeds) {
      const btn = document.createElement('button');
      btn.textContent = label;
      btn.style.cssText = `
        flex: 1;
        padding: 8px 4px;
        background: rgba(255,255,255,0.06);
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 6px;
        color: rgba(255,255,255,0.55);
        font-family: 'Orbitron', sans-serif;
        font-size: 0.75rem;
        font-weight: 700;
        cursor: pointer;
        transition: background 0.15s, border-color 0.15s, color 0.15s, box-shadow 0.15s;
        letter-spacing: 0.04em;
      `;
      btn.addEventListener('click', () => {
        audioManager.playClick();
        currentSpeed = value;
        SettingsStore.update({ gameSpeed: value as GameSettings['gameSpeed'] });
        applySpeedStyles(value);
      });
      speedBtns.set(value, btn);
      speedRow.appendChild(btn);
    }
    applySpeedStyles(currentSpeed);
    panel.appendChild(speedRow);

    // ── Master Volume ──────────────────────────────────────
    panel.appendChild(this._makeSectionLabel('MASTER VOLUME'));

    const volWrapper = document.createElement('div');
    volWrapper.style.cssText = 'width:100%; display:flex; align-items:center; gap:10px;';

    const volSlider = document.createElement('input');
    volSlider.type = 'range';
    volSlider.min = '0';
    volSlider.max = '100';
    volSlider.value = String(Math.round(settings.masterVolume * 100));
    volSlider.style.cssText = `
      flex: 1;
      -webkit-appearance: none;
      appearance: none;
      height: 4px;
      border-radius: 2px;
      background: rgba(149,117,205,0.35);
      outline: none;
      cursor: pointer;
    `;

    const volLabel = document.createElement('span');
    volLabel.textContent = `${volSlider.value}%`;
    volLabel.style.cssText = `
      font-family: 'Orbitron', sans-serif;
      font-size: 0.7rem;
      color: #b39ddb;
      min-width: 36px;
      text-align: right;
    `;

    volSlider.addEventListener('input', () => {
      const v = Number(volSlider.value) / 100;
      volLabel.textContent = `${volSlider.value}%`;
      SettingsStore.update({ masterVolume: v });
      audioManager.setVolume(v);
    });

    volWrapper.appendChild(volSlider);
    volWrapper.appendChild(volLabel);
    panel.appendChild(volWrapper);

    // ── Game Challenge ─────────────────────────────────────
    panel.appendChild(this._makeSectionLabel('GAME CHALLENGE'));

    const difficultyHint = document.createElement('div');
    difficultyHint.style.cssText = `
      font-family: 'Rajdhani', sans-serif;
      font-size: 0.7rem;
      color: rgba(255,255,255,0.3);
      letter-spacing: 0.05em;
      width: 100%;
      text-align: center;
      margin-top: -4px;
      margin-bottom: 2px;
    `;

    const difficulties: Array<{ label: string; hint: string; value: GameSettings['difficulty']; color: string }> = [
      { label: 'Easy',   hint: 'Passive Turtle AI',          value: 'easy',   color: '#66bb6a' },
      { label: 'Normal', hint: 'Balanced — varies each game', value: 'normal', color: '#ffa726' },
      { label: 'Hard',   hint: 'Unhinged — unpredictable',   value: 'hard',   color: '#ef5350' },
    ];

    const diffRow = document.createElement('div');
    diffRow.style.cssText = 'display:flex; gap:8px; width:100%;';

    let currentDiff = settings.difficulty;
    const diffBtns = new Map<string, HTMLButtonElement>();

    const applyDiffStyles = (val: string) => {
      diffBtns.forEach((b, v) => {
        const diff = difficulties.find(d => d.value === v)!;
        const active = v === val;
        b.style.background  = active ? `${diff.color}33` : 'rgba(255,255,255,0.06)';
        b.style.borderColor = active ? `${diff.color}bb` : 'rgba(255,255,255,0.12)';
        b.style.boxShadow   = active ? `0 0 10px ${diff.color}44` : 'none';
        const hintEl = b.querySelector<HTMLElement>('.diff-hint');
        if (hintEl) hintEl.style.color = active ? `${diff.color}cc` : 'rgba(255,255,255,0.3)';
      });
      const selected = difficulties.find(d => d.value === val);
      if (selected) difficultyHint.textContent = selected.hint;
    };

    for (const { label, value, color } of difficulties) {
      const btn = document.createElement('button');
      btn.style.cssText = `
        flex: 1;
        padding: 10px 4px 8px;
        background: rgba(255,255,255,0.06);
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 6px;
        color: rgba(255,255,255,0.9);
        font-family: 'Orbitron', sans-serif;
        font-size: 0.75rem;
        font-weight: 700;
        cursor: pointer;
        transition: background 0.15s, border-color 0.15s, box-shadow 0.15s;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        letter-spacing: 0.06em;
      `;

      const labelEl = document.createElement('span');
      labelEl.textContent = label;
      btn.appendChild(labelEl);

      btn.addEventListener('click', () => {
        currentDiff = value;
        SettingsStore.update({ difficulty: value });
        applyDiffStyles(value);
      });

      diffBtns.set(value, btn);
      diffRow.appendChild(btn);
    }

    applyDiffStyles(currentDiff);
    panel.appendChild(diffRow);
    panel.appendChild(difficultyHint);

    // ── Color Theme ────────────────────────────────────────
    panel.appendChild(this._makeSectionLabel('COLOR THEME'));

    const themes: Array<{ label: string; value: GameSettings['colorTheme']; color: string; soon: boolean }> = [
      { label: 'Default', value: 'default', color: '#4fc3f7', soon: false },
      { label: 'Nebula',  value: 'nebula',  color: '#b39ddb', soon: true  },
      { label: 'Ice',     value: 'ice',     color: '#81d4fa', soon: true  },
      { label: 'Lava',    value: 'lava',    color: '#ff8a65', soon: true  },
    ];

    const themeRow = document.createElement('div');
    themeRow.style.cssText = 'display:flex; gap:8px; width:100%;';

    let currentTheme = settings.colorTheme;
    const themeBtns = new Map<string, HTMLButtonElement>();

    const applyThemeStyles = (val: string) => {
      themeBtns.forEach((b, v) => {
        const themeData = themes.find(t => t.value === v)!;
        const active = v === val;
        b.style.background  = active ? `${themeData.color}33` : 'rgba(255,255,255,0.06)';
        b.style.borderColor = active ? `${themeData.color}bb` : 'rgba(255,255,255,0.12)';
        b.style.boxShadow   = active ? `0 0 10px ${themeData.color}44` : 'none';
      });
    };

    for (const { label, value, color, soon } of themes) {
      const btn = document.createElement('button');
      btn.style.cssText = `
        flex: 1;
        padding: 10px 4px 6px;
        background: rgba(255,255,255,0.06);
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 6px;
        cursor: ${soon ? 'not-allowed' : 'pointer'};
        transition: background 0.15s, border-color 0.15s, box-shadow 0.15s;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        opacity: ${soon ? '0.6' : '1'};
      `;

      // Color swatch circle
      const swatch = document.createElement('div');
      swatch.style.cssText = `
        width: 18px; height: 18px;
        border-radius: 50%;
        background: ${color};
        box-shadow: 0 0 8px ${color}88;
      `;

      const lblEl = document.createElement('span');
      lblEl.textContent = label;
      lblEl.style.cssText = `
        font-family: 'Rajdhani', sans-serif;
        font-size: 0.72rem;
        font-weight: 700;
        color: rgba(255,255,255,0.6);
      `;

      btn.appendChild(swatch);
      btn.appendChild(lblEl);

      if (soon) {
        const badge = document.createElement('span');
        badge.textContent = 'Soon';
        badge.style.cssText = `
          font-family: 'Rajdhani', sans-serif;
          font-size: 0.6rem;
          color: rgba(255,200,100,0.75);
        `;
        btn.appendChild(badge);
      } else {
        btn.addEventListener('click', () => {
          audioManager.playClick();
          currentTheme = value;
          SettingsStore.update({ colorTheme: value });
          applyThemeStyles(value);
        });
      }

      themeBtns.set(value, btn);
      themeRow.appendChild(btn);
    }
    applyThemeStyles(currentTheme);
    panel.appendChild(themeRow);

    // ── Version text ────────────────────────────────────────
    const version = document.createElement('div');
    version.textContent = 'v0.1.0';
    version.style.cssText = `
      font-family: 'Rajdhani', sans-serif;
      font-size: 11px;
      color: rgba(255,255,255,0.2);
      letter-spacing: 0.1em;
      margin-top: 12px;
    `;
    panel.appendChild(version);

    return panel;
  }

  private _makeSectionLabel(text: string): HTMLElement {
    const lbl = document.createElement('div');
    lbl.textContent = text;
    lbl.style.cssText = `
      font-family: 'Rajdhani', sans-serif;
      font-size: 0.72rem;
      font-weight: 600;
      color: rgba(255,255,255,0.35);
      letter-spacing: 0.14em;
      text-transform: uppercase;
      align-self: flex-start;
      margin-top: 4px;
    `;
    return lbl;
  }

  private createAuxButton(text: string, color: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.textContent = text;
    btn.style.cssText = `
      padding: 8px 16px;
      background: transparent;
      border: 1px solid ${color}55;
      border-radius: 8px;
      color: ${color};
      font-family: 'Orbitron', sans-serif;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.08em;
      cursor: pointer;
      transition: all 0.2s ease;
    `;
    btn.addEventListener('mouseenter', () => {
      btn.style.background = `${color}22`;
      btn.style.borderColor = `${color}99`;
      btn.style.boxShadow = `0 0 12px ${color}44`;
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.background = 'transparent';
      btn.style.borderColor = `${color}55`;
      btn.style.boxShadow = 'none';
    });
    btn.addEventListener('click', () => {
      audioManager.playClick();
      onClick();
    });
    return btn;
  }

  // ── Systems panel ────────────────────────────────────────

  private openSystemsPanel(galaxy: any): void {
    if (this.systemsPanel) {
      this.systemsPanel.remove();
    }
    this.systemsPanel = this.createSystemsPanel(galaxy);
    this.element.appendChild(this.systemsPanel);

    const card = this._mainCard!;
    const panel = this.systemsPanel;

    // Slide card left + fade out
    card.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    card.style.opacity = '0';
    card.style.transform = 'translateX(-40px)';
    card.style.pointerEvents = 'none';

    // Show panel, slide in from right
    panel.style.display = 'flex';
    panel.style.opacity = '0';
    panel.style.transform = 'translateX(40px)';
    panel.style.pointerEvents = 'auto';
    
    requestAnimationFrame(() => {
      panel.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
      panel.style.opacity = '1';
      panel.style.transform = 'translateX(0)';
    });
  }

  private closeSystemsPanel(): void {
    const card = this._mainCard!;
    const panel = this.systemsPanel;
    if (!panel) return;

    // Slide panel out right
    panel.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    panel.style.opacity = '0';
    panel.style.transform = 'translateX(40px)';
    panel.style.pointerEvents = 'none';

    // Slide card back in
    card.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    card.style.opacity = '1';
    card.style.transform = 'translateX(0)';
    card.style.pointerEvents = 'auto';

    setTimeout(() => {
      if (this.systemsPanel) {
        this.systemsPanel.remove();
        this.systemsPanel = null;
      }
    }, 310);
  }

  private createSystemsPanel(galaxy: any): HTMLElement {
    const panel = document.createElement('div');
    panel.style.cssText = `
      position: absolute;
      display: none;
      flex-direction: column;
      align-items: center;
      gap: 20px;
      padding: 40px;
      background: rgba(0, 0, 12, 0.88);
      backdrop-filter: blur(24px);
      -webkit-backdrop-filter: blur(24px);
      border: 1px solid rgba(79, 195, 247, 0.2);
      border-radius: 24px;
      box-shadow: 0 0 60px rgba(79, 195, 247, 0.1), 0 8px 48px rgba(0,0,0,0.8);
      width: 90%;
      max-width: 1000px;
      max-height: 90vh;
      overflow-y: auto;
      pointer-events: none;
      opacity: 0;
      transform: translateX(40px);
    `;

    // Background Image representing the theme
    const bgImg = document.createElement('div');
    bgImg.style.cssText = `
      position: absolute;
      top: 0; left: 0; right: 0; bottom: 0;
      background-image: url('${galaxy.image}');
      background-size: cover;
      background-position: center;
      opacity: 0.15;
      z-index: -1;
      border-radius: 24px;
      mask-image: linear-gradient(to bottom, black 0%, transparent 100%);
      -webkit-mask-image: linear-gradient(to bottom, black 0%, transparent 100%);
    `;
    panel.appendChild(bgImg);

    // Header
    const header = document.createElement('div');
    header.style.cssText = 'display:flex; align-items:center; width:100%; gap:20px; margin-bottom:10px;';

    const backBtn = document.createElement('button');
    backBtn.textContent = '← BACK';
    backBtn.style.cssText = `
      background: transparent;
      border: 1px solid rgba(79, 195, 247, 0.4);
      border-radius: 8px;
      color: rgba(79, 195, 247, 0.9);
      font-family: 'Orbitron', sans-serif;
      font-size: 14px;
      font-weight: 700;
      letter-spacing: 0.1em;
      cursor: pointer;
      padding: 10px 16px;
      transition: all 0.2s;
    `;
    backBtn.addEventListener('click', () => this.closeSystemsPanel());
    backBtn.addEventListener('mouseenter', () => {
      backBtn.style.background = 'rgba(79, 195, 247, 0.1)';
      backBtn.style.borderColor = 'rgba(79, 195, 247, 0.8)';
    });
    backBtn.addEventListener('mouseleave', () => {
      backBtn.style.background = 'transparent';
      backBtn.style.borderColor = 'rgba(79, 195, 247, 0.4)';
    });

    const title = document.createElement('div');
    title.textContent = `${galaxy.name.toUpperCase()} SYSTEMS`;
    title.style.cssText = `
      font-family: 'Orbitron', sans-serif;
      font-size: 2rem;
      font-weight: 900;
      color: #4fc3f7;
      letter-spacing: 0.15em;
      text-shadow: 0 0 20px rgba(79, 195, 247, 0.5);
      flex: 1;
      text-align: right;
    `;

    header.appendChild(backBtn);
    header.appendChild(title);
    panel.appendChild(header);

    // Grid of systems — branched by galaxy type
    const grid = document.createElement('div');
    grid.style.cssText = `
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
      gap: 20px;
      width: 100%;
    `;

    if (galaxy.name === 'Tutorial') {
      this.buildTutorialSystemTiles(grid, galaxy);
    } else {
      this.buildGenericSystemTiles(grid, galaxy);
    }

    panel.appendChild(grid);

    return panel;
  }

  // ── Tutorial-specific 3-tile system grid ────────────────────

  private buildTutorialSystemTiles(grid: HTMLElement, galaxy: any): void {
    const systems = [
      {
        num: '01',
        name: 'Movement',
        icon: '🚀',
        desc: 'Learn to select planets, send particles, capture neutral worlds, and survive your first counter-attack.',
        locked: false,
        levelData: galaxy.levels?.[0] as LevelData | undefined,
        isTutorial: true,
      },
      {
        num: '02',
        name: 'Attack',
        icon: '⚔️',
        desc: 'Master deploying fleets strategically, overwhelming fortified enemy planets, and managing multiple fronts.',
        locked: true,
        levelData: undefined,
        isTutorial: true,
      },
      {
        num: '03',
        name: 'Conquest',
        icon: '👑',
        desc: 'Combine all skills for total galactic domination — upgrade chains, multi-enemy engagements, and the final push.',
        locked: true,
        levelData: undefined,
        isTutorial: true,
      },
    ];

    for (const sys of systems) {
      const tile = document.createElement('div');
      tile.style.cssText = `
        background: ${sys.locked ? 'rgba(255,255,255,0.03)' : 'rgba(79,195,247,0.05)'};
        border: 1px solid ${sys.locked ? 'rgba(255,255,255,0.08)' : 'rgba(79,195,247,0.2)'};
        border-radius: 16px;
        padding: 28px 24px 24px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 10px;
        min-height: 200px;
        cursor: ${sys.locked ? 'not-allowed' : 'pointer'};
        transition: transform 0.2s, box-shadow 0.2s, border-color 0.2s;
        opacity: ${sys.locked ? '0.5' : '1'};
        position: relative;
        overflow: hidden;
        text-align: center;
      `;

      if (!sys.locked) {
        tile.addEventListener('mouseenter', () => {
          tile.style.transform = 'translateY(-6px)';
          tile.style.boxShadow = '0 10px 28px rgba(79, 195, 247, 0.25)';
          tile.style.borderColor = 'rgba(79, 195, 247, 0.6)';
        });
        tile.addEventListener('mouseleave', () => {
          tile.style.transform = 'translateY(0)';
          tile.style.boxShadow = 'none';
          tile.style.borderColor = 'rgba(79,195,247,0.2)';
        });
        tile.addEventListener('click', () => {
          audioManager.playClick();
          if (sys.levelData) {
            this.closeSystemsPanel();
            setTimeout(() => this.onPlay(sys.levelData!, sys.isTutorial), 320);
          }
        });
      }

      // System number badge
      const numBadge = document.createElement('div');
      numBadge.textContent = `SYSTEM ${sys.num}`;
      numBadge.style.cssText = `
        font-family: 'Rajdhani', sans-serif;
        font-size: 0.7rem;
        font-weight: 700;
        color: ${sys.locked ? 'rgba(255,255,255,0.3)' : 'rgba(79,195,247,0.6)'};
        letter-spacing: 0.25em;
        text-transform: uppercase;
      `;
      tile.appendChild(numBadge);

      // Icon
      const iconEl = document.createElement('div');
      iconEl.textContent = sys.icon;
      iconEl.style.cssText = `
        font-size: 2.4rem;
        line-height: 1;
        filter: ${sys.locked ? 'grayscale(1)' : 'none'};
      `;
      tile.appendChild(iconEl);

      // Name
      const nameEl = document.createElement('div');
      nameEl.textContent = sys.name;
      nameEl.style.cssText = `
        font-family: 'Orbitron', sans-serif;
        font-size: 1.2rem;
        font-weight: 900;
        color: ${sys.locked ? 'rgba(255,255,255,0.4)' : '#4fc3f7'};
        letter-spacing: 0.1em;
        text-shadow: ${sys.locked ? 'none' : '0 0 12px rgba(79,195,247,0.4)'};
      `;
      tile.appendChild(nameEl);

      // Description
      const descEl = document.createElement('div');
      descEl.textContent = sys.desc;
      descEl.style.cssText = `
        font-family: 'Rajdhani', sans-serif;
        font-size: 0.82rem;
        color: ${sys.locked ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.55)'};
        line-height: 1.45;
        letter-spacing: 0.02em;
      `;
      tile.appendChild(descEl);

      if (!sys.locked) {
        const playTag = document.createElement('div');
        playTag.textContent = '▶ START';
        playTag.style.cssText = `
          margin-top: auto;
          font-family: 'Orbitron', sans-serif;
          font-size: 0.72rem;
          font-weight: 700;
          color: rgba(79,195,247,0.7);
          letter-spacing: 0.18em;
          border: 1px solid rgba(79,195,247,0.25);
          border-radius: 6px;
          padding: 5px 14px;
        `;
        tile.appendChild(playTag);
      } else {
        const soonTag = document.createElement('div');
        soonTag.textContent = 'Coming Soon';
        soonTag.style.cssText = `
          margin-top: auto;
          font-family: 'Rajdhani', sans-serif;
          font-size: 0.8rem;
          color: rgba(255,200,100,0.7);
          letter-spacing: 0.15em;
        `;
        tile.appendChild(soonTag);
      }

      grid.appendChild(tile);
    }
  }

  // ── Generic 9-tile system grid (non-Tutorial galaxies) ──────

  private buildGenericSystemTiles(grid: HTMLElement, galaxy: any): void {
    const systemNames = [
      'Alpha Centauri',
      'Sirius Prime',
      'Vega Core',
      'Betelgeuse Anomaly',
      'Rigel Outpost',
      'Orion Nebula',
      'Pleiades Cluster',
      'Andromeda Edge',
      'Void Nexus'
    ];

    const levelsCount = galaxy.levels ? galaxy.levels.length : 0;
    const isCustomGalaxy = galaxy.name === 'Custom';
    const totalTiles = isCustomGalaxy ? levelsCount : Math.max(levelsCount, 9);

    if (totalTiles === 0 && isCustomGalaxy) {
      const emptyMsg = document.createElement('div');
      emptyMsg.textContent = 'No custom systems found. Create one in the Level Editor!';
      emptyMsg.style.cssText = `
        grid-column: 1 / -1;
        text-align: center;
        font-family: 'Rajdhani', sans-serif;
        color: rgba(255,255,255,0.4);
        padding: 40px;
      `;
      grid.appendChild(emptyMsg);
      return;
    }

    for (let i = 0; i < totalTiles; i++) {
      const level = galaxy.levels ? galaxy.levels[i] : null;
      const isLocked = !isCustomGalaxy && !level;
      const tile = document.createElement('div');

      tile.style.cssText = `
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 12px;
        padding: 24px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        min-height: 140px;
        cursor: ${isLocked ? 'not-allowed' : 'pointer'};
        transition: transform 0.2s, box-shadow 0.2s, border-color 0.2s;
        opacity: ${isLocked ? '0.5' : '1'};
        position: relative;
        overflow: hidden;
      `;

      if (!isLocked) {
        tile.addEventListener('mouseenter', () => {
          tile.style.transform = 'translateY(-4px)';
          tile.style.boxShadow = '0 8px 24px rgba(79, 195, 247, 0.2)';
          tile.style.borderColor = 'rgba(79, 195, 247, 0.6)';
        });
        tile.addEventListener('mouseleave', () => {
          tile.style.transform = 'translateY(0)';
          tile.style.boxShadow = 'none';
          tile.style.borderColor = 'rgba(255, 255, 255, 0.1)';
        });
        tile.addEventListener('click', (e) => {
          if ((e.target as HTMLElement).closest('.delete-custom-btn')) return;
          audioManager.playClick();
          if (level) {
            this.closeSystemsPanel();
            setTimeout(() => this.onPlay(level, false), 320);
          }
        });
      }

      const numLabel = document.createElement('div');
      numLabel.textContent = isCustomGalaxy ? `CUSTOM` : `SYSTEM 0${i + 1}`;
      numLabel.style.cssText = `
        font-family: 'Rajdhani', sans-serif;
        font-size: 0.9rem;
        color: rgba(255, 255, 255, 0.4);
        letter-spacing: 0.2em;
        margin-bottom: 8px;
      `;

      const nameStr = level ? level.name : (systemNames[i] || `System ${i+1}`);
      const nameLabel = document.createElement('div');
      nameLabel.textContent = nameStr;
      nameLabel.style.cssText = `
        font-family: 'Orbitron', sans-serif;
        font-size: 1.1rem;
        font-weight: 700;
        color: ${isLocked ? 'rgba(255, 255, 255, 0.6)' : '#4fc3f7'};
        text-align: center;
      `;

      tile.appendChild(numLabel);
      tile.appendChild(nameLabel);

      if (isLocked) {
        const lockLabel = document.createElement('div');
        lockLabel.textContent = 'Coming Soon';
        lockLabel.style.cssText = `
          font-family: 'Rajdhani', sans-serif;
          font-size: 0.8rem;
          color: rgba(255, 200, 100, 0.9);
          letter-spacing: 0.15em;
          margin-top: 12px;
          text-transform: uppercase;
        `;
        tile.appendChild(lockLabel);
      }

      if (level && level.isCustom) {
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-custom-btn';
        deleteBtn.textContent = '🗑️';
        deleteBtn.title = 'Delete Custom Level';
        deleteBtn.style.cssText = `
          position: absolute;
          top: 8px;
          right: 8px;
          background: rgba(255, 50, 50, 0.2);
          border: 1px solid rgba(255, 50, 50, 0.4);
          border-radius: 4px;
          color: white;
          cursor: pointer;
          font-size: 12px;
          padding: 4px 6px;
          transition: background 0.2s;
          pointer-events: auto;
        `;
        deleteBtn.addEventListener('mouseenter', () => { deleteBtn.style.background = 'rgba(255, 50, 50, 0.6)'; });
        deleteBtn.addEventListener('mouseleave', () => { deleteBtn.style.background = 'rgba(255, 50, 50, 0.2)'; });
        deleteBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          audioManager.playClick();
          if (confirm(`Delete custom level "${level.name}"?`)) {
            LevelStore.deleteLevel(level.id!);
            tile.remove();
            const idx = galaxy.levels.indexOf(level);
            if (idx >= 0) galaxy.levels.splice(idx, 1);
          }
        });
        tile.appendChild(deleteBtn);
      }

      if (level) {
        // Display top 5 times
        const levelKey = level.id || level.name;
        const topTimes = HighScoreStore.getTop(levelKey).slice(0, 5);
        
        if (topTimes.length > 0) {
          const timesContainer = document.createElement('div');
          timesContainer.style.cssText = `
            margin-top: 12px;
            padding-top: 8px;
            border-top: 1px solid rgba(255, 255, 255, 0.1);
            width: 100%;
            display: flex;
            flex-direction: column;
            align-items: center;
          `;

          const timesHeader = document.createElement('div');
          timesHeader.textContent = 'TOP TIMES';
          timesHeader.style.cssText = `
            font-family: 'Rajdhani', sans-serif;
            font-size: 0.75rem;
            color: rgba(79, 195, 247, 0.8);
            letter-spacing: 0.1em;
            margin-bottom: 4px;
          `;
          timesContainer.appendChild(timesHeader);

          topTimes.forEach((score, idx) => {
            const timeRow = document.createElement('div');
            
            // Format time as MM:SS
            const timeStr = HighScoreStore.formatTime(score.bestTime);
            
            timeRow.textContent = `${idx + 1}. ${timeStr}`;
            timeRow.style.cssText = `
              font-family: 'Orbitron', sans-serif;
              font-size: 0.8rem;
              color: ${idx === 0 ? '#ffca28' : 'rgba(255, 255, 255, 0.6)'};
              margin: 1px 0;
            `;
            timesContainer.appendChild(timeRow);
          });
          
          tile.appendChild(timesContainer);
        }
      }

      grid.appendChild(tile);
    }
  }
}
