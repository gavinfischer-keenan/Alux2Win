// ============================================================
// ShortcutsModal.ts — '?' Keyboard Shortcuts Help Overlay
// ============================================================

import { SHORTCUT_DEFINITIONS, type ShortcutDefinition } from './KeyboardShortcuts';
import { audioManager } from '../core/AudioManager';

export class ShortcutsModal {
  private backdrop: HTMLElement | null = null;
  private isOpen = false;
  private onOpenCommandPalette: () => void;

  constructor(onOpenCommandPalette: () => void = () => {}) {
    this.onOpenCommandPalette = onOpenCommandPalette;
  }

  get openState(): boolean {
    return this.isOpen;
  }

  toggle(): void {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  open(): void {
    if (this.isOpen) return;
    this.isOpen = true;

    const backdrop = document.createElement('div');
    backdrop.id = 'lux-shortcuts-modal';
    backdrop.className = 'lux-overlay-backdrop';
    backdrop.setAttribute('role', 'dialog');
    backdrop.setAttribute('aria-modal', 'true');
    backdrop.setAttribute('aria-label', 'Keyboard Shortcuts');

    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) {
        audioManager.playClick();
        this.close();
      }
    });

    const box = document.createElement('div');
    box.className = 'lux-palette-box';
    box.style.cssText = `
      width: min(720px, 94vw);
      max-height: 86vh;
      padding: clamp(16px, 3vw, 28px);
      gap: 16px;
      overflow-y: auto;
    `;

    // Header
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
      border-bottom: 1px solid rgba(79, 195, 247, 0.18);
      padding-bottom: 12px;
    `;

    const titleWrap = document.createElement('div');
    titleWrap.style.cssText = 'display: flex; flex-direction: column; gap: 2px;';

    const title = document.createElement('h2');
    title.textContent = 'KEYBOARD SHORTCUTS';
    title.style.cssText = `
      font-family: 'Orbitron', sans-serif;
      font-size: clamp(1rem, 2.5vw, 1.35rem);
      font-weight: 900;
      color: #4fc3f7;
      letter-spacing: 0.12em;
      margin: 0;
    `;

    const sub = document.createElement('div');
    sub.textContent = 'Shortcuts are automatically paused while typing in inputs.';
    sub.style.cssText = `
      font-size: 0.85rem;
      color: rgba(255, 255, 255, 0.55);
    `;

    titleWrap.appendChild(title);
    titleWrap.appendChild(sub);

    const actions = document.createElement('div');
    actions.style.cssText = 'display: flex; align-items: center; gap: 8px;';

    const paletteBtn = document.createElement('button');
    paletteBtn.className = 'lux-aux-btn';
    paletteBtn.textContent = '⌘K COMMAND PALETTE';
    paletteBtn.style.border = '1px solid rgba(79, 195, 247, 0.45)';
    paletteBtn.style.color = '#4fc3f7';
    paletteBtn.addEventListener('click', () => {
      audioManager.playClick();
      this.close();
      this.onOpenCommandPalette();
    });

    const closeBtn = document.createElement('button');
    closeBtn.className = 'lux-btn-secondary';
    closeBtn.textContent = '✕ CLOSE';
    closeBtn.style.cssText += 'padding: 7px 12px; font-size: 11px;';
    closeBtn.addEventListener('click', () => {
      audioManager.playClick();
      this.close();
    });

    actions.appendChild(paletteBtn);
    actions.appendChild(closeBtn);
    header.appendChild(titleWrap);
    header.appendChild(actions);
    box.appendChild(header);

    // Sections
    const scopes: Array<ShortcutDefinition['scope']> = ['Global', 'In-Game', 'Level Editor'];
    for (const scope of scopes) {
      const items = SHORTCUT_DEFINITIONS.filter((s) => s.scope === scope);
      if (items.length === 0) continue;

      const secLabel = document.createElement('div');
      secLabel.textContent = scope.toUpperCase();
      secLabel.style.cssText = `
        font-family: 'Orbitron', sans-serif;
        font-size: 0.72rem;
        font-weight: 700;
        color: rgba(79, 195, 247, 0.75);
        letter-spacing: 0.14em;
        margin-top: 4px;
      `;
      box.appendChild(secLabel);

      const grid = document.createElement('div');
      grid.className = 'lux-shortcuts-grid';

      for (const item of items) {
        const row = document.createElement('div');
        row.className = 'lux-shortcut-row';

        const left = document.createElement('div');
        left.style.cssText = 'display: flex; flex-direction: column; gap: 2px; min-width: 0;';

        const name = document.createElement('div');
        name.textContent = item.label;
        name.style.cssText = 'font-weight: 700; font-size: 0.95rem; color: #f1f5f9;';

        const desc = document.createElement('div');
        desc.textContent = item.description;
        desc.style.cssText = 'font-size: 0.78rem; color: rgba(255, 255, 255, 0.55); line-height: 1.25;';

        left.appendChild(name);
        left.appendChild(desc);

        const keysWrap = document.createElement('div');
        keysWrap.style.cssText = 'display: flex; align-items: center; gap: 4px; flex-wrap: wrap; justify-content: flex-end; flex-shrink: 0;';

        item.keys.forEach((k, idx) => {
          if (idx > 0 && item.keys.length <= 2 && item.id === 'command-palette') {
            const plus = document.createElement('span');
            plus.textContent = '+';
            plus.style.cssText = 'font-size: 11px; color: rgba(255,255,255,0.4);';
            keysWrap.appendChild(plus);
          }
          const kbd = document.createElement('kbd');
          kbd.className = 'lux-kbd';
          kbd.textContent = k;
          keysWrap.appendChild(kbd);
        });

        row.appendChild(left);
        row.appendChild(keysWrap);
        grid.appendChild(row);
      }

      box.appendChild(grid);
    }

    backdrop.appendChild(box);
    document.body.appendChild(backdrop);
    this.backdrop = backdrop;
    closeBtn.focus();
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.backdrop?.remove();
    this.backdrop = null;
  }

  destroy(): void {
    this.close();
  }
}
