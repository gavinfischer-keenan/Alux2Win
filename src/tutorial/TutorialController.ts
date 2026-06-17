// ============================================================
// TutorialController.ts — Scripted step-machine for the
// Movement tutorial. Overlays instructional cards on screen,
// watches GameState for completion conditions, and controls
// the scripted enemy faction (enemy_a) directly.
// ============================================================

import type { GameState, Faction, PlanetData } from '../types';
import { PLANET_RADIUS } from '../types';

export type TutorialDeployCallback = (fromIds: string[], targetId: string) => void;

// ---------------------------------------------------------------------------
// Step definitions
// ---------------------------------------------------------------------------

interface TutorialStep {
  id: string;
  /** Icon shown at top of card */
  icon: string;
  /** Bold heading */
  heading: string;
  /** Body text */
  body: string;
  /** If set, show a pulsing arrow pointing at this planet id */
  pointAtPlanet?: string;
  /** If true, auto-dismiss when isDone returns true (no tap required) */
  autoDismiss: boolean;
  /** Returns true when this step is complete and we should advance */
  isDone: (state: GameState, elapsed: number) => boolean;
}

const STEPS: TutorialStep[] = [
  {
    id: 'welcome',
    icon: '🌌',
    heading: 'Welcome, Commander!',
    body: 'This glowing sphere is your home planet. It continuously produces energy particles that orbit it. More particles = more military strength.',
    pointAtPlanet: 'p_home',
    autoDismiss: false,
    isDone: (_s, elapsed) => elapsed > 30, // tap to dismiss, or auto after 30s
  },
  {
    id: 'select',
    icon: '🖱️',
    heading: 'Select Your Planet',
    body: 'Left-click your home planet to select it. A bright ring will appear around it.',
    pointAtPlanet: 'p_home',
    autoDismiss: true,
    isDone: (state) => state.selectedPlanetIds.has('p_home'),
  },
  {
    id: 'capture_prompt',
    icon: '🎯',
    heading: 'Capture a Neutral Planet',
    body: 'The grey planet nearby has no owner. With your home planet selected, right-click that grey planet to send your particles to capture it!',
    pointAtPlanet: 'p_near',
    autoDismiss: true,
    isDone: (state) => {
      // Done when player sends particles toward p_near OR captures it
      const pNear = state.planets.get('p_near');
      if (pNear && pNear.faction === 'player') return true;
      // Also done if there are player particles traveling toward p_near
      return state.particles.some(
        p => p.alive && p.faction === 'player' && p.targetPlanetId === 'p_near'
      );
    },
  },
  {
    id: 'captured',
    icon: '✅',
    heading: 'Planet Captured!',
    body: 'Excellent! You own that planet now. It will start producing particles for you. More planets = faster growth. Try capturing the next neutral planet too!',
    pointAtPlanet: 'p_mid',
    autoDismiss: false,
    isDone: (state, elapsed) => {
      // Advance once p_near is captured and player has clicked or 12s passed
      const pNear = state.planets.get('p_near');
      return (pNear?.faction === 'player') && elapsed > 12;
    },
  },
  {
    id: 'upgrade_hint',
    icon: '⬆️',
    heading: 'Upgrade Your Planets',
    body: 'Planets level up automatically when friendly particles are absorbed into them. Keep sending your own particles back to a planet to upgrade it faster. A level 2 planet (larger) produces much faster!',
    pointAtPlanet: 'p_upgrade',
    autoDismiss: true,
    isDone: (state) => {
      // Done when any player planet reaches level 2 or higher (besides p_home which starts at 2)
      for (const planet of state.planets.values()) {
        if (planet.faction === 'player' && planet.id !== 'p_home' && planet.upgradeLevel >= 2) {
          return true;
        }
      }
      // Also advance after 20s if player has 2+ planets
      const playerPlanets = [...state.planets.values()].filter(p => p.faction === 'player');
      return false;
    },
  },
  {
    id: 'upgraded',
    icon: '🌟',
    heading: 'Planet Upgraded!',
    body: 'Look at the size difference! Upgraded planets produce particles faster and can hold more. Max level (3) is a powerhouse. Upgrades are your economic edge.',
    autoDismiss: false,
    isDone: (_s, elapsed) => elapsed > 10,
  },
  {
    id: 'enemy_incoming',
    icon: '⚠️',
    heading: 'Incoming Attack!',
    body: 'The enemy is sending particles toward you! Select your threatened planet and right-click it to reinforce with more particles — or counter-attack the enemy\'s planet while they\'re exposed!',
    pointAtPlanet: 'p_enemy',
    autoDismiss: true,
    isDone: (state) => {
      // Done when enemy has no more particles traveling OR player owns all planets
      const enemyParticles = state.particles.filter(
        p => p.alive && p.faction === 'enemy_a'
      );
      if (enemyParticles.length === 0) {
        const enemyPlanets = [...state.planets.values()].filter(
          p => p.faction === 'enemy_a'
        );
        return enemyPlanets.length === 0;
      }
      return false;
    },
  },
  {
    id: 'victory',
    icon: '🏆',
    heading: 'Mission Complete!',
    body: 'Outstanding, Commander! You\'ve mastered the basics: selecting, capturing, upgrading, and surviving an attack. The Attack system awaits when you\'re ready.',
    autoDismiss: false,
    isDone: (_s, elapsed) => elapsed > 999, // stays forever until player leaves
  },
];

// ---------------------------------------------------------------------------
// Enemy script timeline
// ---------------------------------------------------------------------------

interface EnemyAction {
  triggerTime: number;  // seconds elapsed since tutorial started
  from: string[];       // planet IDs to deploy from
  to: string;           // target planet ID
  done: boolean;
}

const ENEMY_SCRIPT: EnemyAction[] = [
  // At 30s: try to capture the contested mid neutral
  { triggerTime: 30, from: ['p_enemy'], to: 'p_mid', done: false },
  // At 50s: attack the player's nearest planet
  { triggerTime: 50, from: ['p_enemy'], to: 'p_near', done: false },
  // At 70s: one more push (if still alive)
  { triggerTime: 70, from: ['p_enemy'], to: 'p_home', done: false },
];

// ---------------------------------------------------------------------------
// Overlay card renderer
// ---------------------------------------------------------------------------

interface CardState {
  element: HTMLElement;
  arrowElement: HTMLElement | null;
}

// ---------------------------------------------------------------------------
// TutorialController
// ---------------------------------------------------------------------------

export class TutorialController {
  private container: HTMLElement;
  private stepIndex = 0;
  private stepElapsed = 0;
  private totalElapsed = 0;
  private card: CardState | null = null;
  private dismissed = false;

  // Screen-space planet locator — injected so we can point arrows at planets
  private getPlanetScreenPos: (planetId: string) => { x: number; y: number } | null;

  constructor(
    uiContainer: HTMLElement,
    getPlanetScreenPos: (planetId: string) => { x: number; y: number } | null,
  ) {
    this.container = uiContainer;
    this.getPlanetScreenPos = getPlanetScreenPos;
    this.showStep(0);
  }

  // ── Public update — called every game tick ──────────────────

  update(dt: number, state: GameState, deploy: TutorialDeployCallback): void {
    this.totalElapsed += dt;
    this.stepElapsed  += dt;

    // Run enemy script
    this.runEnemyScript(state, deploy);

    // Update current step
    const step = STEPS[this.stepIndex];
    if (!step) return;

    // Update arrow position if pointing at a planet
    if (step.pointAtPlanet && this.card?.arrowElement) {
      const pos = this.getPlanetScreenPos(step.pointAtPlanet);
      if (pos) {
        this.updateArrow(this.card.arrowElement, pos.x, pos.y);
      }
    }

    // Check for auto-dismiss
    if (step.autoDismiss && step.isDone(state, this.stepElapsed)) {
      this.advance(state);
    }
  }

  // ── Advance through steps ───────────────────────────────────

  private advance(state: GameState): void {
    // Special: only show "upgraded" step if a planet actually upgraded
    const nextIdx = this.stepIndex + 1;
    if (nextIdx >= STEPS.length) return;

    this.dismissCard();
    this.stepIndex = nextIdx;
    this.stepElapsed = 0;
    this.showStep(this.stepIndex);
  }

  destroy(): void {
    this.dismissCard();
  }

  // ── Enemy script runner ─────────────────────────────────────

  private runEnemyScript(state: GameState, deploy: TutorialDeployCallback): void {
    for (const action of ENEMY_SCRIPT) {
      if (action.done) continue;
      if (this.totalElapsed < action.triggerTime) continue;

      // Check that source planets still belong to enemy_a
      const validSources = action.from.filter(id => {
        const p = state.planets.get(id);
        return p && p.faction === 'enemy_a' && p.particles >= 5;
      });

      // Check target still exists
      const target = state.planets.get(action.to);

      if (validSources.length > 0 && target) {
        deploy(validSources, action.to);
      }

      action.done = true; // mark done regardless (don't retry)
    }
  }

  // ── Card rendering ──────────────────────────────────────────

  private showStep(idx: number): void {
    const step = STEPS[idx];
    if (!step) return;

    const card = document.createElement('div');
    card.id = 'tutorial-card';
    card.style.cssText = `
      position: absolute;
      bottom: 100px;
      left: 50%;
      transform: translateX(-50%) translateY(20px);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      padding: 20px 28px;
      background: rgba(0, 0, 12, 0.88);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid rgba(79, 195, 247, 0.3);
      border-radius: 16px;
      box-shadow: 0 0 40px rgba(79, 195, 247, 0.12), 0 8px 32px rgba(0,0,0,0.7);
      max-width: min(480px, 88vw);
      min-width: 280px;
      z-index: 100;
      pointer-events: auto;
      opacity: 0;
      transition: opacity 0.4s ease, transform 0.4s ease;
      text-align: center;
      user-select: none;
    `;

    // Step counter badge
    const badge = document.createElement('div');
    badge.textContent = `STEP ${idx + 1} / ${STEPS.length}`;
    badge.style.cssText = `
      font-family: 'Rajdhani', sans-serif;
      font-size: 0.65rem;
      font-weight: 700;
      color: rgba(79, 195, 247, 0.5);
      letter-spacing: 0.2em;
      text-transform: uppercase;
    `;
    card.appendChild(badge);

    // Progress bar
    const progressBar = document.createElement('div');
    progressBar.style.cssText = `
      width: 100%;
      height: 2px;
      background: rgba(255,255,255,0.08);
      border-radius: 1px;
      overflow: hidden;
      margin-bottom: 4px;
    `;
    const progressFill = document.createElement('div');
    progressFill.style.cssText = `
      height: 100%;
      width: ${Math.round(((idx) / STEPS.length) * 100)}%;
      background: linear-gradient(90deg, #4fc3f7, #81d4fa);
      border-radius: 1px;
      transition: width 0.6s ease;
    `;
    progressBar.appendChild(progressFill);
    card.appendChild(progressBar);

    // Icon
    const icon = document.createElement('div');
    icon.textContent = step.icon;
    icon.style.cssText = `
      font-size: 2.2rem;
      line-height: 1;
      margin-top: 4px;
      filter: drop-shadow(0 0 8px rgba(79,195,247,0.4));
    `;
    card.appendChild(icon);

    // Heading
    const heading = document.createElement('div');
    heading.textContent = step.heading;
    heading.style.cssText = `
      font-family: 'Orbitron', sans-serif;
      font-size: clamp(0.95rem, 2.5vw, 1.15rem);
      font-weight: 900;
      color: #4fc3f7;
      letter-spacing: 0.08em;
      text-shadow: 0 0 12px rgba(79,195,247,0.4);
    `;
    card.appendChild(heading);

    // Body
    const body = document.createElement('div');
    body.textContent = step.body;
    body.style.cssText = `
      font-family: 'Rajdhani', sans-serif;
      font-size: clamp(0.85rem, 2vw, 0.98rem);
      color: rgba(255, 255, 255, 0.75);
      line-height: 1.5;
      letter-spacing: 0.02em;
    `;
    card.appendChild(body);

    // Tap-to-continue cue (only for non-auto-dismiss steps)
    if (!step.autoDismiss) {
      const cue = document.createElement('div');
      cue.textContent = '▶ Tap anywhere to continue';
      cue.style.cssText = `
        font-family: 'Rajdhani', sans-serif;
        font-size: 0.72rem;
        color: rgba(79, 195, 247, 0.45);
        letter-spacing: 0.12em;
        margin-top: 6px;
        animation: tutorial-pulse 1.8s ease-in-out infinite;
      `;
      card.appendChild(cue);

      // Click anywhere to advance
      const clickHandler = (e: MouseEvent) => {
        // Don't dismiss if clicking the card itself before reading
        if (this.stepElapsed < 1.5) return;
        e.stopPropagation();
        document.removeEventListener('click', clickHandler, true);
        this.advance(null as unknown as GameState);
      };
      // Small delay before accepting clicks (avoid accidental dismiss)
      setTimeout(() => {
        document.addEventListener('click', clickHandler, true);
      }, 1500);
    }

    // Build arrow element
    let arrowEl: HTMLElement | null = null;
    if (step.pointAtPlanet) {
      arrowEl = document.createElement('div');
      arrowEl.style.cssText = `
        position: absolute;
        width: 0;
        height: 0;
        pointer-events: none;
        z-index: 101;
        transform: translate(-50%, -50%);
        filter: drop-shadow(0 0 6px rgba(79,195,247,0.8));
      `;
      // Inner pulsing dot
      const dot = document.createElement('div');
      dot.style.cssText = `
        position: absolute;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        background: rgba(79,195,247,0.5);
        border: 2px solid #4fc3f7;
        transform: translate(-50%, -50%);
        animation: tutorial-ping 1.2s ease-in-out infinite;
      `;
      arrowEl.appendChild(dot);
      this.container.appendChild(arrowEl);
    }

    this.container.appendChild(card);

    // Inject keyframe animations if not already present
    this.ensureAnimations();

    // Animate in
    requestAnimationFrame(() => {
      card.style.opacity = '1';
      card.style.transform = 'translateX(-50%) translateY(0)';
    });

    this.card = { element: card, arrowElement: arrowEl };
  }

  private dismissCard(): void {
    if (!this.card) return;
    const { element, arrowElement } = this.card;
    element.style.opacity = '0';
    element.style.transform = 'translateX(-50%) translateY(20px)';
    arrowElement?.remove();
    setTimeout(() => element.remove(), 420);
    this.card = null;
  }

  private updateArrow(arrow: HTMLElement, screenX: number, screenY: number): void {
    arrow.style.left = `${screenX}px`;
    arrow.style.top  = `${screenY}px`;
  }

  private ensureAnimations(): void {
    if (document.getElementById('tutorial-animations')) return;
    const style = document.createElement('style');
    style.id = 'tutorial-animations';
    style.textContent = `
      @keyframes tutorial-ping {
        0%, 100% { transform: translate(-50%, -50%) scale(1);   opacity: 0.9; }
        50%       { transform: translate(-50%, -50%) scale(1.6); opacity: 0.4; }
      }
      @keyframes tutorial-pulse {
        0%, 100% { opacity: 0.45; }
        50%       { opacity: 0.9;  }
      }
    `;
    document.head.appendChild(style);
  }
}
