// ============================================================
// main.ts — Entry point for LUX
// ============================================================

import './style.css';
import { App } from './App';

const container = document.getElementById('app')!;
const app = new App(container);

// Cleanup Logic
const data = localStorage.getItem('lux_custom_levels');
if (data) {
  try {
    let levels = JSON.parse(data);
    levels = levels.filter(l => l.name.toLowerCase() !== 'grid fog' && l.name.toLowerCase() !== 'to your corners');
    localStorage.setItem('lux_custom_levels', JSON.stringify(levels));
  } catch (e) {}
}

app.init().catch(console.error);
