# LUX

LUX is a high-performance, minimalist Real-Time Strategy (RTS) game heavily inspired by LUX. It features massive swarms of boid-driven particles, dynamic generative audio, and a challenging heuristic-based AI, all running beautifully in the browser at 60+ FPS.

## 🚀 Features

- **Massive Swarm Physics:** Thousands of particles driven by boids-style flocking (separation, cohesion, alignment) mixed with aggressive seek-and-destroy combat mechanics.
- **O(1) Spatial Hashing:** The core physics engine leverages a highly optimized spatial hash grid to perform collision and proximity checks, completely eliminating O(N²) bottlenecks.
- **Generative Audio:** A fully procedural, Web Audio API-driven ambient soundtrack that dynamically responds to the game state, featuring pentatonic scales, deep drone bass, and procedural reverb.
- **Dynamic AI State Machine:** A heuristic-driven AI controller that analyzes the board state, evaluates planet values, manages upgrade priorities, and coordinates attacks and defenses based on varying strategic personalities.
- **Modern Tech Stack:** Built purely with **TypeScript**, rendered using **PixiJS v8** for lightning-fast WebGL/WebGPU graphics, and bundled with **Vite**.

## 🛠️ Installation & Setup

1. **Clone the repository:**
   \`\`\`bash
   git clone https://github.com/gavinfischer-keenan/LUX.git
   cd LUX
   \`\`\`

2. **Install dependencies:**
   \`\`\`bash
   npm install
   \`\`\`

3. **Run the development server:**
   \`\`\`bash
   npm run dev
   \`\`\`
   *The game will be available at \`http://localhost:5173\`.*

4. **Build for production:**
   \`\`\`bash
   npm run build
   \`\`\`
   *The optimized static files will be generated in the \`dist/\` directory.*

## 🎮 How to Play

- **Objective:** Conquer all planets on the map.
- **Mechanics:** 
  - Planets you own automatically produce particles.
  - Left-click and drag a box to select your particles.
  - Right-click anywhere in space to command them to travel.
  - Right-click on a planet to send them there.
  - If they are sent to an enemy planet, they will attack it.
  - If they are sent to your own planet, they will heal its defenses or upgrade its capacity!

## 📜 Version History

### v0.3.0
- **Spatial Hash Optimization:** Rewrote particle flocking to use an O(1) grid, fixing performance bottlenecks and right-click regressions.
- **Advanced Healing Mechanics:** Friendly particles now intelligently heal a planet's stationed particle count and bonus-health shield before contributing to upgrades.
- **Galaxies UI System:** Complete overhaul of the Main Menu, introducing Galaxy categories and nested System boards.
- **AI Controller:** Fully functional AI that expands, upgrades, and relentlessly attacks.

### v0.2.0
- **Generative Audio:** Introduced the dynamic Web Audio engine.
- **Settings UI:** Added volume controls, game speed modifiers, and placeholder AI personality toggles.
- **Composite Particles:** Added 5X composite particles to reduce render overhead while maintaining massive damage output.

### v0.1.0
- **Initial Prototyping:** Core game loop, rendering engine, boid mechanics, and basic planet upgrades.

## 📄 License
MIT License.
