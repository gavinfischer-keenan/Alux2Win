// ============================================================
// MainMenuScene.ts — Main menu HTML overlay scene for Alux2Win
// Renders on top of the live PixiJS star-background canvas.
// ============================================================

import type { LevelData } from '../types';
import tutorialData from '../levels/tutorial.json';
import skirmishData from '../levels/skirmish.json';
import { SettingsStore } from '../core/SettingsStore';
import type { GameSettings } from '../core/SettingsStore';
import { audioManager } from '../core/AudioManager';
import type { GameSpeed } from '../ui/PauseMenu';

export class MainMenuScene {
  private element: HTMLElement;
  private settingsPanel: HTMLElement | null = null;
  private _mainCard: HTMLElement | null = null;

  onPlay: (levelData: LevelData) => void = () => {};
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
    `;

    // ── Inner card ─────────────────────────────────────────
    const card = document.createElement('div');
    card.style.cssText = `
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      padding: 48px 56px 36px;
      background: rgba(0, 0, 10, 0.65);
      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
      border: 1px solid rgba(79, 195, 247, 0.15);
      border-radius: 20px;
      box-shadow: 0 0 60px rgba(79, 195, 247, 0.08), 0 8px 40px rgba(0,0,0,0.6);
      min-width: 320px;
      transition: opacity 0.3s ease, transform 0.3s ease;
    `;
    this._mainCard = card;
    overlay.appendChild(card);

    // ── Title ──────────────────────────────────────────────
    const titleWrapper = document.createElement('div');
    titleWrapper.className = 'menu-anim-child';
    titleWrapper.style.cssText = 'text-align: center; margin-bottom: 8px;';

    const title = document.createElement('h1');
    title.textContent = 'ALUX2WIN';
    title.style.cssText = `
      font-family: 'Orbitron', sans-serif;
      font-size: clamp(2.4rem, 5vw, 3.8rem);
      font-weight: 900;
      color: #4fc3f7;
      letter-spacing: 0.12em;
      line-height: 1;
      animation: title-glow 3s ease-in-out infinite;
      margin: 0;
    `;

    const subtitle = document.createElement('div');
    subtitle.textContent = 'Constellations';
    subtitle.style.cssText = `
      font-family: 'Rajdhani', sans-serif;
      font-size: 1.05rem;
      color: rgba(79, 195, 247, 0.55);
      letter-spacing: 0.32em;
      text-transform: uppercase;
      margin-top: 6px;
    `;

    titleWrapper.appendChild(title);
    titleWrapper.appendChild(subtitle);
    card.appendChild(titleWrapper);

    // ── Decorative separator ───────────────────────────────
    const sep = document.createElement('div');
    sep.className = 'menu-anim-child';
    sep.style.cssText = `
      width: 180px;
      height: 1px;
      background: linear-gradient(90deg, transparent, rgba(79,195,247,0.45), transparent);
      margin: 8px 0 16px;
    `;
    card.appendChild(sep);

    // ── Play Tutorial button ───────────────────────────────
    const tutorialBtn = this.createMenuButton('▶ PLAY TUTORIAL', '#4fc3f7', '#22d3ee');
    tutorialBtn.className += ' menu-anim-child';
    tutorialBtn.addEventListener('click', () => {
      this.onPlay(tutorialData as LevelData);
    });
    card.appendChild(tutorialBtn);

    // ── Play Skirmish button ───────────────────────────────
    const skirmishBtn = this.createMenuButton('⚔ PLAY SKIRMISH', '#66bb6a', '#4ade80');
    skirmishBtn.className += ' menu-anim-child';
    skirmishBtn.addEventListener('click', () => {
      this.onPlay(skirmishData as LevelData);
    });
    card.appendChild(skirmishBtn);

    // ── Import Level button + hidden input ─────────────────
    const importWrapper = document.createElement('div');
    importWrapper.className = 'menu-anim-child';
    importWrapper.style.cssText = 'width: 100%;';

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
      // Reset so same file can be re-imported
      fileInput.value = '';
    });

    const importBtn = this.createMenuButton('📂 IMPORT LEVEL', '#b0bec5', '#cfd8dc');
    importBtn.addEventListener('click', () => fileInput.click());

    importWrapper.appendChild(fileInput);
    importWrapper.appendChild(importBtn);
    card.appendChild(importWrapper);

    // ── Level Editor button ────────────────────────────────
    const editorBtn = this.createMenuButton('🛠 LEVEL EDITOR', '#f59e0b', '#fbbf24');
    editorBtn.className += ' menu-anim-child';
    editorBtn.addEventListener('click', () => this.onOpenEditor());
    card.appendChild(editorBtn);

    // ── Settings button ────────────────────────────────────
    const settingsBtn = this.createMenuButton('⚙ SETTINGS', '#9575cd', '#b39ddb');
    settingsBtn.className += ' menu-anim-child';
    settingsBtn.addEventListener('click', () => this.openSettings());
    card.appendChild(settingsBtn);

    // ── Version text ───────────────────────────────────────
    const version = document.createElement('div');
    version.className = 'menu-anim-child';
    version.textContent = 'v0.1.0';
    version.style.cssText = `
      font-family: 'Rajdhani', sans-serif;
      font-size: 11px;
      color: rgba(255,255,255,0.2);
      letter-spacing: 0.1em;
      margin-top: 16px;
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
    backBtn.addEventListener('click', () => this.closeSettings());

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

    // ── AI Personality ────────────────────────────────────
    panel.appendChild(this._makeSectionLabel('AI PERSONALITY'));

    const personalities: Array<{ label: string; value: GameSettings['aiPersonality']; soon: boolean }> = [
      { label: 'Balanced',   value: 'balanced',   soon: false },
      { label: 'Aggressive', value: 'aggressive',  soon: true  },
      { label: 'Turtle',     value: 'turtle',      soon: true  },
    ];

    const aiRow = document.createElement('div');
    aiRow.style.cssText = 'display:flex; gap:8px; width:100%;';

    let currentAI = settings.aiPersonality;
    const aiBtns = new Map<string, HTMLButtonElement>();

    const applyAIStyles = (val: string) => {
      aiBtns.forEach((b, v) => {
        const active = v === val;
        b.style.background  = active ? 'rgba(149,117,205,0.25)' : 'rgba(255,255,255,0.06)';
        b.style.borderColor = active ? 'rgba(149,117,205,0.75)' : 'rgba(255,255,255,0.12)';
        b.style.color       = active ? '#b39ddb'                : 'rgba(255,255,255,0.55)';
      });
    };

    for (const { label, value, soon } of personalities) {
      const btn = document.createElement('button');
      btn.style.cssText = `
        flex: 1;
        padding: 8px 4px;
        background: rgba(255,255,255,0.06);
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 6px;
        color: rgba(255,255,255,0.55);
        font-family: 'Rajdhani', sans-serif;
        font-size: 0.8rem;
        font-weight: 700;
        cursor: ${soon ? 'not-allowed' : 'pointer'};
        transition: background 0.15s, border-color 0.15s, color 0.15s;
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
        opacity: ${soon ? '0.6' : '1'};
      `;

      const labelEl = document.createElement('span');
      labelEl.textContent = label;
      btn.appendChild(labelEl);

      if (soon) {
        const badge = document.createElement('span');
        badge.textContent = 'Soon';
        badge.style.cssText = `
          font-family: 'Rajdhani', sans-serif;
          font-size: 0.6rem;
          color: rgba(255,200,100,0.75);
          letter-spacing: 0.05em;
        `;
        btn.appendChild(badge);
      } else {
        btn.addEventListener('click', () => {
          currentAI = value;
          SettingsStore.update({ aiPersonality: value });
          applyAIStyles(value);
        });
      }

      aiBtns.set(value, btn);
      aiRow.appendChild(btn);
    }
    applyAIStyles(currentAI);
    panel.appendChild(aiRow);

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

  private createMenuButton(
    text: string,
    colorFrom: string,
    colorTo: string
  ): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.textContent = text;
    btn.style.cssText = `
      width: 100%;
      padding: 13px 20px;
      background: linear-gradient(135deg, ${colorFrom}22, ${colorTo}11);
      border: 1px solid ${colorFrom}55;
      border-radius: 8px;
      color: ${colorFrom};
      font-family: 'Orbitron', sans-serif;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.1em;
      cursor: pointer;
      transition: background 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease, transform 0.1s ease;
      text-align: left;
    `;
    btn.addEventListener('mouseenter', () => {
      btn.style.background = `linear-gradient(135deg, ${colorFrom}44, ${colorTo}22)`;
      btn.style.borderColor = `${colorFrom}99`;
      btn.style.boxShadow = `0 0 20px ${colorFrom}44, 0 4px 12px rgba(0,0,0,0.4)`;
      btn.style.transform = 'translateX(4px)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.background = `linear-gradient(135deg, ${colorFrom}22, ${colorTo}11)`;
      btn.style.borderColor = `${colorFrom}55`;
      btn.style.boxShadow = 'none';
      btn.style.transform = 'translateX(0)';
    });
    btn.addEventListener('mousedown', () => {
      btn.style.transform = 'translateX(2px) scale(0.98)';
    });
    btn.addEventListener('mouseup', () => {
      btn.style.transform = 'translateX(4px)';
    });
    return btn;
  }
}
