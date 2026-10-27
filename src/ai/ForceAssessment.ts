import type { ParticleData, PlanetData } from "../types";
/** Combat decisions use strength, not rendered sprite count. */
export function unitStrength(particles: readonly ParticleData[]): number {
  let strength = 0;
  for (const p of particles) if (p.alive) strength += p.strength;
  return strength;
}
export function effectiveDefense(
  planet: PlanetData,
  orbitStrength: number,
): number {
  return (
    planet.health +
    orbitStrength +
    (planet.isShielded ? (planet.shieldPoints ?? 0) : 0)
  );
}

/** Select whole units without spending the strength reserved for a garrison. */
export function selectSurplusIds(
  particles: readonly ParticleData[],
  maximumStrength: number,
): number[] {
  const ids: number[] = [];
  let remaining = maximumStrength;
  for (const p of particles)
    if (p.alive && p.strength <= remaining) {
      ids.push(p.id);
      remaining -= p.strength;
    }
  return ids;
}
