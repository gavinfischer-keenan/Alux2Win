import type { ParticleData } from "../types";

// Bound dense bookkeeping to 8 MiB; larger swarms use sparse pair storage.
const DENSE_LIMIT = 8192;
/** Per-tick object ordinals avoid precision loss from long-lived particle IDs.
 * A bounded reusable bitset handles ordinary swarms without per-pair Set entries.
 * Unlike ID ordering, this also works with asymmetric tick-start neighborhoods.
 */
export class CollisionPairTracker {
  private readonly indices = new Map<ParticleData, number>();
  private bits = new Uint32Array(0);
  private readonly sparse = new Set<number>();
  private count = 0;
  begin(particles: readonly ParticleData[]): void {
    this.indices.clear();
    this.sparse.clear();
    this.count = particles.length;
    for (let i = 0; i < particles.length; i++)
      this.indices.set(particles[i], i);
    if (this.count <= DENSE_LIMIT) {
      const words = Math.ceil((this.count * this.count) / 32);
      if (this.bits.length < words) this.bits = new Uint32Array(words);
      else this.bits.fill(0, 0, words);
    }
  }
  markIfNew(a: ParticleData, b: ParticleData): boolean {
    const i = this.indices.get(a)!,
      j = this.indices.get(b)!;
    const key = Math.min(i, j) * this.count + Math.max(i, j);
    if (this.count > DENSE_LIMIT) {
      if (this.sparse.has(key)) return false;
      this.sparse.add(key);
      return true;
    }
    const word = key >>> 5,
      mask = 1 << (key & 31);
    if (this.bits[word] & mask) return false;
    this.bits[word] |= mask;
    return true;
  }
}
