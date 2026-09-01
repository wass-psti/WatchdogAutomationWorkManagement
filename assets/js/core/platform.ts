import type { ApplicationManifest } from '../../../src/types/manifest.ts';
import type { ModuleId } from '../../../src/types/identifiers.ts';
import type { WorkManagementModuleDefinition } from '../../../src/types/modules.ts';
import { storage } from './storage.ts';

export const PLATFORM_VERSION = '1.43.2';

export type ThemePreference = 'system' | 'light' | 'dark';
export interface RecentModulePreference { readonly id: string; readonly openedAt: string; }
export interface PlatformPreferences {
  readonly theme: ThemePreference;
  readonly compact: boolean;
  readonly favorites: readonly string[];
  readonly recent: readonly RecentModulePreference[];
}

export interface DiagnosticCheck {
  readonly id: string;
  readonly label: string;
  readonly ok: boolean;
  readonly detail: string;
}

export interface DiagnosticResult {
  readonly checkedAt: string;
  readonly moduleId?: ModuleId;
  readonly moduleName?: string;
  readonly checks: readonly DiagnosticCheck[];
  readonly passed: boolean;
}

export interface StorageHealth {
  readonly available: boolean;
  readonly quota: number | null;
  readonly usage: number | null;
  readonly persistent: boolean;
  readonly persistenceSupported: boolean;
}

export type PersistentStorageRequestResult =
  | Readonly<{ supported: false; granted: false; already: false; reason: 'unsupported' }>
  | Readonly<{ supported: true; granted: true; already: true; reason: 'granted' }>
  | Readonly<{ supported: true; granted: boolean; already: false; reason: 'granted' | 'denied' }>
  | Readonly<{ supported: true; granted: false; already: false; reason: 'error'; error: unknown }>;

type UnknownRecord = { readonly [key: string]: unknown };
const recordOf = (value: unknown): UnknownRecord | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : null;
const isDevelopmentBuild = (): boolean => recordOf(recordOf(import.meta)?.env)?.DEV === true;

export const DEFAULT_PREFERENCES: PlatformPreferences = Object.freeze({
  theme: 'system',
  compact: false,
  favorites: Object.freeze(['time-tracker']),
  recent: Object.freeze([]),
});

const VALID_THEMES = new Set<ThemePreference>(['system', 'light', 'dark']);

function isValidIsoDate(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

export function normalizePreferences(value: unknown): PlatformPreferences {
  const input = recordOf(value) ?? {};
  const favorites = Array.isArray(input.favorites)
    ? [...new Set(input.favorites.filter((id): id is string => typeof id === 'string' && Boolean(id.trim())).map((id) => id.trim()))]
    : [...DEFAULT_PREFERENCES.favorites];
  const recent = Array.isArray(input.recent)
    ? input.recent.flatMap((entry): RecentModulePreference[] => {
        const record = recordOf(entry);
        const id = typeof record?.id === 'string' ? record.id.trim() : '';
        const openedAt = record?.openedAt;
        return id && isValidIsoDate(openedAt) ? [{ id, openedAt: new Date(openedAt).toISOString() }] : [];
      })
      .filter((entry, index, list) => list.findIndex((candidate) => candidate.id === entry.id) === index)
      .slice(0, 8)
    : [];
  const theme = typeof input.theme === 'string' && VALID_THEMES.has(input.theme as ThemePreference) ? input.theme as ThemePreference : DEFAULT_PREFERENCES.theme;
  return Object.freeze({ theme, compact: input.compact === true, favorites: Object.freeze(favorites), recent: Object.freeze(recent) });
}

export function getPreferences(): PlatformPreferences {
  return normalizePreferences(storage.get('preferences.v1', DEFAULT_PREFERENCES));
}

export function savePreferences(next: unknown): boolean {
  return storage.set('preferences.v1', normalizePreferences(next));
}

export function applyTheme(theme: unknown): void {
  const resolved: ThemePreference = typeof theme === 'string' && VALID_THEMES.has(theme as ThemePreference) ? theme as ThemePreference : 'system';
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.style.colorScheme = resolved === 'system' ? 'normal' : resolved;
}

export function applyDensity(compact: unknown): void {
  document.documentElement.dataset.density = compact === true ? 'compact' : 'comfortable';
}

export function safeModuleStatus(mod: WorkManagementModuleDefinition | null | undefined): Readonly<{ label: string; tone: 'success' | 'muted' }> {
  const status = typeof mod?.status === 'string' ? mod.status : 'disabled';
  if (status !== 'active') return Object.freeze({ label: `${status[0]?.toUpperCase() ?? ''}${status.slice(1)}`, tone: 'muted' });
  return Object.freeze({ label: 'Available', tone: 'success' });
}

export function readTimeTrackerSnapshot() { return Object.freeze({ records: 0, active: null, source: 'cloud' as const, updatedAt: null }); }
export function readFuelTrackSnapshot() { return Object.freeze({ records: 0, pending: 0, completed: 0, active: null, source: 'cloud' as const, updatedAt: null }); }
export function readTradeLinkSnapshot() { return Object.freeze({ records: 0, pending: 0, approved: 0, active: null, source: 'cloud' as const, updatedAt: null }); }

export function markRecent(preferences: PlatformPreferences, moduleId: string): PlatformPreferences {
  const id = String(moduleId ?? '').trim();
  if (!id) return preferences;
  const recent = [{ id, openedAt: new Date().toISOString() }, ...preferences.recent.filter((entry) => entry.id !== id)].slice(0, 8);
  const next: PlatformPreferences = Object.freeze({ ...preferences, recent: Object.freeze(recent) });
  savePreferences(next);
  return next;
}

export function toggleFavorite(preferences: PlatformPreferences, moduleId: string): PlatformPreferences {
  const id = String(moduleId ?? '').trim();
  if (!id) return preferences;
  const favorites = new Set(preferences.favorites);
  favorites.has(id) ? favorites.delete(id) : favorites.add(id);
  const next: PlatformPreferences = Object.freeze({ ...preferences, favorites: Object.freeze([...favorites]) });
  savePreferences(next);
  return next;
}

export async function getStorageHealth(): Promise<StorageHealth> {
  let quota: number | null = null;
  let usage: number | null = null;
  let persisted = false;
  const persistenceSupported = 'storage' in navigator && typeof navigator.storage.persist === 'function' && typeof navigator.storage.persisted === 'function';
  try {
    if (navigator.storage?.estimate) {
      const estimate = await navigator.storage.estimate();
      quota = typeof estimate.quota === 'number' && Number.isFinite(estimate.quota) ? estimate.quota : null;
      usage = typeof estimate.usage === 'number' && Number.isFinite(estimate.usage) ? estimate.usage : null;
    }
  } catch (error) {
    console.warn('[Work Management] Storage estimate unavailable', error);
  }
  try { persisted = Boolean(await navigator.storage?.persisted?.()); }
  catch (error) { console.warn('[Work Management] Persistent-storage status unavailable', error); }
  return Object.freeze({ available: storageAvailableNow(), quota, usage, persistent: persisted, persistenceSupported });
}

function storageAvailableNow(): boolean {
  try {
    const key = 'wm.platform.__health_probe__';
    localStorage.setItem(key, '1');
    localStorage.removeItem(key);
    return true;
  } catch { return false; }
}

export async function requestPersistentStorage(): Promise<PersistentStorageRequestResult> {
  if (!navigator.storage?.persist) return Object.freeze({ supported: false, granted: false, already: false, reason: 'unsupported' });
  try {
    const already = navigator.storage?.persisted ? Boolean(await navigator.storage.persisted()) : false;
    if (already) return Object.freeze({ supported: true, granted: true, already: true, reason: 'granted' });
    const granted = Boolean(await navigator.storage.persist());
    return Object.freeze({ supported: true, granted, already: false, reason: granted ? 'granted' : 'denied' });
  } catch (error) {
    console.warn('[Work Management] Persistent-storage request failed', error);
    return Object.freeze({ supported: true, granted: false, already: false, reason: 'error', error });
  }
}

export async function verifyModuleCompatibility(mod: WorkManagementModuleDefinition | null | undefined): Promise<DiagnosticResult> {
  const checks: DiagnosticCheck[] = [];
  if (!mod) return Object.freeze({ checkedAt: new Date().toISOString(), checks: Object.freeze([{ id: 'registry', label: 'Module registration', ok: false, detail: 'The requested module is not registered.' }]), passed: false });

  checks.push({
    id: 'metadata',
    label: 'Module metadata',
    ok: Boolean(mod.id) && mod.status === 'active' && Boolean(mod.route) && Boolean(mod.version),
    detail: `${mod.name || 'Module'} v${mod.version || 'unknown'} · ${mod.status || 'unknown'}`,
  });

  const exactKeys = mod.cloudStateKeys;
  const prefixes = mod.cloudStatePrefixes;
  checks.push({
    id: 'storage-contract', label: 'Cloud state contract', ok: exactKeys.length > 0,
    detail: `${exactKeys.length} exact key${exactKeys.length === 1 ? '' : 's'}${prefixes.length ? ` · ${prefixes.length} prefix${prefixes.length === 1 ? '' : 'es'}` : ''} registered`,
  });

  try {
    const response = await fetch(mod.route, { method: 'GET', cache: 'no-store' });
    checks.push({ id: 'runtime', label: `${mod.name} runtime`, ok: response.ok, detail: `HTTP ${response.status}` });
  } catch {
    let cached = false;
    if ('caches' in window) {
      try { cached = Boolean(await caches.match(mod.route)); } catch { /* unavailable */ }
    }
    checks.push({ id: 'runtime', label: `${mod.name} runtime`, ok: cached, detail: cached ? 'Available from offline cache' : (navigator.onLine ? 'Runtime request failed' : 'Offline and runtime is not cached') });
  }

  checks.push({ id: 'data-read', label: `${mod.name} data access`, ok: true, detail: 'Authenticated cloud state is resolved at module startup' });
  return Object.freeze({ checkedAt: new Date().toISOString(), moduleId: mod.id, moduleName: mod.name, checks: Object.freeze(checks), passed: checks.every((check) => check.ok) });
}

export async function runPlatformDiagnostics(modules: readonly WorkManagementModuleDefinition[], manifest: ApplicationManifest | null = null): Promise<DiagnosticResult> {
  const checks: DiagnosticCheck[] = [];
  const health = await getStorageHealth();
  checks.push({ id: 'storage', label: 'Shell preference storage', ok: health.available, detail: health.available ? 'Writable' : 'Unavailable or blocked' });
  checks.push({ id: 'quota', label: 'Storage estimate', ok: health.quota == null || health.quota > 0, detail: health.quota == null ? 'Browser does not expose a quota estimate' : `${Math.round(health.quota / 1048576)} MB quota reported` });
  const registryOk = modules.length > 0 && new Set(modules.map((module) => module.id)).size === modules.length && modules.every((module) => Boolean(module.id && module.name && module.route && module.status));
  checks.push({ id: 'registry', label: 'Module registry', ok: registryOk, detail: `${modules.length} registered module${modules.length === 1 ? '' : 's'}` });
  if (manifest) {
    const featureIds = manifest.features.map((feature) => feature.id);
    const manifestOk = manifest.id === 'work-management' && manifest.version === PLATFORM_VERSION && manifest.architectureVersion >= 2 && featureIds.length > 0 && new Set(featureIds).size === featureIds.length;
    checks.push({ id: 'architecture', label: 'Application architecture manifest', ok: manifestOk, detail: manifestOk ? `Architecture v${manifest.architectureVersion} · ${featureIds.length} feature boundaries` : 'Manifest/version/feature-boundary mismatch' });
  }
  for (const mod of modules) {
    if (mod.status !== 'active') continue;
    let ok = false;
    let detail = 'Unavailable';
    try {
      const response = await fetch(mod.route, { method: 'GET', cache: 'no-store' });
      ok = response.ok;
      detail = `HTTP ${response.status}`;
    } catch {
      detail = navigator.onLine ? 'Network request failed' : 'Offline; checking cache';
      if ('caches' in window) {
        try { ok = Boolean(await caches.match(mod.route)); } catch { /* unavailable */ }
        if (ok) detail = 'Available from offline cache';
      }
    }
    checks.push({ id: `module:${mod.id}`, label: `${mod.name} runtime`, ok, detail });
  }
  const preferences = getPreferences();
  checks.push({ id: 'preferences', label: 'Preferences', ok: true, detail: `Theme ${preferences.theme}; ${preferences.compact ? 'compact' : 'comfortable'} spacing` });
  return Object.freeze({ checkedAt: new Date().toISOString(), checks: Object.freeze(checks), passed: checks.every((check) => check.ok) });
}

export function registerServiceWorker(onUpdate?: ((registration: ServiceWorkerRegistration) => void) | null): void {
  if (isDevelopmentBuild() || !('serviceWorker' in navigator) || location.protocol === 'file:') return;
  addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('./service-worker.js');
      if (registration.waiting) onUpdate?.(registration);
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) onUpdate?.(registration);
        });
      });
    } catch (error) {
      console.warn('[Work Management] Service worker registration failed', error);
    }
  }, { once: true });
}
