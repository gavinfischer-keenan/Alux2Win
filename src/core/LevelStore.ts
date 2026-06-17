import type { LevelData } from '../types';

const STORAGE_KEY = 'alux2win_custom_levels';

export class LevelStore {
  /**
   * Returns all saved custom levels.
   */
  static loadLevels(): LevelData[] {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return [];
    try {
      return JSON.parse(data) as LevelData[];
    } catch (e) {
      console.error('Failed to parse custom levels from localStorage', e);
      return [];
    }
  }

  /**
   * Saves a level (adds new or overwrites existing by id).
   */
  static saveLevel(level: LevelData): void {
    if (!level.id) {
      level.id = `custom_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    }
    level.isCustom = true;

    const levels = this.loadLevels();
    const existingIndex = levels.findIndex(l => l.id === level.id);

    if (existingIndex >= 0) {
      levels[existingIndex] = level;
    } else {
      levels.push(level);
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(levels));
  }

  /**
   * Deletes a custom level by id.
   */
  static deleteLevel(id: string): void {
    const levels = this.loadLevels();
    const filtered = levels.filter(l => l.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  }

  /**
   * Clears all custom levels.
   */
  static clearAll(): void {
    localStorage.removeItem(STORAGE_KEY);
  }
}
