// ============================================================
// AIController.ts — Heuristic state-machine AI for LUX
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
import { scoreRoute, isGammaDangerous, computeWaypoint } from './HazardPathChecker';
import type { EventBus } from '../core/EventBus';

/** The four mutually exclusive high-level intentions the AI can be in. */
type AIState = 'defend' | 'conquer_neutral' | 'upgrade' | 'attack';

/** Callback signature for deploying particles from one set of planets to a target. */
export type DeployCallback = (fromIds: string[], targetPlanetId: string, stationedParticleIds?: number[], waypointX?: number, waypointY?: number) => void;

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
   * Hazard route score threshold. Routes scoring below this are considered
   * dangerous and the AI will try to reroute or find a different target.
   * −1000 = lethal hazard; −500 = storm; 0 = no hazards.
   * Set to a very negative value to effectively disable hazard avoidance.
   */
  hazardToleranceThreshold: number;
  /** Whether this sub-role will compute a waypoint to route around hazards. */
  usesWaypoints: boolean;
  /**
   * Weight: how strongly the AI prioritises expanding (neutral captures) over
   * attacking enemy planets (0–1).
   */
  expandWeight: number;
  /** Max upgrade level the AI will pursue. */
  maxUpgrade: UpgradeLevel;
}

// ---------------------------------------------------------------------------
// AIWave — a tracked group of in-flight particles bound for a target
// ---------------------------------------------------------------------------

interface AIWave {
  faction: Faction;
  targetPlanetId: string;
  particleIds: number[];
  originalTargetFaction: Faction;
  sentAt: number;         // performance.now() when dispatched
  waypointX?: number;
  waypointY?: number;
}

const STRATEGIES: Record<AISubRole, AIStrategy> = {
  // ── EASY ────────────────────────────────────────────────────────────────────
  easy_turtle: {
    evalInterval:     5.5,
    evalJitter:       1.5,
    minToDeploy:      18,
    reserveParticles: 15,
    aggressionRatio:  2.5,
    upgradeTrigger:   80,
    neutralAttackCap: 3,
    upgradeFraction:  0.35,
    neutralFraction:  0.45,
    attackFraction:   0.40,
    upgradeWeight:    0.6,
    expandWeight:     0.7,
    maxUpgrade:       2,
    hazardToleranceThreshold: -999,  // only avoids BHs (lethal = -1000)
    usesWaypoints:    false,
  },

  // ── NORMAL ──────────────────────────────────────────────────────────────────
  fortress: {
    evalInterval:     3.5,
    evalJitter:       1.0,
    minToDeploy:      12,
    reserveParticles: 10,
    aggressionRatio:  1.4,
    upgradeTrigger:   40,
    neutralAttackCap: 8,
    upgradeFraction:  0.55,
    neutralFraction:  0.55,
    attackFraction:   0.45,
    upgradeWeight:    0.75,
    expandWeight:     0.65,
    maxUpgrade:       3,
    hazardToleranceThreshold: -79,   // avoids BHs, storms, and slow zones
    usesWaypoints:    true,
  },
  balanced: {
    evalInterval:     2.8,
    evalJitter:       0.8,
    minToDeploy:      8,
    reserveParticles: 5,
    aggressionRatio:  1.2,
    upgradeTrigger:   30,
    neutralAttackCap: 8,
    upgradeFraction:  0.50,
    neutralFraction:  0.65,
    attackFraction:   0.60,
    upgradeWeight:    0.60,
    expandWeight:     0.75,
    maxUpgrade:       3,
    hazardToleranceThreshold: -499,  // avoids BHs and storms; ignores slow zones
    usesWaypoints:    true,
  },
  opportunist: {
    evalInterval:     2.0,
    evalJitter:       0.6,
    minToDeploy:      8,
    reserveParticles: 4,
    aggressionRatio:  1.0,
    upgradeTrigger:   25,
    neutralAttackCap: 10,
    upgradeFraction:  0.35,
    neutralFraction:  0.70,
    attackFraction:   0.75,
    upgradeWeight:    0.40,
    expandWeight:     0.80,
    maxUpgrade:       3,
    hazardToleranceThreshold: -499,  // avoids BHs and storms
    usesWaypoints:    true,
  },
  expander: {
    evalInterval:     2.4,
    evalJitter:       0.6,
    minToDeploy:      7,
    reserveParticles: 3,
    aggressionRatio:  1.5,
    upgradeTrigger:   35,
    neutralAttackCap: 20,
    upgradeFraction:  0.30,
    neutralFraction:  0.85,
    attackFraction:   0.50,
    upgradeWeight:    0.25,
    expandWeight:     0.98,
    maxUpgrade:       3,
    hazardToleranceThreshold: -999,  // avoids BHs; ignores storms
    usesWaypoints:    true,
  },

  // ── HARD ────────────────────────────────────────────────────────────────────
  berserker: {
    evalInterval:     1.5,
    evalJitter:       0.5,
    minToDeploy:      6,
    reserveParticles: 2,
    aggressionRatio:  0.9,
    upgradeTrigger:   20,
    neutralAttackCap: 20,
    upgradeFraction:  0.25,
    neutralFraction:  0.70,
    attackFraction:   0.90,
    upgradeWeight:    0.20,
    expandWeight:     0.50,
    maxUpgrade:       3,
    hazardToleranceThreshold: -9999, // charges through everything — no avoidance
    usesWaypoints:    false,
  },
  economic: {
    evalInterval:     2.5,
    evalJitter:       0.8,
    minToDeploy:      8,
    reserveParticles: 4,
    aggressionRatio:  1.6,
    upgradeTrigger:   25,
    neutralAttackCap: 5,
    upgradeFraction:  0.75,
    neutralFraction:  0.50,
    attackFraction:   0.65,
    upgradeWeight:    0.90,
    expandWeight:     0.55,
    maxUpgrade:       3,
    hazardToleranceThreshold: -499,  // avoids BHs and storms
    usesWaypoints:    true,
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
    neutralFraction:  0.90,
    attackFraction:   0.80,
    upgradeWeight:    0.25,
    expandWeight:     0.90,
    maxUpgrade:       2,
    hazardToleranceThreshold: -999,  // avoids only BHs, ignores storms
    usesWaypoints:    true,
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
    hazardToleranceThreshold: -499,  // avoids BHs and storms
    usesWaypoints:    true,
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

  /** Seconds each faction has been in 'defend' state consecutively — triggers pressure valve. */
  private defendTimers: Map<Faction, number>;

  /** Rolling buffer of recent deploy events (any faction) for backcap detection. */
  private recentDeployEvents: Array<{ planetId: string; faction: Faction; time: number; orbitCountBefore: number }> = [];

  /** Per-faction: planet IDs recently deployed FROM (with cooldown). */
  private aggressorCooldowns: Map<string, number> = new Map(); // planetId -> seconds remaining

  /** Active waves: groups of particles in flight toward a tracked target. */
  private activeWaves: AIWave[] = [];

  /** Planet capture events queued for re-evaluation on next update tick. */
  private _pendingCaptureEvals: Array<{ planetId: string; newFaction: Faction; oldFaction: Faction }> = [];

  /** Unsubscribe handle for the planet:captured event. */
  private _unsubCapture: (() => void) | null = null;

  constructor(factions: Faction[], difficulty: AIDifficulty = 'normal') {
    this.factions   = factions;
    this.timers     = new Map();
    this.evalIntervals = new Map();
    this.states     = new Map();
    this.subRoles   = new Map();
    this.strategies = new Map();
    this.defendTimers = new Map();

    for (const faction of factions) {
      const role     = pickSubRole(difficulty);
      const strategy = STRATEGIES[role];

      this.subRoles.set(faction, role);
      this.strategies.set(faction, strategy);
      this.timers.set(faction, Math.random() * strategy.evalInterval);
      this.evalIntervals.set(faction, this.randomInterval(strategy));
      this.states.set(faction, 'defend');
      this.defendTimers.set(faction, 0);

      console.log(`[AI] faction=${faction} difficulty=${difficulty} sub-role=${role}`);
    }
  }

  /**
   * Subscribe to EventBus events needed by the AI.
   * Call this once after construction, before the first update().
   */
  subscribeEvents(eventBus: EventBus): void {
    this._unsubCapture = eventBus.on('planet:captured', (payload) => {
      this._pendingCaptureEvals.push(payload);
    });
  }

  /** Unsubscribe all EventBus listeners (call when the game ends / AI is torn down). */
  destroy(): void {
    this._unsubCapture?.();
    this._unsubCapture = null;
  }

  // -------------------------------------------------------------------------
  // Public update — called every frame from GameScene
  // -------------------------------------------------------------------------

  update(dt: number, state: GameState, deployCallback: DeployCallback): void {
    if (!state.running) return;

    // Tick aggressor cooldowns
    for (const [planetId, remaining] of this.aggressorCooldowns) {
      const next = remaining - dt;
      if (next <= 0) this.aggressorCooldowns.delete(planetId);
      else this.aggressorCooldowns.set(planetId, next);
    }

    // Expire old deploy events (> 12s)
    const cutoff = performance.now() - 12000;
    this.recentDeployEvents = this.recentDeployEvents.filter(e => e.time > cutoff);

    // Prune completed waves (particles that are dead or no longer traveling)
    this.activeWaves = this.activeWaves.filter(wave => {
      const alive = wave.particleIds.some(id => {
        const p = state.particles.find(p => p.id === id);
        return p && p.alive && (p.mode === 'traveling' || p.mode === 'combat');
      });
      return alive;
    });

    // Process planet-captured events for wave re-evaluation
    for (const captureEvent of this._pendingCaptureEvals) {
      this._reevaluateWavesForCapture(captureEvent, state, deployCallback);
    }
    this._pendingCaptureEvals = [];

    for (const faction of this.factions) {
      const elapsed  = (this.timers.get(faction) ?? 0) + dt;
      const interval = this.evalIntervals.get(faction) ?? 3.0;

      // Tick defend timer
      if (this.states.get(faction) === 'defend') {
        this.defendTimers.set(faction, (this.defendTimers.get(faction) ?? 0) + dt);
      } else {
        this.defendTimers.set(faction, 0);
      }

      if (elapsed >= interval) {
        this.timers.set(faction, 0);
        this.evalIntervals.set(faction, this.randomInterval(this.strategies.get(faction)!));
        this.evaluate(faction, state, deployCallback);
      } else {
        this.timers.set(faction, elapsed);
      }
    }
  }

  /** Call this whenever any faction deploys units away from a planet. */
  recordDeployEvent(planetId: string, faction: Faction, orbitCountBefore: number): void {
    this.recentDeployEvents.push({ planetId, faction, time: performance.now(), orbitCountBefore });
    // Keep buffer small
    if (this.recentDeployEvents.length > 20) this.recentDeployEvents.shift();
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

    // Gather any stationed particles belonging to this faction
    const stationedParticleIds = state.particles
      .filter((p) => p.alive && p.faction === faction && p.mode === 'stationed')
      .map((p) => p.id);

    if (ownPlanets.length === 0) {
      this.states.set(faction, 'defend');
      return;
    }

    const totalParticles = this.getTotalParticles(faction, state);

    // Find strongest enemy's particle count
    const enemyTotals = new Map<Faction, number>();
    for (const p of state.particles) {
      if (p.alive && p.faction !== 'neutral' && p.faction !== faction) {
        enemyTotals.set(p.faction, (enemyTotals.get(p.faction) || 0) + 1);
      }
    }
    let strongestEnemyParticles = 0;
    for (const count of enemyTotals.values()) {
      if (count > strongestEnemyParticles) strongestEnemyParticles = count;
    }

    const sourcePlanets = ownPlanets.filter(
      (p) => this.getOrbitingCount(p.id, state) > strategy.minToDeploy &&
             !this.aggressorCooldowns.has(p.id),
    );

    // --- Branch 0: Backcap — opportunistically attack a just-vacated planet ---
    if (sourcePlanets.length > 0 || stationedParticleIds.length > 0) {
      const backcapTarget = this._findBackcapTarget(faction, state);
      if (backcapTarget !== null) {
        const localSource = this.nearestPlanet(sourcePlanets, backcapTarget);
        if (localSource !== null || stationedParticleIds.length > 0) {
          const localOrbit = localSource ? this.getOrbitingCount(localSource.id, state) : 0;
          if (localOrbit + stationedParticleIds.length > backcapTarget.health + strategy.reserveParticles) {
            this.states.set(faction, 'attack');
            this.deployParticles(localSource ? [localSource] : [], backcapTarget, deployCallback, strategy.attackFraction, stationedParticleIds, state);
            if (localSource) this.aggressorCooldowns.set(localSource.id, 8);
            return;
          }
        }
      }
    }

    // --- Branch 1: Upgrade ---
    const wantsUpgrade = Math.random() < strategy.upgradeWeight;
    if (wantsUpgrade && (sourcePlanets.length > 0 || stationedParticleIds.length > 0) && totalParticles >= strategy.upgradeTrigger) {
      const bestUpgradePlanet = this.findBestPlanetToUpgrade(ownPlanets, strategy.maxUpgrade);
      if (bestUpgradePlanet !== null) {
        this.states.set(faction, 'upgrade');
        const nearest = this.nearestPlanet(sourcePlanets, bestUpgradePlanet);
        if (nearest !== null && nearest.id !== bestUpgradePlanet.id) {
          this.deployParticles([nearest], bestUpgradePlanet, deployCallback, strategy.upgradeFraction, stationedParticleIds, state);
          this.aggressorCooldowns.set(nearest.id, 5);
        } else if (nearest !== null) {
          const alt = sourcePlanets.find((p) => p.id !== nearest.id) ?? null;
          if (alt !== null) {
            this.deployParticles([alt], bestUpgradePlanet, deployCallback, strategy.upgradeFraction, stationedParticleIds, state);
            this.aggressorCooldowns.set(alt.id, 5);
          } else if (stationedParticleIds.length > 0) {
            this.deployParticles([], bestUpgradePlanet, deployCallback, strategy.upgradeFraction, stationedParticleIds, state);
          }
        } else if (stationedParticleIds.length > 0) {
          this.deployParticles([], bestUpgradePlanet, deployCallback, strategy.upgradeFraction, stationedParticleIds, state);
        }
        return;
      }
    }

    // --- Branch 2: Conquer Neutral ---
    const wantsExpand = Math.random() < strategy.expandWeight;
    const weakestNeutral = this.findWeakestNeutral(state, faction);
    if (
      wantsExpand &&
      weakestNeutral !== null &&
      weakestNeutral.health < strategy.neutralAttackCap &&
      (sourcePlanets.length > 0 || stationedParticleIds.length > 0)
    ) {
      this.states.set(faction, 'conquer_neutral');
      const nearest = this.nearestPlanet(sourcePlanets, weakestNeutral);
      if (nearest !== null) {
        this.deployParticles([nearest], weakestNeutral, deployCallback, strategy.neutralFraction, stationedParticleIds, state);
        this.aggressorCooldowns.set(nearest.id, 6);
      } else if (stationedParticleIds.length > 0) {
        this.deployParticles([], weakestNeutral, deployCallback, strategy.neutralFraction, stationedParticleIds, state);
      }
      return;
    }

    // --- Branch 2.5: Opportunity Attack (local advantage) ---
    // Attack a nearby enemy planet even if globally behind, if locally strong enough
    if (sourcePlanets.length > 0 || stationedParticleIds.length > 0) {
      const opportunityTarget = this._findOpportunityTarget(faction, sourcePlanets, state, stationedParticleIds.length);
      if (opportunityTarget !== null) {
        const src = this.nearestPlanet(sourcePlanets, opportunityTarget);
        this.states.set(faction, 'attack');
        this.deployParticles(src ? [src] : [], opportunityTarget, deployCallback, strategy.attackFraction, stationedParticleIds, state);
        if (src) this.aggressorCooldowns.set(src.id, 8);
        return;
      }
    }

    // --- Branch 3: Attack (global advantage) ---
    if (
      totalParticles > strongestEnemyParticles * strategy.aggressionRatio &&
      (sourcePlanets.length > 0 || stationedParticleIds.length > 0)
    ) {
      const target = this.findAttackTarget(state, faction);
      if (target !== null) {
        this.states.set(faction, 'attack');
        const src = this.nearestPlanet(sourcePlanets, target);
        this.deployParticles(src ? [src] : [], target, deployCallback, strategy.attackFraction, stationedParticleIds, state);
        if (src) this.aggressorCooldowns.set(src.id, 8);
        return;
      }
    }

    // --- Branch 4: Defend timeout pressure valve ---
    // If stuck in defend for 15+ seconds, force an action regardless of ratios
    const defendTime = this.defendTimers.get(faction) ?? 0;
    if (defendTime >= 15 && (sourcePlanets.length > 0 || stationedParticleIds.length > 0)) {
      this.defendTimers.set(faction, 0);
      // Try neutral first; if none, attack weakest enemy
      const neutral = this.findWeakestNeutral(state, faction);
      const forceSrc = this.nearestPlanet(sourcePlanets, neutral ?? ownPlanets[0]);
      if (forceSrc !== null || stationedParticleIds.length > 0) {
        if (neutral !== null) {
          this.states.set(faction, 'conquer_neutral');
          this.deployParticles(forceSrc ? [forceSrc] : [], neutral, deployCallback, strategy.neutralFraction, stationedParticleIds, state);
          if (forceSrc) this.aggressorCooldowns.set(forceSrc.id, 6);
        } else {
          const anyEnemy = this.findAttackTarget(state, faction);
          if (anyEnemy !== null) {
            this.states.set(faction, 'attack');
            this.deployParticles(forceSrc ? [forceSrc] : [], anyEnemy, deployCallback, strategy.attackFraction * 0.5, stationedParticleIds, state);
            if (forceSrc) this.aggressorCooldowns.set(forceSrc.id, 8);
          }
        }
        return;
      }
    }

    // --- Branch 5: Defend (accumulate) ---
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
    for (const particle of state.particles) {
      if (particle.alive && particle.faction === faction) total++;
    }
    return total;
  }

  private getOrbitingCount(planetId: string, state: GameState): number {
    let count = 0;
    for (const particle of state.particles) {
      if (particle.alive && particle.mode === 'orbiting' && particle.homePlanetId === planetId) count++;
    }
    return count;
  }

  private isPlanetVisible(target: PlanetData, faction: Faction, state: GameState): boolean {
    if (!state.fogOfWarConfig?.enabled) return true;
    if (state.tick * (1/60) < 5) return true;
    if (target.faction === faction) return true;

    const diffMap: Record<string, number> = {
      'easy_turtle': 1,
      'fortress': 1.25,
      'balanced': 1.25,
      'opportunist': 1.25,
      'expander': 1.25,
      'berserker': 2.0,
      'economic': 2.0,
      'blitzkrieg': 2.0,
      'dominator': 2.0
    };
    const subRole = this.subRoles.get(faction) as string;
    const diff = diffMap[subRole] || 1;

    for (const p of state.planets.values()) {
      if (p.faction === faction) {
        let r = 500;
        if (p.upgradeLevel === 2) r = 850;
        if (p.upgradeLevel === 3) r = 1300;
        r *= diff;
        const dx = target.x - p.x;
        const dy = target.y - p.y;
        if (dx*dx + dy*dy <= r*r) return true;
      }
    }
    return false;
  }

  private findWeakestNeutral(state: GameState, faction: Faction): PlanetData | null {
    let best: PlanetData | null = null;
    for (const planet of state.planets.values()) {
      if (planet.faction === 'neutral') {
        if (!this.isPlanetVisible(planet, faction, state)) continue;
        if (best === null || planet.health < best.health) best = planet;
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
        if (!this.isPlanetVisible(planet, faction, state)) continue;
        if (best === null || planet.health < best.health) best = planet;
      }
      return best;
    }

    // Default: target weakest non-self, non-neutral planet
    let best: PlanetData | null = null;
    for (const planet of state.planets.values()) {
      if (planet.faction !== faction && planet.faction !== 'neutral') {
        if (!this.isPlanetVisible(planet, faction, state)) continue;
        if (best === null || planet.health < best.health) best = planet;
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
        planet.health > best.health
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
    stationedParticleIds?: number[],
    state?: GameState
  ): void {
    if (sources.length === 0 && (!stationedParticleIds || stationedParticleIds.length === 0)) return;

    let waypointX: number | undefined;
    let waypointY: number | undefined;

    if (state && sources.length > 0) {
      const faction = sources[0].faction;
      const strategy = this.strategies.get(faction)!;
      const src = sources[0];

      // Gamma ray temporal suppression
      if (isGammaDangerous(state, target.x, target.y)) return;

      const routeScore = scoreRoute(state, src.x, src.y, target.x, target.y);
      if (routeScore < strategy.hazardToleranceThreshold) {
        if (strategy.usesWaypoints) {
          const wp = computeWaypoint(
            src.x, src.y, target.x, target.y,
            state, state.worldWidth, state.worldHeight, 50
          );
          if (wp) { waypointX = wp.wpx; waypointY = wp.wpy; }
        }
        // No waypoint found or role doesn't use them — deploy straight (graceful degradation)
      }
    }

    deployCallback(sources.map((p) => p.id), target.id, stationedParticleIds, waypointX, waypointY);
  }

  // -------------------------------------------------------------------------
  // Wave re-evaluation (Part 1: in-flight re-evaluation on planet capture)
  // -------------------------------------------------------------------------

  private _reevaluateWavesForCapture(
    event: { planetId: string; newFaction: Faction; oldFaction: Faction },
    state: GameState,
    deployCallback: DeployCallback,
  ): void {
    const affected = this.activeWaves.filter(w => w.targetPlanetId === event.planetId);
    if (affected.length === 0) return;

    const capturedPlanet = state.planets.get(event.planetId);

    for (const wave of affected) {
      if (wave.faction === event.newFaction) {
        // We captured our own target — wave will orbit on arrival, no action needed
        continue;
      }

      const strategy = this.strategies.get(wave.faction)!;
      const waveParticles = state.particles.filter(
        p => p.alive && wave.particleIds.includes(p.id) && (p.mode === 'traveling' || p.mode === 'combat')
      );
      if (waveParticles.length === 0) continue;

      // Evaluate "point of no return": are particles closer to target or to a friendly planet?
      const ownPlanets = this.getOwnPlanets(wave.faction, state);
      const avgX = waveParticles.reduce((s, p) => s + p.x, 0) / waveParticles.length;
      const avgY = waveParticles.reduce((s, p) => s + p.y, 0) / waveParticles.length;

      const targetPlanet = capturedPlanet;
      const distToTarget = targetPlanet
        ? Math.sqrt((targetPlanet.x - avgX) ** 2 + (targetPlanet.y - avgY) ** 2)
        : Infinity;

      const nearestFriendly = this.nearestPlanet(ownPlanets, { x: avgX, y: avgY } as PlanetData);
      const distToFriend = nearestFriendly
        ? Math.sqrt((nearestFriendly.x - avgX) ** 2 + (nearestFriendly.y - avgY) ** 2)
        : Infinity;

      const isPastPointOfNoReturn = distToTarget <= distToFriend;

      // Compute new defense strength at captured planet
      const newDefense = capturedPlanet
        ? (capturedPlanet.health + this.getOrbitingCount(capturedPlanet.id, state))
        : 0;
      const waveStrength = waveParticles.length;
      const subRole = this.subRoles.get(wave.faction)!;

      if (isPastPointOfNoReturn) {
        // Can't turn back — commit or accept as sacrifice
        // berserker, blitzkrieg: always commit (do nothing)
        // others: only commit if we can still win
        if (subRole !== 'berserker' && subRole !== 'blitzkrieg' && subRole !== 'easy_turtle') {
          if (waveStrength < newDefense * 0.8) {
            // Sacrifice — accept loss, let them fly in — nothing to do
          }
          // else: still a winnable fight, commit silently
        }
      } else {
        // Can still redirect — decide what to do
        const waveParticleIds = waveParticles.map(p => p.id);

        if (subRole === 'fortress' || subRole === 'economic' || subRole === 'dominator') {
          // Recall to nearest friendly planet
          if (nearestFriendly) {
            deployCallback([], nearestFriendly.id, waveParticleIds);
          }
        } else if (subRole === 'opportunist' || subRole === 'expander' || subRole === 'blitzkrieg') {
          // Redirect to best available neutral or weakest enemy
          const altNeutral = this.findWeakestNeutral(state, wave.faction);
          const altEnemy = altNeutral ? null : this.findAttackTarget(state, wave.faction);
          const altTarget = altNeutral ?? altEnemy;
          if (altTarget) {
            deployCallback([], altTarget.id, waveParticleIds);
          } else if (nearestFriendly) {
            deployCallback([], nearestFriendly.id, waveParticleIds);
          }
        } else if (subRole === 'balanced') {
          // Commit if odds are decent, else recall
          if (waveStrength >= newDefense * 1.0) {
            // Keep going — do nothing
          } else if (nearestFriendly) {
            deployCallback([], nearestFriendly.id, waveParticleIds);
          }
        }
        // easy_turtle: do nothing (too dumb to redirect)
      }
    }
  }

  // -------------------------------------------------------------------------
  // Spatial helpers
  // -------------------------------------------------------------------------

  private richestPlanet(planets: PlanetData[], state?: GameState): PlanetData | null {
    if (planets.length === 0) return null;
    if (!state) return planets[0]; // fallback
    return planets.reduce((best, p) => (this.getOrbitingCount(p.id, state) > this.getOrbitingCount(best.id, state) ? p : best));
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

  /**
   * Backcap: scan recent deploy events for enemy planets that just sent units away
   * and are now weakly defended.
   */
  private _findBackcapTarget(faction: Faction, state: GameState): PlanetData | null {
    const now = performance.now();
    let best: PlanetData | null = null;
    let bestScore = 0;

    for (const event of this.recentDeployEvents) {
      const age = (now - event.time) / 1000; // seconds
      if (age > 10) continue; // only care about last 10s
      if (event.faction === faction) continue; // don't backcap ourselves

      const planet = state.planets.get(event.planetId);
      if (!planet || planet.faction === faction || planet.faction === 'neutral') continue;
      if (!this.isPlanetVisible(planet, faction, state)) continue;

      const currentOrbit = this.getOrbitingCount(event.planetId, state);
      const depleted = event.orbitCountBefore - currentOrbit;
      // Score: how depleted is it relative to what it was?
      const score = depleted > 0 ? depleted / Math.max(1, currentOrbit + planet.health) : 0;
      if (score > bestScore && currentOrbit < 15) {
        bestScore = score;
        best = planet;
      }
    }
    return best;
  }

  /**
   * Opportunity attack: find an enemy planet that is locally weak enough
   * for one of our source planets to take it on, even without global advantage.
   */
  private _findOpportunityTarget(faction: Faction, sourcePlanets: PlanetData[], state: GameState, stationedCount: number): PlanetData | null {
    const OPPORTUNITY_RANGE_SQ = 350 * 350; // within 350px
    let best: PlanetData | null = null;
    let bestScore = Infinity;

    for (const planet of state.planets.values()) {
      if (planet.faction === faction || planet.faction === 'neutral') continue;
      if (!this.isPlanetVisible(planet, faction, state)) continue;
      const enemyOrbit = this.getOrbitingCount(planet.id, state);
      const totalDefense = enemyOrbit + planet.health;

      // If we have no source planets, but we have stationed particles, check if stationed is enough
      if (sourcePlanets.length === 0) {
        if (stationedCount > totalDefense * 1.5) {
          const score = totalDefense;
          if (score < bestScore) {
            bestScore = score;
            best = planet;
          }
        }
        continue;
      }

      for (const src of sourcePlanets) {
        const dSq = this.distSq(src, planet);
        if (dSq > OPPORTUNITY_RANGE_SQ) continue;
        const myOrbit = this.getOrbitingCount(src.id, state);
        // Only attack if we have a meaningful local advantage
        if (myOrbit + stationedCount > totalDefense * 1.5) {
          if (totalDefense < bestScore) {
            bestScore = totalDefense;
            best = planet;
          }
        }
      }
    }
    return best;
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
