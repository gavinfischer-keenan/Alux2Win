// ============================================================
// HUD.ts — In-game heads-up display for Alux2Win
// Shows FPS, faction particle counts, pause button, and hints.
// ============================================================

import type { GameState, Faction } from '../types';
import { FACTION_COLORS_HEX } from '../types';
import { audioManager } from '../core/AudioManager';

interface FactionDisplay {
  faction: Faction;
  label: string;
  colorHex: string;
  countEl: HTMLElement;
}

export class HUD {
  private element: HTMLElement;
  private fpsEl: HTMLElement;
  private pauseBtn: HTMLElement;
  private pausedBanner: HTMLElement;
  private factionDisplays: FactionDisplay[];

  private lastFpsUpdate = 0;
  private frameCount    = 0;
  private currentFps    = 0;

  constructor(container: HTMLElement, onPauseClick: () => void = () => {}) {
    this.element      = this._build(onPauseClick);
    container.appendChild(this.element);

    this.fpsEl        = this.element.querySelector<HTMLElement>('#hud-fps')!;
    this.pauseBtn     = this.element.querySelector<HTMLElement>('#hud-pause-btn')!;
    this.pausedBanner = this.element.querySelector<HTMLElement>('#hud-paused-banner')!;

    const factionDefs: Array<{ faction: Faction; label: string }> = [
      { faction: 'player',  label: 'You'   },
      { faction: 'enemy_a', label: 'Red'   },
      { faction: 'enemy_b', label: 'Green' },
    ];

    this.factionDisplays = factionDefs.map(({ faction, label }) => ({
      faction,
      label,
      colorHex: FACTION_COLORS_HEX[faction],
      countEl: this.element.querySelector<HTMLElement>(`#hud-count-${faction}`)!,
    }));
  }

  // ── Public API ────────────────────────────────────────────

  /** Toggle visual paused state on HUD. */
  setPaused(paused: boolean): void {
    this.pauseBtn.textContent     = paused ? '▶' : '⏸';
    this.pauseBtn.title           = paused ? 'Resume (ESC)' : 'Pause (ESC)';
    this.pausedBanner.style.opacity = paused ? '1' : '0';
  }

  /** Call once per frame to keep FPS accurate. */
  tick(now: number): void {
    this.frameCount++;
    if (now - this.lastFpsUpdate >= 1000) {
      this.currentFps    = this.frameCount;
      this.frameCount    = 0;
      this.lastFpsUpdate = now;
      this.fpsEl.textContent = `${this.currentFps} FPS`;
    }
  }

  /** Update faction particle counts from current game state. */
  update(state: GameState): void {
    const stationedCounts: Partial<Record<Faction, number>> = {};
    state.planets.forEach(planet => {
      stationedCounts[planet.faction] = (stationedCounts[planet.faction] ?? 0) + planet.particles;
    });

    const travelCounts: Partial<Record<Faction, number>> = {};
    state.particles.forEach(p => {
      if (p.alive) {
        travelCounts[p.faction] = (travelCounts[p.faction] ?? 0) + 1;
      }
    });

    for (const fd of this.factionDisplays) {
      const total = (stationedCounts[fd.faction] ?? 0) + (travelCounts[fd.faction] ?? 0);
      fd.countEl.textContent = String(Math.floor(total));
    }
  }

  show(): void    { this.element.style.display = 'block'; }
  hide(): void    { this.element.style.display = 'none';  }
  destroy(): void { this.element.remove(); }

  // ── Build ─────────────────────────────────────────────────

  private _build(onPauseClick: () => void): HTMLElement {
    const el = document.createElement('div');
    el.id = 'game-hud';
    el.style.cssText = `
      position: absolute;
      top: 0; left: 0;
      width: 100%; height: 100%;
      pointer-events: none;
      z-index: 15;
      font-family: 'Rajdhani', sans-serif;
    `;

    // ── FPS counter (top-left) ─────────────────────────────
    const fpsEl = document.createElement('div');
    fpsEl.id = 'hud-fps';
    fpsEl.style.cssText = `
      position: absolute;
      top: 10px; left: 12px;
      font-size: 11px;
      color: rgba(255,255,255,0.28);
      font-family: 'Orbitron', sans-serif;
      letter-spacing: 0.05em;
      user-select: none;
    `;
    fpsEl.textContent = '60 FPS';
    el.appendChild(fpsEl);

    // ── Faction counts (top-center) ────────────────────────
    const factionsBar = document.createElement('div');
    factionsBar.style.cssText = `
      position: absolute;
      top: 10px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      gap: 24px;
      align-items: center;
      pointer-events: none;
    `;

    const factionDefs: Array<{ faction: Faction; label: string }> = [
      { faction: 'player',  label: 'You'   },
      { faction: 'enemy_a', label: 'Red'   },
      { faction: 'enemy_b', label: 'Green' },
    ];

    factionDefs.forEach(({ faction, label }) => {
      const colorHex = FACTION_COLORS_HEX[faction];
      const wrapper  = document.createElement('div');
      wrapper.style.cssText = `display:flex;align-items:center;gap:7px;`;

      const dot = document.createElement('div');
      dot.style.cssText = `
        width: 10px; height: 10px;
        border-radius: 50%;
        background: ${colorHex};
        box-shadow: 0 0 6px ${colorHex}cc;
        flex-shrink: 0;
      `;

      const labelEl = document.createElement('span');
      labelEl.style.cssText = `
        font-size: 11px;
        color: rgba(255,255,255,0.45);
        text-transform: uppercase;
        letter-spacing: 0.07em;
        font-weight: 600;
      `;
      labelEl.textContent = label;

      const count = document.createElement('span');
      count.id = `hud-count-${faction}`;
      count.style.cssText = `
        font-family: 'Orbitron', sans-serif;
        font-size: 13px;
        font-weight: 700;
        color: ${colorHex};
        min-width: 28px;
        text-align: right;
      `;
      count.textContent = '0';

      wrapper.appendChild(dot);
      wrapper.appendChild(labelEl);
      wrapper.appendChild(count);
      factionsBar.appendChild(wrapper);
    });
    el.appendChild(factionsBar);

    // ── Pause button (top-right) ───────────────────────────
    const pauseBtn = document.createElement('button');
    pauseBtn.id    = 'hud-pause-btn';
    pauseBtn.title = 'Pause (ESC)';
    pauseBtn.textContent = '⏸';
    pauseBtn.style.cssText = `
      position: absolute;
      top: 8px; right: 12px;
      width: 32px; height: 32px;
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 6px;
      color: rgba(255,255,255,0.5);
      font-size: 13px;
      cursor: pointer;
      pointer-events: auto;
      display: flex; align-items: center; justify-content: center;
      transition: background 0.15s, border-color 0.15s, color 0.15s;
      user-select: none;
    `;
    pauseBtn.addEventListener('click', () => {
      audioManager.playClick();
      onPauseClick();
    });
    pauseBtn.addEventListener('mouseenter', () => {
      pauseBtn.style.background   = 'rgba(79,195,247,0.15)';
      pauseBtn.style.borderColor  = 'rgba(79,195,247,0.4)';
      pauseBtn.style.color        = '#4fc3f7';
    });
    pauseBtn.addEventListener('mouseleave', () => {
      pauseBtn.style.background   = 'rgba(255,255,255,0.06)';
      pauseBtn.style.borderColor  = 'rgba(255,255,255,0.12)';
      pauseBtn.style.color        = 'rgba(255,255,255,0.5)';
    });
    el.appendChild(pauseBtn);

    // ── PAUSED banner (center, hidden by default) ──────────
    const pausedBanner = document.createElement('div');
    pausedBanner.id = 'hud-paused-banner';
    pausedBanner.textContent = '⏸  PAUSED';
    pausedBanner.style.cssText = `
      position: absolute;
      top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      font-family: 'Orbitron', sans-serif;
      font-size: 2.8rem;
      font-weight: 900;
      color: rgba(79, 195, 247, 0.12);
      letter-spacing: 0.25em;
      user-select: none;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.2s;
    `;
    el.appendChild(pausedBanner);

    // ── Control hint (bottom-center) ───────────────────────
    const hint = document.createElement('div');
    hint.style.cssText = `
      position: absolute;
      bottom: 18px;
      left: 50%;
      transform: translateX(-50%);
      font-size: 11px;
      color: rgba(255,255,255,0.22);
      letter-spacing: 0.06em;
      white-space: nowrap;
      font-family: 'Rajdhani', sans-serif;
      font-weight: 500;
      user-select: none;
      pointer-events: none;
    `;
    hint.textContent = 'Drag to select  |  Right-click to send  |  ESC to pause';
    el.appendChild(hint);

    return el;
  }
}
