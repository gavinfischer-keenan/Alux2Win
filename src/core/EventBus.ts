// ============================================================
// EventBus.ts — Typed event emitter for LUX
// ============================================================

import type { SceneName, Faction, LevelData } from '../types';

// ---- Event payload map ----
export interface EventMap {
  'scene:change':     { scene: SceneName };
  'planet:selected':  { ids: string[] };
  'particles:deploy': { fromIds: string[]; targetX: number; targetY: number; targetPlanetId?: string };
  'planet:captured':  { planetId: string; newFaction: Faction; oldFaction: Faction };
  'game:over':        { winner: Faction };
  'level:load':       { levelData: LevelData };
}

export type EventName = keyof EventMap;

type Listener<K extends EventName> = (payload: EventMap[K]) => void;

/**
 * A small, fully typed publish-subscribe bus used to decouple systems.
 * Listeners are stored per event name in a Map of arrays.
 */
export class EventBus {
  private listeners: Map<EventName, Array<Listener<any>>> = new Map();

  /**
   * Subscribe to an event.
   * @returns An unsubscribe function — call it to remove the listener.
   */
  on<K extends EventName>(event: K, listener: Listener<K>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(listener as Listener<any>);

    return () => this.off(event, listener);
  }

  /** Subscribe to an event exactly once. Auto-removes after first call. */
  once<K extends EventName>(event: K, listener: Listener<K>): void {
    const wrapper: Listener<K> = (payload) => {
      listener(payload);
      this.off(event, wrapper);
    };
    this.on(event, wrapper);
  }

  /** Remove a specific listener. */
  off<K extends EventName>(event: K, listener: Listener<K>): void {
    const arr = this.listeners.get(event);
    if (!arr) return;
    const idx = arr.indexOf(listener as Listener<any>);
    if (idx !== -1) arr.splice(idx, 1);
  }

  /** Emit an event, calling all registered listeners synchronously. */
  emit<K extends EventName>(event: K, payload: EventMap[K]): void {
    const arr = this.listeners.get(event);
    if (!arr || arr.length === 0) return;
    // Snapshot before iterating to handle listeners that remove themselves.
    const snapshot = arr.slice();
    for (const listener of snapshot) {
      listener(payload);
    }
  }

  /** Remove all listeners for one event, or all events if none specified. */
  removeAllListeners(event?: EventName): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }
}
