// ============================================================
// LevelSerializer.ts — JSON serialization / deserialization
// Converts runtime GameState <-> LevelData JSON schema
// ============================================================

import {
  GameState,
  LevelData,
  PlanetData,
  PlanetDef,
  BlackHoleData,
  BlackHoleDef,
  UpgradeLevel,
  PLANET_MAX_HEALTH,
  PLANET_PRODUCTION,
  PLANET_RADIUS,
  Faction,
} from '../types';

// ---------------------------------------------------------------------------
// Internal validation helpers
// ---------------------------------------------------------------------------

const VALID_FACTIONS: ReadonlySet<string> = new Set([
  'player',
  'enemy_a',
  'enemy_b',
  'neutral',
]);

const VALID_UPGRADE_LEVELS: ReadonlySet<number> = new Set([1, 2, 3]);

function isFaction(value: unknown): value is Faction {
  return typeof value === 'string' && VALID_FACTIONS.has(value);
}

function isUpgradeLevel(value: unknown): value is UpgradeLevel {
  return typeof value === 'number' && VALID_UPGRADE_LEVELS.has(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && isFinite(value);
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

function isPlanetDef(value: unknown): value is PlanetDef {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (!isString(v['id'])) return false;
  if (!isNumber(v['x']) || !isNumber(v['y'])) return false;
  if (!isFaction(v['faction'])) return false;
  if (!isUpgradeLevel(v['upgradeLevel'])) return false;
  if (!isNumber(v['startingParticles'])) return false;
  if (!isBoolean(v['isOrbiting'])) return false;
  if (v['isOrbiting']) {
    if (!isNumber(v['orbitCenterX'])) return false;
    if (!isNumber(v['orbitCenterY'])) return false;
    if (!isNumber(v['orbitRadius'])) return false;
    if (v['orbitShape'] !== undefined && v['orbitShape'] !== 'circle' && v['orbitShape'] !== 'ellipse') return false;
    if (v['orbitRadiusY'] !== undefined && !isNumber(v['orbitRadiusY'])) return false;
    if (!isNumber(v['orbitSpeed'])) return false;
  }
  if (v['isShielded'] !== undefined && !isBoolean(v['isShielded'])) return false;
  return true;
}

function isBlackHoleDef(value: unknown): value is BlackHoleDef {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (!isString(v['id'])) return false;
  if (!isNumber(v['x']) || !isNumber(v['y'])) return false;
  if (!isNumber(v['radius'])) return false;
  if (!isNumber(v['pullStrength'])) return false;
  return true;
}

// ---------------------------------------------------------------------------
// LevelSerializer
// ---------------------------------------------------------------------------

export class LevelSerializer {
  /**
   * Converts the running GameState into a portable LevelData snapshot.
   * Planets are serialised with their current particle count as startingParticles.
   *
   * @param state  Current game state.
   * @param name   Human-readable level name.
   */
  static serialize(state: GameState, name: string): LevelData {
    const planets: PlanetDef[] = [];
    for (const planet of state.planets.values()) {
      const def: PlanetDef = {
        id: planet.id,
        x: planet.x,
        y: planet.y,
        faction: planet.faction,
        upgradeLevel: planet.upgradeLevel,
        startingParticles: Math.floor(planet.health),
        isOrbiting: planet.isOrbiting,
      };

      if (planet.isOrbiting) {
        def.orbitCenterX = planet.orbitCenterX;
        def.orbitCenterY = planet.orbitCenterY;
        def.orbitRadius = planet.orbitRadius;
        if (planet.orbitShape) def.orbitShape = planet.orbitShape;
        if (planet.orbitRadiusY) def.orbitRadiusY = planet.orbitRadiusY;
        def.orbitSpeed = planet.orbitSpeed;
        // Persist the current angle so the level re-opens at the same orbital position.
        def.orbitStartAngle = planet.orbitAngle ?? 0;
      }

      if (planet.isShielded) {
        def.isShielded = true;
      }

      planets.push(def);
    }

    const blackHoles: BlackHoleDef[] = [];
    for (const bh of state.blackHoles.values()) {
      blackHoles.push({
        id: bh.id,
        x: bh.x,
        y: bh.y,
        radius: bh.radius,
        pullStrength: bh.pullStrength,
      });
    }

    return {
      version: 1,
      name,
      worldWidth: 2048,
      worldHeight: 2048,
      planets,
      blackHoles,
    };
  }

  /**
   * Converts a LevelData JSON object into runtime arrays ready to be consumed
   * by GameScene.  Computes derived stats (capacity, productionRate, radius)
   * from the upgradeLevel constants so the JSON stays lean.
   *
   * @param json  A validated LevelData object.
   * @returns     { planets, blackHoles } arrays.
   */
  static deserialize(json: LevelData): {
    planets: PlanetData[];
    blackHoles: BlackHoleData[];
  } {
    const planets: PlanetData[] = json.planets.map((def) => {
      const planet: PlanetData = {
        id: def.id,
        x: def.x,
        y: def.y,
        faction: def.faction,
        upgradeLevel: def.upgradeLevel,
        health: Math.max(0, def.startingParticles),
        maxHealth: PLANET_MAX_HEALTH[def.upgradeLevel],
        productionRate: PLANET_PRODUCTION[def.upgradeLevel],
        absorbedCount: 0,
        isOrbiting: def.isOrbiting,
        isShielded: def.isShielded ?? false,
        shieldPoints: 0,
        shieldTimer: 0,
      };

      if (def.isOrbiting) {
        planet.orbitCenterX = def.orbitCenterX;
        planet.orbitCenterY = def.orbitCenterY;
        planet.orbitRadius = def.orbitRadius;
        planet.orbitShape = def.orbitShape ?? 'circle';
        planet.orbitRadiusY = def.orbitRadiusY ?? def.orbitRadius;
        planet.orbitSpeed = def.orbitSpeed;
        planet.orbitAngle = def.orbitStartAngle ?? 0;

        if (
          isNumber(planet.orbitCenterX) &&
          isNumber(planet.orbitCenterY) &&
          isNumber(planet.orbitRadius) &&
          isNumber(planet.orbitAngle)
        ) {
          const rx = planet.orbitRadius;
          const ry = planet.orbitShape === 'ellipse' ? (planet.orbitRadiusY ?? rx) : rx;
          planet.x = planet.orbitCenterX + rx * Math.cos(planet.orbitAngle);
          planet.y = planet.orbitCenterY + ry * Math.sin(planet.orbitAngle);
        }
      }

      return planet;
    });

    // Pull radius is derived as 3x the destruction radius for a comfortable
    // gravitational influence zone.
    const blackHoles: BlackHoleData[] = json.blackHoles.map((def) => ({
      id: def.id,
      x: def.x,
      y: def.y,
      radius: def.radius,
      pullRadius: def.radius * 3,
      pullStrength: def.pullStrength,
    }));

    return { planets, blackHoles };
  }

  /**
   * Triggers a browser download of the LevelData as a JSON file.
   *
   * @param levelData  The level to download.
   * @param filename   Output filename (e.g. "my_level.json").
   */
  static downloadLevel(levelData: LevelData, filename: string): void {
    const json = JSON.stringify(levelData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename.endsWith('.json') ? filename : `${filename}.json`;

    // Append to document so Firefox triggers the download correctly.
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);

    // Release the object URL after a short delay so the download can start.
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  /**
   * Reads a File object, parses it as JSON, and validates the result.
   *
   * @param file  A File selected by the user (e.g. from an <input type="file">).
   * @returns     Promise resolving to a validated LevelData.
   * @throws      If the file cannot be read, parsed, or validated.
   */
  static loadFromFile(file: File): Promise<LevelData> {
    return new Promise<LevelData>((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (event) => {
        try {
          const text = event.target?.result;
          if (typeof text !== 'string') {
            reject(new Error('FileReader did not return a string result.'));
            return;
          }

          let parsed: unknown;
          try {
            parsed = JSON.parse(text);
          } catch (parseError) {
            reject(
              new Error(
                `Failed to parse JSON: ${(parseError as Error).message}`,
              ),
            );
            return;
          }

          if (!LevelSerializer.validateLevel(parsed)) {
            reject(
              new Error(
                'Invalid level format: the file does not match the LevelData schema.',
              ),
            );
            return;
          }

          resolve(parsed);
        } catch (err) {
          reject(err);
        }
      };

      reader.onerror = () => {
        reject(new Error(`FileReader error while reading "${file.name}".`));
      };

      reader.readAsText(file, 'utf-8');
    });
  }

  /**
   * Type guard — returns true if `data` looks like a valid LevelData object.
   * Performs structural checks but not deep semantic validation (e.g. duplicate ids).
   *
   * @param data  Any unknown value.
   */
  static validateLevel(data: unknown): data is LevelData {
    if (typeof data !== 'object' || data === null) return false;
    const d = data as Record<string, unknown>;

    // Version check.
    if (d['version'] !== 1) return false;

    // Required strings.
    if (!isString(d['name']) || d['name'].trim().length === 0) return false;

    // World dimensions.
    if (!isNumber(d['worldWidth']) || d['worldWidth'] <= 0) return false;
    if (!isNumber(d['worldHeight']) || d['worldHeight'] <= 0) return false;

    // Planets array.
    if (!Array.isArray(d['planets'])) return false;
    if (d['planets'].length === 0) return false;
    for (const planet of d['planets']) {
      if (!isPlanetDef(planet)) return false;
    }

    // Black holes array (may be empty).
    if (!Array.isArray(d['blackHoles'])) return false;
    for (const bh of d['blackHoles']) {
      if (!isBlackHoleDef(bh)) return false;
    }

    return true;
  }
}

// Re-export the radius lookup so callers can calculate planet visual sizes
// without importing types directly.
export { PLANET_RADIUS };



