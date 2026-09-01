const PREFIX = 'wm.platform.';

export interface WorkManagementStorage {
  readonly prefix: string;
  readonly available: boolean;
  get(key: string, fallback?: unknown): unknown;
  set(key: string, value: unknown): boolean;
  remove(key: string): boolean;
  keys(): readonly string[];
}

function storageAvailable(): boolean {
  try {
    const key = `${PREFIX}__probe__`;
    localStorage.setItem(key, '1');
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export const storage: WorkManagementStorage = Object.freeze({
  prefix: PREFIX,
  available: storageAvailable(),
  get(key: string, fallback: unknown = null): unknown {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      if (raw == null) return fallback;
      const parsed: unknown = JSON.parse(raw);
      return parsed;
    } catch (error) {
      console.warn('[Work Management] Failed to read preference', key, error);
      return fallback;
    }
  },
  set(key: string, value: unknown): boolean {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error('[Work Management] Failed to persist preference', key, error);
      return false;
    }
  },
  remove(key: string): boolean {
    try { localStorage.removeItem(PREFIX + key); return true; }
    catch { return false; }
  },
  keys(): readonly string[] {
    try {
      return Object.keys(localStorage).filter((key) => key.startsWith(PREFIX));
    } catch {
      return [];
    }
  },
});
