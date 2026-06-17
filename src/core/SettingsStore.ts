// ============================================================
// SettingsStore.ts — Persistent game settings via localStorage
// ============================================================

import type { GameSpeed } from '../ui/PauseMenu';

export type AIDifficulty = 'easy' | 'normal' | 'hard';

export interface GameSettings {
  gameSpeed:    GameSpeed;
  difficulty:   AIDifficulty;
  colorTheme:   'default' | 'nebula' | 'ice' | 'lava';
  masterVolume: number;   // 0–1
}

const STORAGE_KEY = 'alux2win_settings_v2';

const DEFAULTS: GameSettings = {
  gameSpeed:   1,
  difficulty:  'normal',
  colorTheme:  'default',
  masterVolume: 0.6,
};

export const SettingsStore = {
  get(): GameSettings {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...DEFAULTS };
      return { ...DEFAULTS, ...JSON.parse(raw) };
    } catch {
      return { ...DEFAULTS };
    }
  },

  update(partial: Partial<GameSettings>): void {
    const next = { ...this.get(), ...partial };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch { /* quota exceeded — ignore */ }
  },

  reset(): void {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  },
};
