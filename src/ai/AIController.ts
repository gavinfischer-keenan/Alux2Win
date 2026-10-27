import {assessSituation} from './assessSituation';
import {unitStrength,effectiveDefense,selectSurplusIds} from './ForceAssessment';
import {WaveTracker} from './WaveTracker';
// ============================================================
// AIController.ts — Heuristic state-machine AI for LUX
// ============================================================

import {
  Faction,
  GameState,
  PlanetData,
  UpgradeLevel,
  PLANET_PRODUCTION,
  PARTICLE_SPEED,
} from '../types';
import type { AIDifficulty } from '../core/SettingsStore';
import { scoreRoute, isGammaDangerous, getGammaRiskForPlanet, computeWaypoint } from './HazardPathChecker';
import type { EventBus } from '../core/EventBus';
import {
  AIState,
  AISubRole,
  AIStrategy,
  FutilityEntry,
  AIWave,
  BreakthroughEntry,
  SituationAssessment,
  STRATEGIES,
  pickSubRole,
} from './AIStrategies';

export type { AIState, AISubRole, AIStrategy } from './AIStrategies';

export type DeployCallback = (fromIds: string[], targetPlanetId: string, stationedParticleIds?: number[], waypointX?: number, waypointY?: number, fraction?: number) => void;

// ---------------------------------------------------------------------------
// AIController
// ---------------------------------------------------------------------------

export class AIController {
  /** All factions managed by this controller. */
  private factions: Faction[];

  /** Stored difficulty for adaptive logic. */
  private _difficulty: AIDifficulty;

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
  private readonly waveTracker = new WaveTracker();

  /** Planet capture events queued for re-evaluation on next update tick. */
  private _pendingCaptureEvals: Array<{ planetId: string; newFaction: Faction; oldFaction: Faction }> = [];

  /** Unsubscribe handle for the planet:captured event. */
  private _unsubCapture: (() => void) | null = null;

  // ── v2 state ──────────────────────────────────────────────

  /** Whether each faction has taken its mandatory first action. */
  private _hasActed: Map<Faction, boolean> = new Map();

  /** Total game time elapsed (seconds), tracked from dt. */
  private _gameElapsed = 0;

  /** Whether the first-tick planet counts have been captured. */
  private _initialPlanetCountsCaptured = false;

  /** Initial planet count per faction (for stagnation detection). */
  private _initialPlanetCounts: Map<Faction, number> = new Map();

  /** Number of adaptive aggression boosts applied per faction. */
  private _adaptiveBoosts: Map<Faction, number> = new Map();

  /** Timestamp (game seconds) of last adaptive boost check. */
  private _lastAdaptiveCheck = 0;

  // ── v3: Breakthrough state ────────────────────────────────

  /**
   * Active breakthrough campaigns per faction.
   * A faction can only run one breakthrough surge at a time.
   * If a new capture event fires while one is running, it extends the timer
   * rather than launching a second surge.
   */
  private _breakthroughs: Map<Faction, BreakthroughEntry> = new Map();

  // ── v4: Futility detection ─────────────────────────────────────────────────────

  /** Active attack campaigns per faction — used to detect futile early assaults. */
  private _futileAttackTracker: Map<Faction, FutilityEntry> = new Map();

  /** Game-seconds timestamp until which each faction is in growth-only mode (no attacks). */
  private _growthPauseUntil: Map<Faction, number> = new Map();

  // ── v5: Lockout timing ────────────────────────────────────────────────

  /**
   * Planets being pre-targeted for a timed attack (waiting for lockout to lift).
   * Map: faction → { planetId, deployAt (game-seconds) }
   */
  private _lockoutTimingTargets: Map<Faction, { planetId: string; deployAt: number }> = new Map();

  constructor(factions: Faction[], difficulty: AIDifficulty = 'normal') {
    this.factions    = factions;
    this._difficulty = difficulty;
    this.timers      = new Map();
    this.evalIntervals = new Map();
    this.states      = new Map();
    this.subRoles    = new Map();
    this.strategies  = new Map();
    this.defendTimers = new Map();

    for (const faction of factions) {
      const role     = pickSubRole(difficulty);
      const strategy = { ...STRATEGIES[role] }; // clone so adaptive boosts are per-faction

      this.subRoles.set(faction, role);
      this.strategies.set(faction, strategy);
      // First tick fires sooner (within 1.5-3s) to break the static opener
      this.timers.set(faction, strategy.evalInterval - (1.5 + Math.random() * 1.5));
      this.evalIntervals.set(faction, this.randomInterval(strategy));
      this.states.set(faction, 'defend');
      this.defendTimers.set(faction, 0);
      this._hasActed.set(faction, false);
      this._adaptiveBoosts.set(faction, 0);
      this._growthPauseUntil.set(faction, 0);
      // _lockoutTimingTargets initialised lazily (no entry = no pending timed attack)

      console.log(`[AI] faction=${faction} difficulty=${difficulty} sub-role=${role}`);
    }
  }

  /**
   * Subscribe to EventBus events needed by the AI.
   * Call this once after construction, before the first update().
   */
  subscribeEvents(eventBus: EventBus): void {
    this._unsubCapture?.();
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

    this._gameElapsed += dt;

    // Capture initial planet counts on first update
    if (!this._initialPlanetCountsCaptured) {
      this._initialPlanetCountsCaptured = true;
      for (const faction of this.factions) {
        this._initialPlanetCounts.set(faction, this.getOwnPlanets(faction, state).length);
      }
    }

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
    this.waveTracker.prune(this.activeWaves, state.particles);

    // ── Tick and expire breakthrough campaigns ───────────────
    for (const [faction, bt] of this._breakthroughs) {
      const age = this._gameElapsed - bt.launchedAt;
      if (age >= bt.consolidateSecs) {
        // Surge window closed — planets either consolidated or were lost.
        // Either way, remove the campaign; normal logic resumes.
        this._breakthroughs.delete(faction);
        if (this.states.get(faction) === 'breakthrough') {
          this.states.set(faction, 'defend');
        }
      }
    }

    // Process planet-captured events for wave re-evaluation AND breakthrough checks
    for (const captureEvent of this._pendingCaptureEvals) {
      this._reevaluateWavesForCapture(captureEvent, state, deployCallback);
      this._evaluateBreakthrough(captureEvent, state, deployCallback);
    }
    this._pendingCaptureEvals = [];

    // ── Adaptive aggression (stagnation detection) ──────────────
    // Check every 60 seconds if a faction has failed to expand
    if (this._gameElapsed - this._lastAdaptiveCheck >= 60) {
      this._lastAdaptiveCheck = this._gameElapsed;
      for (const faction of this.factions) {
        const initialCount = this._initialPlanetCounts.get(faction) ?? 0;
        const currentCount = this.getOwnPlanets(faction, state).length;
        if (currentCount <= initialCount && currentCount > 0) {
          this._applyAdaptiveBoost(faction);
        }
      }
    }

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
  // Adaptive aggression — reduces passivity for stagnating factions
  // -------------------------------------------------------------------------

  private _applyAdaptiveBoost(faction: Faction): void {
    const boosts = (this._adaptiveBoosts.get(faction) ?? 0) + 1;
    this._adaptiveBoosts.set(faction, boosts);

    const strategy = this.strategies.get(faction)!;
    // Each boost makes the AI more aggressive
    strategy.aggressionRatio = Math.max(0.5, strategy.aggressionRatio - 0.15);
    strategy.minToDeploy     = Math.max(3, strategy.minToDeploy - 2);
    strategy.defendTimeout   = Math.max(3, strategy.defendTimeout - 2);
    strategy.expandWeight    = Math.min(1.0, strategy.expandWeight + 0.1);

    // Reset the "has acted" flag to force another colonization attempt
    this._hasActed.set(faction, false);

    console.log(`[AI] Adaptive boost #${boosts} for ${faction}: aggression=${strategy.aggressionRatio.toFixed(2)} minDeploy=${strategy.minToDeploy}`);
  }

  // -------------------------------------------------------------------------
  // Breakthrough mechanic — v3
  // -------------------------------------------------------------------------

  /**
   * Called whenever any planet is captured. If the capturing faction is one
   * we manage AND the strategy allows breakthroughs, we check whether there
   * are nearby enemy planets that are vulnerable and roll the dice.
   *
   * On a successful roll:
   *  1. Identify up to `breakthroughMaxTargets` nearby weak enemy planets.
   *  2. Gather source particles from ALL own planets — including rear/defensive
   *     reserves (respecting a minimal holdback so we don't go completely naked).
   *  3. Deploy surge waves to each target in priority order (weakest first).
   *  4. Record the active breakthrough campaign so normal logic can ignore
   *     those planets until the consolidation window closes.
   */
  private _evaluateBreakthrough(
    event: { planetId: string; newFaction: Faction; oldFaction: Faction },
    state: GameState,
    deployCallback: DeployCallback,
  ): void {
    const faction = event.newFaction;

    // Only trigger for AI-managed factions
    if (!this.factions.includes(faction)) return;

    const strategy = this.strategies.get(faction)!;

    // Easy AI never breakthroughs
    if (strategy.breakthroughChance <= 0) return;

    // Player just lost a planet to us — check the conditions
    // (only trigger on enemy/player captures, not neutral captures)
    if (event.oldFaction === 'neutral') return;

    // Dice roll — weighted by role aggression
    if (Math.random() > strategy.breakthroughChance) return;

    const capturedPlanet = state.planets.get(event.planetId);
    if (!capturedPlanet) return;

    const ownPlanets   = this.getOwnPlanets(faction, state);
    const scanRadiusSq = strategy.breakthroughScanRadius * strategy.breakthroughScanRadius;

    // ── Find nearby weak enemy planets ───────────────────────
    type Candidate = { planet: PlanetData; defense: number };
    const candidates: Candidate[] = [];

    for (const planet of state.planets.values()) {
      if (planet.faction === faction || planet.faction === 'neutral') continue;
      if (!this.isPlanetVisible(planet, faction, state)) continue;

      const dx = planet.x - capturedPlanet.x;
      const dy = planet.y - capturedPlanet.y;
      if (dx * dx + dy * dy > scanRadiusSq) continue;

      const orbitCount = this.getOrbitingStrength(planet.id, state);
      const defense = planet.health + orbitCount;

      if (defense <= strategy.breakthroughWeaknessThreshold) {
        candidates.push({ planet, defense });
      }
    }

    if (candidates.length === 0) return;

    // Sort by weakest first (best chance of success)
    candidates.sort((a, b) => a.defense - b.defense);
    const targets = candidates.slice(0, strategy.breakthroughMaxTargets);

    // ── Compute surge sources ────────────────────────────────
    // We use ALL own planets as potential sources, but leave a minimal
    // holdback (3 particles per planet, or reserveParticles / 2) so we
    // don't go completely naked. The key differentiator vs. normal attack:
    // we pull from REAR planets too (not just source planets near the target).
    const HOLDBACK = Math.max(3, Math.floor(strategy.reserveParticles / 2));

    // Gather one source per surge target (nearest own planet to each target)
    const usedSourceIds = new Set<string>();

    for (const { planet: surgeTarget } of targets) {
      // Avoid firing if cooldown is up on both the capture source and the target
      if (this.aggressorCooldowns.has(surgeTarget.id)) continue;

      // Find the best source for this target — prefer planets not already used
      const eligibleSources = ownPlanets.filter(p => {
        const orb = this.getOrbitingStrength(p.id, state);
        return orb > HOLDBACK && !this.aggressorCooldowns.has(p.id);
      });

      if (eligibleSources.length === 0) break;

      // For rear-guard surge, sort by "most particles available" rather than
      // nearest, so we drain the fat defensive planets first.
      eligibleSources.sort((a, b) =>
        this.getOrbitingStrength(b.id, state) - this.getOrbitingStrength(a.id, state)
      );

      // Pick first unused source
      const source = eligibleSources.find(p => !usedSourceIds.has(p.id));
      if (!source) continue;

      usedSourceIds.add(source.id);

      // Deploy the surge fraction (higher than normal to be impactful)
      this.deployParticles([source], surgeTarget, deployCallback, strategy.breakthroughSurgeFraction, [], state);
      this.aggressorCooldowns.set(source.id, 6);

      console.log(`[AI] Breakthrough! ${faction} (${this.subRoles.get(faction)}) surging from ${source.id} → ${surgeTarget.id} (defense=${candidates.find(c => c.planet.id === surgeTarget.id)?.defense})`);
    }

    // ── Register/extend breakthrough campaign ────────────────
    const existing = this._breakthroughs.get(faction);
    if (existing) {
      // Extend consolidation window and add new targets
      targets.forEach(({ planet }) => existing.surgeTargetIds.add(planet.id));
      existing.launchedAt = this._gameElapsed; // reset timer
    } else {
      this._breakthroughs.set(faction, {
        surgeTargetIds:   new Set(targets.map(({ planet }) => planet.id)),
        launchedAt:       this._gameElapsed,
        consolidateSecs:  strategy.breakthroughConsolidateSecs,
      });
    }

    this.states.set(faction, 'breakthrough');
  }

  // -------------------------------------------------------------------------
  // Overflow pressure valve — v6
  // -------------------------------------------------------------------------

  /**
   * Branch -0.5: Force-deploy excess orbiters from any planet that has
   * accumulated above `overflowThreshold`. Bypasses ALL random gates,
   * growth pauses, and cooldowns. This prevents the army-hoarding problem
   * where planets sit at 300+ orbiters while neutrals go unclaimed.
   *
   * Priority: nearest reachable neutral first. If none, nearest enemy planet.
   * Returns true if any deployment was made.
   */
  private _checkOverflow(
    faction: Faction,
    ownPlanets: PlanetData[],
    assessment: SituationAssessment,
    state: GameState,
    deployCallback: DeployCallback,
  ): boolean {
    const strategy = this.strategies.get(faction)!;
    let acted = false;

    for (const planet of ownPlanets) {
      const orbiting = this.getOrbitingStrength(planet.id, state);
      if (orbiting <= strategy.overflowThreshold) continue;

      // When fog blocks all targets, redirect overflow into an upgrade instead of
      // searching for invisible enemies. This reinforces the Branch 2 upgrade push.
      if (assessment.canUpgradeForVision) {
        const subRole    = this.subRoles.get(faction) as string;
        const shieldBonus = subRole === 'fortress' ? 20 : subRole === 'balanced' ? 8 : subRole === 'economic' ? 12 : 0;
        const upgTarget  = this.findBestPlanetToUpgrade(ownPlanets, strategy.maxUpgrade, shieldBonus);
        if (upgTarget && upgTarget.id !== planet.id) {
          this.states.set(faction, 'upgrade');
          this.deployParticles([planet], upgTarget, deployCallback, strategy.upgradeFraction, [], state);
          this.aggressorCooldowns.set(planet.id, 5);
          acted = true;
          break;
        }
        continue; // no upgrade target — hold (don't hunt invisible enemies)
      }

      // Find a target: prefer nearest reachable neutral, then nearest enemy
      let target: PlanetData | null = null;

      // Try reachable neutrals first — skip those on an active/imminent gamma path
      let bestNeutralDist = Infinity;
      for (const neutral of assessment.neutralsAvailable) {
        if (this._isLockoutTarget(neutral, faction)) continue;
        if (neutral.health >= strategy.neutralAttackCap) continue;
        if (!this.isPlanetVisible(neutral, faction, state)) continue;
        // Skip neutrals being fired on now (3) or imminently (2) — sending overflow there is wasteful
        const gr = getGammaRiskForPlanet(state, neutral.id, neutral.x, neutral.y);
        if (gr >= 2) continue;
        const d = this.distSq(planet, neutral);
        if (d < bestNeutralDist) { bestNeutralDist = d; target = neutral; }
      }

      // Fallback: nearest enemy if no neutral and not in growth pause
      if (!target) {
        const inGrowthPause = this._gameElapsed < (this._growthPauseUntil.get(faction) ?? 0);
        const earlyBlocked  = this._earlyGameAttackBlocked(faction);
        if (!inGrowthPause && !earlyBlocked) {
          let bestEnemyDist = Infinity;
          for (const p of state.planets.values()) {
            if (p.faction === faction || p.faction === 'neutral') continue;
            if (!this.isPlanetVisible(p, faction, state)) continue;
            const d = this.distSq(planet, p);
            if (d < bestEnemyDist) { bestEnemyDist = d; target = p; }
          }
        }
      }

      if (!target) continue;

      // Deploy — ignore aggressorCooldown
      const isNeutral = target.faction === 'neutral';
      const cooldown  = isNeutral ? 2 : 6;

      if (!isGammaDangerous(state, target.x, target.y)) {
        this.states.set(faction, isNeutral ? 'conquer_neutral' : 'attack');
        this.deployParticles([planet], target, deployCallback, isNeutral ? strategy.neutralFraction : strategy.attackFraction, [], state);
        this.aggressorCooldowns.set(planet.id, cooldown);
        if (!isNeutral) this._recordAttackWave(faction, target.faction as Faction, assessment);
        console.log(`[AI] Overflow: ${faction} planet ${planet.id} (${orbiting} orbs > ${strategy.overflowThreshold}) → ${target.id}`);
        acted = true;
        break; // one overflow per tick to avoid flooding the callback
      }
    }
    return acted;
  }

  // -------------------------------------------------------------------------
  // Lockout-aware timed attack — v5
  // -------------------------------------------------------------------------


  /**
   * Returns true if this neutral planet is locked out AND we are not the
   * previous owner (meaning our particles will die if they arrive now).
   */
  private _isLockoutTarget(planet: PlanetData, faction: Faction): boolean {
    return (
      planet.faction === 'neutral' &&
      (planet.lockoutTimer ?? 0) > 0 &&
      planet.previousOwner !== faction
    );
  }

  /**
   * Branch 0.8 — Lockout timing.
   *
   * For each neutral planet that is locked out (and would interest this faction),
   * compute the travel time from our nearest source. If the lockout will expire
   * within one eval interval PLUS travel time, deploy now so units arrive the
   * instant the lock lifts. Also fires if we already queued a timed attack and
   * the deploy window has arrived.
   *
   * Returns true if an action was taken (prevents further evaluate branches).
   */
  private _tryLockoutTimedAttack(
    faction: Faction,
    sourcePlanets: PlanetData[],
    state: GameState,
    deployCallback: DeployCallback,
  ): boolean {
    if (sourcePlanets.length === 0) return false;
    if (this._difficulty === 'easy') return false;

    const strategy = this.strategies.get(faction)!;

    // ── Check if a previously queued timed attack is ready to fire ─────────
    const queued = this._lockoutTimingTargets.get(faction);
    if (queued && this._gameElapsed >= queued.deployAt) {
      const target = state.planets.get(queued.planetId);
      this._lockoutTimingTargets.delete(faction);

      if (target && target.faction === 'neutral' && (target.lockoutTimer ?? 0) <= 0) {
        // Lock has lifted — we can colonise now
        if (target.health < strategy.neutralAttackCap) {
          const sources = this._gatherCoordinatedSources(sourcePlanets, target, strategy.maxSources);
          if (sources.length > 0) {
            this.states.set(faction, 'conquer_neutral');
            this.deployParticles(sources, target, deployCallback, strategy.neutralFraction, [], state);
            for (const src of sources) this.aggressorCooldowns.set(src.id, 2);  // short colonisation cooldown
            console.log(`[AI] Lockout-timed arrival: ${faction} colonising ${target.id}`);
            return true;
          }
        }
      }
      // Target changed faction or lockout still up — abandon and fall through
    }

    // ── Scan for soon-to-unlock neutrals worth pre-targeting ────────────────
    for (const planet of state.planets.values()) {
      if (!this._isLockoutTarget(planet, faction)) continue;
      if (planet.health >= strategy.neutralAttackCap) continue;
      if (!this.isPlanetVisible(planet, faction, state)) continue;

      const nearest = this.nearestPlanet(sourcePlanets, planet);
      if (!nearest) continue;

      const dist = Math.sqrt(this.distSq(nearest, planet));
      const travelTimeSecs = dist / PARTICLE_SPEED;
      const lockRemaining  = planet.lockoutTimer ?? 0;

      // Deploy when: lockout will have lifted by the time units arrive
      // Give one extra eval interval of margin so we don't undershoot.
      if (lockRemaining <= travelTimeSecs + strategy.evalInterval) {
        // Queue the deploy for exactly when lockout ≤ travelTime
        const deployAt = this._gameElapsed + Math.max(0, lockRemaining - travelTimeSecs);
        const existing = this._lockoutTimingTargets.get(faction);

        // Only replace an existing queue entry if this target is closer
        if (!existing || deployAt < existing.deployAt) {
          this._lockoutTimingTargets.set(faction, { planetId: planet.id, deployAt });
          console.log(
            `[AI] Lockout timing queued: ${faction} → ${planet.id} ` +
            `(lock=${lockRemaining.toFixed(1)}s travel=${travelTimeSecs.toFixed(1)}s deployAt=${deployAt.toFixed(1)}s)`
          );
        }
      }
    }

    return false; // queuing is not a branch-consuming action
  }

  // -------------------------------------------------------------------------
  // Production-rate emergency — v5
  // -------------------------------------------------------------------------

  /**
   * Returns true when this faction's production rate has fallen behind the
   * best enemy's rate by more than the role's configured threshold.
   * This triggers growth-emergency mode: expand/upgrade priority overrides
   * attack branches.
   */
  private _inProductionEmergency(faction: Faction, assessment: SituationAssessment): boolean {
    const strategy = this.strategies.get(faction)!;
    if (!strategy.productionEmergencyEnabled) return false;
    if (assessment.bestEnemyProduction <= 0) return false;
    return assessment.productionAdvantage < strategy.productionEmergencyThreshold;
  }

  // -------------------------------------------------------------------------
  // Futility detection — v4
  // -------------------------------------------------------------------------


  /**
   * Called on every evaluate tick (before attack branches).
   * Updates the active campaign entry for this faction and, if the campaign
   * looks futile, cancels it and enters a growth-only pause.
   */
  private _checkFutility(faction: Faction, assessment: SituationAssessment): void {
    const strategy = this.strategies.get(faction)!;
    if (!strategy.futilityEnabled) return;

    const entry = this._futileAttackTracker.get(faction);
    if (!entry) return; // no active campaign

    const campaignAge = this._gameElapsed - entry.startedAt;

    // Look up current enemy particles for the tracked faction
    const enemyData = assessment.enemyFactions.get(entry.targetFaction);
    const currentEnemyParticles = enemyData?.particles ?? 0;

    const noProgress = currentEnemyParticles >= entry.enemyParticlesAtStart * strategy.futilityProgressThreshold;
    const longCampaign = campaignAge >= strategy.futilityTimeoutSecs;
    const tooManyWaves = entry.wavesSent >= strategy.futilityMaxWaves;

    if ((noProgress && longCampaign) || tooManyWaves) {
      const pauseUntil = this._gameElapsed + strategy.futilityGrowthPauseSecs;
      this._growthPauseUntil.set(faction, pauseUntil);
      this._futileAttackTracker.delete(faction);
      console.log(
        `[AI] Futility detected for ${faction} (${this.subRoles.get(faction)}) ` +
        `against ${entry.targetFaction} — backing off for ${strategy.futilityGrowthPauseSecs}s ` +
        `(waves=${entry.wavesSent} age=${campaignAge.toFixed(0)}s progress=${noProgress})`
      );
    }
  }

  /**
   * Called whenever an attack wave is dispatched against an enemy faction.
   * Creates or updates the campaign entry for futility tracking.
   */
  private _recordAttackWave(
    faction: Faction,
    targetFaction: Faction,
    assessment: SituationAssessment,
  ): void {
    const strategy = this.strategies.get(faction)!;
    if (!strategy.futilityEnabled) return;
    if (targetFaction === 'neutral') return;

    const existing = this._futileAttackTracker.get(faction);
    const enemyData = assessment.enemyFactions.get(targetFaction);
    const enemyParticles = enemyData?.particles ?? 0;

    if (existing && existing.targetFaction === targetFaction) {
      // Same campaign — increment wave count
      existing.wavesSent++;
    } else {
      // New campaign (or switched target) — start fresh
      this._futileAttackTracker.set(faction, {
        targetFaction,
        startedAt:             this._gameElapsed,
        wavesSent:             1,
        enemyParticlesAtStart: enemyParticles,
      });
    }
  }

  /**
   * Returns true if this role's early-game attack block is still active.
   * Prevents enemy attacks (opportunity and global) before the configured window.
   */
  private _earlyGameAttackBlocked(faction: Faction): boolean {
    const strategy = this.strategies.get(faction)!;
    if (strategy.earlyGameAttackBlockSecs <= 0) return false;
    return this._gameElapsed < strategy.earlyGameAttackBlockSecs;
  }

  // -------------------------------------------------------------------------
  // Situation assessment — lightweight strategic snapshot

  // -------------------------------------------------------------------------

  private _assessSituation(faction: Faction, state: GameState): SituationAssessment {
    return assessSituation(faction, state, this.strategies.get(faction)!,
      (target, observer, snapshot) => this.isPlanetVisible(target, observer, snapshot));
  }

  // -------------------------------------------------------------------------
  // Forced opening move
  // -------------------------------------------------------------------------

  private _forceOpeningMove(
    faction: Faction,
    state: GameState,
    deployCallback: DeployCallback,
    assessment: SituationAssessment,
  ): boolean {
    if (this._hasActed.get(faction)) return false;
    this._hasActed.set(faction, true);

    const strategy = this.strategies.get(faction)!;
    const subRole = this.subRoles.get(faction)!;
    const ownPlanets = assessment.myPlanets;
    if (ownPlanets.length === 0) return false;

    // Find nearest neutral
    const nearestNeutral = this._findNearestNeutral(faction, ownPlanets, state);

    if (subRole === 'easy_turtle') {
      // Easy: colonize nearest neutral (simple)
      if (nearestNeutral) {
        const src = this.richestPlanet(ownPlanets, state);
        if (src) {
          this.states.set(faction, 'conquer_neutral');
          this.deployParticles([src], nearestNeutral, deployCallback, strategy.neutralFraction, [], state);
          this.aggressorCooldowns.set(src.id, 2);  // short colonisation cooldown
          return true;
        }
      }
    } else if (this._difficulty === 'hard') {
      // Hard: colonize nearest neutral AND start upgrading simultaneously
      const richest = this.richestPlanet(ownPlanets, state);
      if (nearestNeutral && richest) {
        this.states.set(faction, 'conquer_neutral');
        this.deployParticles([richest], nearestNeutral, deployCallback, strategy.neutralFraction, [], state);
        this.aggressorCooldowns.set(richest.id, 2);  // short colonisation cooldown

        // Also queue an upgrade if we have a second planet
        const secondSource = ownPlanets.find(p => p.id !== richest.id);
        if (secondSource) {
          const shieldBonusEarly = subRole === 'fortress' ? 20 : subRole === 'balanced' ? 8 : 0;
          const upgradeTarget = this.findBestPlanetToUpgrade(ownPlanets, strategy.maxUpgrade, shieldBonusEarly);
          if (upgradeTarget && upgradeTarget.id !== secondSource.id) {
            this.deployParticles([secondSource], upgradeTarget, deployCallback, strategy.upgradeFraction, [], state);
            this.aggressorCooldowns.set(secondSource.id, 4); // upgrade cooldown stays at 4
          }
        }
        return true;
      }
    } else {
      // Normal: colonize or upgrade based on sub-role
      if (subRole === 'fortress') {
        // Fortress: upgrade first, then expand — strongly prefers shielded planets (free defenders)
        const upgradeTarget = this.findBestPlanetToUpgrade(ownPlanets, strategy.maxUpgrade, 20);
        if (upgradeTarget) {
          const src = ownPlanets.find(p => p.id !== upgradeTarget.id) ?? null;
          if (src) {
            this.states.set(faction, 'upgrade');
            this.deployParticles([src], upgradeTarget, deployCallback, strategy.upgradeFraction, [], state);
            this.aggressorCooldowns.set(src.id, 5);
            return true;
          }
        }
        // Fallback: colonize
        if (nearestNeutral) {
          const src = this.richestPlanet(ownPlanets, state);
          if (src) {
            this.states.set(faction, 'conquer_neutral');
            this.deployParticles([src], nearestNeutral, deployCallback, strategy.neutralFraction, [], state);
            this.aggressorCooldowns.set(src.id, 2);  // short colonisation cooldown
            return true;
          }
        }
      } else {
        // Balanced / Opportunist / Expander: colonize nearest neutral
        if (nearestNeutral) {
          const src = this.richestPlanet(ownPlanets, state);
          if (src) {
            this.states.set(faction, 'conquer_neutral');
            this.deployParticles([src], nearestNeutral, deployCallback, strategy.neutralFraction, [], state);
            this.aggressorCooldowns.set(src.id, 2);  // short cooldown for colonisation
            return true;
          }
        }
      }
    }

    return false;
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
    const assessment = this._assessSituation(faction, state);
    const ownPlanets = assessment.myPlanets;

    // Gather any stationed particles belonging to this faction
    const stationedParticleIds = state.particles
      .filter((p) => p.alive && p.faction === faction && p.mode === 'stationed')
      .map((p) => p.id);

    if (ownPlanets.length === 0) {
      this.states.set(faction, 'defend');
      return;
    }

    const stationedIds = new Set(stationedParticleIds);
    const stationedStrength = unitStrength(state.particles.filter(p => stationedIds.has(p.id)));
    const totalParticles = assessment.myParticles;

    const sourcePlanets = ownPlanets.filter(
      (p) => this.getOrbitingStrength(p.id, state) > strategy.minToDeploy &&
             !this.aggressorCooldowns.has(p.id),
    );

    // --- Branch -1: Forced opening move (first tick only) ---
    if (this._forceOpeningMove(faction, state, deployCallback, assessment)) {
      return;
    }

    // --- Futility check: update campaign tracker; may set/extend growth pause ---
    if (this._difficulty !== 'easy') {
      this._checkFutility(faction, assessment);
    }

    // --- Branch 0: Retreat (Normal/Hard only) ---
    if (this._difficulty !== 'easy') {
      if (this._checkRetreat(faction, state, deployCallback)) {
        return;
      }
    }

    // --- Branch 0.3: Counterattack (Normal/Hard only) ---
    // Fires AFTER retreat check so a doomed planet retreats first;
    // only planets that can hold launch a counter-strike.
    if (this._difficulty !== 'easy') {
      if (this._checkCounterattack(faction, state, deployCallback)) {
        return;
      }
    }

    // --- Build source planet lists (two thresholds) ---
    // neutralSourcePlanets: lower bar — for colonisation where costs are low.
    // sourcePlanets: standard bar — for attacks and upgrades.
    const neutralSourcePlanets = ownPlanets.filter(
      (p) => this.getOrbitingStrength(p.id, state) > strategy.minToDeployNeutral,
      // NOTE: aggressorCooldown intentionally NOT applied here — colonisation
      // should not be blocked by attack cooldowns on the same planet.
    );

    // --- Branch -0.5: Overflow pressure valve ---
    // If any planet has accumulated too many orbiters, force-deploy the excess
    // to the nearest neutral or best available target. Bypasses all random
    // gates and growth pauses — hoarding is never allowed.
    if (this._checkOverflow(faction, ownPlanets, assessment, state, deployCallback)) {
      return;
    }

    // --- Branch 0.5: Backcap — opportunistically attack a just-vacated planet ---
    if (sourcePlanets.length > 0 || stationedParticleIds.length > 0) {
      const backcapTarget = this._findBackcapTarget(faction, state);
      if (backcapTarget !== null) {
        const localSource = this.nearestPlanet(sourcePlanets, backcapTarget);
        if (localSource !== null || stationedParticleIds.length > 0) {
          const localOrbit = localSource ? this.getOrbitingStrength(localSource.id, state) : 0;
          if (localOrbit + stationedStrength > backcapTarget.health + strategy.reserveParticles) {
            this.states.set(faction, 'attack');
            this.deployParticles(localSource ? [localSource] : [], backcapTarget, deployCallback, strategy.attackFraction, stationedParticleIds, state);
            if (localSource) this.aggressorCooldowns.set(localSource.id, 8);
            return;
          }
        }
      }
    }

    // --- Branch 0.8: Lockout timing — stage waves to arrive the moment a lock lifts ---
    if (this._tryLockoutTimedAttack(faction, neutralSourcePlanets, state, deployCallback)) {
      return;
    }

    // --- Branch 1: Expand ---
    // Priority rules, in order:
    //   a) During earlyGameExpandForcedSecs: ALWAYS expand if neutrals + sources exist (no random).
    //   b) Fortress saturation: if all fortress planets are at/above garrison cap → force expand.
    //   c) Production emergency (non-berserker): forced expand bias = 1.0.
    //   d) Normal case: random gate weighted by expandBias.
    // Uses neutralSourcePlanets (lower threshold) so even small planets can send scouts.

    const subRole = this.subRoles.get(faction)!;
    const inProductionEmergency = this._inProductionEmergency(faction, assessment);
    const isBerserker = subRole === 'berserker';
    const hasProductionDisadvantage = assessment.productionAdvantage < 0.8;
    const hasUnitAdvantage = assessment.unitAdvantage > 1.0;

    const earlyExpandForced = strategy.earlyGameExpandForcedSecs > 0 &&
      this._gameElapsed < strategy.earlyGameExpandForcedSecs;

    // Fortress saturation: all planets are at/above garrison cap → needs to expand
    const fortressSaturated = subRole === 'fortress' && ownPlanets.length > 0 &&
      ownPlanets.every(p => this.getOrbitingStrength(p.id, state) >= 20);

    let expandBias: number;
    if (earlyExpandForced || fortressSaturated) {
      expandBias = 1.0; // deterministic — skip random gate
    } else if (inProductionEmergency && !isBerserker) {
      expandBias = 1.0;
    } else if (inProductionEmergency && isBerserker) {
      expandBias = Math.min(1.0, strategy.expandWeight * 1.5);
    } else if (hasProductionDisadvantage) {
      expandBias = Math.min(1.0, strategy.expandWeight * 1.2);
    } else {
      expandBias = strategy.expandWeight;
    }

    const neutralExpansionSources = neutralSourcePlanets.length > 0 ? neutralSourcePlanets
      : sourcePlanets; // fallback to standard sources if neutral-floor sources are empty

    const wantsExpand = Math.random() < expandBias;
    if (
      wantsExpand &&
      assessment.neutralsAvailable.length > 0 &&
      (neutralExpansionSources.length > 0 || stationedParticleIds.length > 0)
    ) {
      const bestNeutral = this._findBestNeutral(faction, neutralExpansionSources, assessment, state);
      if (bestNeutral !== null && bestNeutral.health < strategy.neutralAttackCap) {
        this.states.set(faction, 'conquer_neutral');
        const sources = this._gatherCoordinatedSources(neutralExpansionSources, bestNeutral, strategy.maxSources);
        if (sources.length > 0) {
          this.deployParticles(sources, bestNeutral, deployCallback, strategy.neutralFraction, stationedParticleIds, state);
          // SHORT cooldown for colonisation — 2s not 6s. Planet refills quickly and we want rapid expansion.
          for (const src of sources) this.aggressorCooldowns.set(src.id, 2);
        } else if (stationedParticleIds.length > 0) {
          this.deployParticles([], bestNeutral, deployCallback, strategy.neutralFraction, stationedParticleIds, state);
        }
        return;
      }
    }

    // --- Branch 2: Upgrade ---
    // In production emergency, strongly prefer upgrading (more production = recovery).
    // When fog blinds this faction (no visible neutrals or enemies), upgrading is
    // the ONLY way to expand the vision radius and unlock new territory — make it
    // deterministic so the AI never randomly falls through to "defend" (accumulate).
    let upgradeBias: number;
    if (assessment.canUpgradeForVision) {
      upgradeBias = 1.0; // vision-blocked: deterministic upgrade, no random gate
    } else if (inProductionEmergency) {
      upgradeBias = Math.min(1.0, strategy.upgradeWeight * 1.5);
    } else if (hasProductionDisadvantage) {
      upgradeBias = Math.min(1.0, strategy.upgradeWeight * 1.3);
    } else {
      upgradeBias = strategy.upgradeWeight;
    }
    const wantsUpgrade = Math.random() < upgradeBias;
    if (wantsUpgrade && (sourcePlanets.length > 0 || stationedParticleIds.length > 0) && totalParticles >= strategy.upgradeTrigger) {
      const shieldBonus = subRole === 'fortress' ? 20 : subRole === 'balanced' ? 8 : subRole === 'economic' ? 12 : 0;
      const bestUpgradePlanet = this.findBestPlanetToUpgrade(ownPlanets, strategy.maxUpgrade, shieldBonus);
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

    // --- Branch 2.5: Opportunity Attack (local advantage) ---
    // Skipped when in growth-pause, early-game attack block, OR production emergency
    // (for non-berserker roles: emergency forces them to grow first).
    const inGrowthPause    = this._gameElapsed < (this._growthPauseUntil.get(faction) ?? 0);
    const earlyGameBlocked = this._earlyGameAttackBlocked(faction);
    // Production emergency blocks attacks for non-berserkers only when reachable neutrals exist
    // (locked neutrals we can't enter don't count as reachable territory)
    const reachableNeutrals = assessment.neutralsAvailable.filter(n => !this._isLockoutTarget(n, faction));
    const emergencyBlocksAttack = inProductionEmergency && !isBerserker && reachableNeutrals.length > 0;

    if (!inGrowthPause && !earlyGameBlocked && !emergencyBlocksAttack && (sourcePlanets.length > 0 || stationedParticleIds.length > 0)) {
      const opportunityTarget = this._findOpportunityTarget(faction, sourcePlanets, state, stationedStrength);
      // Hard gate: never deploy to a planet the gamma ray is firing on or about to fire on
      if (opportunityTarget !== null && getGammaRiskForPlanet(state, opportunityTarget.id, opportunityTarget.x, opportunityTarget.y) < 2) {
        const sources = this._gatherCoordinatedSources(sourcePlanets, opportunityTarget, strategy.maxSources);
        this.states.set(faction, 'attack');
        this.deployParticles(sources.length > 0 ? sources : [], opportunityTarget, deployCallback, strategy.attackFraction, stationedParticleIds, state);
        for (const src of sources) this.aggressorCooldowns.set(src.id, 8);
        this._recordAttackWave(faction, opportunityTarget.faction as Faction, assessment);
        return;
      }
    }

    // --- Branch 3: Attack (global advantage OR strategic necessity) ---
    // Skipped when in growth-pause, early-game attack block, or production emergency with neutrals.
    // Attack if: we have global unit advantage OR we have production advantage and roughly even
    // OR if we're losing production and have units to burn (desperate attack)
    const shouldAttack =
      (totalParticles > assessment.bestEnemyParticles * strategy.aggressionRatio) ||
      (hasUnitAdvantage && !hasProductionDisadvantage) ||
      (hasProductionDisadvantage && hasUnitAdvantage && assessment.neutralsAvailable.length === 0);

    if (
      !inGrowthPause && !earlyGameBlocked && !emergencyBlocksAttack &&
      shouldAttack &&
      (sourcePlanets.length > 0 || stationedParticleIds.length > 0)
    ) {
      const target = this._findBestAttackTarget(faction, sourcePlanets, state, assessment);
      // Hard gate: double-check gamma safety even after scoring (belt-and-suspenders)
      if (target !== null && getGammaRiskForPlanet(state, target.id, target.x, target.y) < 2) {
        this.states.set(faction, 'attack');
        const sources = this._gatherCoordinatedSources(sourcePlanets, target, strategy.maxSources);
        this.deployParticles(sources.length > 0 ? sources : [], target, deployCallback, strategy.attackFraction, stationedParticleIds, state);
        for (const src of sources) this.aggressorCooldowns.set(src.id, 8);
        this._recordAttackWave(faction, target.faction as Faction, assessment);
        return;
      }
    }

    // --- Branch 4: Defend timeout pressure valve (difficulty-scaled) ---
    const defendTime = this.defendTimers.get(faction) ?? 0;
    if (defendTime >= strategy.defendTimeout && (neutralExpansionSources.length > 0 || sourcePlanets.length > 0 || stationedParticleIds.length > 0)) {
      this.defendTimers.set(faction, 0);
      // Try neutral first (using lower-threshold sources); if none, attack weakest enemy
      const neutral = this._findBestNeutral(faction, neutralExpansionSources.length > 0 ? neutralExpansionSources : sourcePlanets, assessment, state);
      if (neutral !== null) {
        this.states.set(faction, 'conquer_neutral');
        const expandSrc = neutralExpansionSources.length > 0 ? neutralExpansionSources : sourcePlanets;
        const sources = this._gatherCoordinatedSources(expandSrc, neutral, strategy.maxSources);
        this.deployParticles(sources.length > 0 ? sources : [], neutral, deployCallback, strategy.neutralFraction, stationedParticleIds, state);
        for (const src of sources) this.aggressorCooldowns.set(src.id, 2);  // short colonisation cooldown
      } else {
        const anyEnemy = this._findBestAttackTarget(faction, sourcePlanets, state, assessment);
        // Hard gate: Branch 4 fallback attack also blocked for gamma targets
        if (anyEnemy !== null && getGammaRiskForPlanet(state, anyEnemy.id, anyEnemy.x, anyEnemy.y) < 2) {
          this.states.set(faction, 'attack');
          const sources = this._gatherCoordinatedSources(sourcePlanets, anyEnemy, strategy.maxSources);
          this.deployParticles(sources.length > 0 ? sources : [], anyEnemy, deployCallback, strategy.attackFraction, stationedParticleIds, state);
          for (const src of sources) this.aggressorCooldowns.set(src.id, 8);
        }
      }
      return;
    }

    // --- Branch 5: Defend (accumulate) ---
    this.states.set(faction, 'defend');
  }

  // -------------------------------------------------------------------------
  // Attack target scoring
  // -------------------------------------------------------------------------

  /**
   * Score-based attack target selection. Considers distance, weakness, value,
   * isolation, production denial, threat-leader pressure, and wave fixation.
   */
  private _scoreAttackTarget(
    target: PlanetData,
    faction: Faction,
    sourcePlanets: PlanetData[],
    state: GameState,
    assessment: SituationAssessment,
  ): number {
    // Player immunity period based on difficulty
    if (target.faction === 'player') {
      if (this._difficulty === 'easy' && this._gameElapsed < 120) return -Infinity;
      if (this._difficulty === 'normal' && this._gameElapsed < 30) return -Infinity;
    }

    // Ignore locked neutral planets unless we are the previous owner
    if (target.faction === 'neutral' && target.lockoutTimer !== undefined && target.lockoutTimer > 0 && target.previousOwner !== faction) {
      return -Infinity;
    }

    let score = 0;

    // Distance penalty (use nearest source)
    const nearest = this.nearestPlanet(sourcePlanets, target);
    if (nearest) {
      const dist = Math.sqrt(this.distSq(nearest, target));
      score -= dist * 0.05; // 200px = -10 score
    } else {
      score -= 50; // no nearby source is bad
    }

    // Weakness bonus (fewer defenders = easier target)
    const orbitersOnTarget = this.getOrbitingStrength(target.id, state);
    let defense = target.health + orbitersOnTarget;

    // ── Shield adds real effective defense cost ────────────────────────────
    // Shielded planets can absorb damage before their health bar is touched.
    // Include shield points in the defense score so the AI correctly prefers
    // unshielded targets over shielded ones at similar health.
    if (target.isShielded && (target.shieldPoints ?? 0) > 0) {
      defense += target.shieldPoints!;
    }

    // Retake discount logic
    if (target.faction === 'neutral' && target.previousOwner === faction && (target.rebellionBonus || 0) > 0) {
      defense -= 20;
    }

    score += Math.max(0, 80 - defense) * 0.6; // up to +48 for undefended

    // ── Heavy fixation penalty: already sending waves here ─────────────────
    // Applied on ALL difficulties (was only Hard before). Stops the AI from
    // endlessly hammering a well-defended wall. Penalty scales with wave count.
    const existingWaves = this.activeWaves.filter(w => w.targetPlanetId === target.id && w.faction === faction);
    if (existingWaves.length > 0) {
      score -= 25 * existingWaves.length; // -25 per wave already en-route
    }

    // ── Over-defended penalty: target is clearly too strong ────────────────
    // Only applies to ENEMY planets — NOT neutral planets.
    // Neutrals are unshielded and always conquerable given enough force.
    // The AI should send more units, not give up on a neutral with 5 defenders.
    const combinedForce = sourcePlanets.reduce((s, p) => s + this.getOrbitingStrength(p.id, state), 0);
    if (target.faction !== 'neutral' && defense > combinedForce * 1.5 && this._difficulty !== 'easy') {
      score -= 40; // strongly discourage suicide attacks on ENEMY planets
    }

    // ── Gamma-ray risk penalty ──────────────────────────────────────────────
    // Planets on the gamma path are worthless to attack — you'll lose the
    // units AND the capture. Safe planets (risk 0) get an explicit bonus to
    // make them clearly better options.
    //   Risk 3 (firing now)      → -Infinity: hard block, never send units here
    //   Risk 2 (imminent ≤10s)   → -Infinity: guaranteed loss before arrival
    //   Risk 1 (locked, >10s)    → -40: strong bias away
    //   Risk 0 (safe)            → +30: positive incentive to pick safe planets
    const gammaRisk = getGammaRiskForPlanet(state, target.id, target.x, target.y);
    if (gammaRisk >= 2) return -Infinity; // firing now or imminent — hard block
    if (gammaRisk === 1) score -= 40;     // will fire eventually
    if (gammaRisk === 0) score += 30;     // explicitly reward safe planets

    // Value bonus (higher upgrade = more valuable to capture)
    score += target.upgradeLevel * 15; // +15 / +30 / +45

    // Production denial bonus (taking this hurts enemy production)
    const targetProduction = PLANET_PRODUCTION[target.upgradeLevel];
    score += targetProduction * 4;

    if (this._difficulty !== 'easy') {
      // Isolation bonus (enemy planet far from other enemy planets = less likely reinforced)
      const enemyData = assessment.enemyFactions.get(target.faction);
      if (enemyData) {
        let nearestAllyDistSq = Infinity;
        for (const ep of enemyData.planets) {
          if (ep.id === target.id) continue;
          nearestAllyDistSq = Math.min(nearestAllyDistSq, this.distSq(ep, target));
        }
        if (nearestAllyDistSq > 250 * 250) score += 12; // isolated planet bonus
      }

      // ── Threat-leader bias ──────────────────────────────────────────────
      // If this planet belongs to the faction with the highest production rate,
      // apply a bonus that scales with how far ahead they are. Prevents the
      // entire AI from ganging up on you while the real winner runs away.
      if (assessment.highestProductionFaction && target.faction === assessment.highestProductionFaction) {
        const myProd = assessment.myProduction;
        const theirProd = assessment.enemyFactions.get(assessment.highestProductionFaction)?.production ?? 1;
        // Bonus grows as they pull ahead: e.g. 2× ahead = +30, 3× ahead = +60
        const leadRatio = theirProd > 0 ? theirProd / Math.max(myProd, 1) : 1;
        score += Math.min(60, (leadRatio - 1) * 30);
      }

      // Hard: also prefer disrupting players who are upgrading actively
      if (this._difficulty === 'hard' && target.faction === 'player' && target.upgradeLevel >= 2) {
        score += 10;
      }
    }

    return score;
  }

  /**
   * Find the best attack target using scoring function.
   * Falls back to weakest enemy if scoring produces no result.
   */
  private _findBestAttackTarget(
    faction: Faction,
    sourcePlanets: PlanetData[],
    state: GameState,
    assessment: SituationAssessment,
  ): PlanetData | null {
    const subRole = this.subRoles.get(faction);

    // Dominator: systematically target the weakest faction first
    if (subRole === 'dominator') {
      let weakestFaction: Faction | null = null;
      let weakestCount = Infinity;
      for (const [ef, data] of assessment.enemyFactions) {
        if (data.planets.length > 0 && data.planets.length < weakestCount) {
          weakestCount = data.planets.length;
          weakestFaction = ef;
        }
      }
      if (weakestFaction) {
        // Score only planets belonging to the weakest faction.
        // Hard-skip any planet the gamma ray is firing on or about to fire on.
        let best: PlanetData | null = null;
        let bestScore = -Infinity;
        for (const planet of state.planets.values()) {
          if (planet.faction !== weakestFaction) continue;
          if (!this.isPlanetVisible(planet, faction, state)) continue;
          const gr = getGammaRiskForPlanet(state, planet.id, planet.x, planet.y);
          if (gr >= 2) continue; // hard skip — never target gamma-destined planet
          const score = this._scoreAttackTarget(planet, faction, sourcePlanets, state, assessment);
          if (score > bestScore) { bestScore = score; best = planet; }
        }
        // Return null (not best) if nothing scored above -Infinity
        return bestScore > -Infinity ? best : null;
      }
    }

    // Default: score all enemy planets and pick the best.
    // Hard-skip planets the gamma ray is firing on or about to fire on.
    let best: PlanetData | null = null;
    let bestScore = -Infinity;
    for (const planet of state.planets.values()) {
      if (planet.faction === faction || planet.faction === 'neutral') continue;
      if (!this.isPlanetVisible(planet, faction, state)) continue;
      const gr = getGammaRiskForPlanet(state, planet.id, planet.x, planet.y);
      if (gr >= 2) continue; // hard skip — never target a planet being/about to be vaporised
      const score = this._scoreAttackTarget(planet, faction, sourcePlanets, state, assessment);
      if (score > bestScore) { bestScore = score; best = planet; }
    }
    // Return null if no safe target was found (all visible planets on gamma path)
    return bestScore > -Infinity ? best : null;
  }

  // -------------------------------------------------------------------------
  // Neutral selection with expand-or-deny logic
  // -------------------------------------------------------------------------

  /**
   * Find the best neutral planet to colonize, considering distance AND denial value.
   * Denial: neutrals closer to the enemy than to us are worth grabbing to deny them.
   */
  private _findBestNeutral(
    faction: Faction,
    sourcePlanets: PlanetData[],
    assessment: SituationAssessment,
    state: GameState,
  ): PlanetData | null {
    if (assessment.neutralsAvailable.length === 0) return null;

    const allOwnPlanets = assessment.myPlanets;
    if (allOwnPlanets.length === 0) return null;

    let best: PlanetData | null = null;
    let bestScore = -Infinity;

    for (const neutral of assessment.neutralsAvailable) {
      // ── Skip locked planets we are not the previous owner of ────────────
      if (this._isLockoutTarget(neutral, faction)) continue;

      let score = 0;

      // Distance score (closer to our planets = better)
      const nearestOwn = this.nearestPlanet(allOwnPlanets, neutral);
      if (nearestOwn) {
        const dist = Math.sqrt(this.distSq(nearestOwn, neutral));
        score -= dist * 0.04;
      }

      // Weakness score (lower health = easier to take)
      score += Math.max(0, 40 - neutral.health) * 0.3;

      // ── Orbiter / defender scoring ────────────────────────────────────────
      // Neutrals are NOT shielded and cannot regenerate lost health, so even
      // defended neutrals are worth attacking — we just prefer the easier ones.
      //
      // Scoring:
      //   0 orbiters + full health  → neutral bonus (easy target, just chip health)
      //   0 orbiters + low health   → big bonus from weakness score above
      //   some defenders (1-10)     → mild penalty per defender — prefer cheaper targets
      //   many defenders (10+)      → stronger but not prohibitive penalty
      //
      // CRITICALLY: there is NO hard cap here. The AI can and will attack defended
      // neutrals — it just prefers cheaper ones when equal alternatives exist.
      const orbiters = this.getOrbitingStrength(neutral.id, state);
      if (orbiters === 0) {
        // No defenders — this is a free planet (just takes health chip damage)
        score += 30; // strong preference for zero-defender neutrals
      } else {
        // Each defender costs us something but doesn't make the planet untouchable
        score -= orbiters * 2.5; // mild per-orbiter penalty: 5 defenders = -12.5
      }

      // ── Production value bonus ───────────────────────────────────────────
      // Higher-level neutrals produce more per turn — worth more to capture.
      score += PLANET_PRODUCTION[neutral.upgradeLevel] * 3;

      // Denial score (Normal/Hard): if neutral is closer to enemy than to us, bonus for denial
      if (this._difficulty !== 'easy' && assessment.strongestEnemyFaction) {
        const enemyData = assessment.enemyFactions.get(assessment.strongestEnemyFaction);
        if (enemyData && enemyData.planets.length > 0) {
          const nearestEnemy = this.nearestPlanet(enemyData.planets, neutral);
          if (nearestEnemy && nearestOwn) {
            const distToUs = Math.sqrt(this.distSq(nearestOwn!, neutral));
            const distToEnemy = Math.sqrt(this.distSq(nearestEnemy, neutral));
            if (distToEnemy < distToUs) {
              // This neutral is closer to the enemy — high denial value
              score += 20;
            }
          }
        }
      }

      // ── Gamma-ray risk ───────────────────────────────────────────────────
      // Skip or penalise neutrals in the gamma path — colonising one that will
      // immediately be wiped resets the planet and wastes the colonists.
      const neutralGammaRisk = getGammaRiskForPlanet(state, neutral.id, neutral.x, neutral.y);
      if (neutralGammaRisk === 3) continue;    // actively firing — never target
      if (neutralGammaRisk === 2) score -= 80; // fires imminently — very strong deterrent
      if (neutralGammaRisk === 1) score -= 30; // locked future — prefer safer planet

      if (score > bestScore) {
        bestScore = score;
        best = neutral;
      }
    }

    return best;
  }

  // -------------------------------------------------------------------------
  // Multi-source coordinated attack gathering
  // -------------------------------------------------------------------------

  /**
   * Gather up to `maxSources` source planets for a coordinated attack,
   * sorted by distance to the target.
   */
  private _gatherCoordinatedSources(
    sourcePlanets: PlanetData[],
    target: PlanetData,
    maxSources: number,
  ): PlanetData[] {
    if (sourcePlanets.length === 0) return [];
    if (maxSources <= 1) {
      const nearest = this.nearestPlanet(sourcePlanets, target);
      return nearest ? [nearest] : [];
    }

    // Sort by distance to target, take up to maxSources
    return sourcePlanets
      .map(p => ({ planet: p, distSq: this.distSq(p, target) }))
      .sort((a, b) => a.distSq - b.distSq)
      .slice(0, maxSources)
      .map(entry => entry.planet);
  }

  // -------------------------------------------------------------------------
  // Counterattack — hit back at the attacker's weak spot (Normal/Hard)
  // -------------------------------------------------------------------------

  /**
   * When one of our planets is under attack and we have surplus defenders,
   * strike at the attacker's weakest planet rather than purely holding.
   *
   * Decision logic:
   *  1. Find any own planet with significant incoming enemy particles.
   *  2. Compute how many orbiters we need to keep (max of counterattackMinDefenders
   *     and counterattackDefenseRatio × current orbiters).
   *  3. If there are surplus orbiters above that holdback, roll counterattackChance.
   *  4. Find the best counterattack target: the attacker's WEAKEST planet that
   *     the surplus force can actually threaten (adjusted for sub-role preferences).
   *  5. Deploy the surplus to that target; keep the rest defending.
   *
   * Returns true if a counterattack was launched (prevents further evaluate branches).
   */
  private _checkCounterattack(
    faction: Faction,
    state: GameState,
    deployCallback: DeployCallback,
  ): boolean {
    const strategy  = this.strategies.get(faction)!;
    if (strategy.counterattackChance <= 0) return false;

    const ownPlanets = this.getOwnPlanets(faction, state);
    if (ownPlanets.length === 0) return false;

    for (const planet of ownPlanets) {
      // ── Count incoming enemy particles ───────────────────────
      let incomingEnemies = 0;
      const attackerFactions = new Set<Faction>();
      const attackerHomePlanetIds = new Set<string>();

      for (const p of state.particles) {
        if (
          p.alive && p.faction !== faction && p.faction !== 'neutral' &&
          p.mode === 'traveling' && p.targetPlanetId === planet.id
        ) {
          incomingEnemies += p.strength;
          attackerFactions.add(p.faction as Faction);
          if (p.homePlanetId) attackerHomePlanetIds.add(p.homePlanetId);
        }
      }

      if (incomingEnemies === 0) continue;

      const orbiting = this.getOrbitingStrength(planet.id, state);

      // ── Compute holdback ─────────────────────────────────────
      // Keep at least counterattackMinDefenders, but also at least
      // enough to weather the incoming wave (based on defense ratio).
      const ratioHoldback = Math.ceil(orbiting * strategy.counterattackDefenseRatio);
      const holdback = Math.max(strategy.counterattackMinDefenders, ratioHoldback);

      // We also make sure we can absorb the incoming wave —
      // if incoming > holdback, we won't counterattack (we NEED those defenders).
      if (incomingEnemies >= holdback) continue;

      const surplus = orbiting - holdback;
      if (surplus <= 0) continue;

      // ── Dice roll ─────────────────────────────────────────────
      if (Math.random() > strategy.counterattackChance) continue;

      // ── Find the best counterattack target ───────────────────
      // Priority: attacker's planets, preferring weak ones that our
      // surplus can actually crack. Dominator targets the weakest-faction
      // planet; others target the weakest nearby attacker planet.
      const subRole = this.subRoles.get(faction)!;
      let counterTarget: PlanetData | null = null;

      // Collect all visible enemy planets belonging to attacking factions
      const attackerPlanets: PlanetData[] = [];
      for (const p of state.planets.values()) {
        if (!attackerFactions.has(p.faction as Faction)) continue;
        if (!this.isPlanetVisible(p, faction, state)) continue;
        attackerPlanets.push(p);
      }

      if (attackerPlanets.length === 0) continue;

      if (subRole === 'dominator') {
        // Dominator: hit the launch planet itself (where the attack came FROM)
        // to cut off reinforcements — most surgical choice.
        let bestLaunchPlanet: PlanetData | null = null;
        let lowestDefense = Infinity;
        for (const id of attackerHomePlanetIds) {
          const p = state.planets.get(id);
          if (!p || p.faction === faction || p.faction === 'neutral') continue;
          if (!this.isPlanetVisible(p, faction, state)) continue;
          const def = effectiveDefense(p, this.getOrbitingStrength(p.id, state));
          if (def < lowestDefense) { lowestDefense = def; bestLaunchPlanet = p; }
        }
        counterTarget = bestLaunchPlanet;
      }

      if (!counterTarget) {
        // Everyone else: find the weakest attacker planet our surplus can threaten.
        // "Can threaten" = surplus > planet defense (with a small margin).
        let bestScore = -Infinity;
        for (const p of attackerPlanets) {
          const def = effectiveDefense(p, this.getOrbitingStrength(p.id, state));

          // Skip planets we can't crack with our surplus
          if (surplus < def * 0.8) continue;

          let score = 0;

          // Prefer weaker planets (easier to take)
          score += Math.max(0, 60 - def) * 0.8;

          // Prefer higher-value planets (more disruptive)
          score += p.upgradeLevel * 12;

          // Prefer the launch planet (cuts off the source of the attack)
          if (attackerHomePlanetIds.has(p.id)) score += 25;

          // Prefer closer planets (less travel time = faster disruption)
          const dist = Math.sqrt(this.distSq(planet, p));
          score -= dist * 0.03;

          if (score > bestScore) { bestScore = score; counterTarget = p; }
        }
      }

      if (!counterTarget) continue;

      // Select exact whole-unit strength so a composite cannot consume the garrison.
      const orbiters = state.particles.filter(p => p.alive && p.mode === 'orbiting' && p.homePlanetId === planet.id && p.faction === faction);
      const budget = Math.min(surplus, orbiting * strategy.attackFraction);
      const surplusIds = selectSurplusIds(orbiters, budget);
      if (surplusIds.length === 0) continue;
      if (scoreRoute(state, planet.x, planet.y, counterTarget.x, counterTarget.y) < strategy.hazardToleranceThreshold) continue;
      this.states.set(faction, 'counterattack');
      this.deployParticles([], counterTarget, deployCallback, 1, surplusIds, state);
      this.aggressorCooldowns.set(planet.id, 10); // longer cooldown — we just stripped defenders

      console.log(`[AI] Counterattack! ${faction} (${subRole}) striking ${counterTarget.id} from ${planet.id} (incoming=${incomingEnemies} surplus=${surplus})`);
      return true;
    }

    return false;
  }

  // -------------------------------------------------------------------------
  // Retreat / Regroup — pull units from doomed planets (Normal/Hard)
  // -------------------------------------------------------------------------

  private _checkRetreat(
    faction: Faction,
    state: GameState,
    deployCallback: DeployCallback,
  ): boolean {
    const ownPlanets = this.getOwnPlanets(faction, state);
    if (ownPlanets.length <= 1) return false;

    for (const planet of ownPlanets) {
      // Count incoming enemy particles heading toward this planet
      let incomingEnemies = 0;
      for (const p of state.particles) {
        if (p.alive && p.faction !== faction && p.faction !== 'neutral' &&
            p.mode === 'traveling' && p.targetPlanetId === planet.id) {
          incomingEnemies += p.strength;
        }
      }

      if (incomingEnemies === 0) continue;

      const orbiting = this.getOrbitingStrength(planet.id, state);
      const totalDefense = effectiveDefense(planet, orbiting);

      // If incoming enemies significantly outnumber our defense, retreat
      if (incomingEnemies > totalDefense * 1.5 && orbiting > 3) {
        const safePlanets = ownPlanets.filter(p => p.id !== planet.id);
        const safeTarget = this.nearestPlanet(safePlanets, planet);
        if (safeTarget) {
          this.states.set(faction, 'retreat');
          this.deployParticles([planet], safeTarget, deployCallback, 1, [], state);
          this.aggressorCooldowns.set(planet.id, 5);

          // Hard: counter-attack the source of the incoming wave
          if (this._difficulty === 'hard' && safePlanets.length > 1) {
            const attackerSources = new Set<string>();
            for (const p of state.particles) {
              if (p.alive && p.faction !== faction && p.faction !== 'neutral' &&
                  p.mode === 'traveling' && p.targetPlanetId === planet.id && p.homePlanetId) {
                attackerSources.add(p.homePlanetId);
              }
            }
            if (attackerSources.size > 0) {
              const counterTargetId = attackerSources.values().next().value as string;
              const counterTarget = state.planets.get(counterTargetId);
              if (counterTarget && counterTarget.faction !== faction) {
                const counterSource = safePlanets.find(
                  p => p.id !== safeTarget.id && this.getOrbitingStrength(p.id, state) > 5
                );
                if (counterSource) {
                  this.deployParticles([counterSource], counterTarget, deployCallback, this.strategies.get(faction)!.attackFraction, [], state);
                  this.aggressorCooldowns.set(counterSource.id, 8);
                }
              }
            }
          }
          return true;
        }
      }
    }
    return false;
  }

  // -------------------------------------------------------------------------
  // Find nearest neutral (for opening move)
  // -------------------------------------------------------------------------

  private _findNearestNeutral(
    faction: Faction,
    ownPlanets: PlanetData[],
    state: GameState,
  ): PlanetData | null {
    let best: PlanetData | null = null;
    let bestDistSq = Infinity;

    for (const planet of state.planets.values()) {
      if (planet.faction !== 'neutral') continue;
      if (!this.isPlanetVisible(planet, faction, state)) continue;

      // Distance from the nearest own planet
      for (const own of ownPlanets) {
        const dSq = this.distSq(own, planet);
        if (dSq < bestDistSq) {
          bestDistSq = dSq;
          best = planet;
        }
      }
    }
    return best;
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

  private getTotalStrength(faction: Faction, state: GameState): number {
    let total = 0;
    for (const particle of state.particles) {
      if (particle.alive && particle.faction === faction) total += particle.strength;
    }
    return total;
  }

  private getOrbitingStrength(planetId: string, state: GameState): number {
    let count = 0;
    for (const particle of state.particles) {
      if (particle.alive && particle.mode === 'orbiting' && particle.homePlanetId === planetId) count += particle.strength;
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
        let r = 250;
        if (p.upgradeLevel === 2) r = 425;
        if (p.upgradeLevel === 3) r = 650;
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

  private findBestPlanetToUpgrade(planets: PlanetData[], maxUpgrade: UpgradeLevel, shieldBonus = 0): PlanetData | null {
    let best: PlanetData | null = null;
    let bestScore = -Infinity;
    for (const planet of planets) {
      if (planet.upgradeLevel >= maxUpgrade) continue;
      // Score = current upgrade level * 10 (higher level = more progress = worth feeding)
      //       + health fraction (fuller planet = more efficient)
      //       + shield bonus for shielded planets (they generate free defenders)
      let score = planet.upgradeLevel * 10;
      score += (planet.health / planet.maxHealth) * 5;
      if (planet.isShielded) {
        score += shieldBonus; // Role-specific: fortress values shields much more
      }
      if (score > bestScore) {
        bestScore = score;
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
    fraction: number,
    stationedParticleIds?: number[],
    state?: GameState
  ): void {
    if (sources.length === 0 && (!stationedParticleIds || stationedParticleIds.length === 0)) return;

    if (state && isGammaDangerous(state, target.x, target.y)) return;

    const sourceIds = new Set(sources.map(p => p.id));
    const stationedIds = new Set(stationedParticleIds ?? []);
    const candidates = state?.particles.filter(p => p.alive && (
      (p.mode === 'orbiting' && sourceIds.has(p.homePlanetId)) || stationedIds.has(p.id)
    )) ?? [];
    const originalTargetFaction = target.faction;

    if (state && sources.length > 0) {
      const faction = sources[0].faction;
      const strategy = this.strategies.get(faction)!;

      for (const src of sources) {
        let waypointX: number | undefined;
        let waypointY: number | undefined;

        const routeScore = scoreRoute(state, src.x, src.y, target.x, target.y);
        if (routeScore < strategy.hazardToleranceThreshold) {
          if (strategy.usesWaypoints) {
            const wp = computeWaypoint(
              src.x, src.y, target.x, target.y,
              state, state.worldWidth, state.worldHeight, 50
            );
            if (wp) { 
              waypointX = wp.wpx; 
              waypointY = wp.wpy; 
            } else if (routeScore <= -900) {
              // Lethal hazard with no viable waypoint! Abort attack for this source.
              continue;
            }
          } else if (routeScore <= -900) {
            // Lethal hazard, and role doesn't use waypoints! Abort attack for this source.
            continue;
          }
        }
        deployCallback([src.id], target.id, undefined, waypointX, waypointY, fraction);
      }
    }

    if (stationedParticleIds && stationedParticleIds.length > 0) {
      deployCallback([], target.id, stationedParticleIds, undefined, undefined, fraction);
    }
    const launched = candidates.filter(p => p.alive && p.mode === 'traveling' && p.targetPlanetId === target.id);
    if (launched.length > 0) {
      // Mixed-faction orders are never intentionally issued by the AI; group defensively.
      const factions = new Set(launched.map(p => p.faction));
      for (const faction of factions) this.activeWaves.push({
        faction, targetPlanetId: target.id,
        particleIds: launched.filter(p => p.faction === faction).map(p => p.id),
        originalTargetFaction, sentAt: this._gameElapsed,
      });
    }

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

      const waveIds = new Set(wave.particleIds);
      const waveParticles = state.particles.filter(
        p => p.alive && p.faction === wave.faction && p.targetPlanetId === wave.targetPlanetId && waveIds.has(p.id) && (p.mode === 'traveling' || p.mode === 'combat')
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
        ? effectiveDefense(capturedPlanet, this.getOrbitingStrength(capturedPlanet.id, state))
        : 0;
      const waveStrength = unitStrength(waveParticles);
      const subRole = this.subRoles.get(wave.faction)!;
      const redirect = (target: PlanetData, ids: number[]) => {
        deployCallback([], target.id, ids);
        wave.targetPlanetId = target.id;
        wave.originalTargetFaction = target.faction;
        wave.sentAt = this._gameElapsed;
        wave.waypointX = undefined;
        wave.waypointY = undefined;
      };


      if (isPastPointOfNoReturn) {
        // Can't turn back — commit or accept as sacrifice
        if (subRole !== 'berserker' && subRole !== 'blitzkrieg' && subRole !== 'easy_turtle') {
          if (waveStrength < newDefense * 0.8) {
            // Sacrifice — accept loss
          }
        }
      } else {
        // Can still redirect — decide what to do
        const waveParticleIds = waveParticles.map(p => p.id);

        if (subRole === 'fortress' || subRole === 'economic' || subRole === 'dominator') {
          if (nearestFriendly) {
            redirect(nearestFriendly, waveParticleIds);
          }
        } else if (subRole === 'opportunist' || subRole === 'expander' || subRole === 'blitzkrieg') {
          const altNeutral = this.findWeakestNeutral(state, wave.faction);
          const altEnemy = altNeutral ? null : this._findBestAttackTarget(
            wave.faction, this.getOwnPlanets(wave.faction, state), state,
            this._assessSituation(wave.faction, state)
          );
          const altTarget = altNeutral ?? altEnemy;
          if (altTarget) {
            redirect(altTarget, waveParticleIds);
          } else if (nearestFriendly) {
            redirect(nearestFriendly, waveParticleIds);
          }
        } else if (subRole === 'balanced') {
          if (waveStrength >= newDefense * 1.0) {
            // Keep going
          } else if (nearestFriendly) {
            redirect(nearestFriendly, waveParticleIds);
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
    return planets.reduce((best, p) => (this.getOrbitingStrength(p.id, state) > this.getOrbitingStrength(best.id, state) ? p : best));
  }

  private nearestPlanet(planets: PlanetData[], target: PlanetData | { x: number; y: number }): PlanetData | null {
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
      if (age > 10) continue;
      if (event.faction === faction) continue;

      const planet = state.planets.get(event.planetId);
      if (!planet || planet.faction === faction || planet.faction === 'neutral') continue;
      if (!this.isPlanetVisible(planet, faction, state)) continue;

      const currentOrbit = this.getOrbitingStrength(event.planetId, state);
      const depleted = event.orbitCountBefore - currentOrbit;
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
   * Now uses per-strategy range and considers combined multi-source force.
   */
  /**
   * Find an opportunity target — a nearby enemy planet that we can take with
   * combined local forces. Upgraded to v6:
   * - Uses _scoreAttackTarget (threat-leader aware, fixation-penalised) not raw defense
   * - Scans ALL visible enemy planets, not just those within opportunityRange
   *   (opportunityRange still gates which SOURCE planets contribute force)
   * - Requires combined force > defense * 1.3 to qualify as an opportunity
   * - If the threat leader has a clearly undefended planet anywhere on the map,
   *   that is surfaced even if it requires pooling from distant sources
   */
  private _findOpportunityTarget(
    faction: Faction,
    sourcePlanets: PlanetData[],
    state: GameState,
    stationedCount: number,
  ): PlanetData | null {
    const strategy = this.strategies.get(faction)!;
    const assessment = this._assessSituation(faction, state);
    const OPPORTUNITY_RANGE_SQ = strategy.opportunityRange * strategy.opportunityRange;

    let best: PlanetData | null = null;
    let bestScore = -Infinity;

    for (const planet of state.planets.values()) {
      if (planet.faction === faction || planet.faction === 'neutral') continue;
      if (!this.isPlanetVisible(planet, faction, state)) continue;

      const enemyOrbit  = this.getOrbitingStrength(planet.id, state);
      const totalDefense = effectiveDefense(planet, enemyOrbit);

      // Calculate combined local force (sources within opportunity range)
      let localForce = stationedCount;
      for (const src of sourcePlanets) {
        if (this.distSq(src, planet) <= OPPORTUNITY_RANGE_SQ) {
          localForce += this.getOrbitingStrength(src.id, state);
        }
      }

      // Calculate total pooled force (ALL sources, for threat-leader check)
      const totalPooled = sourcePlanets.reduce(
        (s, p) => s + this.getOrbitingStrength(p.id, state), stationedCount
      );

      // ── Two qualification paths ─────────────────────────────────────────
      // Path A: Local opportunity — nearby sources can overwhelm the target
      const localQualifies = localForce > totalDefense * 1.3;

      // Path B: Threat-leader undefended planet — pool ALL sources against a
      // weak planet belonging to the winning faction, even if it's far away.
      const isThreatLeaderPlanet = assessment.highestProductionFaction !== null &&
        planet.faction === assessment.highestProductionFaction;
      const leaderQualifies = isThreatLeaderPlanet &&
        totalDefense <= 8 && // genuinely undefended
        totalPooled > totalDefense * 1.5;

      if (!localQualifies && !leaderQualifies) continue;

      // Score using the full threat-aware scoring function
      const score = this._scoreAttackTarget(planet, faction, sourcePlanets, state, assessment);
      if (score > bestScore) {
        bestScore = score;
        best = planet;
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

  /** Returns true if this faction is currently in an active breakthrough surge. */
  isBreakingThrough(faction: Faction): boolean {
    return this._breakthroughs.has(faction);
  }
}
