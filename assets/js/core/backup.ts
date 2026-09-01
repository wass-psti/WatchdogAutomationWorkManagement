import type { WorkManagementModuleDefinition } from '../../../src/types/modules.ts';
import { PLATFORM_VERSION } from './platform.ts';
import { auth } from './auth.ts';

export const BACKUP_FORMAT = 'work-management-backup' as const;
export const BACKUP_VERSION = 4 as const;
export const SUPPORTED_BACKUP_VERSIONS = Object.freeze([1, 2, 3, 4] as const);
export const MAX_BACKUP_BYTES = 25 * 1024 * 1024;

type BackupVersion = (typeof SUPPORTED_BACKUP_VERSIONS)[number];
type StorageScope = 'shared' | 'user';
type JsonObject = Record<string, unknown>;

type RestorePhase =
  | 'input-acquisition'
  | 'parsing'
  | 'structural-validation'
  | 'version-detection'
  | 'compatibility-migration'
  | 'restore-planning'
  | 'conflict-resolution'
  | 'local-persistence'
  | 'cloud-transaction'
  | 'cache-invalidation'
  | 'post-restore-verification'
  | 'complete';

export interface ModuleStateBackupRow {
  readonly state_key: string;
  readonly value: string;
  readonly scope: StorageScope;
  readonly revision?: number;
}

export interface FuelTrackActivityBackupEvent {
  readonly id: string;
  readonly sequence: number;
  readonly type: string;
  readonly title: string;
  readonly message: string;
  readonly requestId: string;
  readonly actorUserId: string | null;
  readonly actorEmail: string;
  readonly actor: string;
  readonly actorRole: string;
  readonly at: string;
  readonly payload: JsonObject;
}

export interface BoardBackupSnapshot {
  readonly board: JsonObject;
  readonly groups: readonly JsonObject[];
  readonly items: readonly JsonObject[];
  readonly members: readonly JsonObject[];
  readonly columns: readonly JsonObject[];
  readonly values: readonly JsonObject[];
  readonly preferences: JsonObject;
}

export interface WorkspaceBackupPayload {
  readonly format: typeof BACKUP_FORMAT;
  readonly backupVersion: BackupVersion;
  readonly platformVersion: string;
  readonly createdAt: string | null;
  readonly origin: string;
  readonly modules: readonly { readonly id: string; readonly version: string }[];
  readonly data: Readonly<Record<string, string>>;
  readonly moduleData: Readonly<Record<string, readonly ModuleStateBackupRow[]>>;
  readonly activityData: Readonly<Record<string, readonly FuelTrackActivityBackupEvent[]>>;
  readonly boardData: readonly BoardBackupSnapshot[];
  readonly rejectedCount: number;
  readonly entryCount: number;
  readonly migration: Readonly<{ readonly fromVersion: BackupVersion; readonly toVersion: typeof BACKUP_VERSION }>;
}

export interface RestorePlan {
  readonly phase: 'restore-planning';
  readonly shellEntries: readonly [string, string][];
  readonly moduleData: Readonly<Record<string, readonly ModuleStateBackupRow[]>>;
  readonly activityData: Readonly<Record<string, readonly FuelTrackActivityBackupEvent[]>>;
  readonly boardData: readonly BoardBackupSnapshot[];
  readonly skippedModules: readonly string[];
  readonly cloudEntryCount: number;
  readonly localEntryCount: number;
}

export interface RestoreOutcome {
  readonly restored: number;
  readonly localRestored: number;
  readonly cloudRestored: number;
  readonly boardRestored: number;
  readonly skippedModules: readonly string[];
  readonly phase: 'complete';
}

export class BackupValidationError extends Error {
  readonly phase: RestorePhase;
  readonly code: string;
  constructor(message: string, phase: RestorePhase, code = 'WM_BACKUP_INVALID') {
    super(message);
    this.name = 'BackupValidationError';
    this.phase = phase;
    this.code = code;
  }
}

const recordOf = (value: unknown): JsonObject => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {};
const stringOf = (value: unknown): string => typeof value === 'string' ? value : '';
const numberOf = (value: unknown, fallback = 0): number => { const n = Number(value); return Number.isFinite(n) ? n : fallback; };
const arrayOf = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const errorMessage = (error: unknown, fallback: string): string => error instanceof Error ? error.message : fallback;
const isUuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const SUPPORTED_BOARD_COLUMN_TYPES = new Set(['text','long_text','number','status','dropdown','date','people','checkbox','url','email','timeline']);

function shellKeys(): string[] {
  const keys: string[] = [];
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key?.startsWith('wm.platform.') && !key.startsWith('wm.platform.auth.') && !key.startsWith('wm.platform.identity.')) keys.push(key);
    }
  } catch { /* Storage can be unavailable in privacy/sandboxed contexts. */ }
  return keys;
}

function moduleForKey(key: string, modules: readonly WorkManagementModuleDefinition[]): WorkManagementModuleDefinition | null {
  return modules.find((module) => module.cloudStateKeys.includes(key) || module.cloudStatePrefixes.some((prefix) => key.startsWith(prefix))) ?? null;
}

function scopeFor(module: WorkManagementModuleDefinition | null, key: string): StorageScope {
  return module?.userStateKeys.includes(key) ? 'user' : 'shared';
}

function validModuleValue(module: WorkManagementModuleDefinition | null, key: string, value: unknown): value is string {
  if (typeof value !== 'string' || value.length > MAX_BACKUP_BYTES) return false;
  const rawKeys = new Set(module?.rawStorageKeys ?? []);
  if (rawKeys.has(key)) {
    const pattern = module?.rawStoragePatterns?.[key];
    if (!pattern) return true;
    try { return new RegExp(pattern, 'i').test(value); } catch { return false; }
  }
  try { JSON.parse(value); return true; } catch { return false; }
}

async function cloudList(moduleId: string): Promise<ModuleStateBackupRow[]> {
  const token = await auth.ensureAccessToken();
  if (!token) throw new Error('Your session expired. Sign in again.');
  const rows = await auth.request<unknown[]>('/rest/v1/rpc/list_module_state', {
    method: 'POST', headers: auth.headers(token), body: JSON.stringify({ p_module_id: moduleId }),
  });
  return arrayOf(rows).flatMap((raw) => {
    const row = recordOf(raw);
    const stateKey = stringOf(row.state_key);
    const value = stringOf(row.value);
    if (!stateKey || !value || !['shared', 'user'].includes(stringOf(row.scope))) return [];
    return [{ state_key: stateKey, value, scope: stringOf(row.scope) as StorageScope, revision: numberOf(row.revision, 0) }];
  });
}

function normalizeActivityEvent(raw: unknown): FuelTrackActivityBackupEvent | null {
  const row = recordOf(raw);
  const id = stringOf(row.event_id) || stringOf(row.id);
  const title = stringOf(row.title);
  const message = stringOf(row.message);
  if (!id || id.length > 240 || !title || title.length > 240 || message.length > 4000) return null;
  return {
    id,
    sequence: numberOf(row.sequence, 0),
    type: stringOf(row.event_type) || stringOf(row.type) || 'system',
    title,
    message,
    requestId: stringOf(row.request_id) || stringOf(row.requestId),
    actorUserId: stringOf(row.actor_user_id) || stringOf(row.actorUserId) || null,
    actorEmail: stringOf(row.actor_email) || stringOf(row.actorEmail),
    actor: stringOf(row.actor_name) || stringOf(row.actor) || 'Unknown user',
    actorRole: stringOf(row.actor_role) || stringOf(row.actorRole),
    at: stringOf(row.occurred_at) || stringOf(row.at),
    payload: recordOf(row.payload),
  };
}

async function cloudActivityList(moduleId: string): Promise<FuelTrackActivityBackupEvent[]> {
  if (moduleId !== 'fueltrack-plus') return [];
  const token = await auth.ensureAccessToken();
  if (!token) throw new Error('Your session expired. Sign in again.');
  const rows = await auth.request<unknown[]>('/rest/v1/rpc/list_module_activity', {
    method: 'POST', headers: auth.headers(token), body: JSON.stringify({ p_module_id: moduleId, p_before_sequence: null, p_limit: 2000 }),
  });
  return arrayOf(rows).map(normalizeActivityEvent).filter((event): event is FuelTrackActivityBackupEvent => event !== null);
}

function validateStatusColumn(column: JsonObject): Set<string> {
  if (stringOf(column.data_type) !== 'status') return new Set<string>();
  const config = recordOf(column.config);
  const labels = arrayOf(config.labels);
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const raw of labels) {
    const label = recordOf(raw);
    const id = stringOf(label.id);
    const name = stringOf(label.name).trim().toLowerCase();
    if (!id || !name || ids.has(id) || names.has(name)) throw new BackupValidationError('A board Status column contains duplicate or invalid labels.', 'structural-validation', 'WM_BACKUP_STATUS_LABEL_INVALID');
    ids.add(id); names.add(name);
  }
  if (!ids.size) throw new BackupValidationError('A board Status column does not contain any valid labels.', 'structural-validation', 'WM_BACKUP_STATUS_LABEL_EMPTY');
  const defaultId = stringOf(config.default_label_id);
  if (defaultId && !ids.has(defaultId)) throw new BackupValidationError('A board Status column references an invalid default label.', 'structural-validation', 'WM_BACKUP_STATUS_DEFAULT_INVALID');
  return ids;
}

export function validateBoardSnapshot(input: unknown): BoardBackupSnapshot {
  const source = recordOf(input);
  const board = recordOf(source.board);
  const boardId = stringOf(board.id);
  const boardName = stringOf(board.name).trim();
  const boardStatus = stringOf(board.status) || 'active';
  if (!isUuid(boardId)) throw new BackupValidationError('A board backup contains an invalid board identifier.', 'structural-validation', 'WM_BACKUP_BOARD_ID_INVALID');
  if (!boardName || boardName.length > 160 || !['active','archived','trashed'].includes(boardStatus)) throw new BackupValidationError('A board backup contains invalid board metadata.', 'structural-validation', 'WM_BACKUP_BOARD_METADATA_INVALID');

  const groups = arrayOf(source.groups).map(recordOf);
  const items = arrayOf(source.items).map(recordOf);
  const members = arrayOf(source.members).map(recordOf);
  const columns = arrayOf(source.columns).map(recordOf);
  const values = arrayOf(source.values).map(recordOf);
  const preferences = recordOf(source.preferences);

  const groupIds = new Set<string>();
  for (const group of groups) {
    const id = stringOf(group.id);
    if (!isUuid(id) || groupIds.has(id) || stringOf(group.board_id) !== boardId) throw new BackupValidationError('A board backup contains a duplicate, invalid, or orphaned group.', 'structural-validation', 'WM_BACKUP_GROUP_INTEGRITY');
    groupIds.add(id);
  }

  const memberIds = new Set<string>();
  const memberEmails = new Set<string>();
  for (const member of members) {
    const userId = stringOf(member.user_id);
    const email = stringOf(member.email).trim().toLowerCase();
    const role = stringOf(member.role);
    if (!isUuid(userId) || memberIds.has(userId) || !email || memberEmails.has(email) || !['owner', 'editor', 'viewer'].includes(role)) throw new BackupValidationError('A board backup contains an invalid or duplicate member reference.', 'structural-validation', 'WM_BACKUP_MEMBER_INTEGRITY');
    memberIds.add(userId); memberEmails.add(email);
  }

  const columnIds = new Set<string>();
  const statusLabelsByColumn = new Map<string, Set<string>>();
  const columnTypes = new Map<string, string>();
  let systemStatusColumnId = '';
  let systemStatusColumnCount = 0;
  for (const column of columns) {
    const id = stringOf(column.id);
    const dataType = stringOf(column.data_type);
    if (!isUuid(id) || columnIds.has(id) || stringOf(column.board_id) !== boardId || !SUPPORTED_BOARD_COLUMN_TYPES.has(dataType)) throw new BackupValidationError('A board backup contains a duplicate, invalid, orphaned, or unsupported column.', 'structural-validation', 'WM_BACKUP_COLUMN_INTEGRITY');
    columnIds.add(id); columnTypes.set(id, dataType);
    const labels = validateStatusColumn(column);
    if (labels.size) statusLabelsByColumn.set(id, labels);
    if (stringOf(column.system_key) === 'status') {
      if (dataType !== 'status') throw new BackupValidationError('The system Status column must use the status data type.', 'structural-validation', 'WM_BACKUP_SYSTEM_STATUS_INVALID');
      systemStatusColumnId = id; systemStatusColumnCount += 1;
    }
  }
  if (systemStatusColumnCount > 1) throw new BackupValidationError('A board backup contains more than one system Status column.', 'structural-validation', 'WM_BACKUP_SYSTEM_STATUS_DUPLICATE');

  const itemIds = new Set<string>();
  for (const item of items) {
    const id = stringOf(item.id);
    const groupId = stringOf(item.group_id);
    if (!isUuid(id) || itemIds.has(id) || stringOf(item.board_id) !== boardId || !groupIds.has(groupId)) throw new BackupValidationError('A board backup contains a duplicate or orphaned item.', 'structural-validation', 'WM_BACKUP_ITEM_INTEGRITY');
    const assigneeId = stringOf(item.assignee_id);
    if (assigneeId && !memberIds.has(assigneeId)) throw new BackupValidationError('A board item references an assignee who is not a board member.', 'structural-validation', 'WM_BACKUP_ASSIGNEE_ORPHAN');
    const status = stringOf(item.status);
    if (status && !systemStatusColumnId) throw new BackupValidationError('A board item contains a Status value but the system Status column is missing.', 'structural-validation', 'WM_BACKUP_STATUS_COLUMN_MISSING');
    if (status && systemStatusColumnId && !statusLabelsByColumn.get(systemStatusColumnId)?.has(status)) throw new BackupValidationError('A board item references a Status label that does not exist.', 'structural-validation', 'WM_BACKUP_STATUS_ORPHAN');
    itemIds.add(id);
  }

  const valueKeys = new Set<string>();
  for (const value of values) {
    const itemId = stringOf(value.item_id);
    const columnId = stringOf(value.column_id);
    const key = `${itemId}:${columnId}`;
    if (!itemIds.has(itemId) || !columnIds.has(columnId) || valueKeys.has(key)) throw new BackupValidationError('A board cell value references an unknown item/column or is duplicated.', 'structural-validation', 'WM_BACKUP_CELL_INTEGRITY');
    const allowedStatuses = statusLabelsByColumn.get(columnId);
    const statusValue = stringOf(value.value);
    if (allowedStatuses && statusValue && !allowedStatuses.has(statusValue)) throw new BackupValidationError('A board cell references a Status label that does not exist.', 'structural-validation', 'WM_BACKUP_CELL_STATUS_ORPHAN');
    if (columnTypes.get(columnId) === 'people' && statusValue && !memberIds.has(statusValue)) throw new BackupValidationError('A People column references a user who is not a board member.', 'structural-validation', 'WM_BACKUP_CELL_PEOPLE_ORPHAN');
    valueKeys.add(key);
  }

  return Object.freeze({ board, groups, items, members, columns, values, preferences });
}

async function exportBoards(): Promise<BoardBackupSnapshot[]> {
  const token = await auth.ensureAccessToken();
  if (!token) throw new Error('Your session expired. Sign in again.');
  const ids = new Set<string>();
  for (const status of ['active', 'archived', 'trashed'] as const) {
    const rows = await auth.request<unknown[]>('/rest/v1/rpc/wm_list_boards', {
      method: 'POST', headers: auth.headers(token), body: JSON.stringify({ p_status: status }),
    });
    for (const raw of arrayOf(rows)) {
      const id = stringOf(recordOf(raw).id);
      if (isUuid(id)) ids.add(id);
    }
  }
  const snapshots: BoardBackupSnapshot[] = [];
  for (const id of ids) {
    const [envelopeRaw, preferencesRaw] = await Promise.all([
      auth.request<unknown>('/rest/v1/rpc/wm_get_board', { method: 'POST', headers: auth.headers(token), body: JSON.stringify({ p_board_id: id }) }),
      auth.request<unknown>('/rest/v1/rpc/wm_get_board_preferences', { method: 'POST', headers: auth.headers(token), body: JSON.stringify({ p_board_id: id }) }).catch(() => ({})),
    ]);
    snapshots.push(validateBoardSnapshot({ ...recordOf(envelopeRaw), preferences: recordOf(preferencesRaw) }));
  }
  return snapshots;
}

export async function createWorkspaceBackup(modules: readonly WorkManagementModuleDefinition[]): Promise<WorkspaceBackupPayload> {
  if (!auth.isAuthenticated) throw new Error('Sign in before exporting an authenticated workspace backup.');
  const data: Record<string, string> = {};
  for (const key of shellKeys()) {
    const value = localStorage.getItem(key);
    if (value != null) data[key] = value;
  }

  const moduleData: Record<string, ModuleStateBackupRow[]> = {};
  const activityData: Record<string, FuelTrackActivityBackupEvent[]> = {};
  for (const module of modules.filter((entry) => entry.status === 'active' && auth.canAccessModule(entry.id))) {
    moduleData[module.id] = await cloudList(module.id);
    if (module.id === 'fueltrack-plus') activityData[module.id] = await cloudActivityList(module.id).catch(() => []);
  }
  const boardData = await exportBoards();
  const entryCount = Object.keys(data).length
    + Object.values(moduleData).reduce((count, rows) => count + rows.length, 0)
    + Object.values(activityData).reduce((count, rows) => count + rows.length, 0)
    + boardData.length;

  return Object.freeze({
    format: BACKUP_FORMAT,
    backupVersion: BACKUP_VERSION,
    platformVersion: String(PLATFORM_VERSION),
    createdAt: new Date().toISOString(),
    origin: location.origin,
    modules: modules.map(({ id, version }) => ({ id, version })),
    data,
    moduleData,
    activityData,
    boardData,
    rejectedCount: 0,
    entryCount,
    migration: { fromVersion: BACKUP_VERSION, toVersion: BACKUP_VERSION },
  });
}

export async function downloadWorkspaceBackup(modules: readonly WorkManagementModuleDefinition[]): Promise<number> {
  const payload = await createWorkspaceBackup(modules);
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `work-management-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  return payload.entryCount;
}

interface MutableNormalizedBackup {
  format: typeof BACKUP_FORMAT;
  backupVersion: BackupVersion;
  platformVersion: string;
  createdAt: string | null;
  origin: string;
  modules: { id: string; version: string }[];
  data: Record<string, unknown>;
  moduleData: Record<string, unknown>;
  activityData: Record<string, unknown>;
  boardData: unknown[];
}

type BackupMigration = (payload: MutableNormalizedBackup) => MutableNormalizedBackup;

const migrations: Readonly<Record<1 | 2 | 3, BackupMigration>> = Object.freeze({
  1: (payload) => ({ ...payload, backupVersion: 2 }),
  2: (payload) => ({ ...payload, backupVersion: 3, activityData: payload.activityData ?? {} }),
  3: (payload) => ({ ...payload, backupVersion: 4, boardData: payload.boardData ?? [] }),
});

function normalizeBackupRoot(input: unknown): MutableNormalizedBackup {
  const root = recordOf(input);
  if (root.format !== BACKUP_FORMAT) throw new BackupValidationError('This file is not a Work Management backup.', 'structural-validation', 'WM_BACKUP_FORMAT_UNSUPPORTED');
  const version = numberOf(root.backupVersion, 0);
  if (!SUPPORTED_BACKUP_VERSIONS.includes(version as BackupVersion)) throw new BackupValidationError(`Backup version ${version || 'unknown'} is not supported.`, 'version-detection', 'WM_BACKUP_VERSION_UNSUPPORTED');
  return {
    format: BACKUP_FORMAT,
    backupVersion: version as BackupVersion,
    platformVersion: stringOf(root.platformVersion),
    createdAt: Number.isFinite(Date.parse(stringOf(root.createdAt))) ? new Date(stringOf(root.createdAt)).toISOString() : null,
    origin: stringOf(root.origin),
    modules: arrayOf(root.modules).flatMap((entry) => { const item = recordOf(entry); const id = stringOf(item.id); return id ? [{ id, version: stringOf(item.version) }] : []; }),
    data: recordOf(root.data),
    moduleData: recordOf(root.moduleData),
    activityData: recordOf(root.activityData),
    boardData: arrayOf(root.boardData),
  };
}

function migrateBackup(payload: MutableNormalizedBackup): MutableNormalizedBackup {
  let current = payload;
  const seen = new Set<number>();
  while (current.backupVersion !== BACKUP_VERSION) {
    if (seen.has(current.backupVersion)) throw new BackupValidationError('Backup migration entered an invalid cycle.', 'compatibility-migration', 'WM_BACKUP_MIGRATION_CYCLE');
    seen.add(current.backupVersion);
    const migration = migrations[current.backupVersion as 1 | 2 | 3];
    if (!migration) throw new BackupValidationError(`No migration path exists for backup version ${current.backupVersion}.`, 'compatibility-migration', 'WM_BACKUP_MIGRATION_MISSING');
    current = migration(current);
  }
  return current;
}

export function parseBackupObject(input: unknown, modules: readonly WorkManagementModuleDefinition[]): WorkspaceBackupPayload {
  const initial = normalizeBackupRoot(input);
  const fromVersion = initial.backupVersion;
  const payload = migrateBackup(initial);
  const shellData: Record<string, string> = {};
  const moduleData: Record<string, ModuleStateBackupRow[]> = {};
  const activityData: Record<string, FuelTrackActivityBackupEvent[]> = {};
  const boardData: BoardBackupSnapshot[] = [];
  const moduleStateKeys = new Set<string>();
  let rejectedCount = 0;
  const addModuleState = (moduleId: string, row: ModuleStateBackupRow): void => {
    const identity = `${moduleId}:${row.scope}:${row.state_key}`;
    if (moduleStateKeys.has(identity)) throw new BackupValidationError(`The backup contains conflicting state for ${row.state_key}.`, 'conflict-resolution', 'WM_BACKUP_MODULE_STATE_CONFLICT');
    moduleStateKeys.add(identity);
    (moduleData[moduleId] ??= []).push(row);
  };

  for (const [key, rawValue] of Object.entries(payload.data)) {
    const value = stringOf(rawValue);
    if (key.startsWith('wm.platform.') && !key.startsWith('wm.platform.auth.') && !key.startsWith('wm.platform.identity.')) {
      try { JSON.parse(value); shellData[key] = value; } catch { rejectedCount += 1; }
      continue;
    }
    const module = moduleForKey(key, modules);
    if (module?.id === 'fueltrack-plus' && key === 'fueltrackplus.activity.v3') {
      try {
        const parsed: unknown = JSON.parse(value);
        if (!Array.isArray(parsed)) rejectedCount += 1;
        else for (const event of parsed) { const normalized = normalizeActivityEvent(event); if (normalized) (activityData['fueltrack-plus'] ??= []).push(normalized); else rejectedCount += 1; }
      } catch { rejectedCount += 1; }
    } else if (module && validModuleValue(module, key, value)) {
      addModuleState(module.id, { state_key: key, value, scope: scopeFor(module, key) });
    } else rejectedCount += 1;
  }

  for (const [moduleId, rawRows] of Object.entries(payload.moduleData)) {
    const module = modules.find((entry) => entry.id === moduleId);
    if (!module || !Array.isArray(rawRows)) { rejectedCount += 1; continue; }
    for (const raw of rawRows) {
      const row = recordOf(raw);
      const key = stringOf(row.state_key);
      const value = stringOf(row.value);
      if (moduleId === 'fueltrack-plus' && key === 'fueltrackplus.activity.v3') {
        try {
          const events: unknown = JSON.parse(value);
          if (!Array.isArray(events)) rejectedCount += 1;
          else for (const event of events) { const normalized = normalizeActivityEvent(event); if (normalized) (activityData[moduleId] ??= []).push(normalized); else rejectedCount += 1; }
        } catch { rejectedCount += 1; }
      } else if (moduleForKey(key, modules)?.id === moduleId && validModuleValue(module, key, value)) {
        addModuleState(moduleId, { state_key: key, value, scope: stringOf(row.scope) === 'user' ? 'user' : 'shared' });
      } else rejectedCount += 1;
    }
  }

  for (const [moduleId, rawEvents] of Object.entries(payload.activityData)) {
    if (moduleId !== 'fueltrack-plus' || !Array.isArray(rawEvents)) { rejectedCount += 1; continue; }
    for (const event of rawEvents) { const normalized = normalizeActivityEvent(event); if (normalized) (activityData[moduleId] ??= []).push(normalized); else rejectedCount += 1; }
  }

  for (const [moduleId, events] of Object.entries(activityData)) {
    activityData[moduleId] = [...new Map(events.map((event) => [event.id, event])).values()];
  }

  const boardIds = new Set<string>();
  for (const rawBoard of payload.boardData) {
    const snapshot = validateBoardSnapshot(rawBoard);
    const id = stringOf(snapshot.board.id);
    if (boardIds.has(id)) throw new BackupValidationError('The backup contains the same board identifier more than once.', 'structural-validation', 'WM_BACKUP_BOARD_DUPLICATE');
    boardIds.add(id);
    boardData.push(snapshot);
  }

  const entryCount = Object.keys(shellData).length
    + Object.values(moduleData).reduce((count, rows) => count + rows.length, 0)
    + Object.values(activityData).reduce((count, rows) => count + rows.length, 0)
    + boardData.length;
  if (!entryCount) throw new BackupValidationError('The backup does not contain valid restorable data.', 'structural-validation', 'WM_BACKUP_EMPTY');

  return Object.freeze({
    format: BACKUP_FORMAT,
    backupVersion: BACKUP_VERSION,
    platformVersion: payload.platformVersion,
    createdAt: payload.createdAt,
    origin: payload.origin,
    modules: payload.modules,
    data: shellData,
    moduleData,
    activityData,
    boardData,
    rejectedCount,
    entryCount,
    migration: { fromVersion, toVersion: BACKUP_VERSION },
  });
}

export async function parseBackupFile(file: File, modules: readonly WorkManagementModuleDefinition[]): Promise<WorkspaceBackupPayload> {
  if (!(file instanceof File) || file.size <= 0 || file.size > MAX_BACKUP_BYTES) throw new BackupValidationError('Backup file is missing, empty, or exceeds the 25 MB safety limit.', 'input-acquisition', 'WM_BACKUP_FILE_INVALID');
  let parsed: unknown;
  try { parsed = JSON.parse(await file.text()); }
  catch { throw new BackupValidationError('The selected file is not valid JSON.', 'parsing', 'WM_BACKUP_JSON_INVALID'); }
  return parseBackupObject(parsed, modules);
}

export function createRestorePlan(payload: WorkspaceBackupPayload): RestorePlan {
  const skippedModules: string[] = [];
  const moduleData: Record<string, readonly ModuleStateBackupRow[]> = {};
  const activityData: Record<string, readonly FuelTrackActivityBackupEvent[]> = {};
  for (const [moduleId, rows] of Object.entries(payload.moduleData)) {
    if (!auth.canAccessModule(moduleId)) { skippedModules.push(moduleId); continue; }
    moduleData[moduleId] = rows;
  }
  for (const [moduleId, events] of Object.entries(payload.activityData)) {
    if (!auth.canAccessModule(moduleId)) { if (!skippedModules.includes(moduleId)) skippedModules.push(moduleId); continue; }
    activityData[moduleId] = events;
  }
  const shellEntries = Object.entries(payload.data);
  return Object.freeze({
    phase: 'restore-planning',
    shellEntries,
    moduleData,
    activityData,
    boardData: payload.boardData,
    skippedModules,
    localEntryCount: shellEntries.length,
    cloudEntryCount: Object.values(moduleData).reduce((count, rows) => count + rows.length, 0)
      + Object.values(activityData).reduce((count, rows) => count + rows.length, 0)
      + payload.boardData.length,
  });
}

async function commitCloudRestore(plan: RestorePlan): Promise<{ restored: number; boards: number }> {
  const token = await auth.ensureAccessToken();
  if (!token) throw new Error('Your session expired. Sign in again.');
  const result = await auth.request<unknown>('/rest/v1/rpc/wm_restore_workspace_backup_v4', {
    method: 'POST',
    headers: auth.headers(token),
    body: JSON.stringify({ p_module_data: plan.moduleData, p_activity_data: plan.activityData, p_boards: plan.boardData }),
  });
  const record = recordOf(result);
  if (record.verified !== true) throw new Error('The restore transaction completed without a positive verification result.');
  const restored = numberOf(record.restored, -1);
  const boards = numberOf(record.boards, -1);
  if (restored < 0 || boards !== plan.boardData.length) throw new Error('The restore transaction returned inconsistent verification counts.');
  return { restored, boards };
}

function invalidateRestoredState(payload: WorkspaceBackupPayload): void {
  window.dispatchEvent(new CustomEvent('wm:backup-restored', { detail: { backupVersion: payload.backupVersion, entryCount: payload.entryCount } }));
  window.dispatchEvent(new CustomEvent('wm:module-store-invalidate', { detail: { reason: 'backup-restore' } }));
}

export async function restoreWorkspaceBackup(payload: WorkspaceBackupPayload): Promise<RestoreOutcome> {
  if (!auth.isAuthenticated) throw new Error('Sign in before restoring an authenticated workspace backup.');
  const plan = createRestorePlan(payload);
  const previous = new Map<string, string | null>();
  const written: string[] = [];
  try {
    for (const [key, value] of plan.shellEntries) {
      previous.set(key, localStorage.getItem(key));
      localStorage.setItem(key, value);
      written.push(key);
    }
    const cloud = await commitCloudRestore(plan);
    invalidateRestoredState(payload);
    return Object.freeze({
      restored: written.length + cloud.restored,
      localRestored: written.length,
      cloudRestored: cloud.restored,
      boardRestored: cloud.boards,
      skippedModules: plan.skippedModules,
      phase: 'complete',
    });
  } catch (error) {
    for (const key of written.reverse()) {
      const value = previous.get(key);
      try { value == null ? localStorage.removeItem(key) : localStorage.setItem(key, value); } catch { /* Best-effort local rollback. */ }
    }
    throw new Error(`Restore failed: ${errorMessage(error, 'cloud transaction error')}`);
  }
}
