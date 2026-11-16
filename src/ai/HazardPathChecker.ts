// ============================================================
// HazardPathChecker.ts — AI route scoring and waypoint computation
//
// Used by AIController to:
//   1. Score a proposed src → target flight path for hazard danger.
//   2. Compute a single avoidance waypoint when a path is blocked.
// ============================================================

import type { GameState } from '../types';

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

/**
 * Returns the minimum distance from any point on segment (A→B) to point P.
 */
function segmentToPointMinDist(
  ax: number, ay: number,
  bx: number, by: number,
  px: number, py: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    // Segment is a point
    return Math.sqrt((px - ax) * (px - ax) + (py - ay) * (py - ay));
  }
  // Project P onto the line AB, clamped to [0,1]
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  const closestX = ax + t * dx;
  const closestY = ay + t * dy;
  const diffX = px - closestX;
  const diffY = py - closestY;
  return Math.sqrt(diffX * diffX + diffY * diffY);
}

/**
 * Returns the closest point on segment (A→B) to point P.
 */
function segmentClosestPoint(
  ax: number, ay: number,
  bx: number, by: number,
  px: number, py: number,
): { x: number; y: number; t: number } {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return { x: ax, y: ay, t: 0 };
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  return { x: ax + t * dx, y: ay + t * dy, t };
}

/**
 * Returns true if the segment (A→B) comes within `radius` of the ellipse
 * centered at (ex, ey) with semi-axes (rx, ry).
 * Approximated by transforming to unit-circle space.
 */
function segmentNearEllipse(
  ax: number, ay: number,
  bx: number, by: number,
  ex: number, ey: number,
  rx: number, ry: number,
): boolean {
  // Scale space so ellipse becomes a unit circle
  const scaleX = 1 / rx;
  const scaleY = 1 / ry;
  const dist = segmentToPointMinDist(
    (ax - ex) * scaleX, (ay - ey) * scaleY,
    (bx - ex) * scaleX, (by - ey) * scaleY,
    0, 0,
  );
  return dist <= 1.0; // 1.0 = unit circle boundary
}

// ---------------------------------------------------------------------------
// Route scoring
// ---------------------------------------------------------------------------

/**
 * Score the route from (sx,sy) to (tx,ty) given the current game state.
 *
 * Higher is safer. Penalties for hazards, bonuses for speed zones.
 * Starts at 0. If negative enough (below strategy.hazardToleranceThreshold)
 * the AI should avoid or reroute.
 */
export function scoreRoute(
  state: GameState,
  sx: number, sy: number,
  tx: number, ty: number,
): number {
  let score = 0;

  // ── Black Holes (instant lethal) ─────────────────────────────────────────
  for (const bh of state.blackHoles.values()) {
    const dist = segmentToPointMinDist(sx, sy, tx, ty, bh.x, bh.y);
    if (dist < bh.pullRadius * 1.2) {
      score -= 1000;
    }
  }

  // ── Trapping Black Holes (lethal) ─────────────────────────────────────────
  for (const tbh of state.trappingBlackHoles) {
    const dist = segmentToPointMinDist(sx, sy, tx, ty, tbh.x, tbh.y);
    if (dist < tbh.pullRadius * 1.1) {
      score -= 1000;
    }
  }


  // ── Speed Zones ───────────────────────────────────────────────────────────
  for (const zone of state.speedZones) { if (!zone.points || zone.points.length < 3) continue; let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity; for (const p of zone.points) { if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y; if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y; } const cx = (minX + maxX) / 2; const cy = (minY + maxY) / 2; const r = Math.max(maxX - minX, maxY - minY) / 2; const dist = segmentToPointMinDist(sx, sy, tx, ty, cx, cy); if (dist < r) { if (zone.type === 'speedup') { score += 60; } else { score -= 80; } } }

  // ── Gamma Ray 1 & 2 (temporal — active or imminent beam is dangerous) ────
  const rays = [state.gammaRay, ...(state.gammaRay2 ? [state.gammaRay2] : [])];
  for (const ray of rays) {
    if (!ray.enabled) continue;
    if (ray.firing && ray.path) {
      const beamDist = segmentToPointMinDist(ray.path.x1, ray.path.y1, ray.path.x2, ray.path.y2, tx, ty);
      if (beamDist < ray.path.width * 2) {
        score -= 300;
      }
    } else if (ray.lockedPath && ray.timer <= 6) {
      const lockDist = segmentToPointMinDist(ray.lockedPath.x1, ray.lockedPath.y1, ray.lockedPath.x2, ray.lockedPath.y2, tx, ty);
      if (lockDist < ray.lockedPath.width * 1.5) {
        score -= 220;
      }
    }
  }

  // ── White Holes near supernova eruption ──────────────────────────────────
  for (const wh of state.whiteHoles) {
    if (!wh.exploded && wh.ownerFaction && wh.ownerFaction !== 'neutral' && wh.progress >= 65) {
      const dist = segmentToPointMinDist(sx, sy, tx, ty, wh.x, wh.y);
      if (dist < 120) {
        score -= 250;
      }
    }
  }

  return score;
}

/**
 * Returns true if any gamma ray is actively firing and the target is near
 * the current beam path. Used for temporal suppression of launches.
 */
export function isGammaDangerous(state: GameState, tx: number, ty: number): boolean {
  const rays = [state.gammaRay, ...(state.gammaRay2 ? [state.gammaRay2] : [])];
  for (const ray of rays) {
    if (!ray.enabled || !ray.firing || !ray.path) continue;
    const dist = segmentToPointMinDist(ray.path.x1, ray.path.y1, ray.path.x2, ray.path.y2, tx, ty);
    if (dist < ray.path.width * 3) return true;
  }
  return false;
}

export interface PortalRouteEstimate {
  effectiveDistance: number;
  entryPortalX?: number;
  entryPortalY?: number;
}

/**
 * Computes direct distance vs. routing through any linked portal pair.
 * Returns a portal entry waypoint when using a portal saves >=25% distance.
 */
export function getEffectiveDistanceAndPortal(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  state: GameState,
): PortalRouteEstimate {
  const directDist = Math.hypot(bx - ax, by - ay);
  if (!state.portals || state.portals.length < 2) {
    return { effectiveDistance: directDist };
  }

  let bestDist = directDist;
  let bestEntry: { x: number; y: number } | null = null;

  for (let i = 0; i < state.portals.length; i++) {
    const p1 = state.portals[i];
    for (let j = 0; j < state.portals.length; j++) {
      if (i === j) continue;
      const p2 = state.portals[j];
      if (p1.pairId !== p2.pairId) continue;

      const viaDist = Math.hypot(p1.x - ax, p1.y - ay) + Math.hypot(bx - p2.x, by - p2.y);
      if (viaDist < directDist * 0.75 && viaDist < bestDist) {
        bestDist = viaDist;
        bestEntry = { x: p1.x, y: p1.y };
      }
    }
  }

  if (bestEntry) {
    return {
      effectiveDistance: bestDist,
      entryPortalX: bestEntry.x,
      entryPortalY: bestEntry.y,
    };
  }
  return { effectiveDistance: directDist };
}

/**
 * Returns a gamma-ray risk level for a planet at (tx, ty).
 *
 *   0 — safe (not targeted by any gamma ray)
 *   1 — targeted by a locked future path (timer > 10s away — plenty of time)
 *   2 — targeted and fires within ~10 seconds (imminent)
 *   3 — gamma ray is actively firing and beam is on this planet RIGHT NOW
 *
 * Checks both gammaRay and gammaRay2 (if present), both the active path
 * and the pre-announced lockedPath (for 'locked' mode rays).
 *
 * Use this for SCORING decisions — e.g. penalise attacking a planet that
 * is about to be gamma'd (wasted effort) or skip colonising one.
 */
export function getGammaRiskForPlanet(
  state: GameState,
  planetId: string,
  tx: number,
  ty: number,
): 0 | 1 | 2 | 3 {
  let maxRisk: 0 | 1 | 2 | 3 = 0;

  const rays = [state.gammaRay, ...(state.gammaRay2 ? [state.gammaRay2] : [])];

  for (const ray of rays) {
    if (!ray.enabled) continue;

    // ── Level 3: firing right now ────────────────────────────────────────
    if (ray.firing && ray.path) {
      // Use planetId fast path first (game already resolves targeted ids)
      const byId = ray.path.targetedPlanetIds.includes(planetId);
      const byDist = !byId &&
        segmentToPointMinDist(ray.path.x1, ray.path.y1, ray.path.x2, ray.path.y2, tx, ty) < ray.path.width * 3;
      if (byId || byDist) {
        return 3; // actively being zapped — highest priority
      }
    }

    // ── Level 2 / 1: locked future path ─────────────────────────────────
    if (ray.lockedPath) {
      const lp = ray.lockedPath;
      const byId = lp.targetedPlanetIds.includes(planetId);
      const byDist = !byId &&
        segmentToPointMinDist(lp.x1, lp.y1, lp.x2, lp.y2, tx, ty) < lp.width * 3;

      if (byId || byDist) {
        const risk: 0 | 1 | 2 | 3 = ray.timer <= 10 ? 2 : 1;
        if (risk > maxRisk) maxRisk = risk;
      }
    }
  }

  return maxRisk;
}

// ---------------------------------------------------------------------------
// Waypoint computation
// ---------------------------------------------------------------------------

/** Margin in pixels beyond the hazard radius the waypoint is placed. */
const DEFAULT_CLEARANCE = 40;

interface WaypointResult {
  wpx: number;
  wpy: number;
}

/**
 * Attempts to compute a single waypoint that routes around the most
 * dangerous hazard blocking the path from (ax,ay) to (bx,by).
 *
 * Returns { wpx, wpy } if a valid waypoint is found, or null if
 * no safe single-waypoint route exists.
 */
export function computeWaypoint(
  ax: number, ay: number,
  bx: number, by: number,
  state: GameState,
  worldWidth: number,
  worldHeight: number,
  clearanceMargin: number = DEFAULT_CLEARANCE,
): WaypointResult | null {
  // Collect all lethal hazards that block the direct route
  type BlockingHazard = { cx: number; cy: number; r: number };
  const blocking: BlockingHazard[] = [];

  for (const bh of state.blackHoles.values()) {
    const dist = segmentToPointMinDist(ax, ay, bx, by, bh.x, bh.y);
    if (dist < bh.pullRadius * 1.2) {
      blocking.push({ cx: bh.x, cy: bh.y, r: bh.pullRadius * 1.2 });
    }
  }
  for (const tbh of state.trappingBlackHoles) {
    const dist = segmentToPointMinDist(ax, ay, bx, by, tbh.x, tbh.y);
    if (dist < tbh.pullRadius * 1.1) {
      blocking.push({ cx: tbh.x, cy: tbh.y, r: tbh.pullRadius * 1.1 });
    }
  }

  if (blocking.length === 0) return null; // nothing actually blocked

  // Pick the most dangerous blocker (closest to the midpoint of the path)
  const midX = (ax + bx) / 2;
  const midY = (ay + by) / 2;
  blocking.sort((a, b) => {
    const da = (a.cx - midX) ** 2 + (a.cy - midY) ** 2;
    const db = (b.cx - midX) ** 2 + (b.cy - midY) ** 2;
    return da - db;
  });
  const primary = blocking[0];

  // Find the closest point on segment to the hazard center
  const cp = segmentClosestPoint(ax, ay, bx, by, primary.cx, primary.cy);

  // Perpendicular direction (unit vector from hazard center to closest point,
  // then flipped to go AWAY from hazard)
  let perpX = cp.x - primary.cx;
  let perpY = cp.y - primary.cy;
  const perpLen = Math.sqrt(perpX * perpX + perpY * perpY);

  if (perpLen < 1) {
    // Closest point is almost exactly at hazard center — path goes right through.
    // Use a perpendicular to the AB direction instead.
    const abX = bx - ax;
    const abY = by - ay;
    const abLen = Math.sqrt(abX * abX + abY * abY) || 1;
    perpX = -abY / abLen;
    perpY =  abX / abLen;
  } else {
    perpX /= perpLen;
    perpY /= perpLen;
  }

  // Choose which side gives shorter total detour
  const r = primary.r + clearanceMargin;

  const wpRight = { wpx: primary.cx + perpX * r, wpy: primary.cy + perpY * r };
  const wpLeft  = { wpx: primary.cx - perpX * r, wpy: primary.cy - perpY * r };

  const costRight = dist2(ax, ay, wpRight.wpx, wpRight.wpy) + dist2(wpRight.wpx, wpRight.wpy, bx, by);
  const costLeft  = dist2(ax, ay, wpLeft.wpx,  wpLeft.wpy)  + dist2(wpLeft.wpx,  wpLeft.wpy,  bx, by);

  let wp = costRight <= costLeft ? wpRight : wpLeft;

  // Clamp to world bounds
  wp.wpx = Math.max(20, Math.min(worldWidth  - 20, wp.wpx));
  wp.wpy = Math.max(20, Math.min(worldHeight - 20, wp.wpy));

  // Validate: both legs of A→WP and WP→B must be safe
  const legAScore = scoreRoute(state, ax, ay, wp.wpx, wp.wpy);
  const legBScore = scoreRoute(state, wp.wpx, wp.wpy, bx, by);

  if (legAScore < -900 || legBScore < -900) {
    // Still blocked — waypoint didn't help
    return null;
  }

  return wp;
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

/** Squared Euclidean distance (for relative comparisons only). */
function dist2(ax: number, ay: number, bx: number, by: number): number {
  return (bx - ax) ** 2 + (by - ay) ** 2;
}
