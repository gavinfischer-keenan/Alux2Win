// ============================================================
// HighScoreStore.ts — Persist best completion times per level
// ============================================================

export interface LevelRecord {
  /** Best completion time in seconds */
  bestTime: number;
  /** When this record was set (ISO timestamp) */
  recordedAt: string;
}

export interface GameStats {
  /** Time elapsed during the game in seconds */
  elapsedTime: number;
  /** Maximum number of particles the player had at any one point */
  peakParticles: number;
  /** Maximum number of planets the player owned at any one point */
  peakPlanets: number;
  /** Final particle count when game ended */
  finalParticles: number;
  /** Final planet count when game ended */
  finalPlanets: number;
}

const STORAGE_KEY = 'alux2win_highscores_v1';

type RecordMap = Record<string, LevelRecord>;

export const HighScoreStore = {
  _load(): RecordMap {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  },

  _save(map: RecordMap): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    } catch { /* quota exceeded */ }
  },

  /** Returns the best record for a level, or null if never completed. */
  getBest(levelId: string): LevelRecord | null {
    return this._load()[levelId] ?? null;
  },

  /**
   * Submit a completion time. If it's better than the stored record, saves it.
   * Returns true if a new record was set.
   */
  submit(levelId: string, timeSeconds: number): boolean {
    const map  = this._load();
    const prev = map[levelId];
    if (!prev || timeSeconds < prev.bestTime) {
      map[levelId] = { bestTime: timeSeconds, recordedAt: new Date().toISOString() };
      this._save(map);
      return true;
    }
    return false;
  },

  /** Format seconds as mm:ss */
  formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  },
};
