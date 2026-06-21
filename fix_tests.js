const fs = require('fs');
const path = require('path');

const dir = 'src/systems/__tests__';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.test.ts'));

for (const file of files) {
  const filePath = path.join(dir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  if (!content.includes('createMockGameState')) {
    // Add import at the top
    const importStr = `import { createMockGameState, createMockParticle, createMockPlanet } from '../../utils/__tests__/TestFactory';\n`;
    content = importStr + content;
    changed = true;
  }

  // Replace manual GameState definitions
  // e.g. const state: GameState = { ... };
  // or state = { ... };
  // We'll replace the block with `createMockGameState(...)`
  
  // Actually, replacing objects with regex is tricky. Let's just do it manually for reliability, or use a simpler regex.
  // We can just use the typescript compiler! Wait, I'll write a simple regex that finds GameState creations and logs them so I know what to replace.
}
