// ============================================================
// AIController.ts — Heuristic state-machine AI for Alux2Win
// Manages one or more AI factions with timed decision loops.
// ============================================================

import {
  Faction,
  GameState,
  PlanetData,
  UpgradeLevel,
} from '../types';

/** The four mutually exclusive high-level intentions the AI can be in. */
type AIState = 'defend' | 'conquer_neutral' | 'upgrade' | 'attack';

/** Callback signature for deploying particles from one set of planets to a target. */
export type DeployCallback = (fromIds: string[], targetPlanetId: string) => void;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Base seconds between AI evaluations. */
const BASE_EVAL_INTERVAL = 3.0;

/** Jitter applied +-EVAL_JITTER seconds so multiple AI factions do not evaluate simultaneously. */
const EVAL_JITTER = 1.0;

/** Minimum particles a planet must have before it contributes to a deployment. */
const MIN_PARTICLES_TO_DEPLOY = 10;

/** Particles to keep in reserve on the source planet. */
const RESERVE_PARTICLES = 5;

/** Ratio of AI total particles over player total that triggers aggression. */
const AGGRESSION_RATIO = 1.4;

/** Max upgrade level — do not try to upgrade beyond this. */
const MAX_UPGRADE: UpgradeLevel = 3;

/** Minimum total particles the AI needs before attempting an upgrade deployment. */
const UPGRADE_TRIGGER_PARTICLES = 40;

/** Maximum particles on a neutral planet that the AI will risk attacking. */
const NEUTRAL_ATTACK_THRESHOLD = 5;

// ---------------------------------------------------------------------------
// AIController
// ---------------------------------------------------------------------------

export class AIController {
  /** All factions managed by this controller. */
  private factions: Faction[];

  /**
   * Tracks accumulated delta-time for each faction.
   * When a faction timer exceeds its next evaluation interval the AI decides.
   */
  private timers: Map<Faction, number>;

  /** Per-faction randomised evaluation intervals (re-rolled after each decision). */
  private evalIntervals: Map<Faction, number>;

  /** The current high-level state for each faction (for debugging / HUD). */
  private states: Map<Faction, AIState>;

  constructor(factions: Faction[]) {
    this.factions = factions;
    this.timers = new Map();
    this.evalIntervals = new Map();
    this.states = new Map();

    for (const faction of factions) {
      // Stagger initial evaluation so factions do not all fire on tick 0.
      this.timers.set(faction, Math.random() * BASE_EVAL_INTERVAL);
      this.evalIntervals.set(faction, this.randomInterval());
      this.states.set(faction, 'defend');
    }
  }

  // -------------------------------------------------------------------------
  // Public update — called every frame from GameScene
  // -------------------------------------------------------------------------

  /**
   * Advances AI timers and triggers evaluations when intervals expire.
   *
   * @param dt             Frame delta-time in seconds.
   * @param state          Current shared GameState.
   * @param deployCallback Callback to invoke when the AI wants to deploy particles.
   */
  update(dt: number, state: GameState, deployCallback: DeployCallback): void {
    if (!state.running) return;

    for (const faction of this.factions) {
      const elapsed = (this.timers.get(faction) ?? 0) + dt;
      const interval = this.evalIntervals.get(faction) ?? BASE_EVAL_INTERVAL;

      if (elapsed >= interval) {
        // Reset timer and randomise next interval before evaluating.
        this.timers.set(faction, 0);
        this.evalIntervals.set(faction, this.randomInterval());
        this.evaluate(faction, state, deployCallback);
      } else {
        this.timers.set(faction, elapsed);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Core decision logic
  // -------------------------------------------------------------------------

  /**
   * Evaluates the current situation for a single faction and acts accordingly.
   * Priority order: upgrade > conquer neutral > attack > defend.
   */
  private evaluate(
    faction: Faction,
    state: GameState,
    deployCallback: DeployCallback,
  ): void {
    const ownPlanets = this.getOwnPlanets(faction, state);

    // Dead faction — nothing to do.
    if (ownPlanets.length === 0) {
      this.states.set(faction, 'defend');
      return;
    }

    const totalParticles = this.getTotalParticles(faction, state);
    const playerParticles = this.getTotalParticles('player', state);

    // Planets with enough particles to be worth deploying from.
    const sourcePlanets = ownPlanets.filter(
      (p) => p.particles > MIN_PARTICLES_TO_DEPLOY,
    );

    // --- Branch 1: Upgrade ---
    if (sourcePlanets.length > 0 && totalParticles >= UPGRADE_TRIGGER_PARTICLES) {
      const bestUpgradePlanet = this.findBestPlanetToUpgrade(ownPlanets);
      if (bestUpgradePlanet !== null && bestUpgradePlanet.upgradeLevel < MAX_UPGRADE) {
        this.states.set(faction, 'upgrade');

        const richestSource = this.richestPlanet(sourcePlanets);
        if (richestSource !== null && richestSource.id !== bestUpgradePlanet.id) {
          this.deployParticles([richestSource], bestUpgradePlanet, deployCallback, 0.5);
        } else if (richestSource !== null) {
          // Source IS the upgrade target — use the second richest if one exists.
          const alt = sourcePlanets.find((p) => p.id !== richestSource.id) ?? null;
          if (alt !== null) {
            this.deployParticles([alt], bestUpgradePlanet, deployCallback, 0.5);
          }
        }
        return;
      }
    }

    // --- Branch 2: Conquer Neutral ---
    const weakestNeutral = this.findWeakestNeutral(state);
    if (
      weakestNeutral !== null &&
      weakestNeutral.particles < NEUTRAL_ATTACK_THRESHOLD &&
      sourcePlanets.length > 0
    ) {
      this.states.set(faction, 'conquer_neutral');
      const nearest = this.nearestPlanet(sourcePlanets, weakestNeutral);
      if (nearest !== null) {
        this.deployParticles([nearest], weakestNeutral, deployCallback, 0.6);
      }
      return;
    }

    // --- Branch 3: Attack ---
    if (
      totalParticles > playerParticles * AGGRESSION_RATIO &&
      sourcePlanets.length > 0
    ) {
      const weakestPlayer = this.findWeakestPlayerPlanet(state);
      if (weakestPlayer !== null) {
        this.states.set(faction, 'attack');
        this.deployParticles(sourcePlanets, weakestPlayer, deployCallback, 0.55);
        return;
      }
    }

    // --- Branch 4: Defend (accumulate) ---
    this.states.set(faction, 'defend');
  }

  // -------------------------------------------------------------------------
  // Query helpers
  // -------------------------------------------------------------------------

  /** Returns all planets belonging to the given faction. */
  private getOwnPlanets(faction: Faction, state: GameState): PlanetData[] {
    const result: PlanetData[] = [];
    for (const planet of state.planets.values()) {
      if (planet.faction === faction) {
        result.push(planet);
      }
    }
    return result;
  }

  /**
   * Sums the total particles available to a faction:
   * stationed particles on planets + traveling particles in flight.
   */
  private getTotalParticles(faction: Faction, state: GameState): number {
    let total = 0;

    for (const planet of state.planets.values()) {
      if (planet.faction === faction) {
        total += planet.particles;
      }
    }

    for (const particle of state.particles) {
      if (particle.alive && particle.faction === faction) {
        total++;
      }
    }

    return total;
  }

  /**
   * Finds the weakest (fewest particles) neutral planet on the map.
   * Returns null if there are no neutral planets.
   */
  private findWeakestNeutral(state: GameState): PlanetData | null {
    let best: PlanetData | null = null;
    for (const planet of state.planets.values()) {
      if (planet.faction === 'neutral') {
        if (best === null || planet.particles < best.particles) {
          best = planet;
        }
      }
    }
    return best;
  }

  /**
   * Finds the weakest (fewest particles) planet owned by the human player.
   * Returns null if the player has no planets.
   */
  private findWeakestPlayerPlanet(state: GameState): PlanetData | null {
    let best: PlanetData | null = null;
    for (const planet of state.planets.values()) {
      if (planet.faction === 'player') {
        if (best === null || planet.particles < best.particles) {
          best = planet;
        }
      }
    }
    return best;
  }

  /**
   * Among the given planets, returns the one most worth upgrading.
   * Prefers higher current level (closer to threshold), ties broken by particle count.
   * Returns null if all planets are already at MAX_UPGRADE.
   */
  private findBestPlanetToUpgrade(planets: PlanetData[]): PlanetData | null {
    let best: PlanetData | null = null;
    for (const planet of planets) {
      if (planet.upgradeLevel >= MAX_UPGRADE) continue;
      if (best === null) {
        best = planet;
        continue;
      }
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

  /**
   * Issues a deploy order by calling the provided callback.
   *
   * @param sources        Source planets to pull particles from.
   * @param target         Destination planet.
   * @param deployCallback Registered callback in GameScene.
   * @param fraction       Fraction of surplus particles to send (0-1); used to
   *                       signal intent — actual amount is controlled by GameScene.
   */
  private deployParticles(
    sources: PlanetData[],
    target: PlanetData,
    deployCallback: DeployCallback,
    _fraction: number,
  ): void {
    const validSources = sources.filter((p) => p.particles > RESERVE_PARTICLES);
    if (validSources.length === 0) return;

    const fromIds = validSources.map((p) => p.id);
    deployCallback(fromIds, target.id);
  }

  // -------------------------------------------------------------------------
  // Spatial helpers
  // -------------------------------------------------------------------------

  /** Returns the planet in the list with the most stationed particles. */
  private richestPlanet(planets: PlanetData[]): PlanetData | null {
    if (planets.length === 0) return null;
    return planets.reduce((best, p) => (p.particles > best.particles ? p : best));
  }

  /** Returns the planet in the list closest to the target. */
  private nearestPlanet(planets: PlanetData[], target: PlanetData): PlanetData | null {
    if (planets.length === 0) return null;
    let nearest = planets[0];
    let nearestDistSq = this.distSq(planets[0], target);

    for (let i = 1; i < planets.length; i++) {
      const d = this.distSq(planets[i], target);
      if (d < nearestDistSq) {
        nearestDistSq = d;
        nearest = planets[i];
      }
    }
    return nearest;
  }

  /** Squared Euclidean distance between two positional objects. */
  private distSq(a: { x: number; y: number }, b: { x: number; y: number }): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return dx * dx + dy * dy;
  }

  /** Returns a randomised evaluation interval around BASE_EVAL_INTERVAL. */
  private randomInterval(): number {
    return BASE_EVAL_INTERVAL + (Math.random() * 2 - 1) * EVAL_JITTER;
  }

  // -------------------------------------------------------------------------
  // Accessors (for debugging / HUD)
  // -------------------------------------------------------------------------

  /** Returns the current AI state for the given faction. */
  getState(faction: Faction): AIState {
    return this.states.get(faction) ?? 'defend';
  }

  /** Returns which factions this controller manages. */
  getManagedFactions(): Faction[] {
    return [...this.factions];
  }
}
