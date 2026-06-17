// ============================================================
// AIController.ts — Heuristic state-machine AI for Alux2Win
// Supports Easy / Normal / Hard difficulty with random sub-roles
// that persist for the lifetime of a single game.
// ============================================================

import {
  Faction,
  GameState,
  PlanetData,
  UpgradeLevel,
} from '../types';
import type { AIDifficulty } from '../core/SettingsStore';

/** The four mutually exclusive high-level intentions the AI can be in. */
type AIState = 'defend' | 'conquer_neutral' | 'upgrade' | 'attack';

/** Callback signature for deploying particles from one set of planets to a target. */
export type DeployCallback = (fromIds: string[], targetPlanetId: string) => void;

// ---------------------------------------------------------------------------
// Sub-roles
// ---------------------------------------------------------------------------

/**
 * Sub-roles for NORMAL difficulty. The AI picks one randomly at game start
 * and sticks to it for the entire game.
 *
 *  fortress    – builds a strong defensive core, expands slowly, rarely attacks
 *               unless overwhelmingly ahead.
 *  balanced    – sensible mix of expansion, defence and offence.
 *  opportunist – watches for openings; strikes weak enemy planets but retreats
 *               when behind.
 *  expander    – races to claim every neutral planet before engaging enemies.
 */
type NormalSubRole = 'fortress' | 'balanced' | 'opportunist' | 'expander';

/**
 * Sub-roles for HARD difficulty.
 *
 *  berserker   – attacks at every opportunity, minimal defence, go for broke.
 *  economic    – upgrades everything first, then attacks with superior firepower.
 *  blitzkrieg  – fast-rush: grabs neutrals immediately and strikes early.
 *  dominator   – methodically eliminates the weakest faction first, then the next.
 */
type HardSubRole = 'berserker' | 'economic' | 'blitzkrieg' | 'dominator';

type AISubRole = NormalSubRole | HardSubRole | 'easy_turtle';

// ---------------------------------------------------------------------------
// Strategy parameter table
// ---------------------------------------------------------------------------

interface AIStrategy {
  /** Seconds between each AI evaluation tick. Higher = slower reactions. */
  evalInterval: number;
  /** +/- jitter on the interval */
  evalJitter: number;
  /** Minimum particles on a planet before it can be a deploy source. */
  minToDeploy: number;
  /** Particles kept in reserve on source planet — never sent away. */
  reserveParticles: number;
  /** Ratio of AI total / player total that unlocks the attack branch. */
  aggressionRatio: number;
  /** Total particles the AI must have before it even tries to upgrade. */
  upgradeTrigger: number;
  /** Max particles on a neutral planet the AI will bother attacking. */
  neutralAttackCap: number;
  /** Fraction of surplus particles sent during an upgrade mission. */
  upgradeFraction: number;
  /** Fraction of surplus particles sent during a neutral-capture mission. */
  neutralFraction: number;
  /** Fraction of surplus particles sent in an attack. */
  attackFraction: number;
  /**
   * Weight: how strongly the AI prioritises upgrading over attacking (0–1).
   * 1.0 = always upgrade when possible; 0 = skip upgrade, go straight to attack.
   */
  upgradeWeight: number;
  /**
   * Weight: how strongly the AI prioritises expanding (neutral captures) over
   * attacking enemy planets (0–1).
   */
  expandWeight: number;
  /** Max upgrade level the AI will pursue. */
  maxUpgrade: UpgradeLevel;
}

const STRATEGIES: Record<AISubRole, AIStrategy> = {
  // ── EASY ────────────────────────────────────────────────────────────────────
  easy_turtle: {
    evalInterval:     5.5,
    evalJitter:       1.5,
    minToDeploy:      18,
    reserveParticles: 15,
    aggressionRatio:  2.5,    // needs to be 2.5× the player before attacking
    upgradeTrigger:   80,
    neutralAttackCap: 3,
    upgradeFraction:  0.35,
    neutralFraction:  0.45,
    attackFraction:   0.40,
    upgradeWeight:    0.6,
    expandWeight:     0.7,
    maxUpgrade:       2,
  },

  // ── NORMAL ──────────────────────────────────────────────────────────────────
  fortress: {
    evalInterval:     4.0,
    evalJitter:       1.0,
    minToDeploy:      14,
    reserveParticles: 12,
    aggressionRatio:  2.0,
    upgradeTrigger:   50,
    neutralAttackCap: 4,
    upgradeFraction:  0.55,   // spends a lot on upgrades
    neutralFraction:  0.45,
    attackFraction:   0.35,   // cautious attacker
    upgradeWeight:    0.85,
    expandWeight:     0.55,
    maxUpgrade:       3,
  },
  balanced: {
    evalInterval:     3.0,
    evalJitter:       1.0,
    minToDeploy:      10,
    reserveParticles: 5,
    aggressionRatio:  1.4,
    upgradeTrigger:   40,
    neutralAttackCap: 5,
    upgradeFraction:  0.50,
    neutralFraction:  0.60,
    attackFraction:   0.55,
    upgradeWeight:    0.65,
    expandWeight:     0.70,
    maxUpgrade:       3,
  },
  opportunist: {
    evalInterval:     2.5,
    evalJitter:       0.8,
    minToDeploy:      10,
    reserveParticles: 6,
    aggressionRatio:  1.3,    // strikes when barely ahead
    upgradeTrigger:   35,
    neutralAttackCap: 6,
    upgradeFraction:  0.40,
    neutralFraction:  0.65,
    attackFraction:   0.70,   // bold strikes
    upgradeWeight:    0.45,
    expandWeight:     0.75,
    maxUpgrade:       3,
  },
  expander: {
    evalInterval:     2.8,
    evalJitter:       0.7,
    minToDeploy:      8,
    reserveParticles: 4,
    aggressionRatio:  1.8,    // holds off attacking while it expands
    upgradeTrigger:   45,
    neutralAttackCap: 12,     // attacks neutral planets even when they're big
    upgradeFraction:  0.35,
    neutralFraction:  0.80,   // pours resources into expansion
    attackFraction:   0.45,
    upgradeWeight:    0.30,
    expandWeight:     0.95,   // expansion first, always
    maxUpgrade:       3,
  },

  // ── HARD ────────────────────────────────────────────────────────────────────
  berserker: {
    evalInterval:     1.5,
    evalJitter:       0.5,
    minToDeploy:      6,
    reserveParticles: 2,
    aggressionRatio:  0.9,    // attacks even when behind
    upgradeTrigger:   20,
    neutralAttackCap: 20,
    upgradeFraction:  0.25,
    neutralFraction:  0.70,
    attackFraction:   0.90,
    upgradeWeight:    0.20,
    expandWeight:     0.50,
    maxUpgrade:       3,
  },
  economic: {
    evalInterval:     2.5,
    evalJitter:       0.8,
    minToDeploy:      8,
    reserveParticles: 4,
    aggressionRatio:  1.6,
    upgradeTrigger:   25,
    neutralAttackCap: 5,
    upgradeFraction:  0.75,   // almost always upgrading
    neutralFraction:  0.50,
    attackFraction:   0.65,
    upgradeWeight:    0.90,
    expandWeight:     0.55,
    maxUpgrade:       3,
  },
  blitzkrieg: {
    evalInterval:     1.8,
    evalJitter:       0.4,
    minToDeploy:      6,
    reserveParticles: 2,
    aggressionRatio:  1.0,
    upgradeTrigger:   20,
    neutralAttackCap: 15,
    upgradeFraction:  0.30,
    neutralFraction:  0.90,   // rush expansion ultra-aggressively
    attackFraction:   0.80,
    upgradeWeight:    0.25,
    expandWeight:     0.90,
    maxUpgrade:       2,      // doesn't bother with full upgrades — speed wins
  },
  dominator: {
    evalInterval:     2.0,
    evalJitter:       0.6,
    minToDeploy:      8,
    reserveParticles: 4,
    aggressionRatio:  1.1,
    upgradeTrigger:   30,
    neutralAttackCap: 8,
    upgradeFraction:  0.50,
    neutralFraction:  0.60,
    attackFraction:   0.85,
    upgradeWeight:    0.60,
    expandWeight:     0.65,
    maxUpgrade:       3,
  },
};

// ---------------------------------------------------------------------------
// Role pool lookup per difficulty
// ---------------------------------------------------------------------------

const NORMAL_ROLES: NormalSubRole[] = ['fortress', 'balanced', 'opportunist', 'expander'];
const HARD_ROLES:   HardSubRole[]   = ['berserker', 'economic', 'blitzkrieg', 'dominator'];

function pickSubRole(difficulty: AIDifficulty): AISubRole {
  switch (difficulty) {
    case 'easy':   return 'easy_turtle';
    case 'hard':   return HARD_ROLES[Math.floor(Math.random() * HARD_ROLES.length)];
    default:       return NORMAL_ROLES[Math.floor(Math.random() * NORMAL_ROLES.length)];
  }
}

// ---------------------------------------------------------------------------
// AIController
// ---------------------------------------------------------------------------

export class AIController {
  /** All factions managed by this controller. */
  private factions: Faction[];

  /** Accumulated delta-time for each faction. */
  private timers: Map<Faction, number>;

  /** Per-faction randomised evaluation intervals (re-rolled after each decision). */
  private evalIntervals: Map<Faction, number>;

  /** The current high-level state for each faction (for debugging / HUD). */
  private states: Map<Faction, AIState>;

  /** The sub-role chosen for each faction at construction time. */
  private subRoles: Map<Faction, AISubRole>;

  /** The resolved strategy parameters per faction (derived from sub-role). */
  private strategies: Map<Faction, AIStrategy>;

  constructor(factions: Faction[], difficulty: AIDifficulty = 'normal') {
    this.factions   = factions;
    this.timers     = new Map();
    this.evalIntervals = new Map();
    this.states     = new Map();
    this.subRoles   = new Map();
    this.strategies = new Map();

    for (const faction of factions) {
      const role     = pickSubRole(difficulty);
      const strategy = STRATEGIES[role];

      this.subRoles.set(faction, role);
      this.strategies.set(faction, strategy);
      this.timers.set(faction, Math.random() * strategy.evalInterval);
      this.evalIntervals.set(faction, this.randomInterval(strategy));
      this.states.set(faction, 'defend');

      console.log(`[AI] faction=${faction} difficulty=${difficulty} sub-role=${role}`);
    }
  }

  // -------------------------------------------------------------------------
  // Public update — called every frame from GameScene
  // -------------------------------------------------------------------------

  update(dt: number, state: GameState, deployCallback: DeployCallback): void {
    if (!state.running) return;

    for (const faction of this.factions) {
      const elapsed  = (this.timers.get(faction) ?? 0) + dt;
      const interval = this.evalIntervals.get(faction) ?? 3.0;

      if (elapsed >= interval) {
        this.timers.set(faction, 0);
        this.evalIntervals.set(faction, this.randomInterval(this.strategies.get(faction)!));
        this.evaluate(faction, state, deployCallback);
      } else {
        this.timers.set(faction, elapsed);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Core decision logic
  // -------------------------------------------------------------------------

  private evaluate(
    faction: Faction,
    state: GameState,
    deployCallback: DeployCallback,
  ): void {
    const strategy = this.strategies.get(faction)!;
    const ownPlanets = this.getOwnPlanets(faction, state);

    if (ownPlanets.length === 0) {
      this.states.set(faction, 'defend');
      return;
    }

    const totalParticles  = this.getTotalParticles(faction, state);
    const playerParticles = this.getTotalParticles('player', state);

    const sourcePlanets = ownPlanets.filter(
      (p) => p.particles > strategy.minToDeploy,
    );

    // --- Branch 1: Upgrade ---
    // Respect upgradeWeight: higher weight = more eager to upgrade before acting.
    const wantsUpgrade = Math.random() < strategy.upgradeWeight;
    if (wantsUpgrade && sourcePlanets.length > 0 && totalParticles >= strategy.upgradeTrigger) {
      const bestUpgradePlanet = this.findBestPlanetToUpgrade(ownPlanets, strategy.maxUpgrade);
      if (bestUpgradePlanet !== null) {
        this.states.set(faction, 'upgrade');
        const richest = this.richestPlanet(sourcePlanets);
        if (richest !== null && richest.id !== bestUpgradePlanet.id) {
          this.deployParticles([richest], bestUpgradePlanet, deployCallback, strategy.upgradeFraction);
        } else if (richest !== null) {
          const alt = sourcePlanets.find((p) => p.id !== richest.id) ?? null;
          if (alt !== null) {
            this.deployParticles([alt], bestUpgradePlanet, deployCallback, strategy.upgradeFraction);
          }
        }
        return;
      }
    }

    // --- Branch 2: Conquer Neutral ---
    const wantsExpand = Math.random() < strategy.expandWeight;
    const weakestNeutral = this.findWeakestNeutral(state);
    if (
      wantsExpand &&
      weakestNeutral !== null &&
      weakestNeutral.particles < strategy.neutralAttackCap &&
      sourcePlanets.length > 0
    ) {
      this.states.set(faction, 'conquer_neutral');
      const nearest = this.nearestPlanet(sourcePlanets, weakestNeutral);
      if (nearest !== null) {
        this.deployParticles([nearest], weakestNeutral, deployCallback, strategy.neutralFraction);
      }
      return;
    }

    // --- Branch 3: Attack ---
    if (
      totalParticles > playerParticles * strategy.aggressionRatio &&
      sourcePlanets.length > 0
    ) {
      const target = this.findAttackTarget(state, faction);
      if (target !== null) {
        this.states.set(faction, 'attack');
        this.deployParticles(sourcePlanets, target, deployCallback, strategy.attackFraction);
        return;
      }
    }

    // --- Branch 4: Defend (accumulate) ---
    this.states.set(faction, 'defend');
  }

  // -------------------------------------------------------------------------
  // Query helpers
  // -------------------------------------------------------------------------

  private getOwnPlanets(faction: Faction, state: GameState): PlanetData[] {
    const result: PlanetData[] = [];
    for (const planet of state.planets.values()) {
      if (planet.faction === faction) result.push(planet);
    }
    return result;
  }

  private getTotalParticles(faction: Faction, state: GameState): number {
    let total = 0;
    for (const planet of state.planets.values()) {
      if (planet.faction === faction) total += planet.particles;
    }
    for (const particle of state.particles) {
      if (particle.alive && particle.faction === faction) total++;
    }
    return total;
  }

  private findWeakestNeutral(state: GameState): PlanetData | null {
    let best: PlanetData | null = null;
    for (const planet of state.planets.values()) {
      if (planet.faction === 'neutral') {
        if (best === null || planet.particles < best.particles) best = planet;
      }
    }
    return best;
  }

  /**
   * Finds the weakest enemy planet to attack. The dominator sub-role targets
   * the weakest faction systematically; others target the weakest player planet.
   */
  private findAttackTarget(state: GameState, faction: Faction): PlanetData | null {
    const subRole = this.subRoles.get(faction);

    if (subRole === 'dominator') {
      // Find the weakest non-neutral, non-self planet
      let best: PlanetData | null = null;
      for (const planet of state.planets.values()) {
        if (planet.faction === faction || planet.faction === 'neutral') continue;
        if (best === null || planet.particles < best.particles) best = planet;
      }
      return best;
    }

    // Default: target weakest player planet
    let best: PlanetData | null = null;
    for (const planet of state.planets.values()) {
      if (planet.faction === 'player') {
        if (best === null || planet.particles < best.particles) best = planet;
      }
    }
    return best;
  }

  private findBestPlanetToUpgrade(planets: PlanetData[], maxUpgrade: UpgradeLevel): PlanetData | null {
    let best: PlanetData | null = null;
    for (const planet of planets) {
      if (planet.upgradeLevel >= maxUpgrade) continue;
      if (best === null) { best = planet; continue; }
      if (planet.upgradeLevel > best.upgradeLevel) {
        best = planet;
      } else if (
        planet.upgradeLevel === best.upgradeLevel &&
        planet.particles > best.particles
      ) {
        best = planet;
      }
    }
    return best;
  }

  // -------------------------------------------------------------------------
  // Deployment
  // -------------------------------------------------------------------------

  private deployParticles(
    sources: PlanetData[],
    target: PlanetData,
    deployCallback: DeployCallback,
    _fraction: number,
  ): void {
    const strategy = this.strategies.get(this.factions[0])!; // fraction logged only
    const validSources = sources.filter((p) => p.particles > strategy.reserveParticles);
    if (validSources.length === 0) return;
    deployCallback(validSources.map((p) => p.id), target.id);
  }

  // -------------------------------------------------------------------------
  // Spatial helpers
  // -------------------------------------------------------------------------

  private richestPlanet(planets: PlanetData[]): PlanetData | null {
    if (planets.length === 0) return null;
    return planets.reduce((best, p) => (p.particles > best.particles ? p : best));
  }

  private nearestPlanet(planets: PlanetData[], target: PlanetData): PlanetData | null {
    if (planets.length === 0) return null;
    let nearest = planets[0];
    let nearestDistSq = this.distSq(planets[0], target);
    for (let i = 1; i < planets.length; i++) {
      const d = this.distSq(planets[i], target);
      if (d < nearestDistSq) { nearestDistSq = d; nearest = planets[i]; }
    }
    return nearest;
  }

  private distSq(a: { x: number; y: number }, b: { x: number; y: number }): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return dx * dx + dy * dy;
  }

  private randomInterval(strategy: AIStrategy): number {
    return strategy.evalInterval + (Math.random() * 2 - 1) * strategy.evalJitter;
  }

  // -------------------------------------------------------------------------
  // Accessors (for debugging / HUD)
  // -------------------------------------------------------------------------

  getState(faction: Faction): AIState {
    return this.states.get(faction) ?? 'defend';
  }

  getSubRole(faction: Faction): AISubRole | undefined {
    return this.subRoles.get(faction);
  }

  getManagedFactions(): Faction[] {
    return [...this.factions];
  }
}
