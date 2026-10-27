import { it, vi } from "vitest";
vi.mock("../core/AudioManager", () => ({
  audioManager: { playCombatEngage: () => {} },
}));
import { CollisionSystem } from "../systems/CollisionSystem";
import { SpatialHash } from "../core/SpatialHash";
import {
  createMockGameState,
  createMockParticle,
} from "../utils/__tests__/TestFactory";
it("records deterministic local CPU collision timings (not an FPS assertion)", () => {
  const results = [];
  for (const [name, count, width] of [
    ["distributed", 5000, 2000],
    ["dense", 1500, 180],
  ] as const) {
    let seed = 42;
    const random = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
    const template = Array.from({ length: count }, (_, i) =>
      createMockParticle({
        id: i + 1,
        x: random() * width,
        y: random() * width,
        faction: i % 2 ? "enemy_a" : "player",
        mode: "traveling",
      }),
    );
    const system = new CollisionSystem();
    const hash = new SpatialHash(2048, 2048, 32);
    const times = [];
    for (let run = 0; run < 25; run++) {
      const state = createMockGameState();
      state.particles = template.map((p) => ({ ...p }));
      hash.clear();
      state.particles.forEach((p) => hash.insert(p));
      const start = performance.now();
      system.update(state, hash);
      const ms = performance.now() - start;
      if (run >= 5) times.push(ms);
    }
    times.sort((a, b) => a - b);
    results.push({
      name,
      count,
      medianMs: times[Math.floor(times.length / 2)],
      samples: times.length,
    });
  }
  console.log("COLLISION_BENCHMARK " + JSON.stringify(results));
});
