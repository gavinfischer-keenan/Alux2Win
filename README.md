# Alux2Win (Lux) v1.4.0

Alux2Win is an ambient, real-time strategy (RTS) game heavily inspired by Auralux. It emphasizes slow, deliberate macro-strategy over rapid micro-management. The universe beats at a steady rhythm, and your goal is to manage your particle swarms, upgrade your planets, and conquer the galaxy.

---

## What's New in v1.4.0

- **Fog of War**: Shrouded in darkness, players must explore and scout neutral and enemy systems. Upgrading your planets increases their vision radius to light up the dark.
- **Top-5 High Score Leaderboard**: Level tiles now display a compact, styled list of your top 5 best completion times rather than just the single #1 best time.
- **Level Editor Enhancements**:
  - **Live Orbit Preview**: Orbiting planets now animate on their paths directly inside the editor so you can preview the system's motion.
  - **Selected Black Hole Highlights**: Selecting a black hole (or trapping black hole) renders a soft purple fill showing the exact gravity pull boundary.
  - **Rectangular Speed Zones**: Speed zones are now drawn as rectangular areas in the editor and in the game. You can adjust their width and height independently using new sliders in the Properties Panel.
  - **Done / OK Button**: Click the green "✓ Done / OK" button in the Properties Panel to easily deselect the active entity and watch the live orbits.
- **Selection Count Badge**: Drawing a lasso around your swarms displays a handy counter in the top-left corner showing exactly how many units you have selected.
- **Double Right-Click (Repeat Command)**: Re-issue your last command to selected particles instantly without having to target and right-click them again.
- **Performance Overhaul**: Re-architected the `SpatialHash` to use a flat pre-allocated array instead of a Map, and applied division-free ellipse checks and squared-distance physics checks. Headless simulation frame rate is boosted to over **620 FPS**!
- **Volatile Visual FX Overhaul**: Concentric organic glowing shapes for Speed/Slow Zones and Plasma Storms, charging arc loops for White Holes, and writhing edge sweeps for Gamma Ray firing trails.

---

## Core Mechanics

### 1. Planets & Particles
- **Planets** are your bases. Every planet generates a new **Particle** once per second.
- **Particles** are your currency, your military, and your builders. Everything costs particles.
- **Upgrades**: You can upgrade a planet by sending your own particles to it. An upgraded planet holds more health, spawns particles faster, and has a larger defense radius.
  - Level 1: 40 Health, 0.25 Particles/sec (1 per 4s)
  - Level 2: 80 Health, 2.0 Particles/sec (2 per 1s)
  - Level 3: 150 Health, 5.5 Particles/sec (5.5 per 1s)

### 2. Controls
- **Left-Click & Drag**: Draw a lasso around your particles to select a swarm. A counter will appear letting you know exactly how many units you have selected.
- **Right-Click (Single)**: Send your selected particles to the clicked destination (an empty space, an enemy planet to attack, or a friendly planet to upgrade/defend).
- **Right-Click (Double)**: Repeat your last command for the currently selected particles without having to re-select them.
- **Escape**: Pause the game and bring up the menu.

### 3. Combat
- When particles collide with enemy particles, they annihilate each other 1-to-1.
- When particles strike an enemy planet, they deplete its health. If a planet's health reaches 0, it turns neutral. Send more particles to capture it!
- Some enemy planets may have **Shields**. Shields absorb incoming particle damage entirely until they break. They slowly regenerate over time.

## Hazards & Anomalies

The galaxy is a dangerous place. Keep an eye out for these cosmic anomalies:

- **White Holes**: Giant cosmic batteries. Send 80 particles to charge a White Hole, and it explodes, showering the system with 300 free units! But beware: enemies can drain your charge by sending their own units.
- **Trapping Black Holes**: These dark stars exert a massive gravitational pull. Any particle that strays too close will be sucked in and permanently trapped.
- **Gamma Rays**: A devastating beam of pure energy that periodically sweeps across the map. It destroys any particles caught in its path. In some galaxies, it can even vaporize entire planets!
- **Asteroid Showers**: Massive rocks occasionally drift through the system. They crush any particles they touch.
- **Speed Zones (Rectangular)**: Green spacetime fields that drastically speed up particles passing through. Adjustable width/height.
- **Slow Zones (Rectangular)**: Red spacetime fields that severely slow down particles caught inside.

## The AI

The AI Commanders you face are ruthless and calculating:
- **Aggressive Flanking**: They will look for undefended flanks and attack your weakest planets.
- **Back-capping**: If you send your entire army across the map, the AI will exploit the opening and attack your now-defenseless home.
- **Consolidation**: The AI knows when to retreat and pool its forces if it is outnumbered.

## Visuals & Audio
- **Dynamic Audio System**: Alux2Win features a fully voiced, dynamic audio system that responds to your gameplay. It automatically discovers and randomizes audio clips from folders inside `src/assets/audio/` for events such as captures, shield blocks, and deaths.
- **Silky Smooth Rendering**: Built on PIXI.js, the game maintains a solid 60 FPS even with over 10,000 particles on screen, utilizing a highly optimized zero-allocation Spatial Hash for collision detection.

## Development & Build

### Prerequisites
- Node.js (v18+ recommended)
- `npm` or `yarn`

### Installation & Running
1. Clone the repository.
2. Run `npm install` to install dependencies (Vite, PIXI.js, TypeScript).
3. Run `npm run dev` to start the local development server.
4. Open the provided localhost URL in your browser.

### Scripts
- `npm run dev`: Start dev server
- `npm run build`: Compile TypeScript and build for production
- `npm run preview`: Preview the production build
- `npm run test`: Run the `vitest` automated testing suite

---
*Created by Gavin Fischer-Keenan.*
