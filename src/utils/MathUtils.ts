// ============================================================
// MathUtils.ts — Vec2 math helpers for LUX
// ============================================================

import type { Vec2 } from '../types';

/** Add two vectors. Returns a new Vec2. */
export function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

/** Subtract b from a. Returns a new Vec2. */
export function sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

/** Scale a vector by a scalar. Returns a new Vec2. */
export function scale(v: Vec2, s: number): Vec2 {
  return { x: v.x * s, y: v.y * s };
}

/** Euclidean length of a vector. */
export function magnitude(v: Vec2): number {
  return Math.sqrt(v.x * v.x + v.y * v.y);
}

/** Squared length — avoids sqrt when only comparison is needed. */
export function magnitudeSq(v: Vec2): number {
  return v.x * v.x + v.y * v.y;
}

/**
 * Normalize a vector to unit length.
 * Returns zero vector when magnitude is 0.
 */
export function normalize(v: Vec2): Vec2 {
  const mag = magnitude(v);
  if (mag === 0) return { x: 0, y: 0 };
  return { x: v.x / mag, y: v.y / mag };
}

/** Euclidean distance between two points. */
export function distance(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Squared distance — avoids sqrt when only comparison is needed. */
export function distanceSq(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

/** Linear interpolation between two vectors. */
export function lerp(a: Vec2, b: Vec2, t: number): Vec2 {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  };
}

/** Clamp a number between min and max (inclusive). */
export function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/**
 * Angle in radians from point a toward point b.
 * Returns value in the range (-π, π].
 */
export function angleTo(a: Vec2, b: Vec2): number {
  return Math.atan2(b.y - a.y, b.x - a.x);
}

/** Uniform random float in [min, max). */
export function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/** Random unit vector (uniform distribution over the unit circle). */
export function randomUnitVec2(): Vec2 {
  const angle = Math.random() * Math.PI * 2;
  return { x: Math.cos(angle), y: Math.sin(angle) };
}

/** Dot product of two vectors. */
export function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y;
}

/** Linear interpolate between two scalars. */
export function lerpScalar(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Check if two line segments (p1-p2 and p3-p4) intersect. */
export function lineSegmentsIntersect(p1: Vec2, p2: Vec2, p3: Vec2, p4: Vec2): boolean {
  const ccw = (A: Vec2, B: Vec2, C: Vec2) => {
    return (C.y - A.y) * (B.x - A.x) > (B.y - A.y) * (C.x - A.x);
  };
  return (ccw(p1, p3, p4) !== ccw(p2, p3, p4)) && (ccw(p1, p2, p3) !== ccw(p1, p2, p4));
}
