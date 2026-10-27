import { describe, it, expect, vi } from "vitest";
import { createGameState } from "../createGameState";
import { compactAliveParticles, advanceHazardEffects } from "../maintenance";
import { PlanetCollisionSystem } from "../../systems/PlanetCollisionSystem";
import { WaveTracker } from "../../ai/WaveTracker";
import { SubscriptionScope } from "../../core/SubscriptionScope";
import { EventBus } from "../../core/EventBus";
import {
  createMockGameState,
  createMockParticle,
  createMockPlanet,
} from "../../utils/__tests__/TestFactory";
import type { LevelData } from "../../types";

const level = {
  id: "test",
  name: "test",
  worldWidth: 1000,
  worldHeight: 1000,
  planets: [
    {
      id: "p",
      x: 100,
      y: 100,
      faction: "player",
      upgradeLevel: 1,
      startingParticles: 3,
    },
  ],
  blackHoles: [],
} as unknown as LevelData;
describe("simulation module contracts", () => {
  it("creates independent states without mutating level inputs", () => {
    const before = JSON.stringify(level);
    const a = createGameState(level, () => 0.5);
    const b = createGameState(level, () => 0.5);
    expect(a).toEqual(b);
    expect(a.particles).toHaveLength(3);
    a.particles[0].alive = false;
    expect(b.particles[0].alive).toBe(true);
    expect(JSON.stringify(level)).toBe(before);
    for (const p of b.particles)
      expect(p.faction).toBe(b.planets.get(p.homePlanetId)?.faction);
  });
  it("stably compacts particles in place, including all dead and empty", () => {
    const particles = [
      createMockParticle({ id: 1 }),
      createMockParticle({ id: 2, alive: false }),
      createMockParticle({ id: 3 }),
    ];
    const ref = particles;
    compactAliveParticles(particles);
    expect(particles).toBe(ref);
    expect(particles.map((p) => p.id)).toEqual([1, 3]);
    particles.forEach((p) => (p.alive = false));
    compactAliveParticles(particles);
    expect(particles).toEqual([]);
    compactAliveParticles(particles);
  });
  it("ages and expires effects at the exact boundary in place", () => {
    const effects = [
      { id: 1, age: 0, duration: 1 },
      { id: 2, age: 0.8, duration: 1 },
    ] as any;
    const ref = effects;
    advanceHazardEffects(effects, 0.2);
    expect(effects).toBe(ref);
    expect(effects.map((e: any) => e.id)).toEqual([1]);
    expect(effects[0].age).toBe(0.2);
  });
  it("strands units and clears selection for colliding moving planets", () => {
    const state = createMockGameState();
    state.planets.set("a", createMockPlanet({ id: "a", isOrbiting: true }));
    state.planets.set("b", createMockPlanet({ id: "b", x: 110 }));
    state.selectedPlanetIds.add("a");
    state.particles.push(
      createMockParticle({ homePlanetId: "a", vx: 20, vy: 10 }),
    );
    new PlanetCollisionSystem().update(state);
    expect(state.planets.size).toBe(0);
    expect(state.selectedPlanetIds.size).toBe(0);
    expect(state.particles[0]).toMatchObject({
      mode: "stationed",
      vx: 0,
      vy: 0,
    });
    expect(state._pendingPlanetHazardDeaths).toBe(2);
  });
  it("does not destroy overlapping stationary planets", () => {
    const s = createMockGameState();
    s.planets.set("a", createMockPlanet({ id: "a" }));
    s.planets.set("b", createMockPlanet({ id: "b" }));
    new PlanetCollisionSystem().update(s);
    expect(s.planets.size).toBe(2);
  });
  it("prunes waves by live traveling/combat IDs with stable first-match semantics", () => {
    const tracker = new WaveTracker();
    const waves = [
      { particleIds: [1] },
      { particleIds: [2, 3] },
      { particleIds: [4] },
      { particleIds: [5] },
      { particleIds: [6] },
    ] as any;
    const particles = [
      createMockParticle({ id: 1, mode: "traveling" }),
      createMockParticle({ id: 2, alive: false }),
      createMockParticle({ id: 3, mode: "combat" }),
      createMockParticle({ id: 4, mode: "orbiting" }),
      createMockParticle({ id: 5, mode: "stationed" }),
      createMockParticle({ id: 6, alive: false }),
      createMockParticle({ id: 6, mode: "traveling" }),
    ];
    tracker.prune(waves, particles);
    expect(waves.map((w: any) => w.particleIds)).toEqual([[1], [2, 3]]);
    tracker.prune(waves, []);
    expect(waves).toEqual([]);
  });
  it("unsubscribes owned listeners only and permits repeated teardown", () => {
    const bus = new EventBus();
    const scope = new SubscriptionScope();
    const owned = vi.fn();
    const other = vi.fn();
    scope.add(bus.on("game:over", owned));
    bus.on("game:over", other);
    bus.emit("game:over", { winner: "player" });
    scope.dispose();
    scope.dispose();
    bus.emit("game:over", { winner: "player" });
    expect(owned).toHaveBeenCalledTimes(1);
    expect(other).toHaveBeenCalledTimes(2);
  });
});
