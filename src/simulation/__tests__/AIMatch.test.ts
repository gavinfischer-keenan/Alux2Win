import { it, expect, vi, afterEach } from "vitest";
vi.mock("../../core/AudioManager", () => ({
  audioManager: new Proxy({}, { get: () => () => {} }),
}));
import { AIController } from "../../ai/AIController";
import { createGameState } from "../createGameState";
import { SimulationPipeline } from "../SimulationPipeline";
import { compactAliveParticles } from "../maintenance";
import { issueDeploymentOrder } from "../deployment";
import { EventBus } from "../../core/EventBus";
import grid from "../../levels/simple_grid.json";
import type { LevelData } from "../../types";
afterEach(() => vi.restoreAllMocks());
it.each(["easy", "normal", "hard"] as const)(
  "runs a seeded one-minute %s match without invalid orders or non-finite state",
  (difficulty) => {
    let seed = 12345;
    const random = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
    vi.spyOn(Math, "random").mockImplementation(random);
    vi.spyOn(console, "log").mockImplementation(() => {});
    const state = createGameState(grid as unknown as LevelData, random);
    state.running = true;
    const factions = Array.from(
      new Set(Array.from(state.planets.values()).map((p) => p.faction)),
    ).filter((f) => f !== "neutral" && f !== "player");
    const ai = new AIController(factions, difficulty),
      pipeline = new SimulationPipeline(),
      bus = new EventBus();
    ai.subscribeEvents(bus);
    let orders = 0;
    for (let tick = 0; tick < 3600 && state.running; tick++) {
      state.tick++;
      pipeline.update(1 / 60, state, bus);
      compactAliveParticles(state.particles);
      ai.update(1 / 60, state, (from, to, ids, wx, wy, fraction) => {
        expect(state.planets.has(to)).toBe(true);
        for (const id of from) expect(state.planets.has(id)).toBe(true);
        const moved = issueDeploymentOrder(state, {
          sourcePlanetIds: from,
          targetPlanetId: to,
          stationedParticleIds: ids,
          waypointX: wx,
          waypointY: wy,
          fraction,
        });
        orders += moved.length > 0 ? 1 : 0;
      });
      if (tick % 300 === 0)
        for (const p of state.particles) {
          expect(
            Number.isFinite(p.x) &&
              Number.isFinite(p.y) &&
              Number.isFinite(p.vx) &&
              Number.isFinite(p.vy),
          ).toBe(true);
          expect(p.strength === 1 || p.strength === 5).toBe(true);
        }
    }
    expect(orders).toBeGreaterThan(0);
    expect(new Set(state.particles.map((p) => p.id)).size).toBe(
      state.particles.length,
    );
    ai.destroy();
  },
  15000,
);
