import type { ModuleId } from '../../../src/types/identifiers.ts';
import type {
  ModuleActivityEventInput,
  ModuleDataRequest,
  ModuleDataResponse,
  ModuleStateScope,
} from '../../../src/platform/contracts/module-data.ts';
import type {
  EmbeddedModuleActivity,
  EmbeddedModuleAttendance,
  EmbeddedModuleIdentityContext,
  EmbeddedModuleLocks,
  EmbeddedModuleStore,
  ModuleActivityItem,
  ModuleDirectoryEntry,
  ModuleStateRow,
} from '../../../src/platform/contracts/embedded-module.ts';

type UnknownRecord = Record<string, unknown>;
type ModuleRequestInput<T = ModuleDataRequest> = T extends ModuleDataRequest ? Omit<T, 'type' | 'requestId' | 'moduleId'> : never;
interface PendingRequest { readonly resolve: (value: unknown) => void; readonly reject: (reason?: unknown) => void; readonly timer: number; }
interface CloudStoreInstallOptions { readonly moduleId: ModuleId; readonly identityReady: Promise<EmbeddedModuleIdentityContext | null>; }
export interface ModuleCloudStoreHandle { readonly store: EmbeddedModuleStore; dispose(): void; }

const ACTIVITY_PAGE_SIZE = 500;
const recordOf = (value: unknown): UnknownRecord | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : null;
const arrayOf = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const stringOf = (value: unknown): string => typeof value === 'string' ? value : '';
const numberOf = (value: unknown, fallback = 0): number => { const n = Number(value); return Number.isFinite(n) ? n : fallback; };
const errorMessage = (error: unknown): string => error instanceof Error ? error.message : typeof error === 'string' ? error : 'Cloud persistence failed.';

function userScopedKeys(moduleId: ModuleId): ReadonlySet<string> {
  if (moduleId === 'time-tracker') return new Set(['timetracker.ui.v1', 'timetracker.auto-gps-cache.v1']);
  if (moduleId === 'fueltrack-plus') return new Set(['fueltrackplus.preferences.v3', 'fueltrackplus.activity.workspace.v1']);
  return new Set(['tradelink_ui_v1', 'tradelink_draft_v1']);
}

function normalizeCloudError(error: unknown): Error {
  const message = errorMessage(error);
  if (/state key is not registered|state key is not valid/i.test(message)) return new Error('Cloud schema is out of date for this application state. Run the latest Work Management Supabase migration, then refresh.');
  if (/state scope mismatch/i.test(message)) return new Error('Cloud state scope does not match the registered server policy. Refresh after applying the latest database migration.');
  if (/WM_STATE_CONFLICT|serialization|40001/i.test(message)) return new Error('WM_STATE_CONFLICT: This record changed in another session. The latest cloud state has been loaded; review it and retry your action.');
  if (/WM_ATTENDANCE_ACTIVE_EXISTS/i.test(message)) return new Error('A shift is already active for this account. The latest cloud attendance state has been loaded.');
  if (/WM_ATTENDANCE_NO_ACTIVE/i.test(message)) return new Error('No active attendance session exists for this account. The latest cloud attendance state has been loaded.');
  if (/WM_ATTENDANCE_SESSION_CHANGED/i.test(message)) return new Error('The active attendance session changed in another browser or tab. The latest cloud state has been loaded.');
  return error instanceof Error ? error : new Error(message);
}

function normalizeStateRow(value: unknown): ModuleStateRow | null {
  const row = recordOf(value);
  if (!row) return null;
  const stateKey = stringOf(row.state_key);
  if (!stateKey || typeof row.value !== 'string' || (row.scope !== 'shared' && row.scope !== 'user')) return null;
  return Object.freeze({ state_key: stateKey, value: row.value, scope: row.scope, revision: Math.max(0, Math.trunc(numberOf(row.revision))) });
}

function normalizeDirectoryEntry(value: unknown): ModuleDirectoryEntry | null {
  const row = recordOf(value);
  return row ? Object.freeze({ ...row }) : null;
}

function normalizeActivityRow(value: unknown): ModuleActivityItem {
  const row = recordOf(value) ?? {};
  const payload = recordOf(row.payload) ?? {};
  return Object.freeze({
    ...row,
    id: stringOf(row.event_id) || stringOf(row.id),
    sequence: numberOf(row.sequence),
    type: stringOf(row.event_type) || stringOf(row.type) || 'system',
    title: stringOf(row.title) || 'Activity event',
    message: stringOf(row.message),
    requestId: stringOf(row.request_id) || stringOf(row.requestId),
    actorUserId: stringOf(row.actor_user_id) || stringOf(row.actorUserId) || null,
    actorEmail: stringOf(row.actor_email) || stringOf(row.actorEmail),
    actor: stringOf(row.actor_name) || stringOf(row.actor) || 'Unknown user',
    actorRole: stringOf(row.actor_role) || stringOf(row.actorRole),
    at: stringOf(row.occurred_at) || stringOf(row.at) || new Date().toISOString(),
    payload: Object.freeze({ ...payload }),
  });
}

function normalizeActivityEvent(value: unknown): ModuleActivityEventInput {
  const row = recordOf(value);
  if (!row) throw new TypeError('Activity event must be an object.');
  const id = stringOf(row.id).trim();
  const type = stringOf(row.type) || 'system';
  const title = stringOf(row.title).trim();
  const message = stringOf(row.message);
  const requestId = row.requestId == null ? null : stringOf(row.requestId).trim();
  const payload = recordOf(row.payload) ?? {};
  if (id.length < 8 || id.length > 160) throw new TypeError('Activity event id is invalid.');
  if (!['submit', 'review', 'issue', 'system'].includes(type)) throw new TypeError('Activity event type is invalid.');
  if (!title || title.length > 240 || message.length > 4000) throw new TypeError('Activity event text is invalid.');
  return Object.freeze({ id, type: type as ModuleActivityEventInput['type'], title, message, requestId: requestId || null, payload: Object.freeze({ ...payload }) });
}

function parseJson(value: string): unknown {
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed;
  } catch {
    return null;
  }
}
function itemTime(value: unknown): number {
  const item = recordOf(value);
  const candidate = item ? stringOf(item.updatedAt) || stringOf(item.updated_at) || stringOf(item.timestamp) || stringOf(item.createdAt) || stringOf(item.created_at) : '';
  const time = Date.parse(candidate);
  return Number.isFinite(time) ? time : 0;
}
function itemId(value: unknown): string | null {
  const item = recordOf(value);
  if (!item) return null;
  const candidate = item.id ?? item.requestId ?? item.key;
  return candidate == null ? null : String(candidate);
}
function mergeArray(remote: unknown[], local: unknown[]): unknown[] {
  const keyed = new Map<string, unknown>();
  const unkeyed: unknown[] = [];
  for (const item of [...remote, ...local]) {
    const id = itemId(item);
    if (id === null) {
      const serialized = JSON.stringify(item);
      if (!unkeyed.some((value) => JSON.stringify(value) === serialized)) unkeyed.push(item);
      continue;
    }
    const previous = keyed.get(id);
    if (previous === undefined || itemTime(item) >= itemTime(previous)) keyed.set(id, item);
  }
  return [...keyed.values(), ...unkeyed];
}
function mergeObject(remote: UnknownRecord, local: UnknownRecord): UnknownRecord {
  const out: UnknownRecord = { ...remote, ...local };
  for (const key of ['records', 'requests', 'activity', 'audit', 'events', 'snapshots', 'documents', 'clients', 'suppliers', 'users', 'items', 'inventory', 'entries']) {
    const remoteValue = remote[key]; const localValue = local[key];
    if (Array.isArray(remoteValue) && Array.isArray(localValue)) out[key] = mergeArray(remoteValue, localValue);
  }
  return out;
}
function mergeValues(remoteValue: string, localValue: string): string {
  const remote = parseJson(remoteValue); const local = parseJson(localValue);
  if (Array.isArray(remote) && Array.isArray(local)) return JSON.stringify(mergeArray(remote, local));
  const remoteRecord = recordOf(remote); const localRecord = recordOf(local);
  return remoteRecord && localRecord ? JSON.stringify(mergeObject(remoteRecord, localRecord)) : localValue;
}

export function installModuleCloudStore({ moduleId, identityReady }: CloudStoreInstallOptions): ModuleCloudStoreHandle {
  const memory = new Map<string, string>();
  const scopes = new Map<string, ModuleStateScope>();
  const revisions = new Map<string, number>();
  const pending = new Map<string, PendingRequest>();
  const dirty = new Set<string>();
  const writeQueues = new Map<string, Promise<unknown>>();
  const scopedKeys = userScopedKeys(moduleId);
  const abort = new AbortController();
  let hydrated = false;
  let disposed = false;
  let refreshTimer: number | null = null;
  let lastError: Error | null = null;
  let directory: readonly ModuleDirectoryEntry[] = [];
  let activityItems: readonly ModuleActivityItem[] = [];
  let activityReady = false;
  let activityError: Error | null = null;
  let activityHasMore = false;

  const scopeFor = (key: string): ModuleStateScope => scopedKeys.has(key) ? 'user' : 'shared';
  const showPersistenceError = (message: string): void => {
    let element = document.getElementById('wmCloudPersistenceError');
    if (!element) {
      element = document.createElement('div'); element.id = 'wmCloudPersistenceError'; element.setAttribute('role', 'alert');
      element.style.cssText = 'position:fixed;left:16px;right:16px;bottom:16px;z-index:2147483647;padding:12px 14px;border:1px solid #b42318;border-radius:12px;background:#fff1f0;color:#7a271a;font:600 13px/1.4 system-ui,sans-serif;box-shadow:0 12px 30px rgba(0,0,0,.16)';
      document.body.appendChild(element);
    }
    element.textContent = `Cloud persistence error: ${message} Your current view remains open; refresh after connectivity or database migration is restored.`;
  };
  const clearPersistenceError = (): void => { document.getElementById('wmCloudPersistenceError')?.remove(); };

  const request = (input: ModuleRequestInput): Promise<unknown> => {
    if (disposed) return Promise.reject(new Error('The embedded cloud-state runtime is disposed.'));
    const requestId = `${moduleId}:${Date.now()}:${globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)}`;
    const message = { type: 'wm:data:request', requestId, moduleId, ...input } as ModuleDataRequest;
    return new Promise<unknown>((resolve, reject) => {
      const timer = window.setTimeout(() => { pending.delete(requestId); reject(new Error('Cloud data request timed out.')); }, 15000);
      pending.set(requestId, { resolve, reject, timer });
      try { window.parent.postMessage(message, location.origin); }
      catch (error) { window.clearTimeout(timer); pending.delete(requestId); reject(error); }
    });
  };

  window.addEventListener('message', (event: MessageEvent<unknown>) => {
    if (event.origin !== location.origin || event.source !== window.parent) return;
    const response = recordOf(event.data);
    if (!response) return;
    if (response.type === 'wm:host:invalidate') {
      const invalidatedModuleId = stringOf(response.moduleId);
      const reason = response.reason;
      if (invalidatedModuleId === moduleId && (reason === 'backup-restore' || reason === 'host-refresh')) void refresh();
      return;
    }
    if (response.type !== 'wm:data:response') return;
    const requestId = stringOf(response.requestId);
    const active = pending.get(requestId);
    if (!active) return;
    window.clearTimeout(active.timer); pending.delete(requestId);
    const typed: ModuleDataResponse = {
      type: 'wm:data:response', requestId, ok: response.ok === true,
      payload: response.payload, error: response.error == null ? null : stringOf(response.error),
    };
    typed.ok ? active.resolve(typed.payload) : active.reject(new Error(typed.error || 'Cloud persistence failed.'));
  }, { signal: abort.signal });

  const emitStorage = (key: string, oldValue: string | null, newValue: string | null): void => {
    try { window.dispatchEvent(new StorageEvent('storage', { key, oldValue, newValue, url: location.href })); }
    catch { window.dispatchEvent(new CustomEvent('wm:module-store-change', { detail: { key, oldValue, newValue } })); }
  };
  const publishDirectory = (rows: readonly ModuleDirectoryEntry[], emit: boolean): void => {
    const previous = JSON.stringify(directory);
    directory = Object.freeze(rows.map((row) => Object.freeze({ ...row })));
    globalThis.WMModuleDirectory = directory;
    if (emit && JSON.stringify(directory) !== previous) window.dispatchEvent(new CustomEvent('wm:module-directory-change', { detail: directory }));
  };
  const publishActivity = (items: readonly ModuleActivityItem[], emit = true): void => {
    activityItems = Object.freeze([...items].sort((a, b) => (b.sequence - a.sequence) || (Date.parse(b.at) - Date.parse(a.at))));
    globalThis.WMModuleActivityItems = activityItems;
    if (emit) window.dispatchEvent(new CustomEvent('wm:activity-change', { detail: activityItems }));
  };
  const fetchRows = async (): Promise<ModuleStateRow[]> => arrayOf(await request({ action: 'list' })).map(normalizeStateRow).filter((row): row is ModuleStateRow => row !== null);
  const applyRows = (rows: readonly ModuleStateRow[], emit = false): void => {
    const next = new Map(rows.map((row) => [row.state_key, row.value]));
    const nextRevisions = new Map(rows.map((row) => [row.state_key, row.revision]));
    for (const key of new Set([...memory.keys(), ...next.keys()])) {
      const oldValue = memory.get(key) ?? null;
      const newValue = next.get(key) ?? null;
      if (dirty.has(key) || oldValue === newValue) continue;
      if (newValue === null) { memory.delete(key); revisions.delete(key); scopes.delete(key); }
      else { memory.set(key, newValue); revisions.set(key, nextRevisions.get(key) ?? 0); }
      if (emit) emitStorage(key, oldValue, newValue);
    }
    for (const row of rows) { scopes.set(row.state_key, row.scope); revisions.set(row.state_key, row.revision); }
  };

  const hydrate = async (): Promise<boolean> => {
    const identity = await identityReady;
    if (!identity?.allowed) throw new Error('Authenticated module access is required.');
    const [rows, directoryRows] = await Promise.all([fetchRows(), request({ action: 'directory' }).catch(() => [])]);
    if (disposed) throw new Error('The embedded cloud-state runtime was disposed during hydration.');
    memory.clear(); scopes.clear(); revisions.clear(); applyRows(rows, false);
    publishDirectory(arrayOf(directoryRows).map(normalizeDirectoryEntry).filter((row): row is ModuleDirectoryEntry => row !== null), false);
    hydrated = true; lastError = null; clearPersistenceError(); return true;
  };

  const refresh = async (): Promise<void> => {
    if (!hydrated || disposed || document.hidden) return;
    try {
      const [rows, directoryRows] = await Promise.all([fetchRows(), request({ action: 'directory' }).catch(() => directory)]);
      if (disposed) return;
      applyRows(rows, true);
      if (Array.isArray(directoryRows)) publishDirectory(directoryRows.map(normalizeDirectoryEntry).filter((row): row is ModuleDirectoryEntry => row !== null), true);
      lastError = null; clearPersistenceError();
    } catch (error) { lastError = normalizeCloudError(error); }
  };

  const refreshActivity = async (emit = true): Promise<readonly ModuleActivityItem[]> => {
    if (moduleId !== 'fueltrack-plus') { activityReady = true; activityHasMore = false; publishActivity([], false); return activityItems; }
    const role = globalThis.WM_IDENTITY_CONTEXT?.module.role ?? '';
    if (role && role !== 'Admin') { activityReady = true; activityHasMore = false; activityError = null; publishActivity([], emit); return activityItems; }
    try {
      const rows = arrayOf(await request({ action: 'activity:list', limit: ACTIVITY_PAGE_SIZE, beforeSequence: null })).map(normalizeActivityRow);
      activityHasMore = rows.length >= ACTIVITY_PAGE_SIZE; publishActivity(rows, emit); activityReady = true; activityError = null; return activityItems;
    } catch (error) { activityError = normalizeCloudError(error); throw activityError; }
  };

  const loadOlderActivity = async (emit = true): Promise<readonly ModuleActivityItem[]> => {
    if (moduleId !== 'fueltrack-plus' || !activityHasMore) return activityItems;
    const sequences = activityItems.map((item) => item.sequence).filter((value) => Number.isFinite(value) && value > 0);
    const beforeSequence = sequences.length ? Math.min(...sequences) : null;
    if (!beforeSequence) { activityHasMore = false; return activityItems; }
    try {
      const older = arrayOf(await request({ action: 'activity:list', limit: ACTIVITY_PAGE_SIZE, beforeSequence })).map(normalizeActivityRow);
      activityHasMore = older.length >= ACTIVITY_PAGE_SIZE;
      const byId = new Map(activityItems.map((item) => [item.id, item])); for (const item of older) if (item.id) byId.set(item.id, item);
      publishActivity([...byId.values()], emit); activityError = null; return activityItems;
    } catch (error) { activityError = normalizeCloudError(error); throw activityError; }
  };

  const enqueue = <T>(key: string, task: () => Promise<T>): Promise<T> => {
    const previous = writeQueues.get(key) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(task).finally(() => { if (writeQueues.get(key) === next) writeQueues.delete(key); });
    writeQueues.set(key, next); return next;
  };

  const persistWithConflictRecovery = async (key: string, value: string, scope: ModuleStateScope): Promise<string> => {
    const expectedRevision = revisions.get(key) ?? 0;
    try {
      const result = recordOf(await request({ action: 'put', key, value, scope, expectedRevision }));
      revisions.set(key, numberOf(result?.revision, expectedRevision + 1)); return value;
    } catch (error) {
      if (!/WM_STATE_CONFLICT|serialization|40001/i.test(errorMessage(error))) throw normalizeCloudError(error);
      const rows = await fetchRows(); const remote = rows.find((row) => row.state_key === key && row.scope === scope);
      const merged = remote ? mergeValues(remote.value, value) : value; const oldValue = memory.get(key) ?? null;
      memory.set(key, merged); if (merged !== oldValue) emitStorage(key, oldValue, merged);
      const result = recordOf(await request({ action: 'put', key, value: merged, scope, expectedRevision: remote?.revision ?? 0 }));
      revisions.set(key, numberOf(result?.revision, (remote?.revision ?? 0) + 1)); return merged;
    }
  };

  const commitRequestsWithActivity = async (key: string, value: string, event: ModuleActivityEventInput): Promise<unknown> => {
    if (moduleId !== 'fueltrack-plus' || key !== 'fueltrackplus.requests.v3') throw new Error('Atomic request/activity commit is not available for this state key.');
    const expectedRevision = revisions.get(key) ?? 0; dirty.add(key);
    try {
      const normalizedEvent = normalizeActivityEvent(event);
      const result = recordOf(await request({ action: 'commit:requests-activity', value, expectedRevision, event: normalizedEvent }));
      const oldValue = memory.get(key) ?? null; memory.set(key, value); scopes.set(key, 'shared'); revisions.set(key, numberOf(result?.revision, expectedRevision + 1));
      if (oldValue !== value) emitStorage(key, oldValue, value);
      if (result?.activity) { const item = normalizeActivityRow(result.activity); publishActivity([item, ...activityItems.filter((entry) => entry.id !== item.id)], true); activityReady = true; activityError = null; }
      lastError = null; clearPersistenceError(); return result;
    } catch (error) {
      const normalized = normalizeCloudError(error); lastError = normalized; showPersistenceError(normalized.message);
      if (/WM_STATE_CONFLICT/i.test(normalized.message)) { dirty.delete(key); try { applyRows(await fetchRows(), true); } catch { /* Best effort conflict refresh. */ } }
      throw normalized;
    } finally { dirty.delete(key); }
  };

  const store: EmbeddedModuleStore = {
    get length() { return memory.size; },
    key(index: number) { return [...memory.keys()][index] ?? null; },
    getItem(key: string) { return memory.get(String(key)) ?? null; },
    setItem(key: string, value: string) {
      key = String(key); value = String(value); const oldValue = memory.get(key) ?? null;
      memory.set(key, value); scopes.set(key, scopeFor(key)); dirty.add(key); if (oldValue !== value) emitStorage(key, oldValue, value);
      void enqueue(key, () => persistWithConflictRecovery(key, value, scopeFor(key)))
        .then(() => { dirty.delete(key); lastError = null; clearPersistenceError(); })
        .catch((error: unknown) => { dirty.delete(key); lastError = normalizeCloudError(error); showPersistenceError(lastError.message); window.dispatchEvent(new CustomEvent('wm:cloud-persistence-error', { detail: { key, error: lastError.message } })); });
    },
    async setItemAsync(key: string, value: string) {
      key = String(key); value = String(value); const oldValue = memory.get(key) ?? null; const scope = scopeFor(key); dirty.add(key);
      try { const committed = await enqueue(key, () => persistWithConflictRecovery(key, value, scope)); memory.set(key, committed); scopes.set(key, scope); dirty.delete(key); lastError = null; clearPersistenceError(); if (oldValue !== committed) emitStorage(key, oldValue, committed); return true; }
      catch (error) { dirty.delete(key); lastError = normalizeCloudError(error); showPersistenceError(lastError.message); throw lastError; }
    },
    removeItem(key: string) {
      key = String(key); const oldValue = memory.get(key) ?? null; const scope = scopes.get(key) ?? scopeFor(key); const expectedRevision = revisions.get(key) ?? 0;
      memory.delete(key); scopes.delete(key); dirty.add(key);
      void enqueue(key, async () => { await request({ action: 'delete', key, scope, expectedRevision }); })
        .then(() => { dirty.delete(key); revisions.delete(key); lastError = null; clearPersistenceError(); emitStorage(key, oldValue, null); })
        .catch(async (error: unknown) => { dirty.delete(key); lastError = normalizeCloudError(error); showPersistenceError(lastError.message); await refresh(); });
    },
    clear() { for (const key of [...memory.keys()]) store.removeItem(key); },
    async ready() { if (!hydrated) await hydrate(); if (refreshTimer === null) refreshTimer = window.setInterval(() => { void refresh(); }, 5000); return true; },
    refresh,
    async flush() { await Promise.allSettled([...writeQueues.values()]); if (lastError) throw lastError; return true; },
    commitWithActivity: (key, value, event) => enqueue(String(key), () => commitRequestsWithActivity(String(key), String(value), normalizeActivityEvent(event))),
    get directory() { return directory; },
    get lastError() { return lastError; },
    get mode() { return 'shared-cloud' as const; },
  };

  const attendance: EmbeddedModuleAttendance = Object.freeze({
    async commit(operation: 'clock-in' | 'clock-out', payload: Parameters<EmbeddedModuleAttendance['commit']>[1]) {
      if (moduleId !== 'time-tracker') throw new Error('Attendance transactions are only available to TimeTracker.');
      const result = recordOf(await request({
        action: 'attendance:commit', operation, recordId: payload.recordId ?? null,
        location: String(payload.location), department: String(payload.department),
        geo: recordOf(payload.geo) ?? {}, workNote: payload.workNote ?? null, attendancePolicy: recordOf(payload.attendancePolicy) ?? {},
      }));
      const key = 'timetracker.attendance.v1';
      if (result?.value != null) { const oldValue = memory.get(key) ?? null; const newValue = String(result.value); memory.set(key, newValue); scopes.set(key, 'shared'); revisions.set(key, numberOf(result.revision)); dirty.delete(key); lastError = null; clearPersistenceError(); if (oldValue !== newValue) emitStorage(key, oldValue, newValue); }
      return result;
    },
  });

  const locks: EmbeddedModuleLocks = Object.freeze({
    async acquire(lockKey: string, ttlMs = 30000) { const key = String(lockKey).trim(); if (key.length < 3) throw new Error('Operation lock key is required.'); const ttlSeconds = Math.max(3, Math.min(120, Math.ceil(Number(ttlMs || 30000) / 1000))); const token = await request({ action: 'lock:acquire', lockKey: key, ttlSeconds }); return token ? Object.freeze({ key, token: String(token) }) : null; },
    async release(lock: Parameters<EmbeddedModuleLocks['release']>[0]) { if (!lock?.key || !lock.token) return false; try { return Boolean(await request({ action: 'lock:release', lockKey: lock.key, token: lock.token })); } catch { return false; } },
  });

  const activity: EmbeddedModuleActivity = Object.freeze({
    async ready() { if (!activityReady) await refreshActivity(false); return true; },
    refresh: () => refreshActivity(true),
    loadOlder: () => loadOlderActivity(true),
    async append(event: ModuleActivityEventInput) { try { const result = normalizeActivityRow(await request({ action: 'activity:append', event: normalizeActivityEvent(event) })); publishActivity([result, ...activityItems.filter((item) => item.id !== result.id)], true); activityReady = true; activityError = null; return result; } catch (error) { activityError = normalizeCloudError(error); throw activityError; } },
    get items() { return activityItems; }, get hasMore() { return activityHasMore; }, get error() { return activityError; },
  });

  globalThis.WMModuleStore = store; globalThis.WMModuleAttendance = attendance; globalThis.WMModuleLocks = locks; globalThis.WMModuleActivity = activity;
  const onRefresh = (): void => { void refresh(); if (activityReady) void refreshActivity(true); };
  window.addEventListener('focus', onRefresh, { signal: abort.signal });
  window.addEventListener('online', onRefresh, { signal: abort.signal });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) onRefresh(); }, { signal: abort.signal });

  return Object.freeze({
    store,
    dispose() {
      if (disposed) return; disposed = true; abort.abort(); if (refreshTimer !== null) window.clearInterval(refreshTimer); refreshTimer = null;
      for (const [requestId, active] of pending) { window.clearTimeout(active.timer); active.reject(new Error('Embedded module disposed before the cloud request completed.')); pending.delete(requestId); }
      clearPersistenceError();
      if (globalThis.WMModuleStore === store) { globalThis.WMModuleStore = undefined; globalThis.WMModuleAttendance = undefined; globalThis.WMModuleLocks = undefined; globalThis.WMModuleActivity = undefined; }
    },
  });
}

declare global {
  var WMModuleStore: EmbeddedModuleStore | undefined;
  var WMModuleAttendance: EmbeddedModuleAttendance | undefined;
  var WMModuleLocks: EmbeddedModuleLocks | undefined;
  var WMModuleActivity: EmbeddedModuleActivity | undefined;
  var WMModuleDirectory: readonly ModuleDirectoryEntry[] | undefined;
  var WMModuleActivityItems: readonly ModuleActivityItem[] | undefined;
  var WMModuleActivityBootError: unknown;
}
