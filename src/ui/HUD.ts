// ============================================================
// HUD.ts — In-game heads-up display for LUX
// Shows FPS, faction particle counts, pause button, and hints.
// ============================================================

import type { GameState, Faction } from '../types';
import { FACTION_COLORS_HEX } from '../types';
import { audioManager } from '../core/AudioManager';
import { HighScoreStore } from '../core/HighScoreStore';

interface FactionDisplay {
  faction: Faction;
  label: string;
  colorHex: string;
  countEl: HTMLElement;
  labelEl: HTMLElement;
}

export class HUD {
  private element: HTMLElement;
  private fpsEl: HTMLElement;
  private pauseBtn: HTMLElement;
  private pausedBanner: HTMLElement;
  private factionDisplays: FactionDisplay[];
  private gammaCountdownEl: HTMLElement;   // gamma-ray countdown widget
  private hintEl: HTMLElement;             // control hint (hidden when countdown is active)

  private timerEl: HTMLElement;
  private bestTimeEl: HTMLElement;
  private bummerEl: HTMLElement;

  private bestTime: number | null = null;
  private fifthBestTime: number | null = null;
  private hasCrossedBest = false;

  private lastFpsUpdate = 0;
  private frameCount    = 0;
  private currentFps    = 0;

  constructor(container: HTMLElement, onPauseClick: () => void = () => {}, activeFactions: Faction[] = ['player', 'enemy_a', 'enemy_b']) {
    this.element      = this._build(onPauseClick, activeFactions);
    container.appendChild(this.element);

    this.fpsEl        = this.element.querySelector<HTMLElement>('#hud-fps')!;
    this.timerEl      = this.element.querySelector<HTMLElement>('#hud-timer')!;
    this.bestTimeEl   = this.element.querySelector<HTMLElement>('#hud-best-time')!;
    this.bummerEl     = this.element.querySelector<HTMLElement>('#hud-bummer')!;
    this.pauseBtn     = this.element.querySelector<HTMLElement>('#hud-pause-btn')!;
    this.pausedBanner = this.element.querySelector<HTMLElement>('#hud-paused-banner')!;
    this.gammaCountdownEl = this.element.querySelector<HTMLElement>('#hud-gamma-countdown')!;
    this.hintEl           = this.element.querySelector<HTMLElement>('#hud-hint')!;

    const factionDefs: Array<{ faction: Faction; label: string }> = [
      { faction: 'player' as Faction,  label: 'You'   },
      { faction: 'enemy_a' as Faction, label: 'Red'   },
      { faction: 'enemy_b' as Faction, label: 'Green' },
      { faction: 'enemy_c' as Faction, label: 'Purple' },
    ].filter(f => activeFactions.includes(f.faction));

    this.factionDisplays = factionDefs.map(({ faction, label }) => ({
      faction,
      label,
      colorHex: FACTION_COLORS_HEX[faction],
      countEl: this.element.querySelector<HTMLElement>(`#hud-count-${faction}`)!,
      labelEl: this.element.querySelector<HTMLElement>(`#hud-label-${faction}`)!,
    }));
  }

  // ── Public API ────────────────────────────────────────────

  /** Toggle visual paused state on HUD. */
  setPaused(paused: boolean): void {
    this.pauseBtn.textContent     = paused ? '▶' : '⏸';
    this.pauseBtn.title           = paused ? 'Resume (ESC)' : 'Pause (ESC)';
    this.pausedBanner.style.opacity = paused ? '1' : '0';
  }

  /** Append the AI type/subrole to the faction label */
  setFactionSubRole(faction: Faction, subRole: string): void {
    const fd = this.factionDisplays.find(f => f.faction === faction);
    if (fd && faction !== 'player') {
      fd.labelEl.textContent = `${fd.label} (${subRole})`;
    }
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

  loadRecords(levelId: string): void {
    const records = HighScoreStore.getTop(levelId);
    this.bestTime = records.length > 0 ? records[0].bestTime : null;
    this.fifthBestTime = records.length >= 5 ? records[4].bestTime : null;
    this.hasCrossedBest = false;

    if (this.bestTime !== null) {
      this.bestTimeEl.textContent = `BEST: ${HighScoreStore.formatTime(this.bestTime)}`;
    } else {
      this.bestTimeEl.textContent = '';
    }
  }

  updateTimer(elapsedTime: number): void {
    this.timerEl.textContent = HighScoreStore.formatTime(elapsedTime);

    // Color logic
    if (this.bestTime !== null) {
      if (elapsedTime <= this.bestTime) {
        this.timerEl.style.color = '#4fc3f7'; // Green/Blue (using the same victory color or actual green)
      } else if (this.fifthBestTime === null || elapsedTime <= this.fifthBestTime) {
        this.timerEl.style.color = '#ffd54f'; // Yellow
        if (!this.hasCrossedBest) {
          this.hasCrossedBest = true;
          this.bummerEl.style.opacity = '1';
          this.bummerEl.style.transform = 'translateY(0)';
          // Fade out after a bit? Or keep it? The prompt says "push a small banner right below the box saying BUMMER"
          setTimeout(() => {
            this.bummerEl.style.opacity = '0';
          }, 3000);
        }
      } else {
        this.timerEl.style.color = '#ef5350'; // Red
      }
    } else {
      this.timerEl.style.color = 'rgba(255,255,255,0.8)';
    }
  }

  /** Update faction particle counts from current game state. */
  update(state: GameState): void {
    const particleCounts: Partial<Record<Faction, number>> = {};
    state.particles.forEach(p => {
      if (p.alive) {
        particleCounts[p.faction] = (particleCounts[p.faction] ?? 0) + 1;
      }
    });

    for (const fd of this.factionDisplays) {
      const total = particleCounts[fd.faction] ?? 0;
      fd.countEl.textContent = String(Math.floor(total));
    }

    // ── Gamma-ray countdown widget ─────────────────────────────
    const gr = state.gammaRay;
    // Countdown text appears only in the final 30 seconds before firing.
    const inCountdownWindow = gr.enabled && gr.path !== null && !gr.firing && gr.timer <= 30;
    if (inCountdownWindow) {
      const secsLeft = Math.ceil(Math.max(0, gr.timer));
      this.gammaCountdownEl.textContent = `☢  GAMMA RAY  ${secsLeft}s`;

      // Urgency: 0 when countdown starts (timer=30), 1 at firing.
      const urgency = Math.max(0, Math.min(1, 1 - gr.timer / 30));
      const baseAlpha = 0.5 + urgency * 0.5;
      const scale     = 1 + urgency * 0.22;
      const glow      = Math.round(urgency * 22);

      this.gammaCountdownEl.style.opacity    = String(baseAlpha);
      this.gammaCountdownEl.style.transform  = `translateX(-50%) scale(${scale.toFixed(3)})`;
      this.gammaCountdownEl.style.textShadow = `0 0 ${glow}px rgba(255,60,0,0.9)`;
      this.gammaCountdownEl.style.display    = 'block';
      this.hintEl.style.display              = 'none';
    } else if (gr.enabled && gr.firing) {
      // During the beam firing show a bright FIRING label
      this.gammaCountdownEl.textContent      = '☢  GAMMA RAY  FIRING!';
      this.gammaCountdownEl.style.opacity    = '1';
      this.gammaCountdownEl.style.transform  = 'translateX(-50%) scale(1.3)';
      this.gammaCountdownEl.style.textShadow = '0 0 28px rgba(255,60,0,1)';
      this.gammaCountdownEl.style.display    = 'block';
      this.hintEl.style.display              = 'none';
    } else {
      this.gammaCountdownEl.style.display = 'none';
      this.hintEl.style.display           = 'block';
    }
  }


  show(): void    { this.element.style.display = 'block'; }
  hide(): void    { this.element.style.display = 'none';  }
  destroy(): void { this.element.remove(); }

  // ── Build ─────────────────────────────────────────────────

  private _build(onPauseClick: () => void, activeFactions: Faction[]): HTMLElement {
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

    // ── FPS counter & Timer (top-left) ─────────────────────────────
    const topLeftContainer = document.createElement('div');
    topLeftContainer.style.cssText = `
      position: absolute;
      top: 10px; left: 12px;
      display: flex;
      flex-direction: column;
      gap: 2px;
    `;

    const fpsEl = document.createElement('div');
    fpsEl.id = 'hud-fps';
    fpsEl.style.cssText = `
      font-size: 11px;
      color: rgba(255,255,255,0.28);
      font-family: 'Orbitron', sans-serif;
      letter-spacing: 0.05em;
      user-select: none;
    `;
    fpsEl.textContent = '60 FPS';
    topLeftContainer.appendChild(fpsEl);

    const timerEl = document.createElement('div');
    timerEl.id = 'hud-timer';
    timerEl.style.cssText = `
      font-size: 16px;
      font-weight: 700;
      color: rgba(255,255,255,0.8);
      font-family: 'Orbitron', sans-serif;
      letter-spacing: 0.05em;
      user-select: none;
      transition: color 0.3s;
    `;
    timerEl.textContent = '00:00.00';
    topLeftContainer.appendChild(timerEl);

    const bestTimeEl = document.createElement('div');
    bestTimeEl.id = 'hud-best-time';
    bestTimeEl.style.cssText = `
      font-size: 10px;
      color: rgba(255,255,255,0.45);
      font-family: 'Rajdhani', sans-serif;
      letter-spacing: 0.1em;
      user-select: none;
    `;
    topLeftContainer.appendChild(bestTimeEl);

    const bummerEl = document.createElement('div');
    bummerEl.id = 'hud-bummer';
    bummerEl.style.cssText = `
      font-size: 11px;
      font-weight: 700;
      color: #ef5350;
      font-family: 'Orbitron', sans-serif;
      letter-spacing: 0.1em;
      user-select: none;
      background: rgba(239, 83, 80, 0.15);
      border: 1px solid rgba(239, 83, 80, 0.4);
      padding: 2px 6px;
      border-radius: 4px;
      opacity: 0;
      transform: translateY(-5px);
      transition: opacity 0.3s, transform 0.3s;
      margin-top: 2px;
      align-self: flex-start;
    `;
    bummerEl.textContent = 'BUMMER';
    topLeftContainer.appendChild(bummerEl);

    el.appendChild(topLeftContainer);

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
      { faction: 'player' as Faction,  label: 'You'   },
      { faction: 'enemy_a' as Faction, label: 'Red'   },
      { faction: 'enemy_b' as Faction, label: 'Green' },
      { faction: 'enemy_c' as Faction, label: 'Purple' },
    ].filter(f => activeFactions.includes(f.faction));

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
      labelEl.id = `hud-label-${faction}`;
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
    hint.id = 'hud-hint';
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

    // ── Gamma-ray countdown (bottom-center, replaces hint) ─
    const gammaCountdown = document.createElement('div');
    gammaCountdown.id = 'hud-gamma-countdown';
    gammaCountdown.style.cssText = `
      position: absolute;
      bottom: 16px;
      left: 50%;
      transform: translateX(-50%);
      font-family: 'Orbitron', sans-serif;
      font-size: 14px;
      font-weight: 700;
      color: #ff3c00;
      letter-spacing: 0.18em;
      white-space: nowrap;
      user-select: none;
      pointer-events: none;
      display: none;
      transition: transform 0.3s ease, text-shadow 0.3s ease, opacity 0.3s ease;
    `;
    el.appendChild(gammaCountdown);

    return el;
  }
}
