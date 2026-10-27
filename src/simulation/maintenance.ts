import type { ParticleData, HazardEffect } from "../types";
/** Stable in-place compaction keeps shared collection references valid. */
export function compactAliveParticles(particles: ParticleData[]): void {
  let write = 0;
  for (let read = 0; read < particles.length; read++)
    if (particles[read].alive) particles[write++] = particles[read];
  particles.length = write;
}
export function advanceHazardEffects(
  effects: HazardEffect[],
  dt: number,
): void {
  let write = 0;
  for (const effect of effects) {
    effect.age += dt;
    if (effect.age < effect.duration) effects[write++] = effect;
  }
  effects.length = write;
}
