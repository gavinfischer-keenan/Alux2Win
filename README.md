# LUX (Alux2Win) - v1.4.1

Welcome to **LUX**, an ambient, macro-strategic real-time strategy game inspired by the minimalist flow of *Auralux*. Command massive swarms of luminescent particles to conquer star systems across a beautifully treacherous galaxy.

## 🚀 What's New in v1.4.1?
The latest bundle of updates brings a massive leap in aesthetics, UI architecture, and gameplay balance!

- **Spectator Mode:** When the player is eliminated early in the match, the simulation will pause with a "YOU DIED" screen. An "👁 WATCH THE REST OF THE FIGHT" button allows the player to seamlessly transition into a spectator to watch the remaining AIs battle for galactic supremacy until a final victor emerges.
- **Nested Main Menu System:** The main menu has been entirely overhauled to support drill-down sub-menus. The `Single Hazard Universes` folder now neatly organizes all 9 cosmic anomaly galaxies. `Dual` and `Triple Hazard` universes are teased with prominent "COMING SOON" badges. 
- **Shield Mechanics Overhaul:** Shielded Planets are now fully active, accurately rendering varying rates of shield regeneration based on their upgrade levels. A new vibrant cyan intensity ring visually communicates exact shield strength directly on the map.
- **Fog of War Tweaks:** The detection ranges for the Fog of War have been halved across all planet levels (250/425/650), demanding much more aggressive and deliberate expansion to reveal enemy movements.
- **Visual FX Polish:** Hard lines and strokes have been eliminated in favor of organic, breathing nebulas and particle blooms. Plasma Storms and Speed Traps now feature dynamic tendrils, White Holes show progressive charging arcs, and Gamma Rays have intense writhing distortion and terminus bloom effects. 
- **AI Improvements:** The AI has received logic adjustments for colonization priorities and improved white-hole investment awareness.

## 🌌 The Cosmic Hazards
To conquer the galaxy, you must master the anomalies that inhabit it. Single Hazard Universes introduce you to:
1. **Plasma Storms:** Volatile fields that gradually drain the life force of any units within.
2. **Asteroids:** Massive rocks that crash through space, annihilating weak planets and units. 
3. **Gamma Rays:** Lethal sweeping beams that instantly incinerate anything caught in the crossfire.
4. **Speed Traps:** Spacetime distortions that dramatically accelerate or decelerate passing swarms.
5. **Portals:** Wormholes that allow for instantaneous tactical reinforcement across the system.
6. **Black Holes:** Gravitational anomalies that crush any unit foolish enough to stray too close.
7. **White Holes:** Risky investments; feed them with units to trigger a massive payout bounty.
8. **Shielded Planets:** Defensive bastions that slowly generate protective energy barriers over time.
9. **Fog of War:** Shrouds the galaxy in darkness, requiring you to expand your vision to survive.

## 🎮 Getting Started

### Prerequisites
Make sure you have [Node.js](https://nodejs.org/) installed on your machine.

### Installation
1. Clone the repository.
2. Run `npm install` to install dependencies.
3. Run `npm run dev` to start the local development server.
4. Navigate to `http://localhost:3000` to play!

### Controls
*   **Left Click & Drag:** Lasso select units.
*   **Left Click:** Select a planet to control its orbiting defenders and production queue.
*   **Right Click:** Issue a move or attack order to the selected units/planet.
*   **Double Right Click:** Repeat the previous deploy action for the currently selected planet.
*   **Middle Click / Drag:** Pan the camera around the system.
*   **Scroll Wheel:** Zoom the camera in and out.
*   **ESC:** Open the pause menu.

## 🛠 Features Under the Hood
- **PixiJS Rendering:** Silky smooth WebGL rendering capable of handling thousands of independent particles.
- **Custom AI Personalities:** Battle against different AI archetypes (Berserker, Fortress, Opportunist, Economic, etc.) that will dynamically shift strategies based on the current board state.
- **Built-in Level Editor:** Press `[~]` in the main menu to open the level editor and create your own custom star systems.

---
*Command the light. Annihilate the dark.*
