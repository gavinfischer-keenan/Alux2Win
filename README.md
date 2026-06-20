# Alux2Win v1.6.0

**Alux2Win** is an intense, fast-paced planetary warfare strategy game. Command massive swarms of particles, conquer planets, and outmaneuver adaptive AI in a battle for galactic supremacy. Featuring dynamic environments, cinematic hazards, and optimized performance for thousands of on-screen entities.

## What's New in v1.6.0

*   **Performance Overhaul (The Particle Pooling Update):**
    *   **Zero-Allocation Arrays:** Removed array filtering across all major systems (`CombatSystem`, `CollisionSystem`, `AsteroidSystem`, etc.), completely eliminating mid-game micro-stutters caused by Garbage Collection pressure.
    *   **Object Pooling:** Implemented a high-performance Object Pool in `ProductionSystem` to infinitely recycle dead particles.
    *   **Mathematical Optimizations:** Eliminated expensive `Math.sqrt` calls in hot loops (boid flocking, collision detection, and gravity attraction) by using squared-distance logic (`distSq`).
    *   **Stress Tested:** Engineered to comfortably handle 5,000+ active collision-capable particles while strictly adhering to a 60 FPS real-time rendering budget.
*   **Comprehensive Test Coverage:** Achieved a perfect 42/42 passing test suite. All edge cases in `AIController`, `CombatSystem`, `CollisionSystem`, and `GravitySystem` are strictly verified.
*   **AI Enhancements:** The heuristic `AIController` state machine now natively recognizes fog-of-war constraints and dynamically evaluates opportunity vs. strategic necessity using optimized target scoring.
*   **Level Editor Bug Fixes:** The editor no longer drops the `isShielded` flag if the user navigates away from an unconfirmed dialog.

## Core Features

*   **Swarm Mechanics:** Guide boid-flocking particles that dynamically separate, cohere, and align as they travel through space.
*   **Dynamic Hazards:** 
    *   **Plasma Storms:** Temporarily shelter particles and prevent production.
    *   **Trapping Black Holes:** Lethal voids that slowly pull nearby particles inward, annihilating them at the core.
    *   **White Holes:** Build up faction dominance to trigger massive 300-particle explosive spawns.
    *   **Asteroids:** Huge, bouncing obstacles that strip planet upgrade levels and obliterate orbiting defenders.
*   **Planet Upgrades:** Planets absorb health and level up (up to Level 3) to increase their defensive capacity and particle production rates. Max-level planets merge five 1X particles into powerful 5X composite particles.
*   **Adaptive AI:** Engage against varying difficulty tiers (`easy`, `normal`, `hard`) utilizing randomized sub-roles (`economic`, `fortress`, `opportunist`, `blitzkrieg`, `dominator`, `berserker`) that dramatically shift their strategic priorities.

## Technology Stack

*   **Engine:** TypeScript + HTML5 Canvas
*   **Architecture:** Entity-Component-System (ECS) pattern
*   **Optimization:** Spatial Hashing for O(1) collision lookups, strict mathematical gating, Object Pooling
*   **Build & Test:** Vite, Vitest

## Getting Started

1.  Clone the repository.
2.  Run `npm install` to install dependencies.
3.  Run `npm run dev` to start the local development server.
4.  Run `npm run test` to execute the automated test suite.

## Roadmap & Next Steps

With performance optimized, focus is now shifting toward developing distinct, handcrafted levels across all repositories and expanding the Grid Fog system to challenge the player's strategic visibility.
