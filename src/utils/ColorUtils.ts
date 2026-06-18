// ============================================================
// ColorUtils.ts — Faction color helpers for LUX
// ============================================================

import { FACTION_COLORS } from '../types';
import type { Faction } from '../types';

// Re-export for convenience so callers only need one import.
export { FACTION_COLORS };

/** White — used for star backdrop dots. */
export const STAR_COLOR = 0xffffff;

/**
 * Build a PixiJS hex color number tinted at the given alpha.
 * PixiJS Graphics uses separate fill/stroke + alpha calls, so this helper
 * just returns the base hex color; use `alpha` when calling `graphics.fill()`.
 *
 * @param faction - The faction whose base color to use.
 * @param _alpha  - Informational (0–1). The caller must apply alpha to the
 *                  Graphics fill or tint separately.
 * @returns PixiJS hex color number.
 */
export function glowColor(faction: Faction, _alpha?: number): number {
  return FACTION_COLORS[faction];
}

/**
 * Lerp between two PixiJS hex colors by factor t (0-1).
 * Useful for health-bar or capture-progress tinting.
 */
export function lerpColor(colorA: number, colorB: number, t: number): number {
  const ra = (colorA >> 16) & 0xff;
  const ga = (colorA >> 8) & 0xff;
  const ba = colorA & 0xff;

  const rb = (colorB >> 16) & 0xff;
  const gb = (colorB >> 8) & 0xff;
  const bb = colorB & 0xff;

  const r = Math.round(ra + (rb - ra) * t);
  const g = Math.round(ga + (gb - ga) * t);
  const b = Math.round(ba + (bb - ba) * t);

  return (r << 16) | (g << 8) | b;
}
