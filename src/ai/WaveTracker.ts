import type { ParticleData } from "../types";
import type { AIWave } from "./AIStrategies";
/** One particle index per tick replaces a linear search for every wave member. */
export class WaveTracker {
  private readonly seen = new Set<number>();
  private readonly active = new Set<number>();
  prune(waves: AIWave[], particles: readonly ParticleData[]): void {
    if (waves.length === 0) return;
    this.seen.clear();
    this.active.clear();
    for (const p of particles) {
      if (this.seen.has(p.id)) continue;
      this.seen.add(p.id);
      if (p.alive && (p.mode === "traveling" || p.mode === "combat"))
        this.active.add(p.id);
    }
    let write = 0;
    for (const wave of waves)
      if (wave.particleIds.some((id) => this.active.has(id)))
        waves[write++] = wave;
    waves.length = write;
  }
}
