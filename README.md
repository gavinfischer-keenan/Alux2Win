# LUX: Cosmic Conquest 🌌

> **LUX** is an ambient real-time strategy game built with TypeScript and PixiJS. Command glowing particle swarms to conquer star systems, avoid cosmic hazards, and outsmart dynamic AI opponents.

---

## 🎮 Gameplay Features

- **Ambient RTS:** No micromanagement, no build queues. Direct your particle swarms with simple click-and-drag controls.
- **Dynamic AI Sub-Roles:** Face off against various AI personalities (`fortress`, `berserker`, `blitzkrieg`, `expander`, etc.) that dynamically adjust their strategies and behaviors.
- **Advanced Hazard Navigation:** The galaxy is fraught with dangers:
  - 🕳️ **Black Holes & Trapping Black Holes:** Lethal gravity wells that destroy particles and planets alike.
  - 🌩️ **Plasma Storms:** Slow-moving anomalies that scramble navigation and trap units.
  - ⚛️ **Speed Zones:** Temporary gravitational anomalies that can either boost or slow down your fleets.
  - 📡 **Gamma Ray Bursts:** Devastating directional beams that require careful timing.
  - 🪐 **White Holes:** Charge them up to unleash massive particle shockwaves.
- **Intelligent Route Planning:** The AI calculates safe waypoints to route its waves around dangerous hazards rather than flying blindly into black holes.
- **Level Editor:** Build, play, and share your own custom galaxies with intuitive drag-and-drop tools and orbit configuration.
- **Leaderboards:** Track your top-5 fastest completion times for every system.

## ✨ What's New in v1.1.0

- **🛡️ Shielded Planets:** A brand new map mechanic! Certain planets now generate protective shields over time. These shields intercept incoming particle damage before the planet's actual health is affected, adding an intense defensive layer to sieges.
- **Improved Random Generation:** The random level generator now creates deadlier combinations (biased towards 2-3 overlapping hazards) and features Shielded Planets natively. Gamma Ray fuses are properly regulated to ensure fair but chaotic fights.
- **Dynamic Tooltips:** Hover over any shielded planet to view its exact real-time shield point accumulation.
- **Optimized UI:** Ranked top-5 run times displayed beautifully on menu tiles.

## 🚀 Getting Started

### Prerequisites

You need [Node.js](https://nodejs.org/) installed on your machine.

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

### Development

Start the Vite development server:
```bash
npm run dev
```

### Production Build

Build the project for production:
```bash
npm run build
```
You can then preview the build with:
```bash
npm run preview
```

## 🧠 AI Intelligence Overhaul

LUX features a custom-built, highly dynamic AI system (`AIController`):
- **Hazard Awareness:** The AI evaluates the flight path of every particle wave it sends. If the path crosses a lethal hazard, the AI will compute a detour waypoint to navigate around it.
- **In-Flight Re-Evaluation:** When a planet changes hands, the AI re-evaluates all waves currently in flight toward that planet. Depending on the AI's sub-role and whether the wave is past the "point of no return," it may recall its units, press the attack, or redirect to a new target.
- **Temporal Suppression:** The AI knows better than to launch a wave straight through an actively firing Gamma Ray Burst.

## 🛠️ Tech Stack

- **Engine:** [PixiJS v8](https://pixijs.com/) — High-performance 2D WebGL rendering.
- **Language:** TypeScript — Fully typed architecture.
- **Build Tool:** Vite — Lightning fast HMR and optimized builds.
- **UI:** Custom DOM overlays integrated with the PixiJS canvas.

## 📝 License

All rights reserved.
