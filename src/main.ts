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
    const levels = JSON.parse(data);
    if (Array.isArray(levels)) {
      const filtered = levels.filter((l: any) => {
        const name = l?.name?.toLowerCase();
        return name !== 'grid fog' && name !== 'to your corners';
      });
      localStorage.setItem('lux_custom_levels', JSON.stringify(filtered));
    }
  } catch (e) {}
}

app.init().catch(console.error);
