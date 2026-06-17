// ============================================================
// MainMenuScene.ts — Main menu HTML overlay scene for Alux2Win
// Renders on top of the live PixiJS star-background canvas.
// ============================================================

import type { LevelData } from '../types';
import tutorialData from '../levels/tutorial.json';
import skirmishData from '../levels/skirmish.json';

export class MainMenuScene {
  private element: HTMLElement;

  onPlay: (levelData: LevelData) => void = () => {};
  onOpenEditor: () => void = () => {};

  constructor(container: HTMLElement) {
    this.element = this.createMenu();
    container.appendChild(this.element);
  }

  // ── Public API ────────────────────────────────────────────

  show(): void {
    this.element.style.display = 'flex';
    // Stagger-animate children
    const children = this.element.querySelectorAll<HTMLElement>('.menu-anim-child');
    children.forEach((child, i) => {
      child.style.opacity = '0';
      child.style.transform = 'translateY(16px)';
      setTimeout(() => {
        child.style.transition = 'opacity 0.45s ease, transform 0.45s ease';
        child.style.opacity = '1';
        child.style.transform = 'translateY(0)';
      }, 80 + i * 80);
    });
  }

  hide(): void {
    this.element.style.display = 'none';
  }

  destroy(): void {
    this.element.remove();
  }

  // ── Private ───────────────────────────────────────────────

  private createMenu(): HTMLElement {
    const overlay = document.createElement('div');
    overlay.id = 'main-menu';
    overlay.style.cssText = `
      position: absolute;
      top: 0; left: 0;
      width: 100%; height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      z-index: 20;
      pointer-events: auto;
      user-select: none;
    `;

    // ── Inner card ─────────────────────────────────────────
    const card = document.createElement('div');
    card.style.cssText = `
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      padding: 48px 56px 36px;
      background: rgba(0, 0, 10, 0.65);
      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
      border: 1px solid rgba(79, 195, 247, 0.15);
      border-radius: 20px;
      box-shadow: 0 0 60px rgba(79, 195, 247, 0.08), 0 8px 40px rgba(0,0,0,0.6);
      min-width: 320px;
    `;
    overlay.appendChild(card);

    // ── Title ──────────────────────────────────────────────
    const titleWrapper = document.createElement('div');
    titleWrapper.className = 'menu-anim-child';
    titleWrapper.style.cssText = 'text-align: center; margin-bottom: 8px;';

    const title = document.createElement('h1');
    title.textContent = 'ALUX2WIN';
    title.style.cssText = `
      font-family: 'Orbitron', sans-serif;
      font-size: clamp(2.4rem, 5vw, 3.8rem);
      font-weight: 900;
      color: #4fc3f7;
      letter-spacing: 0.12em;
      line-height: 1;
      animation: title-glow 3s ease-in-out infinite;
      margin: 0;
    `;

    const subtitle = document.createElement('div');
    subtitle.textContent = 'Constellations';
    subtitle.style.cssText = `
      font-family: 'Rajdhani', sans-serif;
      font-size: 1.05rem;
      color: rgba(79, 195, 247, 0.55);
      letter-spacing: 0.32em;
      text-transform: uppercase;
      margin-top: 6px;
    `;

    titleWrapper.appendChild(title);
    titleWrapper.appendChild(subtitle);
    card.appendChild(titleWrapper);

    // ── Decorative separator ───────────────────────────────
    const sep = document.createElement('div');
    sep.className = 'menu-anim-child';
    sep.style.cssText = `
      width: 180px;
      height: 1px;
      background: linear-gradient(90deg, transparent, rgba(79,195,247,0.45), transparent);
      margin: 8px 0 16px;
    `;
    card.appendChild(sep);

    // ── Play Tutorial button ───────────────────────────────
    const tutorialBtn = this.createMenuButton('▶ PLAY TUTORIAL', '#4fc3f7', '#22d3ee');
    tutorialBtn.className += ' menu-anim-child';
    tutorialBtn.addEventListener('click', () => {
      this.onPlay(tutorialData as LevelData);
    });
    card.appendChild(tutorialBtn);

    // ── Play Skirmish button ───────────────────────────────
    const skirmishBtn = this.createMenuButton('⚔ PLAY SKIRMISH', '#66bb6a', '#4ade80');
    skirmishBtn.className += ' menu-anim-child';
    skirmishBtn.addEventListener('click', () => {
      this.onPlay(skirmishData as LevelData);
    });
    card.appendChild(skirmishBtn);

    // ── Import Level button + hidden input ─────────────────
    const importWrapper = document.createElement('div');
    importWrapper.className = 'menu-anim-child';
    importWrapper.style.cssText = 'width: 100%;';

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json';
    fileInput.style.display = 'none';
    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target!.result as string) as LevelData;
          this.onPlay(data);
        } catch (err) {
          console.error('Failed to parse level JSON:', err);
          alert('Invalid level JSON file.');
        }
      };
      reader.readAsText(file);
      // Reset so same file can be re-imported
      fileInput.value = '';
    });

    const importBtn = this.createMenuButton('📂 IMPORT LEVEL', '#b0bec5', '#cfd8dc');
    importBtn.addEventListener('click', () => fileInput.click());

    importWrapper.appendChild(fileInput);
    importWrapper.appendChild(importBtn);
    card.appendChild(importWrapper);

    // ── Level Editor button ────────────────────────────────
    const editorBtn = this.createMenuButton('🛠 LEVEL EDITOR', '#f59e0b', '#fbbf24');
    editorBtn.className += ' menu-anim-child';
    editorBtn.addEventListener('click', () => this.onOpenEditor());
    card.appendChild(editorBtn);

    // ── Version text ───────────────────────────────────────
    const version = document.createElement('div');
    version.className = 'menu-anim-child';
    version.textContent = 'v1.0.0';
    version.style.cssText = `
      font-family: 'Rajdhani', sans-serif;
      font-size: 11px;
      color: rgba(255,255,255,0.2);
      letter-spacing: 0.1em;
      margin-top: 16px;
    `;
    card.appendChild(version);

    return overlay;
  }

  private createMenuButton(
    text: string,
    colorFrom: string,
    colorTo: string
  ): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.textContent = text;
    btn.style.cssText = `
      width: 100%;
      padding: 13px 20px;
      background: linear-gradient(135deg, ${colorFrom}22, ${colorTo}11);
      border: 1px solid ${colorFrom}55;
      border-radius: 8px;
      color: ${colorFrom};
      font-family: 'Orbitron', sans-serif;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.1em;
      cursor: pointer;
      transition: background 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease, transform 0.1s ease;
      text-align: left;
    `;
    btn.addEventListener('mouseenter', () => {
      btn.style.background = `linear-gradient(135deg, ${colorFrom}44, ${colorTo}22)`;
      btn.style.borderColor = `${colorFrom}99`;
      btn.style.boxShadow = `0 0 20px ${colorFrom}44, 0 4px 12px rgba(0,0,0,0.4)`;
      btn.style.transform = 'translateX(4px)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.background = `linear-gradient(135deg, ${colorFrom}22, ${colorTo}11)`;
      btn.style.borderColor = `${colorFrom}55`;
      btn.style.boxShadow = 'none';
      btn.style.transform = 'translateX(0)';
    });
    btn.addEventListener('mousedown', () => {
      btn.style.transform = 'translateX(2px) scale(0.98)';
    });
    btn.addEventListener('mouseup', () => {
      btn.style.transform = 'translateX(4px)';
    });
    return btn;
  }
}
