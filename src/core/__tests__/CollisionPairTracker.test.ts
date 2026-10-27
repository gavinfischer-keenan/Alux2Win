import { it, expect } from "vitest";
import { CollisionPairTracker } from "../CollisionPairTracker";
import { createMockParticle } from "../../utils/__tests__/TestFactory";
it.each([3, 8200])(
  "deduplicates either direction and resets each tick, size %s",
  (size) => {
    const particles = Array.from({ length: size }, (_, id) =>
      createMockParticle({ id: 20_000_000 + id }),
    );
    const tracker = new CollisionPairTracker();
    tracker.begin(particles);
    expect(tracker.markIfNew(particles[0], particles[1])).toBe(true);
    expect(tracker.markIfNew(particles[1], particles[0])).toBe(false);
    expect(tracker.markIfNew(particles[0], particles[2])).toBe(true);
    tracker.begin(particles);
    expect(tracker.markIfNew(particles[1], particles[0])).toBe(true);
    tracker.begin(particles.slice(0, 2));
    expect(tracker.markIfNew(particles[0], particles[1])).toBe(true);
  },
);
