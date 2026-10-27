import type { GameState, ParticleData } from "../types";
import { PARTICLE_SPEED } from "../types";
export interface DeploymentOrder {
  sourcePlanetIds: readonly string[];
  targetPlanetId?: string;
  stationedParticleIds?: readonly number[];
  targetX?: number;
  targetY?: number;
  waypointX?: number;
  waypointY?: number;
  /** Omitted for human/tutorial orders: preserve the established half-fleet action. */
  fraction?: number;
}
/** Apply an order to existing units only. No rendering, audio, strategy, or spawning. */
export function issueDeploymentOrder(
  state: GameState,
  order: DeploymentOrder,
): ParticleData[] {
  const moved: ParticleData[] = [];
  const movedIds = new Set<number>();
  const target = order.targetPlanetId
    ? state.planets.get(order.targetPlanetId)
    : undefined;
  const fraction =
    order.fraction === undefined || !Number.isFinite(order.fraction)
      ? 0.5
      : Math.max(0, Math.min(1, order.fraction));
  const launch = (p: ParticleData) => {
    p.mode = "traveling";
    p.targetPlanetId = order.targetPlanetId;
    p.targetX = order.targetX;
    p.targetY = order.targetY;
    p.waypointX = order.waypointX;
    p.waypointY = order.waypointY;
    p.orbitTimer = 0;
    p.deployTimer = 0;
    const dx = (order.waypointX ?? target?.x ?? order.targetX ?? p.x) - p.x;
    const dy = (order.waypointY ?? target?.y ?? order.targetY ?? p.y) - p.y;
    const length = Math.sqrt(dx * dx + dy * dy) || 1;
    p.vx = (dx / length) * PARTICLE_SPEED;
    p.vy = (dy / length) * PARTICLE_SPEED;
    moved.push(p);
    movedIds.add(p.id);
  };
  for (const id of order.sourcePlanetIds) {
    if (!state.planets.has(id)) continue;
    const orbiters = state.particles.filter(
      (p) => p.alive && p.mode === "orbiting" && p.homePlanetId === id,
    );
    const count = Math.floor(orbiters.length * fraction);
    for (let i = 0; i < count; i++) launch(orbiters[i]);
  }
  if (order.stationedParticleIds?.length) {
    const ids = new Set(order.stationedParticleIds);
    for (const p of state.particles)
      if (p.alive && ids.has(p.id) && !movedIds.has(p.id)) launch(p);
  }
  return moved;
}
