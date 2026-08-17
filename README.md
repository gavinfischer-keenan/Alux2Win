# Alux2Win (Lux)

A fast-paced, real-time strategy (RTS) space game where you command massive swarms of particles to conquer planets, navigate treacherous cosmic hazards, and outsmart intelligent AI opponents.

> **Architecture Specification**: See [ARCHITECTURE.md](ARCHITECTURE.md) for the end-to-end system design, ECS mechanics, rendering pipeline, and test mapping.

## 🚀 Features

* **Massive Swarm Combat**: Command thousands of individual particles rendered seamlessly using WebGL. Particles automatically form composite swarms for stronger attacks and break apart when damaged.
* **Intelligent AI**: Face off against AI opponents with dynamic strategies, pathfinding capabilities (including avoiding black holes), and distinct playstyles like "berserker" and "dominator".
* **Cosmic Hazards**: Navigate around and utilize dynamic game elements:
  * **Black Holes**: Massive gravity wells that instantly destroy anything crossing their event horizon.
  * **White Holes**: Repulsive forces that push particles away.
  * **Asteroids**: Bouncing obstacles that block paths, absorb attacks, and can even reset planets.
  * **Plasma Storms**: Chaotic zones that disrupt combat and shield particles from damage.
  * **Speed Zones**: Draw custom polygons to speed up or slow down particles passing through.
  * **Gamma Ray Bursts**: Cataclysmic events that obliterate everything in their path.
  * **Portals**: Instantaneous travel between two points across the map.
* **Level Editor**: Built-in, fully-featured level editor. Create custom maps, place planets, design speed zones, and configure hazards, then export your creations!
* **Upgrades & Abilities**: Level up planets to increase production rates, spawn shields, and deploy devastating EMP blasts.

## 🎮 How to Play

1. **Select**: Left-click to select your planets. Click and drag to select multiple.
2. **Deploy**: Right-click on a target (neutral or enemy planet) to deploy your swarms.
3. **Upgrades**: Use the upgrade panel to reinforce your planets and gain tactical advantages.
4. **Strategy**: Use the terrain! Route particles around black holes, leverage speed zones, and time your attacks during plasma storms.

## 🛠️ Technology Stack

* **Vite** - Lightning-fast build tool and development server.
* **TypeScript** - Strongly typed JavaScript for robust codebase.
* **Pixi.js** - High-performance WebGL 2D rendering engine capable of handling thousands of particles at 60 FPS.
* **Vitest** - Blazing fast unit testing framework.
* **Spatial Hashing** - Optimized collision detection for massive swarms.

## 💻 Development Setup

To run the game locally or contribute to development:

```bash
# 1. Clone the repository
git clone https://github.com/your-username/Alux2Win.git
cd Alux2Win

# 2. Install dependencies
npm install

# 3. Start the development server
npm run dev
```

### Running Tests

The project includes an automated test suite to verify core systems (Combat, Movement, Gravity, Collision, AI, and Asteroids).

```bash
# Run unit tests and performance stress test
npm run test
```

## 📝 Recent Updates

* **v1.6.11** - Enhanced Speed Zone Editor UI with geometric intersection validation, stopping "impossible shapes".
* **Refactored Test Suite** - Consolidated test mock generation using `TestFactory`.
* **Advanced AI Pathfinding** - AI now smartly plots paths around stationary hazards and avoids dangerous black holes.

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! Feel free to check the issues page or submit a pull request.
