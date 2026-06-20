import fs from 'fs';

const levels = JSON.parse(fs.readFileSync('extracted_levels.json', 'utf-8'));
const gridFog = levels.find(l => l.name.toLowerCase() === 'grid fog');

// Strip out the custom metadata so it looks like a built-in level
delete gridFog.id;
delete gridFog.category;
delete gridFog.isCustom;

fs.writeFileSync('src/levels/fogofwar_2.json', JSON.stringify(gridFog, null, 2));
console.log('Saved src/levels/fogofwar_2.json');
