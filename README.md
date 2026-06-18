# Alux2Win (Lux) v1.2.1

Alux2Win is an ambient, real-time strategy (RTS) game heavily inspired by Auralux. It emphasizes slow, deliberate macro-strategy over rapid micro-management. The universe beats at a steady rhythm, and your goal is to manage your particle swarms, upgrade your planets, and conquer the galaxy.

## Core Mechanics

### 1. Planets & Particles
- **Planets** are your bases. Every planet generates a new **Particle** once per second.
- **Particles** are your currency, your military, and your builders. Everything costs particles.
- **Upgrades**: You can upgrade a planet by sending your own particles to it. An upgraded planet holds more health, spawns particles faster, and has a larger defense radius.
  - Level 1: 50 Health, 1 Particle/sec
  - Level 2: 150 Health, 2 Particles/sec
  - Level 3: 300 Health, 3 Particles/sec

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

- **White Holes**: Giant cosmic batteries. If you send enough particles to charge a White Hole, it will detonate, showering you with a massive burst of free units! But beware: enemies can drain your charge by sending their own units.
- **Trapping Black Holes**: These dark stars exert a massive gravitational pull. Any particle that strays too close will be sucked in and permanently trapped.
- **Gamma Rays**: A devastating beam of pure energy that periodically sweeps across the map. It destroys any particles caught in its path. In some galaxies, it can even vaporize entire planets!
- **Asteroid Showers**: Massive rocks occasionally drift through the system. They crush any particles they touch.
- **Speed Zones**: Green nebulas that drastically accelerate any particles passing through them.
- **Slow Zones**: Red nebulas that severely bog down particles caught in their dust.

## The AI

The AI Commanders you face are ruthless and calculating:
- **Aggressive Flanking**: They will look for undefended flanks and attack your weakest planets.
- **Back-capping**: If you send your entire army across the map, the AI will exploit the opening and attack your now-defenseless home.
- **Consolidation**: The AI knows when to retreat and pool its forces if it is outnumbered.

## Visuals & Audio
- **Dynamic Audio System**: Alux2Win features a fully voiced, dynamic audio system that responds to your gameplay. It automatically discovers and randomizes audio clips from folders inside `src/assets/audio/` for events such as:
  - Planet Capture (`capture/`)
  - Planet Loss (`oh_no/`) — supports custom playback speeds, e.g., 1.25x speed
  - Enemy Planet Destroyed (`enemy_planet_destroy/`)
  - Particle Death (`regret_to_inform/`)
  - Shield Damage (`shield_damage/`)
  - Planet Damage (`planet_damage/`)
  - Combat Engagement (`combat_engage/`)
  - Entering Speed/Slow Zones (`speed_zone_enter/`, `slow_zone_enter/`)
  - Anomalies and Hazards (`blackhole_trap/`, `asteroid_enter/`, `gamma_ray_fire/`, `white_hole_explosion/`)
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
