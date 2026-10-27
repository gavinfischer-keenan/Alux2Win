import { describe, it, expect, vi, afterEach } from "vitest";
import { AIController } from "../AIController";
import { issueDeploymentOrder } from "../../simulation/deployment";
import {
  createMockGameState,
  createMockParticle,
  createMockPlanet,
} from "../../utils/__tests__/TestFactory";
afterEach(() => vi.restoreAllMocks());
function setup() {
  vi.spyOn(Math, "random").mockReturnValue(0);
  const ai = new AIController(["enemy_a"], "hard");
  const s = createMockGameState();
  const home = createMockPlanet({
    id: "home",
    faction: "enemy_a",
    x: 100,
    y: 100,
  });
  const target = createMockPlanet({
    id: "target",
    faction: "player",
    x: 200,
    y: 100,
    health: 10,
  });
  s.planets.set(home.id, home);
  s.planets.set(target.id, target);
  s.particles = Array.from({ length: 10 }, (_, i) =>
    createMockParticle({
      id: i + 1,
      faction: "enemy_a",
      homePlanetId: "home",
      x: 100,
      y: 100,
    }),
  );
  return { ai, s, home, target };
}
describe("AI tactical improvements", () => {
  it("assesses composite strength and ignores dead particles", () => {
    const { ai, s } = setup();
    s.particles = [
      createMockParticle({
        id: 1,
        strength: 5,
        faction: "enemy_a",
        homePlanetId: "home",
      }),
      createMockParticle({
        id: 2,
        strength: 5,
        faction: "enemy_a",
        alive: false,
      }),
      createMockParticle({ id: 3, strength: 5, faction: "player" }),
      createMockParticle({ id: 4, strength: 1, faction: "player" }),
    ];
    const assessment = (ai as any)._assessSituation("enemy_a", s);
    expect(assessment.myParticles).toBe(5);
    expect(assessment.bestEnemyParticles).toBe(6);
    expect((ai as any).getOrbitingStrength("home", s)).toBe(5);
  });
  it("honors strategy fractions, records actual waves and notices vacated sources", () => {
    const { ai, s, home, target } = setup();
    const callback = vi.fn(
      (
        from: string[],
        to: string,
        ids?: number[],
        wx?: number,
        wy?: number,
        fraction?: number,
      ) =>
        issueDeploymentOrder(s, {
          sourcePlanetIds: from,
          targetPlanetId: to,
          stationedParticleIds: ids,
          waypointX: wx,
          waypointY: wy,
          fraction,
        }),
    );
    (ai as any).deployParticles([home], target, callback, 0.8, [], s);
    expect(callback.mock.calls[0][5]).toBe(0.8);
    expect(s.particles.filter((p) => p.mode === "traveling")).toHaveLength(8);
    expect((ai as any).activeWaves[0].particleIds).toHaveLength(8);
  });
  it("does not invent a wave when deployment launches nothing", () => {
    const { ai, s, home, target } = setup();
    (ai as any).deployParticles([home], target, vi.fn(), 0.8, [], s);
    expect((ai as any).activeWaves).toHaveLength(0);
  });
  it("prefers an equally distant unshielded target over an unaffordable shield wall", () => {
    const { ai, s, home, target } = setup();
    s.particles.forEach((p) => (p.strength = 5));
    target.isShielded = true;
    target.shieldPoints = 1000;
    target.health = 10;
    const alternative = createMockPlanet({
      id: "safe",
      x: 200,
      y: 100,
      faction: "enemy_b",
      health: 10,
    });
    s.planets.set("safe", alternative);
    (ai as any)._gameElapsed = 200;
    expect(
      (ai as any)._findOpportunityTarget("enemy_a", [home], s, 0)?.id,
    ).toBe("safe");
  });
  it("redirects stranded units even with no source planets and preserves default player half-orders", () => {
    const { s } = setup();
    s.particles.push(
      createMockParticle({ id: 99, mode: "stationed", faction: "enemy_a" }),
    );
    issueDeploymentOrder(s, {
      sourcePlanetIds: [],
      targetPlanetId: "target",
      stationedParticleIds: [99],
    });
    expect(s.particles.find((p) => p.id === 99)).toMatchObject({
      mode: "traveling",
      targetPlanetId: "target",
    });
    issueDeploymentOrder(s, {
      sourcePlanetIds: ["home"],
      targetPlanetId: "target",
    });
    expect(
      s.particles.filter(
        (p) => p.homePlanetId === "home" && p.mode === "traveling",
      ),
    ).toHaveLength(5);
  });
  it("records only newly launched IDs then prunes completed waves", () => {
    const { ai, s, home, target } = setup();
    s.particles.push(
      createMockParticle({
        id: 99,
        faction: "enemy_a",
        mode: "traveling",
        homePlanetId: "home",
        targetPlanetId: "target",
      }),
    );
    (ai as any).deployParticles(
      [home],
      target,
      (
        from: string[],
        to: string,
        ids?: number[],
        wx?: number,
        wy?: number,
        fraction?: number,
      ) =>
        issueDeploymentOrder(s, {
          sourcePlanetIds: from,
          targetPlanetId: to,
          fraction,
        }),
      0.5,
      [],
      s,
    );
    expect((ai as any).activeWaves[0].particleIds).not.toContain(99);
    s.particles.forEach((p) => (p.mode = "orbiting"));
    ai.update(0, s, () => {});
    expect((ai as any).activeWaves).toHaveLength(0);
  });
  it("recognizes a composite assault and evacuates fully, but respects sufficient shields", () => {
    const { ai, s, home } = setup();
    const safe = createMockPlanet({
      id: "rear",
      x: 20,
      y: 100,
      faction: "enemy_a",
    });
    s.planets.set("rear", safe);
    home.health = 1;
    for (let i = 0; i < 8; i++)
      s.particles.push(
        createMockParticle({
          id: 100 + i,
          faction: "player",
          mode: "traveling",
          targetPlanetId: "home",
          strength: 5,
        }),
      );
    home.isShielded = true;
    home.shieldPoints = 100;
    expect((ai as any)._checkRetreat("enemy_a", s, vi.fn())).toBe(false);
    home.shieldPoints = 0;
    const callback = vi.fn(
      (
        from: string[],
        to: string,
        ids?: number[],
        wx?: number,
        wy?: number,
        fraction?: number,
      ) =>
        issueDeploymentOrder(s, {
          sourcePlanetIds: from,
          targetPlanetId: to,
          fraction,
        }),
    );
    expect((ai as any)._checkRetreat("enemy_a", s, callback)).toBe(true);
    expect(callback.mock.calls[0][5]).toBe(1);
    expect(
      s.particles.filter(
        (p) => p.faction === "enemy_a" && p.mode === "orbiting",
      ),
    ).toHaveLength(0);
  });
  it("retargets the tracked wave when an ally-facing destination is captured by a stronger enemy", () => {
    const { ai, s, home, target } = setup();
    target.x = 1000;
    (ai as any).subRoles.set("enemy_a", "balanced");
    const callback = (
      from: string[],
      to: string,
      ids?: number[],
      wx?: number,
      wy?: number,
      fraction?: number,
    ) =>
      issueDeploymentOrder(s, {
        sourcePlanetIds: from,
        targetPlanetId: to,
        stationedParticleIds: ids,
        fraction,
      });
    (ai as any).deployParticles([home], target, callback, 0.5, [], s);
    target.faction = "enemy_b";
    target.health = 500;
    (ai as any)._reevaluateWavesForCapture(
      { planetId: target.id, newFaction: "enemy_b", oldFaction: "player" },
      s,
      callback,
    );
    expect((ai as any).activeWaves[0].targetPlanetId).toBe("home");
    expect(
      s.particles
        .filter((p) => p.mode === "traveling")
        .every((p) => p.targetPlanetId === "home"),
    ).toBe(true);
  });

  it("keeps the promised garrison when counterattacking with composite units", () => {
    const { ai, s, home, target } = setup();
    (ai as any).strategies.get("enemy_a").counterattackChance = 1;
    (ai as any).strategies.get("enemy_a").counterattackMinDefenders = 15;
    (ai as any).strategies.get("enemy_a").counterattackDefenseRatio = 0.5;
    s.particles.forEach((p) => (p.strength = 5));
    target.health = 1;
    s.particles.push(
      createMockParticle({
        id: 100,
        homePlanetId: "target",
        targetPlanetId: "home",
        faction: "player",
        mode: "traveling",
      }),
    );
    const callback = (
      from: string[],
      to: string,
      ids?: number[],
      wx?: number,
      wy?: number,
      fraction?: number,
    ) =>
      issueDeploymentOrder(s, {
        sourcePlanetIds: from,
        targetPlanetId: to,
        stationedParticleIds: ids,
        fraction,
      });
    expect((ai as any)._checkCounterattack("enemy_a", s, callback)).toBe(true);
    expect(
      s.particles
        .filter((p) => p.faction === "enemy_a" && p.mode === "orbiting")
        .reduce((sum, p) => sum + p.strength, 0),
    ).toBeGreaterThanOrEqual(25);
  });

  it("removes arrived or reassigned members before a stale wave can redirect them", () => {
    const { ai, s, home, target } = setup();
    const callback = (
      from: string[],
      to: string,
      ids?: number[],
      wx?: number,
      wy?: number,
      fraction?: number,
    ) =>
      issueDeploymentOrder(s, {
        sourcePlanetIds: from,
        targetPlanetId: to,
        stationedParticleIds: ids,
        fraction,
      });
    (ai as any).deployParticles([home], target, callback, 0.5, [], s);
    const wave = (ai as any).activeWaves[0];
    const departed = s.particles.find((p) => p.id === wave.particleIds[0])!;
    departed.mode = "orbiting";
    ai.update(0, s, () => {});
    expect(wave.particleIds).not.toContain(departed.id);
    departed.mode = "traveling";
    departed.targetPlanetId = "new-mission";
    ai.update(0, s, () => {});
    (ai as any).subRoles.set("enemy_a", "balanced");
    target.faction = "enemy_b";
    target.health = 500;
    (ai as any)._reevaluateWavesForCapture(
      { planetId: target.id, newFaction: "enemy_b", oldFaction: "player" },
      s,
      callback,
    );
    expect(departed.targetPlanetId).toBe("new-mission");
  });
});
