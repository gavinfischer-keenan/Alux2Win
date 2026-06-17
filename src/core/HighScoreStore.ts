// ============================================================
// HighScoreStore.ts — Persist top 5 best completion times
// ============================================================

export interface LevelRecord {
  /** Completion time in seconds */
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

// We now map a levelId to an array of LevelRecord
type RecordMap = Record<string, LevelRecord[]>;

export const HighScoreStore = {
  _load(): RecordMap {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      // Migrate old format { [levelId]: { bestTime: ... } } to array format
      const migrated: RecordMap = {};
      for (const key of Object.keys(parsed)) {
        if (Array.isArray(parsed[key])) {
          migrated[key] = parsed[key];
        } else if (parsed[key] && typeof parsed[key] === 'object') {
          migrated[key] = [parsed[key]];
        } else {
          migrated[key] = [];
        }
      }
      return migrated;
    } catch {
      return {};
    }
  },

  _save(map: RecordMap): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    } catch { /* quota exceeded */ }
  },

  /** Returns the top 5 records for a level */
  getTop(levelId: string): LevelRecord[] {
    return this._load()[levelId] || [];
  },

  /** Returns the single best record for a level, or null */
  getBest(levelId: string): LevelRecord | null {
    const top = this.getTop(levelId);
    return top.length > 0 ? top[0] : null;
  },

  /**
   * Submit a completion time. If it qualifies for top 5, saves it.
   * Returns true if it was a new personal best (rank 1).
   */
  submit(levelId: string, timeSeconds: number): boolean {
    const map = this._load();
    const records = map[levelId] || [];
    
    records.push({ bestTime: timeSeconds, recordedAt: new Date().toISOString() });
    
    // Sort ascending by time
    records.sort((a, b) => a.bestTime - b.bestTime);
    
    // Keep top 5
    map[levelId] = records.slice(0, 5);
    
    this._save(map);
    
    // Check if it was a new personal best
    return map[levelId][0].bestTime === timeSeconds;
  },

  /** Format seconds as mm:ss */
  formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  },
};
