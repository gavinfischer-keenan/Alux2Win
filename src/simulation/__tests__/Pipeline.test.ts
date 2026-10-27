import { it, expect, vi } from "vitest";
vi.mock("../../core/AudioManager", () => ({
  audioManager: new Proxy({}, { get: () => vi.fn() }),
}));
import {
  SimulationPipeline,
  type SimulationSystems,
} from "../SimulationPipeline";
import { EventBus } from "../../core/EventBus";
import {
  createMockGameState,
  createMockParticle,
} from "../../utils/__tests__/TestFactory";
it("keeps simulation order and hazard gating explicit", () => {
  const calls: string[] = [];
  const names = [
    "orbit",
    "planetCollision",
    "production",
    "movement",
    "gravity",
    "collision",
    "combat",
    "upgrade",
    "asteroid",
    "gammaRay",
    "speedZone",
    "portal",
    "trappingBlackHole",
    "whiteHole",
  ];
  const systems = Object.fromEntries(
    names.map((name) => [
      name,
      { update: vi.fn(() => calls.push(name)), setProductionSystem: vi.fn() },
    ]),
  ) as unknown as SimulationSystems;
  const pipeline = new SimulationPipeline(systems),
    s = createMockGameState({ asteroidRespawnTimer: 9999 });
  const bus = new EventBus();
  s.particles = [createMockParticle()];
  pipeline.update(0.1, s, bus);
  expect(calls).toEqual(names.slice(0, 8));
  expect(systems.movement.update).toHaveBeenCalledWith(
    0.1,
    s,
    expect.anything(),
  );
  expect(systems.combat.update).toHaveBeenCalledWith(s, bus);
  calls.length = 0;
  s.asteroidRespawnTimer = 30;
  s.gammaRay.enabled = true;
  s.speedZones = [{} as any];
  s.portals = [{} as any];
  s.trappingBlackHoles = [{} as any];
  s.whiteHoles = [{} as any];
  pipeline.update(0.2, s, bus);
  expect(calls).toEqual(names);
  expect(systems.gammaRay.setProductionSystem).toHaveBeenCalledWith(
    systems.production,
  );
});
