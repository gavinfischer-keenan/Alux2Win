import type { ParticleData } from "../types";
import type { AIWave } from "./AIStrategies";
/** One particle index per tick; a unit leaves its old wave permanently on arrival or retarget. */
export class WaveTracker {
  private readonly particles = new Map<number, ParticleData>();
  prune(waves: AIWave[], particles: readonly ParticleData[]): void {
    if (waves.length === 0) return;
    this.particles.clear();
    for (const p of particles)
      if (!this.particles.has(p.id)) this.particles.set(p.id, p);
    let write = 0;
    for (const wave of waves) {
      let members = 0;
      for (const id of wave.particleIds) {
        const p = this.particles.get(id);
        if (
          p?.alive &&
          p.faction === wave.faction &&
          p.targetPlanetId === wave.targetPlanetId &&
          (p.mode === "traveling" || p.mode === "combat")
        )
          wave.particleIds[members++] = id;
      }
      wave.particleIds.length = members;
      if (members > 0) waves[write++] = wave;
    }
    waves.length = write;
  }
}
