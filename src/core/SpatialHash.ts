// ============================================================
// SpatialHash.ts — Grid-based spatial hash for O(1) particle lookups
// ============================================================

import type { ParticleData } from '../types';

/**
 * Grid-based spatial partitioning.
 * Cell size 32 gives each cell a side of ~2× the particle collision distance
 * so each particle touches at most 4 cells, keeping per-query cost low.
 */
export class SpatialHash {
  private readonly cellSize: number;
  private readonly cols: number;
  private readonly rows: number;
  private buckets: Map<number, ParticleData[]> = new Map();

  /**
   * Two call signatures are supported:
   *   new SpatialHash(cellSize)                       — world defaults to 8192×8192
   *   new SpatialHash(worldWidth, worldHeight, cellSize)
   */
  constructor(
    worldWidthOrCellSize: number,
    worldHeight: number = 8192,
    cellSize: number = 32
  ) {
    // Single-argument form: treat first arg as cellSize.
    if (arguments.length === 1) {
      this.cellSize = worldWidthOrCellSize;
      const side = 8192;
      this.cols = Math.ceil(side / this.cellSize);
      this.rows = Math.ceil(side / this.cellSize);
    } else {
      this.cellSize = cellSize;
      this.cols = Math.ceil(worldWidthOrCellSize / cellSize);
      this.rows = Math.ceil(worldHeight / cellSize);
    }
  }

  /** Encode (cellX, cellY) into a single integer key. */
  private key(cellX: number, cellY: number): number {
    return cellX * 10000 + cellY;
  }

  /** Map a world coordinate to a cell index, clamped to grid bounds. */
  private cellX(x: number): number {
    return Math.max(0, Math.min(this.cols - 1, Math.floor(x / this.cellSize)));
  }

  private cellY(y: number): number {
    return Math.max(0, Math.min(this.rows - 1, Math.floor(y / this.cellSize)));
  }

  /** Reset all buckets. Must be called at the start of each frame. */
  clear(): void {
    for (const bucket of this.buckets.values()) {
      bucket.length = 0;
    }
  }

  /** Insert a particle into its appropriate cell. */
  insert(particle: ParticleData): void {
    const cx = this.cellX(particle.x);
    const cy = this.cellY(particle.y);
    const k = this.key(cx, cy);
    let bucket = this.buckets.get(k);
    if (!bucket) {
      bucket = [];
      this.buckets.set(k, bucket);
    }
    bucket.push(particle);
  }

  /**
   * Return all particles whose cell is within `radius` of the given point.
   * This is a coarse broad-phase; callers should do exact distance checks.
   */
  query(x: number, y: number, radius: number): ParticleData[] {
    const results: ParticleData[] = [];
    const minCX = Math.max(0, Math.floor((x - radius) / this.cellSize));
    const maxCX = Math.min(this.cols - 1, Math.floor((x + radius) / this.cellSize));
    const minCY = Math.max(0, Math.floor((y - radius) / this.cellSize));
    const maxCY = Math.min(this.rows - 1, Math.floor((y + radius) / this.cellSize));

    for (let cx = minCX; cx <= maxCX; cx++) {
      for (let cy = minCY; cy <= maxCY; cy++) {
        const bucket = this.buckets.get(this.key(cx, cy));
        if (bucket) {
          for (const p of bucket) results.push(p);
        }
      }
    }
    return results;
  }

  /**
   * Return particles in the same cell and all 8 adjacent cells for a particle.
   * Fastest possible broad-phase — used by CollisionSystem per-particle.
   */
  getNearby(particle: ParticleData): ParticleData[] {
    const results: ParticleData[] = [];
    const cx = this.cellX(particle.x);
    const cy = this.cellY(particle.y);

    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || nx >= this.cols || ny < 0 || ny >= this.rows) continue;
        const bucket = this.buckets.get(this.key(nx, ny));
        if (bucket) {
          for (const p of bucket) results.push(p);
        }
      }
    }
    return results;
  }
}
