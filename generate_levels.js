import fs from 'fs';
import path from 'path';

const levelsDir = path.join(process.cwd(), 'src', 'levels');

const filesToCreate = [
  { src: 'skirmish_2.json', dest: 'skirmish_3.json', name: 'Skirmish 3' },
  { src: 'plasma_storm_1.json', dest: 'plasma_storm_2.json', name: 'Plasma Storms 2' },
  { src: 'asteroids_1.json', dest: 'asteroids_2.json', name: 'Asteroids 2' },
  { src: 'gamma_rays_1.json', dest: 'gamma_rays_2.json', name: 'Gamma Rays 2' },
  { src: 'speed_traps_1.json', dest: 'speed_traps_2.json', name: 'Speed Traps 2' },
  { src: 'portals_1.json', dest: 'portals_2.json', name: 'Portals 2' },
  { src: 'blackholes_1.json', dest: 'blackholes_2.json', name: 'Black Holes 2' },
  { src: 'whiteholes_1.json', dest: 'whiteholes_2.json', name: 'White Holes 2' },
  { src: 'shielded/level_02.json', dest: 'shielded/level_03.json', name: 'Sirius Beta' }
];

filesToCreate.forEach(mapping => {
  const srcPath = path.join(levelsDir, mapping.src);
  const destPath = path.join(levelsDir, mapping.dest);
  
  if (fs.existsSync(srcPath)) {
    const data = JSON.parse(fs.readFileSync(srcPath, 'utf8'));
    
    // Modify to make it "different"
    data.name = mapping.name;
    
    // Rotate coordinates around center (1024, 1024) and add a neutral planet in center
    const cx = data.worldWidth / 2 || 1024;
    const cy = data.worldHeight / 2 || 1024;
    
    data.planets.forEach((p) => {
      const dx = p.x - cx;
      const dy = p.y - cy;
      // 90 degree rotation
      p.x = cx - dy;
      p.y = cy + dx;
    });
    
    // Add a center planet
    data.planets.push({
      id: "center_n",
      x: cx,
      y: cy,
      faction: "neutral",
      upgradeLevel: 2,
      startingParticles: 30,
      isOrbiting: false,
      isShielded: mapping.src.includes('shielded') ? true : undefined
    });
    
    fs.writeFileSync(destPath, JSON.stringify(data, null, 2));
    console.log(`Created ${mapping.dest}`);
  } else {
    console.log(`Warning: ${srcPath} not found.`);
  }
});

// Update MainMenuScene.ts imports and array
const mainMenuPath = path.join(process.cwd(), 'src', 'scenes', 'MainMenuScene.ts');
let content = fs.readFileSync(mainMenuPath, 'utf8');

const importsToAdd = `
import skirmish3Data from '../levels/skirmish_3.json';
import plasmaStorm2Data from '../levels/plasma_storm_2.json';
import asteroids2Data from '../levels/asteroids_2.json';
import gammaRays2Data from '../levels/gamma_rays_2.json';
import speedTraps2Data from '../levels/speed_traps_2.json';
import portals2Data from '../levels/portals_2.json';
import blackholes2Data from '../levels/blackholes_2.json';
import whiteholes2Data from '../levels/whiteholes_2.json';
import shielded3Data from '../levels/shielded/level_03.json';
`;

content = content.replace(/import shielded2Data from '\.\.\/levels\/shielded\/level_02\.json';/, 
  "import shielded2Data from '../levels/shielded/level_02.json';" + importsToAdd);

// Add to levels arrays
content = content.replace(
  /levels: \[tutorialNormalData as LevelData, skirmishData as LevelData, skirmishData2 as LevelData,/,
  "levels: [tutorialNormalData as LevelData, skirmishData as LevelData, skirmishData2 as LevelData, skirmish3Data as LevelData,"
);
content = content.replace(
  /levels: \[tutorialPlasmaData as LevelData, plasmaStorm1Data as LevelData,/,
  "levels: [tutorialPlasmaData as LevelData, plasmaStorm1Data as LevelData, plasmaStorm2Data as LevelData,"
);
content = content.replace(
  /levels: \[tutorialAsteroidsData as LevelData, asteroids1Data as LevelData,/,
  "levels: [tutorialAsteroidsData as LevelData, asteroids1Data as LevelData, asteroids2Data as LevelData,"
);
content = content.replace(
  /levels: \[tutorialGammaData as LevelData, gammaRays1Data as LevelData,/,
  "levels: [tutorialGammaData as LevelData, gammaRays1Data as LevelData, gammaRays2Data as LevelData,"
);
content = content.replace(
  /levels: \[tutorialSpeedData as LevelData, speedTraps1Data as LevelData,/,
  "levels: [tutorialSpeedData as LevelData, speedTraps1Data as LevelData, speedTraps2Data as LevelData,"
);
content = content.replace(
  /levels: \[tutorialPortalsData as LevelData, portals1Data as LevelData,/,
  "levels: [tutorialPortalsData as LevelData, portals1Data as LevelData, portals2Data as LevelData,"
);
content = content.replace(
  /levels: \[tutorialBlackholesData as LevelData, blackholes1Data as LevelData,/,
  "levels: [tutorialBlackholesData as LevelData, blackholes1Data as LevelData, blackholes2Data as LevelData,"
);
content = content.replace(
  /levels: \[tutorialWhiteholesData as LevelData, whiteholes1Data as LevelData,/,
  "levels: [tutorialWhiteholesData as LevelData, whiteholes1Data as LevelData, whiteholes2Data as LevelData,"
);
content = content.replace(
  /levels: \[shielded1Data as LevelData, shielded2Data as LevelData,/,
  "levels: [shielded1Data as LevelData, shielded2Data as LevelData, shielded3Data as LevelData,"
);

fs.writeFileSync(mainMenuPath, content);
console.log('Updated MainMenuScene.ts');

// Update package.json to 1.1.1
const pkgPath = path.join(process.cwd(), 'package.json');
let pkgContent = fs.readFileSync(pkgPath, 'utf8');
pkgContent = pkgContent.replace(/"version": "1.1.0"/, '"version": "1.1.1"');
fs.writeFileSync(pkgPath, pkgContent);
console.log('Updated package.json to 1.1.1');
