import { describe, it, expect } from 'vitest';
import { SpatialHash } from '../SpatialHash';
import type { ParticleData } from '../../types';

describe('SpatialHash', () => {
  const mockParticle = (id: number, x: number, y: number): ParticleData => {
    return {
      id,
      x,
      y,
      vx: 0,
      vy: 0,
      faction: 'player',
      mode: 'traveling',
      strength: 1,
      orbitTimer: 0,
      damage: 0,
      homePlanetId: '',
      alive: true,
      speedMod: 1.0,
      portalCooldown: 0,
      trappedByBH: null,
    };
  };

  it('inserts and queries particles correctly', () => {
    const hash = new SpatialHash(8192, 8192, 64);
    const p1 = mockParticle(1, 10, 10);
    const p2 = mockParticle(2, 20, 20);
    const p3 = mockParticle(3, 100, 100);

    hash.insert(p1);
    hash.insert(p2);
    hash.insert(p3);

    // Query close to (10, 10)
    const out: ParticleData[] = [];
    hash.query(10, 10, 20, out);
    expect(out.map(p => p.id)).toContain(1);
    expect(out.map(p => p.id)).toContain(2);
    expect(out.map(p => p.id)).not.toContain(3);
  });

  it('clears buckets properly', () => {
    const hash = new SpatialHash(8192, 8192, 64);
    const p1 = mockParticle(1, 10, 10);
    hash.insert(p1);

    hash.clear();
    const out: ParticleData[] = [];
    hash.query(10, 10, 50, out);
    expect(out.length).toBe(0);
  });

  it('correctly retrieves getNearby neighbors in 3x3 cells', () => {
    const hash = new SpatialHash(8192, 8192, 100);
    // Grid boundary cells: (cx, cy)
    // p1 at cell (0, 0)
    // p2 at cell (1, 1)
    // p3 at cell (2, 2)
    const p1 = mockParticle(1, 50, 50);
    const p2 = mockParticle(2, 150, 150);
    const p3 = mockParticle(3, 250, 250);

    hash.insert(p1);
    hash.insert(p2);
    hash.insert(p3);

    const out: ParticleData[] = [];
    // p2 is at cell (1,1), so getNearby should query columns 0, 1, 2 and rows 0, 1, 2
    hash.getNearby(p2, out);
    expect(out.map(p => p.id)).toContain(1);
    expect(out.map(p => p.id)).toContain(2);
    expect(out.map(p => p.id)).toContain(3);

    // p1 is at cell (0,0), getNearby queries columns 0, 1 and rows 0, 1
    const out1: ParticleData[] = [];
    hash.getNearby(p1, out1);
    expect(out1.map(p => p.id)).toContain(1);
    expect(out1.map(p => p.id)).toContain(2);
    expect(out1.map(p => p.id)).not.toContain(3); // p3 is in cell (2,2), not adjacent to (0,0)
  });
});
