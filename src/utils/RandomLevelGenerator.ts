import {
  LevelData,
  Faction,
  PlanetDef,
  SpeedZoneDef,
  PortalDef,
  TrappingBlackHoleDef,
  WhiteHoleDef,
  BlackHoleDef,} from '../types';

/**
 * Generates a random level ensuring playability.
 */
export function generateRandomLevel(): LevelData {
  const worldWidth = 2500;
  const worldHeight = 2500;
  
  // Choose factions. Types.ts defines 'player', 'enemy_a', 'enemy_b'.
  const availableFactions: Faction[] = ['player', 'enemy_a', 'enemy_b'];
  // Random 2 to 3 factions (since 'enemy_c' is not in Faction type)
  const numFactions = Math.floor(Math.random() * 2) + 2; 
  const activeFactions = availableFactions.slice(0, numFactions);
  
  const planets: PlanetDef[] = [];
  const minPlanetDist = 200; // Minimum distance between any two planets

  // Helper to find a valid position
  const getValidPos = (padding: number, existingPoints: {x: number, y: number}[]): {x: number, y: number} | null => {
    let attempts = 0;
    while (attempts < 100) {
      const x = padding + Math.random() * (worldWidth - 2 * padding);
      const y = padding + Math.random() * (worldHeight - 2 * padding);
      
      let valid = true;
      for (const p of existingPoints) {
        const dx = p.x - x;
        const dy = p.y - y;
        if (Math.sqrt(dx*dx + dy*dy) < minPlanetDist) {
          valid = false;
          break;
        }
      }
      if (valid) return {x, y};
      attempts++;
    }
    return null;
  };

  const existingPoints: {x: number, y: number}[] = [];

  // 1. Home Planets
  // Try to place them far apart (e.g. min distance 800)
  for (const faction of activeFactions) {
    let pos = null;
    let attempts = 0;
    while (attempts < 100 && !pos) {
      const p = {
        x: 200 + Math.random() * (worldWidth - 400),
        y: 200 + Math.random() * (worldHeight - 400)
      };
      let valid = true;
      for (const ep of existingPoints) {
        const dx = ep.x - p.x;
        const dy = ep.y - p.y;
        if (Math.sqrt(dx*dx + dy*dy) < 800) {
          valid = false;
          break;
        }
      }
      if (valid) pos = p;
      attempts++;
    }
    
    // Fallback if we couldn't place it far enough
    if (!pos) {
      pos = getValidPos(200, existingPoints) || {x: worldWidth/2, y: worldHeight/2};
    }
    
    existingPoints.push(pos);
    planets.push({
      id: Math.random().toString(36).substring(2, 9),
      x: pos.x,
      y: pos.y,
      faction,
      upgradeLevel: 1,
      startingParticles: Math.floor(Math.random() * 31) + 20, // 20 to 50
      isOrbiting: false
    });
  }

  // 2. Neutral Planets
  const numNeutrals = Math.floor(Math.random() * 10) + 6; // 6 to 15
  for (let i = 0; i < numNeutrals; i++) {
    const pos = getValidPos(100, existingPoints);
    if (pos) {
      existingPoints.push(pos);
      planets.push({
        id: Math.random().toString(36).substring(2, 9),
        x: pos.x,
        y: pos.y,
        faction: 'neutral',
        upgradeLevel: 1,
        startingParticles: Math.floor(Math.random() * 10) + 5, // 5 to 14
        isOrbiting: false
      });
    }
  }

  // 3. Hazards
  const hazardTypes = [
    'SpeedZones', 'BlackHoles', 'Asteroids', 
    'GammaRay', 'Portals', 'TrappingBlackHoles', 'WhiteHoles', 'ShieldedPlanets'
  ];
  
  // Bias towards 2 hazards, occasionally 3 (80% / 20%)
  const numHazardTypes = Math.random() > 0.8 ? 3 : 2;
  const selectedHazardTypes: string[] = [];
  while (selectedHazardTypes.length < numHazardTypes) {
    const t = hazardTypes[Math.floor(Math.random() * hazardTypes.length)];
    if (!selectedHazardTypes.includes(t)) {
      selectedHazardTypes.push(t);
    }
  }

  const speedZones: SpeedZoneDef[] = [];
  const blackHoles: BlackHoleDef[] = [];  const portals: PortalDef[] = [];
  const trappingBlackHoles: TrappingBlackHoleDef[] = [];
  const whiteHoles: WhiteHoleDef[] = [];
  const asteroidConfig = { enabled: false };
  const gammaRayConfig: { enabled: boolean; intervalSeconds?: number } = { enabled: false };
  
  // Enable global hazards if selected
  if (selectedHazardTypes.includes('Asteroids')) {
    asteroidConfig.enabled = true;
  }
  if (selectedHazardTypes.includes('GammaRay')) {
    gammaRayConfig.enabled = true;
    gammaRayConfig.intervalSeconds = 60 + Math.random() * 30; // At least 60 seconds fuse
  }
  if (selectedHazardTypes.includes('ShieldedPlanets')) {
    planets.forEach(p => {
      // 70% chance a planet is shielded if this hazard is active
      if (Math.random() > 0.3) p.isShielded = true;
    });
  }

  // Filter out global hazards for placeable object loop
  const placeableTypes = selectedHazardTypes.filter(t => 
    t !== 'Asteroids' && t !== 'GammaRay' && t !== 'ShieldedPlanets'
  );

  if (placeableTypes.length > 0) {
    // Add 3 to 5 hazard objects total
    const numHazards = Math.floor(Math.random() * 3) + 3; 
    
    for (let i = 0; i < numHazards; i++) {
      const type = placeableTypes[Math.floor(Math.random() * placeableTypes.length)];
      
      // We don't want hazards right on top of home planets
      const pos = getValidPos(300, existingPoints);
      if (!pos) continue;

      if (type === 'SpeedZones') {
        const r = 100 + Math.random() * 100;
        speedZones.push({
          id: `sz${i}`,
          type: Math.random() < 0.5 ? 'speedup' : 'slowdown',
          points: [
            { x: pos.x - r, y: pos.y - r },
            { x: pos.x + r, y: pos.y - r },
            { x: pos.x + r, y: pos.y + r },
            { x: pos.x - r, y: pos.y + r }
          ]
        });
        existingPoints.push(pos);
      } else if (type === 'BlackHoles') {
        blackHoles.push({
          id: Math.random().toString(36).substring(2, 9),
          x: pos.x,
          y: pos.y,
          radius: 30 + Math.random() * 20,
          pullStrength: 50 + Math.random() * 50
        });
        existingPoints.push(pos);      } else if (type === 'TrappingBlackHoles') {
        trappingBlackHoles.push({
          id: Math.random().toString(36).substring(2, 9),
          x: pos.x,
          y: pos.y,
          pullRadius: 150 + Math.random() * 100
        });
        existingPoints.push(pos);
      } else if (type === 'WhiteHoles') {
        whiteHoles.push({
          id: Math.random().toString(36).substring(2, 9),
          x: pos.x,
          y: pos.y
        });
        existingPoints.push(pos);
      }
    }
  }

  return {
    version: 1,
    name: 'Random Sector ' + Math.random().toString(36).substring(2, 6).toUpperCase(),
    isCustom: false,
    category: 'Random',
    worldWidth,
    worldHeight,
    planets,
    blackHoles,    asteroidConfig,
    gammaRayConfig,
    speedZones,
    portals,
    trappingBlackHoles,
    whiteHoles
  };
}
