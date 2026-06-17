// ============================================================
// GameLoop.ts — Fixed-timestep game loop for Alux2Win
// ============================================================

/** Fixed physics timestep: 1/60 second. */
export const TARGET_FPS = 60;
export const FIXED_DT = 1 / TARGET_FPS;

/** Maximum accumulated time per frame to avoid the spiral-of-death. */
const MAX_ACCUMULATOR = FIXED_DT * 5;

/**
 * Fixed-timestep loop using requestAnimationFrame.
 *
 * Pattern:
 *   1. Accumulate real elapsed time.
 *   2. Consume accumulator in FIXED_DT chunks, calling update() each time.
 *   3. Call render() once with the interpolation alpha (leftover fraction).
 *
 * This decouples simulation rate from display rate, giving deterministic physics
 * at 60 tps even on high-refresh monitors.
 */
export class GameLoop {
  private rafHandle: number = 0;
  private lastTimestamp: number = 0;
  private accumulator: number = 0;
  private _running: boolean = false;

  /** Smoothed FPS estimate (EMA). */
  public currentFPS: number = 0;
  private fpsAlpha: number = 0.1; // EMA smoothing factor

  constructor(
    private readonly update: (dt: number) => void,
    private readonly render: (alpha: number) => void
  ) {}

  /** Start the loop. Safe to call multiple times (idempotent). */
  start(): void {
    if (this._running) return;
    this._running = true;
    this.lastTimestamp = performance.now();
    this.accumulator = 0;
    this.rafHandle = requestAnimationFrame(this.tick);
  }

  /** Stop the loop cleanly. */
  stop(): void {
    this._running = false;
    if (this.rafHandle !== 0) {
      cancelAnimationFrame(this.rafHandle);
      this.rafHandle = 0;
    }
  }

  get running(): boolean {
    return this._running;
  }

  private tick = (timestamp: number): void => {
    if (!this._running) return;

    // --- Compute real elapsed delta ---
    let dt = (timestamp - this.lastTimestamp) / 1000; // seconds
    this.lastTimestamp = timestamp;

    // Guard against huge spikes (tab hidden, debugger breakpoints, etc.)
    if (dt > MAX_ACCUMULATOR) dt = MAX_ACCUMULATOR;

    // Update smoothed FPS (based on real frame time, not capped)
    if (dt > 0) {
      const instantFPS = 1 / dt;
      this.currentFPS =
        this.currentFPS === 0
          ? instantFPS
          : this.currentFPS * (1 - this.fpsAlpha) + instantFPS * this.fpsAlpha;
    }

    // --- Fixed-timestep update loop ---
    this.accumulator += dt;
    while (this.accumulator >= FIXED_DT) {
      this.update(FIXED_DT);
      this.accumulator -= FIXED_DT;
    }

    // --- Render with interpolation alpha ---
    const alpha = this.accumulator / FIXED_DT;
    this.render(alpha);

    // --- Schedule next frame ---
    this.rafHandle = requestAnimationFrame(this.tick);
  };
}
