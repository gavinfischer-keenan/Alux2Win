// ============================================================
// main.ts — Entry point for Alux2Win
// ============================================================

import './style.css';
import { App } from './App';

const container = document.getElementById('app')!;
const app = new App(container);
app.init().catch(console.error);
