// ============================================================
// KeyboardShortcuts.ts — Input guards & shortcut registry
// ============================================================

export interface ShortcutDefinition {
  id: string;
  keys: string[];
  label: string;
  description: string;
  scope: 'Global' | 'In-Game' | 'Level Editor';
}

const NON_TYPING_INPUT_TYPES = new Set([
  'button',
  'submit',
  'reset',
  'checkbox',
  'radio',
  'range',
  'color',
  'file',
]);

/**
 * Returns true if the event target or currently focused element is an
 * input where typing characters should NOT trigger global shortcuts.
 */
export function isTypingInInput(e?: { target?: EventTarget | null } | null): boolean {
  const candidates: Array<EventTarget | Element | null | undefined> = [
    e?.target,
    typeof document !== 'undefined' ? document.activeElement : null,
  ];

  for (const raw of candidates) {
    if (!raw || typeof raw !== 'object') continue;
    const el = raw as {
      tagName?: string;
      type?: string;
      isContentEditable?: boolean;
      getAttribute?: (name: string) => string | null;
      closest?: (selector: string) => unknown;
    };

    const tag = el.tagName?.toUpperCase();
    if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (tag === 'INPUT') {
      const inputType = (el.type || 'text').toLowerCase();
      if (!NON_TYPING_INPUT_TYPES.has(inputType)) return true;
    }
    if (el.isContentEditable) return true;
    if (typeof el.getAttribute === 'function' && el.getAttribute('contenteditable') === 'true') {
      return true;
    }
  }
  return false;
}

/**
 * Core shortcuts (top 10+ most common actions) + Editor tool shortcuts
 * rendered by the '?' overlay and referenced by the Command Palette.
 */
export const SHORTCUT_DEFINITIONS: readonly ShortcutDefinition[] = [
  {
    id: 'command-palette',
    keys: ['Ctrl/⌘', 'K'],
    label: 'Command Palette',
    description: 'Search pages, playable systems, actions, and recent commands',
    scope: 'Global',
  },
  {
    id: 'shortcuts-help',
    keys: ['?'],
    label: 'Keyboard Shortcuts',
    description: 'Toggle this shortcuts reference overlay',
    scope: 'Global',
  },
  {
    id: 'toggle-mute',
    keys: ['M'],
    label: 'Mute / Unmute',
    description: 'Toggle master game audio on or off',
    scope: 'Global',
  },
  {
    id: 'open-editor',
    keys: ['E'],
    label: 'Open Editor / Test',
    description: 'Open Level Editor from Menu, or Test Level inside Editor',
    scope: 'Global',
  },
  {
    id: 'pause-game',
    keys: ['Space', 'P'],
    label: 'Pause / Resume',
    description: 'Pause or resume active gameplay',
    scope: 'In-Game',
  },
  {
    id: 'speed-step',
    keys: ['[', ']'],
    label: 'Step Game Speed',
    description: 'Decrease ([) or increase (]) simulation speed (½× – 3×)',
    scope: 'In-Game',
  },
  {
    id: 'speed-presets',
    keys: ['1', '2', '3', '4'],
    label: 'Speed Presets',
    description: 'Jump directly to ½×, 1×, 2×, or 3× speed',
    scope: 'In-Game',
  },
  {
    id: 'select-all',
    keys: ['A'],
    label: 'Select All Units',
    description: 'Select all your planets and orbiting fleets',
    scope: 'In-Game',
  },
  {
    id: 'clear-selection',
    keys: ['D'],
    label: 'Deselect All',
    description: 'Clear currently selected planets and units',
    scope: 'In-Game',
  },
  {
    id: 'repeat-order',
    keys: ['R'],
    label: 'Repeat Last Order',
    description: 'Re-issue your previous fleet deployment order',
    scope: 'In-Game',
  },
  {
    id: 'reset-camera',
    keys: ['C', 'Home'],
    label: 'Reset Camera',
    description: 'Center and fit the entire star system in view',
    scope: 'In-Game',
  },
  {
    id: 'escape-back',
    keys: ['Esc'],
    label: 'Close / Pause',
    description: 'Close active overlay or toggle the Pause Menu',
    scope: 'Global',
  },
  // Level Editor tools
  {
    id: 'editor-select',
    keys: ['S'],
    label: 'Select / Move Tool',
    description: 'Select or drag entities in the Level Editor',
    scope: 'Level Editor',
  },
  {
    id: 'editor-planet',
    keys: ['P'],
    label: 'Place Planet',
    description: 'Switch to Planet placement tool',
    scope: 'Level Editor',
  },
  {
    id: 'editor-blackhole',
    keys: ['B'],
    label: 'Place Black Hole',
    description: 'Switch to Black Hole placement tool',
    scope: 'Level Editor',
  },
  {
    id: 'editor-speedzone',
    keys: ['Z'],
    label: 'Place Speed Zone',
    description: 'Draw a Speed Up / Slow Down zone polygon',
    scope: 'Level Editor',
  },
  {
    id: 'editor-portal',
    keys: ['O'],
    label: 'Place Portal',
    description: 'Place linked wormhole portal pairs',
    scope: 'Level Editor',
  },
  {
    id: 'editor-trappingbh',
    keys: ['T'],
    label: 'Place Trapping BH',
    description: 'Place a Trapping Black Hole gravity well',
    scope: 'Level Editor',
  },
  {
    id: 'editor-whitehole',
    keys: ['H'],
    label: 'Place White Hole',
    description: 'Place a White Hole supernova hazard',
    scope: 'Level Editor',
  },
  {
    id: 'editor-delete',
    keys: ['X', 'Del'],
    label: 'Delete Tool',
    description: 'Switch to Delete Entity tool in the Editor',
    scope: 'Level Editor',
  },
];
