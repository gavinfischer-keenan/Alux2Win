import { describe, it, expect } from 'vitest';
import { filterCommandItems, type CommandItem } from '../CommandPalette';
import { isTypingInInput, SHORTCUT_DEFINITIONS } from '../KeyboardShortcuts';

describe('CommandPalette & KeyboardShortcuts', () => {
  const sampleItems: CommandItem[] = [
    { id: 'page:menu', title: 'Main Menu', subtitle: 'Galaxy selection', category: 'Page', run: () => {} },
    { id: 'page:editor', title: 'Level Editor', subtitle: 'Build custom levels', category: 'Page', shortcut: 'E', run: () => {} },
    { id: 'level:grid', title: 'Play: Simple Grid', subtitle: 'Real Life...Many Hazards', category: 'Level', run: () => {} },
    { id: 'action:pause', title: 'Pause Game', category: 'Action', shortcut: 'Space', run: () => {} },
  ];

  it('orders recent items first when search query is empty', () => {
    const ranked = filterCommandItems(sampleItems, ['action:pause', 'page:editor'], '');
    expect(ranked.map((r) => r.id)).toEqual([
      'action:pause',
      'page:editor',
      'page:menu',
      'level:grid',
    ]);
    expect(ranked[0].displayCategory).toBe('Recent');
    expect(ranked[1].displayCategory).toBe('Recent');
    expect(ranked[2].displayCategory).toBe('Page');
  });

  it('filters across title, subtitle, and category terms', () => {
    const bySubtitle = filterCommandItems(sampleItems, [], 'custom');
    expect(bySubtitle.map((r) => r.id)).toEqual(['page:editor']);

    const byLevel = filterCommandItems(sampleItems, [], 'simple grid');
    expect(byLevel.map((r) => r.id)).toEqual(['level:grid']);

    const noMatch = filterCommandItems(sampleItems, [], 'nonexistentxyz');
    expect(noMatch).toEqual([]);
  });

  it('provides at least 10 core shortcuts plus editor shortcuts', () => {
    const nonEditor = SHORTCUT_DEFINITIONS.filter((s) => s.scope !== 'Level Editor');
    expect(nonEditor.length).toBeGreaterThanOrEqual(10);
    expect(SHORTCUT_DEFINITIONS.some((s) => s.id === 'command-palette')).toBe(true);
    expect(SHORTCUT_DEFINITIONS.some((s) => s.id === 'shortcuts-help')).toBe(true);
  });

  it('guards shortcuts when typing in text inputs, textareas, selects, or contenteditable', () => {
    expect(isTypingInInput({ target: { tagName: 'INPUT', type: 'text' } as unknown as EventTarget })).toBe(true);
    expect(isTypingInInput({ target: { tagName: 'INPUT', type: 'number' } as unknown as EventTarget })).toBe(true);
    expect(isTypingInInput({ target: { tagName: 'TEXTAREA' } as unknown as EventTarget })).toBe(true);
    expect(isTypingInInput({ target: { tagName: 'SELECT' } as unknown as EventTarget })).toBe(true);
    expect(isTypingInInput({ target: { tagName: 'DIV', isContentEditable: true } as unknown as EventTarget })).toBe(true);

    // Non-typing controls (buttons, range sliders, canvas container divs) allow shortcuts
    expect(isTypingInInput({ target: { tagName: 'INPUT', type: 'range' } as unknown as EventTarget })).toBe(false);
    expect(isTypingInInput({ target: { tagName: 'BUTTON' } as unknown as EventTarget })).toBe(false);
    expect(isTypingInInput({ target: { tagName: 'DIV', isContentEditable: false } as unknown as EventTarget })).toBe(false);
  });
});
