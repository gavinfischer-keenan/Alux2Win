// ============================================================
// PauseMenu.ts — In-game pause overlay for LUX
// Triggered by ESC key or the HUD pause button.
// ============================================================

import { SettingsStore } from '../core/SettingsStore';
import { audioManager } from '../core/AudioManager';

export type GameSpeed = 0.5 | 1 | 2 | 3;

const SPEED_OPTIONS: { label: string; value: GameSpeed }[] = [
  { label: '½×', value: 0.5 },
  { label: '1×', value: 1   },
  { label: '2×', value: 2   },
  { label: '3×', value: 3   },
];

export class PauseMenu {
  private element: HTMLElement;
  private speedBtns = new Map<GameSpeed, HTMLButtonElement>();
  private _currentSpeed: GameSpeed = 1;

  // ── Callbacks ─────────────────────────────────────────────
  onResume:     () => void = () => {};
  onSpeedChange: (speed: GameSpeed) => void = () => {};
  onQuitToMenu: () => void = () => {};

  constructor(container: HTMLElement, initialSpeed?: GameSpeed) {
    this._currentSpeed = initialSpeed ?? (SettingsStore.get().gameSpeed as GameSpeed);
    this.element = this._build();
    container.appendChild(this.element);
    this._setActiveSpeed(this._currentSpeed);
  }

  // ── Public API ────────────────────────────────────────────

  show(): void {
    this.element.style.display = 'flex';
    // Fade-in the card
    const card = this.element.querySelector<HTMLElement>('.pause-card');
    if (card) {
      card.style.opacity = '0';
      card.style.transform = 'scale(0.94) translateY(-8px)';
      requestAnimationFrame(() => {
        card.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
        card.style.opacity = '1';
        card.style.transform = 'scale(1) translateY(0)';
      });
    }
  }

  hide(): void {
    const card = this.element.querySelector<HTMLElement>('.pause-card');
    if (card) {
      card.style.transition = 'opacity 0.15s ease, transform 0.15s ease';
      card.style.opacity = '0';
      card.style.transform = 'scale(0.94) translateY(-8px)';
      setTimeout(() => { this.element.style.display = 'none'; }, 160);
    } else {
      this.element.style.display = 'none';
    }
  }

  get currentSpeed(): GameSpeed { return this._currentSpeed; }

  destroy(): void {
    this.element.remove();
  }

  // ── Private build ─────────────────────────────────────────

  private _build(): HTMLElement {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: absolute;
      inset: 0;
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 40;
      background: rgba(0, 0, 10, 0.55);
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
      pointer-events: auto;
    `;

    // ── Card ─────────────────────────────────────────────────
    const card = document.createElement('div');
    card.className = 'pause-card';
    card.style.cssText = `
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
      padding: 36px 48px 28px;
      background: rgba(0, 0, 14, 0.82);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid rgba(79, 195, 247, 0.18);
      border-radius: 18px;
      box-shadow: 0 0 60px rgba(79, 195, 247, 0.06), 0 8px 48px rgba(0,0,0,0.7);
      min-width: 280px;
    `;
    overlay.appendChild(card);

    // ── Title ─────────────────────────────────────────────────
    const title = document.createElement('div');
    title.textContent = '⏸  PAUSED';
    title.style.cssText = `
      font-family: 'Orbitron', sans-serif;
      font-size: 1.4rem;
      font-weight: 900;
      color: #4fc3f7;
      letter-spacing: 0.18em;
      text-shadow: 0 0 20px rgba(79, 195, 247, 0.5);
      margin-bottom: 6px;
    `;
    card.appendChild(title);

    // ── Separator ─────────────────────────────────────────────
    const sep = document.createElement('div');
    sep.style.cssText = `
      width: 160px; height: 1px;
      background: linear-gradient(90deg, transparent, rgba(79,195,247,0.35), transparent);
      margin: 4px 0 12px;
    `;
    card.appendChild(sep);

    // ── Speed row ─────────────────────────────────────────────
    const speedLabel = document.createElement('div');
    speedLabel.textContent = 'GAME SPEED';
    speedLabel.style.cssText = `
      font-family: 'Rajdhani', sans-serif;
      font-size: 0.72rem;
      font-weight: 600;
      color: rgba(255,255,255,0.38);
      letter-spacing: 0.14em;
      text-transform: uppercase;
      align-self: flex-start;
    `;
    card.appendChild(speedLabel);

    const speedRow = document.createElement('div');
    speedRow.style.cssText = `
      display: flex;
      gap: 8px;
      width: 100%;
      margin-bottom: 6px;
    `;

    for (const { label, value } of SPEED_OPTIONS) {
      const btn = document.createElement('button');
      btn.textContent = label;
      btn.dataset['speed'] = String(value);
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
        this._setActiveSpeed(value);
        this.onSpeedChange(value);
        SettingsStore.update({ gameSpeed: value });
      });
      btn.addEventListener('mouseenter', () => {
        if (this._currentSpeed !== value) {
          btn.style.background = 'rgba(79,195,247,0.12)';
          btn.style.borderColor = 'rgba(79,195,247,0.35)';
        }
      });
      btn.addEventListener('mouseleave', () => {
        if (this._currentSpeed !== value) {
          btn.style.background = 'rgba(255,255,255,0.06)';
          btn.style.borderColor = 'rgba(255,255,255,0.12)';
        }
      });
      this.speedBtns.set(value, btn);
      speedRow.appendChild(btn);
    }
    card.appendChild(speedRow);

    // ── Resume button ─────────────────────────────────────────
    const resumeBtn = this._buildActionBtn('▶  RESUME', '#4fc3f7', '#22d3ee');
    resumeBtn.style.marginTop = '8px';
    resumeBtn.addEventListener('click', () => {
      audioManager.playClick();
      this.onResume();
    });
    card.appendChild(resumeBtn);

    // ── Quit button ───────────────────────────────────────────
    const quitBtn = this._buildActionBtn('⌂  QUIT TO MENU', '#78909c', '#90a4ae');
    quitBtn.addEventListener('click', () => {
      audioManager.playClick();
      this.onQuitToMenu();
    });
    card.appendChild(quitBtn);

    // ── ESC hint ──────────────────────────────────────────────
    const hint = document.createElement('div');
    hint.textContent = 'Press ESC to resume';
    hint.style.cssText = `
      font-family: 'Rajdhani', sans-serif;
      font-size: 0.68rem;
      color: rgba(255,255,255,0.2);
      letter-spacing: 0.08em;
      margin-top: 4px;
    `;
    card.appendChild(hint);

    return overlay;
  }

  private _buildActionBtn(text: string, colorFrom: string, colorTo: string): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.textContent = text;
    btn.style.cssText = `
      width: 100%;
      padding: 11px 16px;
      background: linear-gradient(135deg, ${colorFrom}22, ${colorTo}11);
      border: 1px solid ${colorFrom}55;
      border-radius: 8px;
      color: ${colorFrom};
      font-family: 'Orbitron', sans-serif;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.1em;
      cursor: pointer;
      transition: background 0.2s, border-color 0.2s, box-shadow 0.2s, transform 0.1s;
      text-align: center;
    `;
    btn.addEventListener('mouseenter', () => {
      btn.style.background = `linear-gradient(135deg, ${colorFrom}44, ${colorTo}22)`;
      btn.style.borderColor = `${colorFrom}99`;
      btn.style.boxShadow = `0 0 16px ${colorFrom}44`;
      btn.style.transform = 'translateY(-1px)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.background = `linear-gradient(135deg, ${colorFrom}22, ${colorTo}11)`;
      btn.style.borderColor = `${colorFrom}55`;
      btn.style.boxShadow = 'none';
      btn.style.transform = 'translateY(0)';
    });
    return btn;
  }

  private _setActiveSpeed(speed: GameSpeed): void {
    this._currentSpeed = speed;
    this.speedBtns.forEach((btn, value) => {
      const isActive = value === speed;
      btn.style.background    = isActive ? 'rgba(79,195,247,0.22)' : 'rgba(255,255,255,0.06)';
      btn.style.borderColor   = isActive ? 'rgba(79,195,247,0.7)'  : 'rgba(255,255,255,0.12)';
      btn.style.color         = isActive ? '#4fc3f7'               : 'rgba(255,255,255,0.55)';
      btn.style.boxShadow     = isActive ? '0 0 12px rgba(79,195,247,0.3)' : 'none';
    });
  }
}
