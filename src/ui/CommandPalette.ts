// ============================================================
// CommandPalette.ts — Cmd/Ctrl+K Command Palette for LUX
// Searches pages, playable levels, actions, and recent items.
// ============================================================

import { audioManager } from '../core/AudioManager';

export type CommandCategory = 'Recent' | 'Page' | 'Level' | 'Action';

export interface CommandItem {
  id: string;
  title: string;
  subtitle?: string;
  category: Exclude<CommandCategory, 'Recent'>;
  shortcut?: string;
  keywords?: string[];
  run: () => void;
}

export interface RankedCommandItem extends CommandItem {
  displayCategory: CommandCategory;
}

const RECENT_STORAGE_KEY = 'lux_recent_commands_v1';
const MAX_RECENT = 6;

export function loadRecentCommandIds(): string[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(RECENT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function saveRecentCommandId(id: string): string[] {
  const existing = loadRecentCommandIds().filter((x) => x !== id);
  const next = [id, ...existing].slice(0, MAX_RECENT);
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(next));
    }
  } catch {
    // ignore storage quota errors
  }
  return next;
}

/**
 * Pure filter & ranking helper so search and recent-item behavior
 * can be unit-tested deterministically.
 */
export function filterCommandItems(
  items: readonly CommandItem[],
  recentIds: readonly string[],
  rawQuery: string,
): RankedCommandItem[] {
  const query = rawQuery.trim().toLowerCase();
  const byId = new Map<string, CommandItem>();
  for (const item of items) {
    byId.set(item.id, item);
  }

  if (!query) {
    const out: RankedCommandItem[] = [];
    const seen = new Set<string>();

    for (const id of recentIds) {
      const item = byId.get(id);
      if (item && !seen.has(item.id)) {
        out.push({ ...item, displayCategory: 'Recent' });
        seen.add(item.id);
      }
    }

    for (const item of items) {
      if (!seen.has(item.id)) {
        out.push({ ...item, displayCategory: item.category });
      }
    }
    return out;
  }

  const terms = query.split(/\s+/).filter(Boolean);
  const scored: Array<{ item: RankedCommandItem; score: number }> = [];

  for (const item of items) {
    const titleLower = item.title.toLowerCase();
    const subLower = (item.subtitle ?? '').toLowerCase();
    const catLower = item.category.toLowerCase();
    const kwLower = (item.keywords ?? []).join(' ').toLowerCase();
    const haystack = `${titleLower} ${subLower} ${catLower} ${kwLower}`;

    if (!terms.every((t) => haystack.includes(t))) continue;

    let score = 0;
    if (titleLower === query) score += 100;
    else if (titleLower.startsWith(query)) score += 60;
    else if (titleLower.includes(query)) score += 35;
    if (recentIds.includes(item.id)) score += 15;
    if (item.category === 'Page') score += 8;
    if (item.category === 'Action') score += 5;

    scored.push({
      item: {
        ...item,
        displayCategory: recentIds.includes(item.id) ? 'Recent' : item.category,
      },
      score,
    });
  }

  scored.sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title));
  return scored.map((entry) => entry.item);
}

export class CommandPalette {
  private backdrop: HTMLElement | null = null;
  private inputEl: HTMLInputElement | null = null;
  private listEl: HTMLElement | null = null;
  private isOpen = false;
  private selectedIdx = 0;
  private filteredItems: RankedCommandItem[] = [];
  private getCommands: () => CommandItem[];
  private previousFocus: HTMLElement | null = null;

  constructor(getCommands: () => CommandItem[]) {
    this.getCommands = getCommands;
  }

  get openState(): boolean {
    return this.isOpen;
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  open(): void {
    if (this.isOpen) return;
    this.isOpen = true;
    this.selectedIdx = 0;
    this.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const backdrop = document.createElement('div');
    backdrop.id = 'lux-command-palette';
    backdrop.className = 'lux-overlay-backdrop';
    backdrop.setAttribute('role', 'dialog');
    backdrop.setAttribute('aria-modal', 'true');
    backdrop.setAttribute('aria-label', 'Command Palette');

    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) {
        audioManager.playClick();
        this.close();
      }
    });

    const box = document.createElement('div');
    box.className = 'lux-palette-box';

    // Search header
    const searchRow = document.createElement('div');
    searchRow.style.cssText = `
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 16px;
      border-bottom: 1px solid rgba(79, 195, 247, 0.2);
      background: rgba(5, 10, 22, 0.85);
    `;

    const icon = document.createElement('span');
    icon.textContent = '⌘';
    icon.style.cssText = `
      font-family: 'Orbitron', sans-serif;
      font-size: 14px;
      font-weight: 700;
      color: #4fc3f7;
      flex-shrink: 0;
    `;

    const input = document.createElement('input');
    input.id = 'lux-command-palette-input';
    input.type = 'text';
    input.placeholder = 'Search pages, systems, actions, recent items...';
    input.autocomplete = 'off';
    input.style.cssText = `
      flex: 1;
      min-width: 0;
      background: transparent;
      border: none;
      color: #f8fafc;
      font-family: 'Rajdhani', sans-serif;
      font-size: 1rem;
      font-weight: 600;
      outline: none;
    `;

    const escHint = document.createElement('button');
    escHint.type = 'button';
    escHint.className = 'lux-kbd';
    escHint.textContent = 'ESC';
    escHint.title = 'Close Command Palette';
    escHint.style.cursor = 'pointer';
    escHint.addEventListener('click', () => {
      audioManager.playClick();
      this.close();
    });

    searchRow.appendChild(icon);
    searchRow.appendChild(input);
    searchRow.appendChild(escHint);
    box.appendChild(searchRow);

    // Results list
    const list = document.createElement('div');
    list.id = 'lux-command-palette-list';
    list.style.cssText = `
      flex: 1;
      overflow-y: auto;
      padding: 8px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    `;
    box.appendChild(list);

    // Footer legend
    const footer = document.createElement('div');
    footer.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 8px;
      padding: 8px 14px;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      background: rgba(5, 10, 22, 0.7);
      font-size: 0.78rem;
      color: rgba(255, 255, 255, 0.45);
    `;
    footer.innerHTML = `
      <span>↑↓ Navigate · ↵ Run · Esc Close</span>
      <span>Recent items appear at top</span>
    `;
    box.appendChild(footer);

    backdrop.appendChild(box);
    document.body.appendChild(backdrop);

    this.backdrop = backdrop;
    this.inputEl = input;
    this.listEl = list;

    input.addEventListener('input', () => {
      this.selectedIdx = 0;
      this.renderList(input.value);
    });

    input.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (this.filteredItems.length > 0) {
          this.selectedIdx = (this.selectedIdx + 1) % this.filteredItems.length;
          this.updateSelectionHighlight();
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (this.filteredItems.length > 0) {
          this.selectedIdx = (this.selectedIdx - 1 + this.filteredItems.length) % this.filteredItems.length;
          this.updateSelectionHighlight();
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const chosen = this.filteredItems[this.selectedIdx];
        if (chosen) this.executeItem(chosen);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.close();
      }
    });

    this.renderList('');
    requestAnimationFrame(() => input.focus());
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.backdrop?.remove();
    this.backdrop = null;
    this.inputEl = null;
    this.listEl = null;
    if (this.previousFocus && document.contains(this.previousFocus)) {
      this.previousFocus.focus();
    }
    this.previousFocus = null;
  }

  destroy(): void {
    this.close();
  }

  private renderList(query: string): void {
    const list = this.listEl;
    if (!list) return;
    list.innerHTML = '';

    const items = this.getCommands();
    const recentIds = loadRecentCommandIds();
    this.filteredItems = filterCommandItems(items, recentIds, query);

    if (this.filteredItems.length === 0) {
      const empty = document.createElement('div');
      empty.textContent = 'No matching pages, systems, or actions.';
      empty.style.cssText = `
        padding: 28px 16px;
        text-align: center;
        color: rgba(255, 255, 255, 0.45);
        font-size: 0.95rem;
      `;
      list.appendChild(empty);
      return;
    }

    let lastCat: CommandCategory | null = null;
    this.filteredItems.forEach((item, idx) => {
      if (item.displayCategory !== lastCat) {
        lastCat = item.displayCategory;
        const heading = document.createElement('div');
        heading.textContent = lastCat.toUpperCase();
        heading.style.cssText = `
          font-family: 'Orbitron', sans-serif;
          font-size: 0.65rem;
          font-weight: 700;
          letter-spacing: 0.14em;
          color: ${lastCat === 'Recent' ? '#ffd54f' : 'rgba(79, 195, 247, 0.7)'};
          padding: 8px 8px 3px;
        `;
        list.appendChild(heading);
      }

      const row = document.createElement('button');
      row.type = 'button';
      row.dataset.index = String(idx);
      row.style.cssText = `
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 9px 12px;
        border-radius: 8px;
        border: 1px solid transparent;
        background: transparent;
        color: #f1f5f9;
        text-align: left;
        cursor: pointer;
        transition: background 0.12s, border-color 0.12s;
        font-family: 'Rajdhani', sans-serif;
      `;

      const left = document.createElement('div');
      left.style.cssText = 'display: flex; flex-direction: column; min-width: 0; gap: 1px;';

      const titleEl = document.createElement('div');
      titleEl.textContent = item.title;
      titleEl.style.cssText = 'font-weight: 700; font-size: 0.96rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;';
      left.appendChild(titleEl);

      if (item.subtitle) {
        const subEl = document.createElement('div');
        subEl.textContent = item.subtitle;
        subEl.style.cssText = 'font-size: 0.78rem; color: rgba(255, 255, 255, 0.5); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;';
        left.appendChild(subEl);
      }

      const right = document.createElement('div');
      right.style.cssText = 'display: flex; align-items: center; gap: 6px; flex-shrink: 0;';

      const badge = document.createElement('span');
      badge.textContent = item.category;
      badge.style.cssText = `
        font-size: 0.68rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        padding: 2px 6px;
        border-radius: 4px;
        background: rgba(255, 255, 255, 0.06);
        color: rgba(255, 255, 255, 0.55);
      `;
      right.appendChild(badge);

      if (item.shortcut) {
        const kbd = document.createElement('kbd');
        kbd.className = 'lux-kbd';
        kbd.textContent = item.shortcut;
        right.appendChild(kbd);
      }

      row.appendChild(left);
      row.appendChild(right);

      row.addEventListener('mouseenter', () => {
        this.selectedIdx = idx;
        this.updateSelectionHighlight();
      });
      row.addEventListener('click', () => {
        this.executeItem(item);
      });

      list.appendChild(row);
    });

    this.updateSelectionHighlight();
  }

  private updateSelectionHighlight(): void {
    const list = this.listEl;
    if (!list) return;
    const rows = list.querySelectorAll<HTMLElement>('button[data-index]');
    rows.forEach((row) => {
      const idx = Number(row.dataset.index);
      const active = idx === this.selectedIdx;
      row.style.background = active ? 'rgba(79, 195, 247, 0.16)' : 'transparent';
      row.style.borderColor = active ? 'rgba(79, 195, 247, 0.45)' : 'transparent';
      if (active) {
        row.scrollIntoView({ block: 'nearest' });
      }
    });
  }

  private executeItem(item: RankedCommandItem): void {
    audioManager.playClick();
    saveRecentCommandId(item.id);
    this.close();
    item.run();
  }
}
