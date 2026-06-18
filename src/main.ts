// ============================================================
// main.ts — Entry point for LUX
// ============================================================

import './style.css';
import { App } from './App';

const container = document.getElementById('app')!;
const app = new App(container);
app.init().catch(console.error);
