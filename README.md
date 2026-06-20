# LUX (Alux2Win) - v1.5.0

Welcome to **LUX**, an ambient, macro-strategic real-time strategy game inspired by the minimalist flow of *Auralux*. Command massive swarms of luminescent particles to conquer star systems across a beautifully treacherous galaxy.

## 🚀 What's New in v1.5.0?
This major update brings a host of editor improvements, AI additions, and level progression restructurings!

- **Third AI Opponent (Purple):** The galaxy just got more crowded! You can now face off against up to three distinct AI opponents simultaneously. The new "Purple" faction is fully integrated, dynamically spinning up its own brain when detected on the map.
- **Level Editor Overhaul:**
  - Full support for saving levels anywhere in your system via native OS file dialogs! You are no longer restricted to local storage. You can save, organize, and load custom `.json` level files dynamically.
  - Seamlessly test your levels! Hitting 'Play' in the editor now properly tests the level and correctly dumps you right back to your exact editor state when you're done or if you quit. 
  - Editor properties panel now correctly saves all properties instantly (including previously bugged Shield toggles) without needing to click "Done / OK".
  - Gamma Ray editing handles have been improved to align correctly with mouse inputs.
  - Planets with orbits correctly sit still when testing levels directly within the editor.
  - Resolved "Ghost UI" rendering bugs where gameplay elements (like "LOCKED 15s" text) would persist when switching back to the editor.
- **Campaign & Level Cleanups:**
  - Removed "Skirmish 3" to make room for custom user levels in Intro Missions.
  - Cleaned up the Fog of War level system, completely removing older "Grid Fog" and "Hidden Threat" placeholder levels to prep for new designs.
  - Placed newly created levels like "Take Your Sides" prominently into the *Dual Hazard Universes* category.

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
- **Custom AI Personalities:** Battle against up to 3 different AI archetypes simultaneously that will dynamically shift strategies based on the current board state.
- **Built-in Level Editor:** Press `[~]` in the main menu to open the level editor and create your own custom star systems.

## 🛣️ Future Development
- **Custom AI Selection:** Allow the player to explicitly specify the AI types/personalities they want to fight against in a given simulation, rather than relying on randomized subroles.

---
*Command the light. Annihilate the dark.*
