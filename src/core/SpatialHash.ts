// ============================================================
// SpatialHash.ts — High Performance Grid Spatial Hash
// Features O(1) active/dirty bucket tracking for zero-cost frame clears.
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
  private readonly buckets: ParticleData[][];
  private readonly dirtyIndices: number[] = [];

  /**
   * Two call signatures are supported:
   *   new SpatialHash(cellSize)                       — world defaults to 2048×2048
   *   new SpatialHash(worldWidth, worldHeight, cellSize)
   */
  constructor(
    worldWidthOrCellSize: number = 32,
    worldHeight: number = 2048,
    cellSize: number = 32
  ) {
    let width = 2048;
    let height = 2048;

    if (arguments.length === 1 && worldWidthOrCellSize <= 128) {
      this.cellSize = worldWidthOrCellSize;
    } else {
      this.cellSize = cellSize;
      width = worldWidthOrCellSize;
      height = worldHeight;
    }

    this.cols = Math.ceil(width / this.cellSize);
    this.rows = Math.ceil(height / this.cellSize);

    const numCells = this.cols * this.rows;
    this.buckets = new Array(numCells);
    for (let i = 0; i < numCells; i++) {
      this.buckets[i] = [];
    }
  }

  /** Map a world coordinate to a cell index, clamped to grid bounds. */
  private cellX(x: number): number {
    return Math.max(0, Math.min(this.cols - 1, Math.floor(x / this.cellSize)));
  }

  private cellY(y: number): number {
    return Math.max(0, Math.min(this.rows - 1, Math.floor(y / this.cellSize)));
  }

  /** Reset only populated buckets. O(active_cells) instead of O(total_cells). */
  clear(): void {
    const dirty = this.dirtyIndices;
    const len = dirty.length;
    for (let i = 0; i < len; i++) {
      this.buckets[dirty[i]].length = 0;
    }
    dirty.length = 0;
  }

  /** Insert a particle into its appropriate cell. */
  insert(particle: ParticleData): void {
    const cx = this.cellX(particle.x);
    const cy = this.cellY(particle.y);
    const idx = cx * this.rows + cy;
    const bucket = this.buckets[idx];
    if (bucket.length === 0) {
      this.dirtyIndices.push(idx);
    }
    bucket.push(particle);
  }

  /**
   * Return all particles whose cell is within `radius` of the given point.
   * This is a coarse broad-phase; callers should do exact distance checks.
   */
  query(x: number, y: number, radius: number, out: ParticleData[] = []): ParticleData[] {
    out.length = 0;
    const minCX = Math.max(0, Math.floor((x - radius) / this.cellSize));
    const maxCX = Math.min(this.cols - 1, Math.floor((x + radius) / this.cellSize));
    const minCY = Math.max(0, Math.floor((y - radius) / this.cellSize));
    const maxCY = Math.min(this.rows - 1, Math.floor((y + radius) / this.cellSize));

    for (let cx = minCX; cx <= maxCX; cx++) {
      for (let cy = minCY; cy <= maxCY; cy++) {
        const bucket = this.buckets[cx * this.rows + cy];
        const bLen = bucket.length;
        for (let i = 0; i < bLen; i++) {
          out.push(bucket[i]);
        }
      }
    }
    return out;
  }

  /**
   * Return particles in the same cell and all 8 adjacent cells for a particle.
   * Fastest possible broad-phase — used by CollisionSystem per-particle.
   */
  getNearby(particle: ParticleData, out: ParticleData[] = []): ParticleData[] {
    out.length = 0;
    const cx = this.cellX(particle.x);
    const cy = this.cellY(particle.y);

    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || nx >= this.cols || ny < 0 || ny >= this.rows) continue;
        const bucket = this.buckets[nx * this.rows + ny];
        const bLen = bucket.length;
        for (let i = 0; i < bLen; i++) {
          out.push(bucket[i]);
        }
      }
    }
    return out;
  }
}
