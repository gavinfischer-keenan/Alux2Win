// ============================================================
// TutorialController.ts — Multi-tutorial step machine
// Supports all galaxy-specific tutorials via tutorialId key.
// Overlays instructional cards, watches GameState, controls
// scripted enemy faction, and shows a completion card at end.
// ============================================================

import type { GameState } from '../types';

export type TutorialDeployCallback = (fromIds: string[], targetId: string) => void;

// ---------------------------------------------------------------------------
// Step definitions
// ---------------------------------------------------------------------------

interface TutorialStep {
  id: string;
  icon: string;
  heading: string;
  body: string;
  pointAtPlanet?: string;
  /** If true, auto-dismiss when isDone returns true (no tap required) */
  autoDismiss: boolean;
  isDone: (state: GameState, elapsed: number) => boolean;
}

// ---------------------------------------------------------------------------
// Enemy script definitions
// ---------------------------------------------------------------------------

interface EnemyAction {
  triggerTime: number;
  from: string[];
  to: string;
  done: boolean;
}

// ---------------------------------------------------------------------------
// All tutorial scripts keyed by tutorialId
// ---------------------------------------------------------------------------

const TUTORIAL_SCRIPTS: Record<string, TutorialStep[]> = {

  fogofwar: [
    {
      id: 'fog_intro',
      icon: '🌫️',
      heading: 'The Fog of War',
      body: 'Welcome to the Fog of War. You have a few seconds to scout the galaxy before the darkness descends. Pay close attention to enemy positions!',
      autoDismiss: false,
      isDone: (_s, elapsed) => elapsed > 5,
    },
    {
      id: 'fog_vision',
      icon: '👁️',
      heading: 'Expand Your Vision',
      body: "The fog hides everything outside your planets' vision range. Upgrade your planets to increase how far you can see. Particles flying in the dark grant NO vision!",
      autoDismiss: false,
      isDone: (state) => {
        // Done when player has upgraded a planet
        return [...state.planets.values()].some(p => p.faction === 'player' && p.upgradeLevel > 1);
      },
    }
  ],

  shield: [
    {
      id: 'shield_intro',
      icon: '🛡️',
      heading: 'Shielded Planets',
      body: 'Welcome to Shielded Planets. These planets generate a protective shield over time. Every 15 seconds, a shield point is generated, acting as an extra layer of defense.',
      pointAtPlanet: 'planet0',
      autoDismiss: false,
      isDone: (_s, elapsed) => elapsed > 10,
    }
  ],

  // ── COMMANDER TRAINING (Tutorial galaxy, combined tutorial) ─
  commander: [
    {
      id: 'welcome',
      icon: '🌌',
      heading: 'Welcome, Commander!',
      body: 'This is your home planet — it produces energy particles that orbit it continuously. More particles means more firepower. Let\'s learn everything you need to conquer this galaxy.',
      pointAtPlanet: 'p_home',
      autoDismiss: false,
      isDone: (_s, elapsed) => elapsed > 8,
    },
    {
      id: 'select',
      icon: '🖱️',
      heading: 'Step 1 — Select',
      body: 'Left-click your home planet to select it. You\'ll see a bright ring appear around it. You can also drag across multiple planets to select them all at once.',
      pointAtPlanet: 'p_home',
      autoDismiss: true,
      isDone: (state) => state.selectedPlanetIds.has('p_home'),
    },
    {
      id: 'capture',
      icon: '🎯',
      heading: 'Step 2 — Capture',
      body: 'With your planet selected, right-click the grey planet above to send particles to capture it. Grey planets are neutral — they belong to nobody yet! Notice the badge in the top-left corner showing how many particles you have selected.',
      pointAtPlanet: 'p_near',
      autoDismiss: true,
      isDone: (state) => {
        const pNear = state.planets.get('p_near');
        if (pNear && pNear.faction === 'player') return true;
        return state.particles.some(p => p.alive && p.faction === 'player' && p.targetPlanetId === 'p_near');
      },
    },
    {
      id: 'captured',
      icon: '✅',
      heading: 'Captured!',
      body: 'That planet is now yours and producing particles for you. More planets = faster growth. Now capture the neutral planet below too — build your empire!',
      pointAtPlanet: 'p_upgrade',
      autoDismiss: false,
      isDone: (state, elapsed) => {
        const pNear = state.planets.get('p_near');
        return (pNear?.faction === 'player') && elapsed > 8;
      },
    },
    {
      id: 'upgrade_hint',
      icon: '⬆️',
      heading: 'Step 3 — Upgrade',
      body: 'To upgrade a planet, select your fleet and right-click one of YOUR OWN planets. Particles you send to your own planet are absorbed directly, filling the cyan arc on the RIGHT — that\'s your upgrade progress!',
      pointAtPlanet: 'p_upgrade',
      autoDismiss: true,
      isDone: (state) => {
        for (const planet of state.planets.values()) {
          if (planet.faction === 'player' && planet.id !== 'p_home' && planet.upgradeLevel >= 2) return true;
        }
        return false;
      },
    },
    {
      id: 'upgraded',
      icon: '🌟',
      heading: 'Planet Upgraded!',
      body: 'See how it grew? Level 2 planets produce particles twice as fast. Level 3 is even more powerful. Upgraded planets are also tougher to destroy — keep upgrading!',
      autoDismiss: false,
      isDone: (_s, elapsed) => elapsed > 8,
    },
    {
      id: 'attack_prompt',
      icon: '⚔️',
      heading: 'Step 4 — Attack!',
      body: 'Time to go on offense. Select your strongest planet and right-click the enemy\'s red planet. Your particles will fly there and fight theirs. Overwhelm them with numbers!',
      pointAtPlanet: 'p_enemy',
      autoDismiss: true,
      isDone: (state) => {
        return state.particles.some(p => p.alive && p.faction === 'player' && p.targetPlanetId === 'p_enemy');
      },
    },
    {
      id: 'combat',
      icon: '💥',
      heading: 'Combat!',
      body: 'Your particles clash with enemy particles in space — they cancel each other out. Whoever sends MORE particles wins the battle. Use your upgraded planets to out-produce and overwhelm!',
      pointAtPlanet: 'p_enemy',
      autoDismiss: true,
      isDone: (state) => {
        // Enemy attacked — advance when player planet takes damage OR enemy sends particles
        const enemyParticles = state.particles.filter(p => p.alive && p.faction === 'enemy_a');
        const playerPlanets  = [...state.planets.values()].filter(p => p.faction === 'player');
        return playerPlanets.some(p => p.health < p.maxHealth) || enemyParticles.length > 5;
      },
    },
    {
      id: 'repair_hint',
      icon: '🛡️',
      heading: 'Step 5 — Repair!',
      body: 'If a planet takes damage, send YOUR particles to it. The RED arc on the LEFT side shows damage. Incoming particles heal damage FIRST, then contribute to upgrades. Keep your planets healthy!',
      autoDismiss: false,
      isDone: (_s, elapsed) => elapsed > 12,
    },
    {
      id: 'repeat_action',
      icon: '🔁',
      heading: 'Double Right-Click — Repeat!',
      body: 'Power move: double right-click anywhere to instantly repeat your last deploy order. Your last selection and target are remembered, so you can keep up relentless pressure with just two clicks!',
      autoDismiss: false,
      isDone: (_s, elapsed) => elapsed > 10,
    },
    {
      id: 'counter_attack',
      icon: '🚀',
      heading: 'Press the Advantage!',
      body: 'You\'ve got the full toolkit! Now push forward — capture the central neutral planet, upgrade everything to level 3, and eliminate the enemy base. The galaxy is yours to take!',
      pointAtPlanet: 'p_enemy',
      autoDismiss: true,
      isDone: (state) => {
        const enemyPlanets = [...state.planets.values()].filter(p => p.faction === 'enemy_a');
        return enemyPlanets.length === 0;
      },
    },
    {
      id: 'complete',
      icon: '🏆',
      heading: 'Commander Training Complete!',
      body: 'You\'ve mastered it all: selecting, capturing, upgrading, attacking, repairing, and the double right-click repeat trick. You\'re ready for any galaxy!',
      autoDismiss: false,
      isDone: () => false,
    },
  ],

  // ── BASICS (Tutorial galaxy) ────────────────────────────────
  basics: [

    {
      id: 'welcome',
      icon: '🌌',
      heading: 'Welcome, Commander!',
      body: 'This glowing sphere is your home planet. It continuously produces energy particles that orbit it. More particles = more military strength.',
      pointAtPlanet: 'p_home',
      autoDismiss: false,
      isDone: (_s, elapsed) => elapsed > 30,
    },
    {
      id: 'select',
      icon: '🖱️',
      heading: 'Select Your Planet',
      body: 'Left-click your home planet to select it. A bright ring will appear around it.',
      pointAtPlanet: 'p_home',
      autoDismiss: true,
      isDone: (state) => state.selectedPlanetIds.has('p_home'),
    },
    {
      id: 'capture_prompt',
      icon: '🎯',
      heading: 'Capture a Neutral Planet',
      body: 'The grey planet nearby has no owner. With your home planet selected, right-click that grey planet to send your particles to capture it!',
      pointAtPlanet: 'p_near',
      autoDismiss: true,
      isDone: (state) => {
        const pNear = state.planets.get('p_near');
        if (pNear && pNear.faction === 'player') return true;
        return state.particles.some(p => p.alive && p.faction === 'player' && p.targetPlanetId === 'p_near');
      },
    },
    {
      id: 'captured',
      icon: '✅',
      heading: 'Planet Captured!',
      body: 'Excellent! You own that planet now. It will start producing particles for you. More planets = faster growth. Try capturing the next neutral planet too!',
      pointAtPlanet: 'p_mid',
      autoDismiss: false,
      isDone: (state, elapsed) => {
        const pNear = state.planets.get('p_near');
        return (pNear?.faction === 'player') && elapsed > 10;
      },
    },
    {
      id: 'upgrade_hint',
      icon: '⬆️',
      heading: 'Upgrade Your Planets',
      body: 'Right-click one of YOUR OWN planets to send particles to it. They\'re absorbed directly, filling the cyan arc on the right. A level 2 planet produces much faster — level 3 is a powerhouse!',
      pointAtPlanet: 'p_upgrade',
      autoDismiss: true,
      isDone: (state) => {
        for (const planet of state.planets.values()) {
          if (planet.faction === 'player' && planet.id !== 'p_home' && planet.upgradeLevel >= 2) return true;
        }
        return false;
      },
    },
    {
      id: 'upgraded',
      icon: '🌟',
      heading: 'Planet Upgraded!',
      body: 'Look at the size difference! Upgraded planets produce particles faster and can hold more. Max level 3 is a powerhouse. When particles die to hazards, watch for sparkle flashes — and planets struck show a shockwave ring!',
      autoDismiss: false,
      isDone: (_s, elapsed) => elapsed > 8,
    },
    {
      id: 'badge_tip',
      icon: '🔢',
      heading: 'Selection Badge',
      body: 'When you lasso-select multiple planets by dragging, a badge appears in the top-left corner showing your total selected particle count and how many are orbiting in defense. Use it to plan your attacks!',
      autoDismiss: false,
      isDone: (_s, elapsed) => elapsed > 8,
    },
    {
      id: 'enemy_incoming',
      icon: '⚠️',
      heading: 'Incoming Attack!',
      body: 'The enemy is sending particles toward you! Counter-attack their planet while they\'re exposed, or reinforce your threatened planet by single right-clicking it while yours are selected.',
      pointAtPlanet: 'p_enemy',
      autoDismiss: true,
      isDone: (state) => {
        const enemyPlanets = [...state.planets.values()].filter(p => p.faction === 'enemy_a');
        return enemyPlanets.length === 0;
      },
    },
    {
      id: 'complete',
      icon: '🏆',
      heading: 'Training Complete!',
      body: 'Outstanding, Commander! You\'ve mastered the basics: selecting, capturing, upgrading, and surviving an attack. The galaxy awaits!',
      autoDismiss: false,
      isDone: () => false,
    },
  ],

  // ── NORMAL (strategy tutorial) ─────────────────────────────
  normal: [
    {
      id: 'intro',
      icon: '⚔️',
      heading: 'Multi-Planet Warfare',
      body: 'In normal space there are no hazards — just pure strategy. Capture planets quickly to out-produce your opponent.',
      pointAtPlanet: 'p_home',
      autoDismiss: false,
      isDone: (_s, elapsed) => elapsed > 8,
    },
    {
      id: 'expand',
      icon: '🌐',
      heading: 'Expand on Two Fronts',
      body: 'Capture BOTH neutral planets to your right simultaneously! Select your home planet and right-click each grey planet in quick succession.',
      pointAtPlanet: 'p_near_a',
      autoDismiss: true,
      isDone: (state) => {
        const a = state.planets.get('p_near_a');
        const b = state.planets.get('p_near_b');
        return a?.faction === 'player' && b?.faction === 'player';
      },
    },
    {
      id: 'mid_control',
      icon: '⭐',
      heading: 'Contest the Center',
      body: 'The center planet is the key to this system. Whoever owns it gains a massive production advantage. Send your fleet to capture it!',
      pointAtPlanet: 'p_mid',
      autoDismiss: true,
      isDone: (state) => state.planets.get('p_mid')?.faction === 'player',
    },
    {
      id: 'push',
      icon: '🚀',
      heading: 'Press the Advantage!',
      body: 'With more planets, you now out-produce the enemy. Concentrate your forces and push for their home planet!',
      pointAtPlanet: 'p_enemy',
      autoDismiss: true,
      isDone: (state) => {
        const enemyPlanets = [...state.planets.values()].filter(p => p.faction === 'enemy_a');
        return enemyPlanets.length === 0;
      },
    },
    {
      id: 'complete',
      icon: '🏆',
      heading: 'Strategy Mastered!',
      body: 'You dominated this system through smart expansion and coordinated pressure. Normal galaxy systems await your conquest!',
      autoDismiss: false,
      isDone: () => false,
    },
  ],

  // ── PLASMA STORMS ────────────────────────────────────────────
  

  // ── ASTEROIDS ───────────────────────────────────────────────
  asteroids: [
    {
      id: 'intro',
      icon: '☄️',
      heading: 'Asteroid Field!',
      body: 'Asteroids rain down constantly in this galaxy. If one hits your planet, it gets knocked DOWN by 2 upgrade levels. A Level 1 planet hit by an asteroid is DESTROYED!',
      autoDismiss: false,
      isDone: (_s, elapsed) => elapsed > 10,
    },
    {
      id: 'weak_vs_strong',
      icon: '⚡',
      heading: 'Level Matters!',
      body: 'Look at the two planets ahead: the small one (Level 1) and the large one (Level 3). An asteroid hit will destroy the small one but barely affect the max-level one. Keep your planets upgraded!',
      pointAtPlanet: 'p_weak',
      autoDismiss: false,
      isDone: (_s, elapsed) => elapsed > 12,
    },
    {
      id: 'upgrade_push',
      icon: '⬆️',
      heading: 'Upgrade or Die!',
      body: 'Capture that weak neutral planet and immediately upgrade it by sending particles to it. You have to race the asteroids — a Level 3 planet is almost indestructible!',
      pointAtPlanet: 'p_weak',
      autoDismiss: true,
      isDone: (state) => {
        const pw = state.planets.get('p_weak');
        return pw?.faction === 'player' && (pw?.upgradeLevel ?? 0) >= 2;
      },
    },
    {
      id: 'survive',
      icon: '🎯',
      heading: 'Outlast the Enemy',
      body: 'Asteroids hit both sides equally! The enemy has the same problem. Keep upgrading and push for their base while they scramble to recover from asteroid hits.',
      pointAtPlanet: 'p_enemy',
      autoDismiss: true,
      isDone: (state) => {
        const enemyPlanets = [...state.planets.values()].filter(p => p.faction === 'enemy_a');
        return enemyPlanets.length === 0;
      },
    },
    {
      id: 'complete',
      icon: '🏆',
      heading: 'Asteroid Survivor!',
      body: 'You\'ve learned to thrive under constant bombardment. Keep planets at Level 3 and use asteroid hits on the enemy to your advantage!',
      autoDismiss: false,
      isDone: () => false,
    },
  ],

  // ── GAMMA RAYS ──────────────────────────────────────────────
  gamma: [
    {
      id: 'intro',
      icon: '⚡',
      heading: 'Gamma Ray Bursts!',
      body: 'A massive Gamma Ray beam periodically sweeps across this galaxy. Any planet in its path takes serious damage — watch for the countdown warning!',
      autoDismiss: false,
      isDone: (_s, elapsed) => elapsed > 8,
    },
    {
      id: 'watch_beam',
      icon: '👁️',
      heading: 'Watch the Beam!',
      body: 'A beam will fire very soon. Watch how it crosses the galaxy — planets directly in its path will be struck. The center planet is in danger!',
      pointAtPlanet: 'p_danger',
      autoDismiss: true,
      isDone: (state, elapsed) => {
        // Advance once the gamma ray has fired once (after ~22s) OR a planet has taken beam damage
        return elapsed > 25;
      },
    },
    {
      id: 'avoid_path',
      icon: '⚠️',
      heading: 'Avoid the Beam Path!',
      body: 'Planets on the beam path will always take damage. Capture planets that are OUT of the beam path and let the beam punish the enemy\'s central planets instead.',
      pointAtPlanet: 'p_safe',
      autoDismiss: true,
      isDone: (state) => state.planets.get('p_safe')?.faction === 'player',
    },
    {
      id: 'push',
      icon: '🚀',
      heading: 'Use the Beam!',
      body: 'Let the beam do your dirty work. Push into territory the beam keeps damaging. Now finish off the enemy!',
      pointAtPlanet: 'p_enemy',
      autoDismiss: true,
      isDone: (state) => {
        const enemyPlanets = [...state.planets.values()].filter(p => p.faction === 'enemy_a');
        return enemyPlanets.length === 0;
      },
    },
    {
      id: 'complete',
      icon: '🏆',
      heading: 'Gamma Ray Expert!',
      body: 'You\'ve learned to use the beam as a weapon — let it weaken enemy planets while you attack safely from outside the path!',
      autoDismiss: false,
      isDone: () => false,
    },
  ],

  // ── SPEED ZONES ─────────────────────────────────────────────
  speed: [
    {
      id: 'intro',
      icon: '💨',
      heading: 'Speed Zones!',
      body: 'This galaxy has Speed Zones. Green glowing areas DOUBLE your particles\' speed. Red/dark areas slow them to a crawl. Route your fleets wisely!',
      autoDismiss: false,
      isDone: (_s, elapsed) => elapsed > 8,
    },
    {
      id: 'fast_zone',
      icon: '🟢',
      heading: 'The Fast Lane',
      body: 'See that bright green zone in the center? Send particles through it and watch how they ROCKET across the map. Route your attacks through it for surprise speed strikes!',
      autoDismiss: true,
      isDone: (state) => {
        // Done when player has particles in the fast zone or has captured the far planet quickly
        return state.particles.some(p => p.alive && p.faction === 'player' && p.speedMod >= 1.8);
      },
    },
    {
      id: 'slow_zone',
      icon: '🔴',
      heading: 'The Slow Trap',
      body: 'That dark red zone near the bottom-left will slow your particles dramatically. Avoid routing fleets through it unless you need to stall for time!',
      autoDismiss: false,
      isDone: (_s, elapsed) => elapsed > 10,
    },
    {
      id: 'push',
      icon: '⚡',
      heading: 'Speed Blitz!',
      body: 'Route your attack fleet through the fast zone and hit the enemy base before they can react. Speed = surprise!',
      pointAtPlanet: 'p_enemy',
      autoDismiss: true,
      isDone: (state) => {
        const enemyPlanets = [...state.planets.values()].filter(p => p.faction === 'enemy_a');
        return enemyPlanets.length === 0;
      },
    },
    {
      id: 'complete',
      icon: '🏆',
      heading: 'Speed Ace!',
      body: 'You\'ve mastered zone routing. In real matches, controlling the fast zone is like controlling the highway — speed = first strike advantage!',
      autoDismiss: false,
      isDone: () => false,
    },
  ],

  // ── PORTALS ─────────────────────────────────────────────────
  portals: [
    {
      id: 'intro',
      icon: '🌀',
      heading: 'Portals!',
      body: 'Those glowing twin rings are Portal pairs. Particles that fly into one portal INSTANTLY emerge from its twin — no matter how far apart they are!',
      autoDismiss: false,
      isDone: (_s, elapsed) => elapsed > 8,
    },
    {
      id: 'use_portal',
      icon: '🎯',
      heading: 'Try a Portal!',
      body: 'Select your home planet and send particles toward the cyan portal on the upper-left. Watch them vanish and appear from the portal on the other side of the map!',
      autoDismiss: true,
      isDone: (state) => {
        // Done when we have player particles that have portal cooldown (meaning they teleported)
        return state.particles.some(p => p.alive && p.faction === 'player' && (p.portalCooldown ?? 0) > 0);
      },
    },
    {
      id: 'flank',
      icon: '🗡️',
      heading: 'The Flank Attack!',
      body: 'Portals let you attack from an UNEXPECTED direction. Send your fleet through the orange portal pair — they\'ll emerge right behind the enemy!',
      pointAtPlanet: 'p_enemy',
      autoDismiss: true,
      isDone: (state) => {
        const enemyPlanets = [...state.planets.values()].filter(p => p.faction === 'enemy_a');
        return enemyPlanets.length === 0;
      },
    },
    {
      id: 'complete',
      icon: '🏆',
      heading: 'Portal Commander!',
      body: 'Portals are your greatest tactical tool. Use them to strike from multiple directions simultaneously and keep the enemy guessing where your next attack will emerge!',
      autoDismiss: false,
      isDone: () => false,
    },
  ],

  // ── BLACK HOLES ─────────────────────────────────────────────
  blackholes: [
    {
      id: 'intro',
      icon: '🕳️',
      heading: 'Black Holes!',
      body: 'Those dark swirling masses in the center are Black Holes. Any particle that flies too close gets pulled in and TRAPPED — then slowly destroyed. They are impassable barriers!',
      autoDismiss: false,
      isDone: (_s, elapsed) => elapsed > 10,
    },
    {
      id: 'danger_demo',
      icon: '⚠️',
      heading: 'The Pull Zone',
      body: 'The pull radius is much larger than the visible swirl. If you send particles through the center, they\'ll get captured. Route your fleet around the edges of the map!',
      autoDismiss: false,
      isDone: (_s, elapsed) => elapsed > 10,
    },
    {
      id: 'route_around',
      icon: '🧭',
      heading: 'Route Wide!',
      body: 'Capture the safe planet in the upper-left first. It\'s reachable by going around the top edge — far from the black holes. Never send particles through the center!',
      pointAtPlanet: 'p_safe',
      autoDismiss: true,
      isDone: (state) => state.planets.get('p_safe')?.faction === 'player',
    },
    {
      id: 'enemy_bait',
      icon: '💡',
      heading: 'Bait the Enemy!',
      body: 'Smart commanders bait enemy fleets toward black holes! Attack from the far side so the enemy has to route past the black holes to respond.',
      pointAtPlanet: 'p_enemy',
      autoDismiss: true,
      isDone: (state) => {
        const enemyPlanets = [...state.planets.values()].filter(p => p.faction === 'enemy_a');
        return enemyPlanets.length === 0;
      },
    },
    {
      id: 'complete',
      icon: '🏆',
      heading: 'Event Horizon Survivor!',
      body: 'You\'ve learned to navigate and exploit Black Holes. In tough battles, lure enemies into the pull zone — let gravity do your fighting for you!',
      autoDismiss: false,
      isDone: () => false,
    },
  ],

  // ── WHITE HOLES ─────────────────────────────────────────────
  whiteholes: [
    {
      id: 'intro',
      icon: '✨',
      heading: 'White Holes!',
      body: 'That glowing white sphere in the center is a White Hole. Feed it 80 of your particles and it ERUPTS — launching 300 fresh particles for your faction in every direction!',
      pointAtPlanet: 'p_home',
      autoDismiss: false,
      isDone: (_s, elapsed) => elapsed > 10,
    },
    {
      id: 'feed_it',
      icon: '⚡',
      heading: 'Feed the White Hole!',
      body: 'Select your home planet and right-click the glowing White Hole in the center. Keep sending particles into it — it needs 80 to fully charge. Watch the progress ring grow!',
      autoDismiss: true,
      isDone: (state) => {
        // Done when white hole has started charging (progress > 0)
        return state.whiteHoles.some(wh => wh.progress > 5);
      },
    },
    {
      id: 'charging',
      icon: '🔋',
      heading: 'Charging...',
      body: 'Keep feeding it! Each particle adds to the charge. When it hits 80, stand back — 300 particles explode outward from the nova! Enemy particles hit by hazards flash with sparkles; planets struck show a shockwave ring.',
      autoDismiss: true,
      isDone: (state) => {
        return state.whiteHoles.some(wh => wh.exploded) || state.whiteHoles.length === 0;
      },
    },
    {
      id: 'repeat_tip',
      icon: '🔁',
      heading: 'Repeat Last Action!',
      body: 'Pro tip: double right-click anywhere to instantly repeat your last deploy order — same source, same target. Great for feeding a White Hole turn after turn without re-selecting!',
      autoDismiss: false,
      isDone: (_s, elapsed) => elapsed > 10,
    },
    {
      id: 'weapon',
      icon: '💥',
      heading: 'Supernova Weapon!',
      body: 'The best tactic: Charge a White Hole near enemy planets, THEN lure their fleet close — trigger it when their forces are in range for maximum destruction!',
      pointAtPlanet: 'p_enemy_a',
      autoDismiss: false,
      isDone: (_s, elapsed) => elapsed > 12,
    },
    {
      id: 'push',
      icon: '🚀',
      heading: 'Finish Them!',
      body: 'With the nova clearing the field, push forward and eliminate the weakened enemy planets!',
      autoDismiss: true,
      isDone: (state) => {
        const enemyPlanets = [...state.planets.values()].filter(p => p.faction === 'enemy_a');
        return enemyPlanets.length === 0;
      },
    },
    {
      id: 'complete',
      icon: '🏆',
      heading: 'Nova Commander!',
      body: 'You\'ve mastered the White Hole weapon. Charge it near enemy clusters, bait them in, and trigger the nova for a galaxy-shaking advantage!',
      autoDismiss: false,
      isDone: () => false,
    },
  ],
};

// ---------------------------------------------------------------------------
// Enemy scripts keyed by tutorialId
// ---------------------------------------------------------------------------

function makeEnemyScript(tutorialId: string): EnemyAction[] {
  const scripts: Record<string, EnemyAction[]> = {
    commander: [
      // At 35s: enemy attacks the mid neutral to demonstrate threat
      { triggerTime: 35, from: ['p_enemy'], to: 'p_mid',     done: false },
      // At 55s: direct attack on a player planet (demo repair)
      { triggerTime: 55, from: ['p_enemy'], to: 'p_near',    done: false },
      // At 80s: final big push
      { triggerTime: 80, from: ['p_enemy'], to: 'p_home',    done: false },
    ],
    basics: [
      { triggerTime: 30, from: ['p_enemy'], to: 'p_mid',     done: false },
      { triggerTime: 50, from: ['p_enemy'], to: 'p_near',    done: false },
      { triggerTime: 70, from: ['p_enemy'], to: 'p_home',    done: false },
    ],
    normal: [
      { triggerTime: 25, from: ['p_enemy'], to: 'p_far_a',   done: false },
      { triggerTime: 40, from: ['p_enemy'], to: 'p_mid',     done: false },
      { triggerTime: 60, from: ['p_enemy'], to: 'p_home',    done: false },
    ],

    asteroids: [
      { triggerTime: 20, from: ['p_enemy'], to: 'p_mid',     done: false },
      { triggerTime: 45, from: ['p_enemy'], to: 'p_home',    done: false },
    ],
    gamma: [
      { triggerTime: 30, from: ['p_enemy'], to: 'p_far',     done: false },
      { triggerTime: 55, from: ['p_enemy'], to: 'p_home',    done: false },
    ],
    speed: [
      { triggerTime: 20, from: ['p_enemy'], to: 'p_bottom',  done: false },
      { triggerTime: 40, from: ['p_enemy'], to: 'p_home',    done: false },
    ],
    portals: [
      { triggerTime: 25, from: ['p_enemy'], to: 'p_mid',     done: false },
      { triggerTime: 50, from: ['p_enemy'], to: 'p_home',    done: false },
    ],
    blackholes: [
      { triggerTime: 30, from: ['p_enemy'], to: 'p_far',     done: false },
      { triggerTime: 55, from: ['p_enemy'], to: 'p_home',    done: false },
    ],
    whiteholes: [
      { triggerTime: 40, from: ['p_enemy_a'], to: 'p_side_a', done: false },
      { triggerTime: 60, from: ['p_enemy_b'], to: 'p_home',   done: false },
    ],
  };
  return (scripts[tutorialId] || []).map(a => ({ ...a, done: false }));
}

// ---------------------------------------------------------------------------
// Completion text keyed by tutorialId
// ---------------------------------------------------------------------------

const COMPLETION_BLURBS: Record<string, string> = {
  commander:  'Select, capture, upgrade, attack, repair. You know it all now, Commander.',
  basics:     'You\'ve mastered the fundamentals of galactic warfare.',
  normal:     'Pure strategy — no excuses, just skill. You\'ve got it.',
  asteroids:  'Upgrade fast, survive longer. You know the rule.',
  gamma:      'Let the beam work for you, not against you.',
  speed:      'Speed zones amplify every attack you make.',
  portals:    'Portals open the door to unbeatable flanks.',
  blackholes: 'Gravity is a weapon. You\'ve learned to wield it.',
  whiteholes: 'A nova well-placed can win any war in seconds.',
};

// ---------------------------------------------------------------------------
// Card state
// ---------------------------------------------------------------------------

interface CardState {
  element: HTMLElement;
  arrowElement: HTMLElement | null;
}

// ---------------------------------------------------------------------------
// TutorialController
// ---------------------------------------------------------------------------

export class TutorialController {
  private container: HTMLElement;
  private tutorialId: string;
  private steps: TutorialStep[];
  private enemyScript: EnemyAction[];
  private stepIndex = 0;
  private stepElapsed = 0;
  private totalElapsed = 0;
  private card: CardState | null = null;
  private _completed = false;

  private getPlanetScreenPos: (planetId: string) => { x: number; y: number } | null = () => null;

  /** Called when the last step is reached — pass exit and keep-playing callbacks. */
  onComplete: (exitFn: () => void, keepPlayingFn: () => void) => void = () => {};

  constructor(
    tutorialId: string,
    uiContainer: HTMLElement,
    getPlanetScreenPos: (planetId: string) => { x: number; y: number } | null,
  ) {
    this.tutorialId = tutorialId;
    this.container  = uiContainer;
    this.getPlanetScreenPos = getPlanetScreenPos;
    this.steps       = TUTORIAL_SCRIPTS[tutorialId] ?? TUTORIAL_SCRIPTS['basics'];
    this.enemyScript = makeEnemyScript(tutorialId);
    this.ensureAnimations();
    this.showStep(0);
  }

  // ── Public update ────────────────────────────────────────────

  update(dt: number, state: GameState, deploy: TutorialDeployCallback): void {
    this.totalElapsed += dt;
    this.stepElapsed  += dt;

    this.runEnemyScript(state, deploy);

    const step = this.steps[this.stepIndex];
    if (!step) return;

    // Update arrow
    if (step.pointAtPlanet && this.card?.arrowElement) {
      const pos = this.getPlanetScreenPos(step.pointAtPlanet);
      if (pos) this.updateArrow(this.card.arrowElement, pos.x, pos.y);
    }

    // Check auto-dismiss
    if (step.autoDismiss && step.isDone(state, this.stepElapsed)) {
      this.advance();
    }
  }

  destroy(): void {
    this.dismissCard();
  }

  // ── Private helpers ──────────────────────────────────────────

  private advance(): void {
    const nextIdx = this.stepIndex + 1;
    this.dismissCard();

    if (nextIdx >= this.steps.length) {
      // Reached the end — show completion card
      this._completed = true;
      this.showCompletionCard();
      return;
    }

    // Check if it's the *last* step (the 'complete' step with isDone: () => false)
    const nextStep = this.steps[nextIdx];
    this.stepIndex = nextIdx;
    this.stepElapsed = 0;
    this.showStep(this.stepIndex);

    // If the step is the final "complete" card, trigger onComplete after showing it
    if (nextStep.id === 'complete') {
      setTimeout(() => {
        this.dismissCard();
        this.showCompletionCard();
      }, 3000);
    }
  }

  private runEnemyScript(state: GameState, deploy: TutorialDeployCallback): void {
    for (const action of this.enemyScript) {
      if (action.done) continue;
      if (this.totalElapsed < action.triggerTime) continue;

      const validSources = action.from.filter(id => {
        const p = state.planets.get(id);
        if (!p || p.faction !== 'enemy_a') return false;
        const orbitingCount = state.particles.filter(pt => pt.alive && pt.mode === 'orbiting' && pt.homePlanetId === id).length;
        return orbitingCount >= 5;
      });
      const target = state.planets.get(action.to);

      if (validSources.length > 0 && target) {
        deploy(validSources, action.to);
      }
      action.done = true;
    }
  }

  // ── Card UI ──────────────────────────────────────────────────

  private showStep(idx: number): void {
    const step = this.steps[idx];
    if (!step) return;

    const totalSteps = this.steps.filter(s => s.id !== 'complete').length;
    const displayIdx = Math.min(idx, totalSteps - 1);

    const card = document.createElement('div');
    card.className = 'tutorial-card';
    card.style.cssText = `
      position: absolute;
      bottom: 100px;
      left: 50%;
      transform: translateX(-50%) translateY(20px);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      padding: 20px 28px;
      background: rgba(0, 0, 12, 0.88);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid rgba(79, 195, 247, 0.3);
      border-radius: 16px;
      box-shadow: 0 0 40px rgba(79, 195, 247, 0.12), 0 8px 32px rgba(0,0,0,0.7);
      max-width: min(480px, 88vw);
      min-width: 280px;
      z-index: 100;
      pointer-events: auto;
      opacity: 0;
      transition: opacity 0.4s ease, transform 0.4s ease;
      text-align: center;
      user-select: none;
    `;

    // Step counter badge
    const badge = document.createElement('div');
    badge.textContent = `STEP ${displayIdx + 1} / ${totalSteps}`;
    badge.style.cssText = `
      font-family: 'Rajdhani', sans-serif;
      font-size: 0.65rem;
      font-weight: 700;
      color: rgba(79, 195, 247, 0.5);
      letter-spacing: 0.2em;
      text-transform: uppercase;
    `;
    card.appendChild(badge);

    // Progress bar
    const progressBar = document.createElement('div');
    progressBar.style.cssText = `
      width: 100%;
      height: 2px;
      background: rgba(255,255,255,0.08);
      border-radius: 1px;
      overflow: hidden;
      margin-bottom: 4px;
    `;
    const progressFill = document.createElement('div');
    progressFill.style.cssText = `
      height: 100%;
      width: ${Math.round((displayIdx / totalSteps) * 100)}%;
      background: linear-gradient(90deg, #4fc3f7, #81d4fa);
      border-radius: 1px;
      transition: width 0.6s ease;
    `;
    progressBar.appendChild(progressFill);
    card.appendChild(progressBar);

    // Icon
    const iconEl = document.createElement('div');
    iconEl.textContent = step.icon;
    iconEl.style.cssText = `
      font-size: 2.2rem;
      line-height: 1;
      margin-top: 4px;
      filter: drop-shadow(0 0 8px rgba(79,195,247,0.4));
    `;
    card.appendChild(iconEl);

    // Heading
    const headingEl = document.createElement('div');
    headingEl.textContent = step.heading;
    headingEl.style.cssText = `
      font-family: 'Orbitron', sans-serif;
      font-size: clamp(0.95rem, 2.5vw, 1.15rem);
      font-weight: 900;
      color: #4fc3f7;
      letter-spacing: 0.08em;
      text-shadow: 0 0 12px rgba(79,195,247,0.4);
    `;
    card.appendChild(headingEl);

    // Body
    const bodyEl = document.createElement('div');
    bodyEl.textContent = step.body;
    bodyEl.style.cssText = `
      font-family: 'Rajdhani', sans-serif;
      font-size: clamp(0.85rem, 2vw, 0.98rem);
      color: rgba(255, 255, 255, 0.75);
      line-height: 1.5;
      letter-spacing: 0.02em;
    `;
    card.appendChild(bodyEl);

    // Tap-to-continue cue for non-auto-dismiss steps
    if (!step.autoDismiss) {
      const cue = document.createElement('div');
      cue.textContent = '▶ Tap anywhere to continue';
      cue.style.cssText = `
        font-family: 'Rajdhani', sans-serif;
        font-size: 0.72rem;
        color: rgba(79, 195, 247, 0.45);
        letter-spacing: 0.12em;
        margin-top: 6px;
        animation: tutorial-pulse 1.8s ease-in-out infinite;
      `;
      card.appendChild(cue);

      const clickHandler = (e: MouseEvent) => {
        if (this.stepElapsed < 1.5) return;
        e.stopPropagation();
        document.removeEventListener('click', clickHandler, true);
        this.advance();
      };
      setTimeout(() => {
        document.addEventListener('click', clickHandler, true);
      }, 1500);
    }

    // Arrow/pointer element
    let arrowEl: HTMLElement | null = null;
    if (step.pointAtPlanet) {
      arrowEl = document.createElement('div');
      arrowEl.style.cssText = `
        position: absolute;
        width: 0;
        height: 0;
        pointer-events: none;
        z-index: 101;
        transform: translate(-50%, -50%);
        filter: drop-shadow(0 0 6px rgba(79,195,247,0.8));
      `;
      const dot = document.createElement('div');
      dot.style.cssText = `
        position: absolute;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        background: rgba(79,195,247,0.5);
        border: 2px solid #4fc3f7;
        transform: translate(-50%, -50%);
        animation: tutorial-ping 1.2s ease-in-out infinite;
      `;
      arrowEl.appendChild(dot);
      this.container.appendChild(arrowEl);
    }

    this.container.appendChild(card);

    // Animate in
    requestAnimationFrame(() => {
      card.style.opacity = '1';
      card.style.transform = 'translateX(-50%) translateY(0)';
    });

    this.card = { element: card, arrowElement: arrowEl };
  }

  private showCompletionCard(): void {
    const blurb = COMPLETION_BLURBS[this.tutorialId] ?? 'Well done, Commander!';

    const overlay = document.createElement('div');
    overlay.id = 'tutorial-completion-overlay';
    overlay.style.cssText = `
      position: absolute;
      top: 0; left: 0; width: 100%; height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0, 0, 10, 0.6);
      backdrop-filter: blur(8px);
      z-index: 200;
      opacity: 0;
      transition: opacity 0.5s ease;
      pointer-events: auto;
    `;

    const card = document.createElement('div');
    card.style.cssText = `
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
      padding: 40px 48px;
      background: rgba(0, 0, 18, 0.95);
      border: 1px solid rgba(255, 215, 0, 0.4);
      border-radius: 20px;
      box-shadow: 0 0 60px rgba(255, 215, 0, 0.15), 0 8px 48px rgba(0,0,0,0.8);
      max-width: 480px;
      text-align: center;
      transform: scale(0.92);
      transition: transform 0.4s ease;
    `;

    const trophyIcon = document.createElement('div');
    trophyIcon.textContent = '🏆';
    trophyIcon.style.cssText = 'font-size: 3.5rem; filter: drop-shadow(0 0 16px rgba(255,215,0,0.6));';

    const titleEl = document.createElement('div');
    titleEl.textContent = 'TUTORIAL COMPLETE!';
    titleEl.style.cssText = `
      font-family: 'Orbitron', sans-serif;
      font-size: 1.4rem;
      font-weight: 900;
      color: #ffd700;
      letter-spacing: 0.12em;
      text-shadow: 0 0 20px rgba(255,215,0,0.5);
    `;

    const blurbEl = document.createElement('div');
    blurbEl.textContent = blurb;
    blurbEl.style.cssText = `
      font-family: 'Rajdhani', sans-serif;
      font-size: 1rem;
      color: rgba(255, 255, 255, 0.7);
      line-height: 1.5;
      max-width: 340px;
    `;

    const subEl = document.createElement('div');
    subEl.textContent = 'What would you like to do?';
    subEl.style.cssText = `
      font-family: 'Rajdhani', sans-serif;
      font-size: 0.85rem;
      color: rgba(255,255,255,0.4);
      letter-spacing: 0.1em;
      margin-top: 4px;
    `;

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display: flex; gap: 16px; margin-top: 8px; flex-wrap: wrap; justify-content: center;';

    const exitBtn = document.createElement('button');
    exitBtn.textContent = '🚪 EXIT TO MENU';
    exitBtn.style.cssText = `
      font-family: 'Orbitron', sans-serif;
      font-size: 0.85rem;
      font-weight: 700;
      color: rgba(255,255,255,0.8);
      background: transparent;
      border: 1px solid rgba(255,255,255,0.25);
      border-radius: 8px;
      padding: 12px 22px;
      cursor: pointer;
      letter-spacing: 0.1em;
      transition: background 0.2s, border-color 0.2s;
    `;
    exitBtn.addEventListener('mouseenter', () => {
      exitBtn.style.background = 'rgba(255,255,255,0.08)';
      exitBtn.style.borderColor = 'rgba(255,255,255,0.5)';
    });
    exitBtn.addEventListener('mouseleave', () => {
      exitBtn.style.background = 'transparent';
      exitBtn.style.borderColor = 'rgba(255,255,255,0.25)';
    });

    const keepBtn = document.createElement('button');
    keepBtn.textContent = '🎮 KEEP PLAYING';
    keepBtn.style.cssText = `
      font-family: 'Orbitron', sans-serif;
      font-size: 0.85rem;
      font-weight: 700;
      color: #4fc3f7;
      background: rgba(79,195,247,0.1);
      border: 1px solid rgba(79,195,247,0.4);
      border-radius: 8px;
      padding: 12px 22px;
      cursor: pointer;
      letter-spacing: 0.1em;
      transition: background 0.2s, border-color 0.2s;
    `;
    keepBtn.addEventListener('mouseenter', () => {
      keepBtn.style.background = 'rgba(79,195,247,0.2)';
      keepBtn.style.borderColor = 'rgba(79,195,247,0.7)';
    });
    keepBtn.addEventListener('mouseleave', () => {
      keepBtn.style.background = 'rgba(79,195,247,0.1)';
      keepBtn.style.borderColor = 'rgba(79,195,247,0.4)';
    });

    exitBtn.addEventListener('click', () => {
      overlay.style.opacity = '0';
      setTimeout(() => {
        overlay.remove();
        this.onComplete(
          () => { /* exit callback set by GameScene */ },
          () => { /* keep playing - noop, game is still running */ }
        );
        // Trigger exit via the stored callbacks
        this._exitCallback?.();
      }, 500);
    });

    keepBtn.addEventListener('click', () => {
      overlay.style.opacity = '0';
      setTimeout(() => overlay.remove(), 500);
    });

    btnRow.appendChild(exitBtn);
    btnRow.appendChild(keepBtn);

    card.appendChild(trophyIcon);
    card.appendChild(titleEl);
    card.appendChild(blurbEl);
    card.appendChild(subEl);
    card.appendChild(btnRow);
    overlay.appendChild(card);
    this.container.appendChild(overlay);

    // Animate in
    requestAnimationFrame(() => {
      overlay.style.opacity = '1';
      card.style.transform = 'scale(1)';
    });
  }

  // Store exit callback so we can call it from the exit button
  private _exitCallback: (() => void) | null = null;

  setExitCallback(fn: () => void): void {
    this._exitCallback = fn;
  }

  private dismissCard(): void {
    if (!this.card) return;
    const { element, arrowElement } = this.card;
    element.style.opacity = '0';
    element.style.transform = 'translateX(-50%) translateY(20px)';
    arrowElement?.remove();
    setTimeout(() => element.remove(), 420);
    this.card = null;
  }

  private updateArrow(arrow: HTMLElement, screenX: number, screenY: number): void {
    arrow.style.left = `${screenX}px`;
    arrow.style.top  = `${screenY}px`;
  }

  private ensureAnimations(): void {
    if (document.getElementById('tutorial-animations')) return;
    const style = document.createElement('style');
    style.id = 'tutorial-animations';
    style.textContent = `
      @keyframes tutorial-ping {
        0%, 100% { transform: translate(-50%, -50%) scale(1);   opacity: 0.9; }
        50%       { transform: translate(-50%, -50%) scale(1.6); opacity: 0.4; }
      }
      @keyframes tutorial-pulse {
        0%, 100% { opacity: 0.45; }
        50%       { opacity: 0.9;  }
      }
    `;
    document.head.appendChild(style);
  }
}
