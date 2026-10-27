import { describe, it, expect, vi } from "vitest";
vi.mock("../../core/AudioManager", () => ({
  audioManager: { playCombatEngage: vi.fn() },
}));
import { CollisionSystem } from "../CollisionSystem";
import { SpatialHash } from "../../core/SpatialHash";
import {
  createMockGameState,
  createMockParticle,
} from "../../utils/__tests__/TestFactory";
import { COLLISION_DISTANCE } from "../../types";
describe("collision invariants", () => {
  it.each([false, true])(
    "resolves simultaneous reciprocal damage regardless of array order (reverse=%s)",
    (reverse) => {
      const s = createMockGameState({ particleIdCounter: 200 });
      s.particles = [
        createMockParticle({ id: 1, x: 100, y: 100, strength: 5 }),
        createMockParticle({ id: 2, x: 101, y: 100, faction: "enemy_a" }),
        createMockParticle({ id: 3, x: 99, y: 100, faction: "enemy_a" }),
      ];
      if (reverse) s.particles.reverse();
      const hash = new SpatialHash(32);
      s.particles.forEach((p) => hash.insert(p));
      new CollisionSystem().update(s, hash);
      expect(s.particles.filter((p) => p.alive)).toHaveLength(3);
      expect(
        s.particles
          .filter((p) => p.alive)
          .every((p) => p.faction === "player" && p.strength === 1),
      ).toBe(true);
    },
  );
  it("preserves collisions when movement makes grid neighborhoods asymmetric", () => {
    const s = createMockGameState();
    const a = createMockParticle({ id: 1, x: 60, y: 20 });
    const b = createMockParticle({ id: 2, x: 130, y: 20, faction: "enemy_a" });
    s.particles = [a, b];
    const hash = new SpatialHash(64);
    hash.insert(a);
    hash.insert(b);
    // B moves toward A after the tick-start index was built. Only B can see A's old bucket.
    a.x = 60;
    b.x = 65;
    new CollisionSystem().update(s, hash);
    expect(a.alive).toBe(false);
    expect(b.alive).toBe(false);
  });
  it("matches an exact all-pairs reference across deterministic swarms and large IDs", () => {
    let seed = 7;
    const random = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
    for (let run = 0; run < 20; run++) {
      const s = createMockGameState();
      s.particles = Array.from({ length: 80 }, (_, i) =>
        createMockParticle({
          id: 20_000_000 + i,
          x: 100 + random() * 40,
          y: 100 + random() * 40,
          faction: i % 2 ? "enemy_a" : "player",
          strength: 1,
        }),
      );
      const dead = new Set<number>();
      for (let i = 0; i < s.particles.length; i++)
        for (let j = i + 1; j < s.particles.length; j++) {
          const a = s.particles[i],
            b = s.particles[j];
          if (
            a.faction !== b.faction &&
            (a.x - b.x) ** 2 + (a.y - b.y) ** 2 < COLLISION_DISTANCE ** 2
          ) {
            dead.add(a.id);
            dead.add(b.id);
          }
        }
      const hash = new SpatialHash(32);
      s.particles.forEach((p) => hash.insert(p));
      new CollisionSystem().update(s, hash);
      expect(s.particles.filter((p) => !p.alive).map((p) => p.id)).toEqual(
        s.particles.filter((p) => dead.has(p.id)).map((p) => p.id),
      );
    }
  });
});
