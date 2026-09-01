import type { BoardRole } from '../../../../../src/types/auth.ts';
import type {
  BoardColumnId,
  BoardGroupId,
  BoardId,
  BoardItemId,
  StatusLabelId,
  UserId,
} from '../../../../../src/types/identifiers.ts';
import type {
  BoardCellValue,
  BoardColumn,
  BoardColumnType,
  BoardEnvelope,
  BoardEvent,
  BoardGroup,
  BoardItem,
  BoardLifecycleStatus,
  BoardMember,
  BoardPreferences,
  BoardRecord,
  BoardValueRecord,
  BoardViewMode,
  ItemActivityEvent,
  ItemWorkspaceEnvelope,
  ItemWorkspaceFile,
  ItemWorkspaceUpdate,
  TimelineValue,
} from '../../../../../src/features/boards/contracts/domain.ts';
import { statusConfig } from '../status-labels.ts';
import { parseStatusColumnConfig } from '../../../../../src/features/boards/contracts/status-schema.ts';

type UnknownRecord = Record<string, unknown>;

export const recordOf = (value: unknown): UnknownRecord | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : null;

export function boardScalar<T>(value: T | readonly T[] | null | undefined): T | null {
  if (Array.isArray(value)) return (value as readonly T[])[0] ?? null;
  if (value === null || value === undefined) return null;
  return value as T;
}

export function boardArray<T>(value: T | readonly T[] | null | undefined): readonly T[] {
  return Array.isArray(value) ? value : [];
}

const requiredString = (record: UnknownRecord, key: string, operation: string): string => {
  const value = typeof record[key] === 'string' ? record[key].trim() : '';
  if (!value) throw new TypeError(`Invalid ${key} in ${operation}.`);
  return value;
};

const requiredScalarString = (record: UnknownRecord, key: string, operation: string): string => {
  const raw = record[key];
  const value = typeof raw === 'string' || typeof raw === 'number' ? String(raw).trim() : '';
  if (!value) throw new TypeError(`Invalid ${key} in ${operation}.`);
  return value;
};

const optionalString = (record: UnknownRecord, key: string): string | null => {
  const value = record[key];
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') throw new TypeError(`Invalid ${key}: expected a string or null.`);
  return value;
};

const numberValue = (record: UnknownRecord, key: string, fallback = 0): number => {
  const raw = record[key];
  if (raw === null || raw === undefined || raw === '') return fallback;
  if (typeof raw !== 'number' && typeof raw !== 'string') throw new TypeError(`Invalid ${key}: expected a number.`);
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new TypeError(`Invalid ${key}: expected a finite number.`);
  return value;
};

const objectValue = (value: unknown, label = 'object'): Readonly<Record<string, unknown>> => {
  if (value === null || value === undefined) return Object.freeze({});
  const record = recordOf(value);
  if (!record) throw new TypeError(`Invalid ${label}: expected an object.`);
  return record;
};

const lifecycle = (value: unknown): BoardLifecycleStatus => {
  if (value === null || value === undefined || value === '') return 'active';
  if (value === 'active' || value === 'archived' || value === 'trashed') return value;
  throw new TypeError(`Unsupported Board lifecycle status: ${String(value)}.`);
};

const viewMode = (value: unknown): BoardViewMode => {
  if (value === null || value === undefined || value === '') return 'table';
  if (value === 'table' || value === 'kanban') return value;
  throw new TypeError(`Unsupported Board view mode: ${String(value)}.`);
};
const boardRole = (value: unknown): BoardRole => {
  if (value === 'owner' || value === 'editor' || value === 'viewer') return value;
  throw new TypeError(`Unsupported Board member role: ${String(value || '(empty)')}.`);
};

const columnType = (value: unknown): BoardColumnType => {
  const type = String(value || '');
  switch (type) {
    case 'text': case 'long_text': case 'number': case 'status': case 'dropdown': case 'date':
    case 'people': case 'checkbox': case 'timeline': case 'email': case 'url': return type;
    default: throw new TypeError(`Unsupported Board column type: ${type || '(empty)'}.`);
  }
};

const stringArray = (value: unknown): readonly string[] => {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) throw new TypeError('Invalid Board string-array configuration.');
  return value.map((entry) => entry.trim()).filter(Boolean);
};

export function mapBoardRecord(value: unknown, operation = 'board.record'): BoardRecord {
  const record = recordOf(value);
  if (!record) throw new TypeError(`Invalid board record for ${operation}.`);
  const id = requiredString(record, 'id', operation) as BoardId;
  const rawView = record.view_mode ?? record.view;
  return {
    ...record,
    id,
    name: String(record.name ?? '').trim(),
    description: String(record.description ?? ''),
    status: lifecycle(record.status),
    view: viewMode(rawView),
    view_mode: viewMode(rawView),
    ...(record.member_role ? { member_role: boardRole(record.member_role) } : {}),
    ...(record.owner_id ? { owner_id: requiredString(record, 'owner_id', operation) as UserId } : {}),
    ...(record.item_count == null ? {} : { item_count: numberValue(record, 'item_count') }),
    ...(optionalString(record, 'created_at') ? { created_at: optionalString(record, 'created_at') as string } : {}),
    ...(optionalString(record, 'updated_at') ? { updated_at: optionalString(record, 'updated_at') as string } : {}),
  };
}

export function mapBoardGroup(value: unknown): BoardGroup {
  const record = recordOf(value);
  if (!record) throw new TypeError('Invalid Board group response.');
  return {
    ...record,
    id: requiredString(record, 'id', 'board.group') as BoardGroupId,
    board_id: requiredString(record, 'board_id', 'board.group') as BoardId,
    title: String(record.title ?? '').trim(),
    position: numberValue(record, 'position'),
    accent_color: optionalString(record, 'accent_color'),
  };
}

export function mapBoardItem(value: unknown): BoardItem {
  const record = recordOf(value);
  if (!record) throw new TypeError('Invalid Board item response.');
  const status = optionalString(record, 'status');
  return {
    ...record,
    id: requiredString(record, 'id', 'board.item') as BoardItemId,
    board_id: requiredString(record, 'board_id', 'board.item') as BoardId,
    group_id: requiredString(record, 'group_id', 'board.item') as BoardGroupId,
    title: String(record.title ?? '').trim(),
    position: numberValue(record, 'position'),
    status: status as StatusLabelId | null,
    assignee_id: optionalString(record, 'assignee_id') as UserId | null,
    due_date: optionalString(record, 'due_date'),
    notes: String(record.notes ?? ''),
    archived: Boolean(record.archived ?? record.archived_at),
    archived_at: optionalString(record, 'archived_at'),
  };
}

function mapColumnBase(record: UnknownRecord, type: BoardColumnType) {
  return {
    ...record,
    id: requiredString(record, 'id', 'board.column') as BoardColumnId,
    board_id: requiredString(record, 'board_id', 'board.column') as BoardId,
    name: String(record.name ?? '').trim(),
    data_type: type,
    position: numberValue(record, 'position'),
    visible: record.visible !== false,
    required: Boolean(record.required),
    system_key: optionalString(record, 'system_key'),
    column_key: optionalString(record, 'column_key'),
  };
}

export function mapBoardColumn(value: unknown): BoardColumn {
  const record = recordOf(value);
  if (!record) throw new TypeError('Invalid Board column response.');
  const type = columnType(record.data_type);
  const base = mapColumnBase(record, type);
  const rawConfig = objectValue(record.config, 'Board column config');
  switch (type) {
    case 'status': {
      // New-format Status payloads are authoritative typed data and must pass the
      // strict runtime schema unchanged. Only the historical `options` shape is
      // normalized for backwards compatibility before entering the typed model.
      if ('labels' in rawConfig) {
        const strict = parseStatusColumnConfig(rawConfig);
        return { ...base, data_type: 'status', config: strict };
      }
      const legacy = statusConfig({ ...record, config: rawConfig });
      const migrated = parseStatusColumnConfig({ labels: legacy.labels, default_label_id: legacy.defaultLabelId });
      return { ...base, data_type: 'status', config: migrated };
    }
    case 'dropdown': return { ...base, data_type: 'dropdown', config: { ...rawConfig, options: stringArray(rawConfig.options) } };
    case 'text': return { ...base, data_type: 'text', config: rawConfig };
    case 'long_text': return { ...base, data_type: 'long_text', config: rawConfig };
    case 'number': return { ...base, data_type: 'number', config: rawConfig };
    case 'date': return { ...base, data_type: 'date', config: rawConfig };
    case 'people': return { ...base, data_type: 'people', config: rawConfig };
    case 'checkbox': return { ...base, data_type: 'checkbox', config: rawConfig };
    case 'timeline': return { ...base, data_type: 'timeline', config: rawConfig };
    case 'email': return { ...base, data_type: 'email', config: rawConfig };
    case 'url': return { ...base, data_type: 'url', config: rawConfig };
  }
}

function mapCellValue(value: unknown): BoardCellValue {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    if (value.some((entry) => typeof entry !== 'string')) throw new TypeError('Invalid Board array cell value returned by the backend.');
    return value;
  }
  const record = recordOf(value);
  if (record && ('start' in record || 'end' in record)) {
    const timeline: TimelineValue = {
      start: optionalString(record, 'start'),
      end: optionalString(record, 'end'),
    };
    return timeline;
  }
  throw new TypeError('Invalid Board cell value returned by the backend.');
}

export function mapBoardValue(value: unknown): BoardValueRecord {
  const record = recordOf(value);
  if (!record) throw new TypeError('Invalid Board cell response.');
  return {
    ...record,
    item_id: requiredString(record, 'item_id', 'board.value') as BoardItemId,
    column_id: requiredString(record, 'column_id', 'board.value') as BoardColumnId,
    value: mapCellValue(record.value),
  };
}

export function mapBoardMember(value: unknown): BoardMember {
  const record = recordOf(value);
  if (!record) throw new TypeError('Invalid Board member response.');
  return {
    ...record,
    user_id: requiredString(record, 'user_id', 'board.member') as UserId,
    role: boardRole(record.role),
    email: optionalString(record, 'email'),
    display_name: optionalString(record, 'display_name'),
  };
}


function assertUniqueIds(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) throw new TypeError(`Duplicate ${label} identifiers were returned by the backend.`);
}

function validateBoardEnvelopeIntegrity(envelope: BoardEnvelope, operation: string): BoardEnvelope {
  const board = envelope.board;
  if (!board) {
    if (envelope.groups.length || envelope.items.length || envelope.columns.length || envelope.values.length || envelope.members.length) {
      throw new TypeError(`Board collections were returned without a Board record for ${operation}.`);
    }
    return envelope;
  }

  assertUniqueIds(envelope.groups.map((group) => group.id), 'Board group');
  assertUniqueIds(envelope.items.map((item) => item.id), 'Board item');
  assertUniqueIds(envelope.columns.map((column) => column.id), 'Board column');
  assertUniqueIds(envelope.members.map((member) => member.user_id), 'Board member');

  const groupIds = new Set(envelope.groups.map((group) => group.id));
  const itemIds = new Set(envelope.items.map((item) => item.id));
  const columnIds = new Set(envelope.columns.map((column) => column.id));
  const valueKeys = envelope.values.map((value) => `${value.item_id}:${value.column_id}`);
  assertUniqueIds(valueKeys, 'Board cell');

  for (const group of envelope.groups) if (group.board_id !== board.id) throw new TypeError('Board group belongs to a different Board.');
  for (const column of envelope.columns) if (column.board_id !== board.id) throw new TypeError('Board column belongs to a different Board.');
  for (const item of envelope.items) {
    if (item.board_id !== board.id) throw new TypeError('Board item belongs to a different Board.');
    if (!groupIds.has(item.group_id)) throw new TypeError('Board item references an unknown group.');
  }
  for (const value of envelope.values) {
    if (!itemIds.has(value.item_id)) throw new TypeError('Board cell references an unknown item.');
    if (!columnIds.has(value.column_id)) throw new TypeError('Board cell references an unknown column.');
  }

  const statusColumns = envelope.columns.filter((column) => column.data_type === 'status');
  for (const column of statusColumns) {
    assertUniqueIds(column.config.labels.map((label) => label.id), 'Status label');
    if (column.config.default_label_id !== null && !column.config.labels.some((label) => label.id === column.config.default_label_id && label.active)) {
      throw new TypeError('Status column default references an unknown or inactive label.');
    }
  }
  const systemStatus = statusColumns.find((column) => column.system_key === 'status') ?? null;
  if (systemStatus) {
    const labelIds = new Set(systemStatus.config.labels.map((label) => label.id));
    for (const item of envelope.items) if (item.status !== null && !labelIds.has(item.status)) throw new TypeError('Board item references an unknown Status label.');
  }
  // `work_board_items.status` predates flexible/custom Board columns and remains a
  // persisted compatibility field. A flexible Board may legitimately have no
  // system Status column while older rows still retain values such as
  // `not_started`. Only interpret and validate that field against label IDs when
  // an authoritative system Status column actually exists. Custom Status columns
  // are validated independently through their own typed config/cell contracts.

  return envelope;
}

export function assertBoardEnvelope(value: unknown, operation = 'board.load'): BoardEnvelope | null {
  const payload = boardScalar(value);
  if (payload == null) return null;
  const record = recordOf(payload);
  if (!record) throw new TypeError(`Invalid Boards response for ${operation}.`);
  for (const key of ['groups', 'items', 'columns', 'values', 'members'] as const) {
    if (record[key] != null && !Array.isArray(record[key])) throw new TypeError(`Invalid ${key} collection for ${operation}.`);
  }
  const envelope: BoardEnvelope = {
    board: record.board == null ? null : mapBoardRecord(record.board, operation),
    groups: Object.freeze(boardArray(record.groups).map(mapBoardGroup)),
    items: Object.freeze(boardArray(record.items).map(mapBoardItem)),
    columns: Object.freeze(boardArray(record.columns).map(mapBoardColumn)),
    values: Object.freeze(boardArray(record.values).map(mapBoardValue)),
    members: Object.freeze(boardArray(record.members).map(mapBoardMember)),
  };
  return validateBoardEnvelopeIntegrity(envelope, operation);
}

export function mapBoardList(value: unknown): readonly BoardRecord[] {
  if (!Array.isArray(value)) throw new TypeError('Invalid Boards list response.');
  return Object.freeze(value.map((entry) => mapBoardRecord(entry, 'boards.list')));
}

export function mapBoardEvents(value: unknown): readonly BoardEvent[] {
  if (!Array.isArray(value)) throw new TypeError('Invalid Board activity collection response.');
  return Object.freeze(value.map((entry) => {
    const record = recordOf(entry);
    if (!record) throw new TypeError('Invalid Board activity response.');
    const eventType = requiredString(record, 'event_type', 'board.event');
    const message = requiredString(record, 'message', 'board.event');
    return {
      ...record,
      id: requiredScalarString(record, 'id', 'board.event'),
      event_type: eventType,
      message,
      entity_type: optionalString(record, 'entity_type'),
      entity_id: optionalString(record, 'entity_id'),
      ...(optionalString(record, 'created_at') ? { created_at: optionalString(record, 'created_at') as string } : {}),
      actor_id: optionalString(record, 'actor_id') as UserId | null,
      actor_name: optionalString(record, 'actor_name'),
      actor_email: optionalString(record, 'actor_email'),
      payload: objectValue(record.payload, 'Board event payload'),
    };
  }));
}

export function mapBoardPreferences(value: unknown): BoardPreferences {
  const scalar = boardScalar(value);
  if (scalar === null || scalar === undefined) return Object.freeze({});
  const record = recordOf(scalar);
  if (!record) throw new TypeError('Invalid Board preferences response.');

  const sortDirection = record.sort_direction === 'asc' || record.sort_direction === 'desc' ? record.sort_direction : null;
  const filtersRecord = recordOf(record.column_filters);
  if (record.column_filters != null && !filtersRecord) throw new TypeError('Invalid Board preference filters response.');
  const widthsRecord = recordOf(record.column_widths);
  if (record.column_widths != null && !widthsRecord) throw new TypeError('Invalid Board column-width preferences response.');
  const widths = widthsRecord ? Object.fromEntries(Object.entries(widthsRecord).flatMap(([key, raw]) => {
    const width = Number(raw);
    return Number.isFinite(width) ? [[key, width]] : [];
  })) : {};
  if (record.wrap_columns != null && !Array.isArray(record.wrap_columns)) throw new TypeError('Invalid Board wrap-column preferences response.');
  if (record.collapsed_groups != null && !Array.isArray(record.collapsed_groups)) throw new TypeError('Invalid Board collapsed-group preferences response.');

  const identityWidth = Number(record.item_name_width);
  return Object.freeze({
    ...record,
    sort_column_id: optionalString(record, 'sort_column_id') as BoardColumnId | null,
    sort_direction: sortDirection,
    column_filters: Object.freeze({ ...(filtersRecord ?? {}) }),
    wrap_columns: Object.freeze(boardArray(record.wrap_columns).map(String) as BoardColumnId[]),
    column_widths: Object.freeze(widths),
    ...(Number.isFinite(identityWidth) ? { item_name_width: identityWidth } : {}),
    collapsed_groups: Object.freeze(boardArray(record.collapsed_groups).map(String) as BoardGroupId[]),
  });
}

function mapWorkspaceUpdate(value: unknown, itemId: BoardItemId): ItemWorkspaceUpdate {
  const record = recordOf(value);
  if (!record) throw new TypeError('Invalid item update response.');
  return {
    id: requiredScalarString(record, 'id', 'item.update'),
    item_id: itemId,
    body: typeof record.body === 'string' ? record.body : '',
    author_name: optionalString(record, 'author_name'),
    author_id: optionalString(record, 'author_id') as UserId | null,
    can_delete: record.can_delete === true,
    ...(optionalString(record, 'created_at') ? { created_at: optionalString(record, 'created_at') as string } : {}),
  };
}

function mapWorkspaceFile(value: unknown, itemId: BoardItemId): ItemWorkspaceFile {
  const record = recordOf(value);
  if (!record) throw new TypeError('Invalid item file response.');
  const size = record.size_bytes == null ? null : numberValue(record, 'size_bytes');
  return {
    id: requiredString(record, 'id', 'item.file'),
    item_id: itemId,
    storage_path: requiredString(record, 'storage_path', 'item.file'),
    file_name: optionalString(record, 'file_name'),
    size_bytes: size,
    author_name: optionalString(record, 'author_name'),
    author_id: optionalString(record, 'author_id') as UserId | null,
    can_delete: record.can_delete === true,
    ...(optionalString(record, 'created_at') ? { created_at: optionalString(record, 'created_at') as string } : {}),
  };
}

function mapWorkspaceActivity(value: unknown, itemId: BoardItemId): ItemActivityEvent {
  const record = recordOf(value);
  if (!record) throw new TypeError('Invalid item activity response.');
  return {
    id: requiredScalarString(record, 'id', 'item.activity'),
    item_id: itemId,
    event_type: optionalString(record, 'event_type'),
    message: optionalString(record, 'message'),
    ...(optionalString(record, 'created_at') ? { created_at: optionalString(record, 'created_at') as string } : {}),
    actor_name: optionalString(record, 'actor_name'),
    actor_id: optionalString(record, 'actor_id') as UserId | null,
    payload: objectValue(record.payload, 'Item activity payload'),
  };
}

export function assertWorkspaceEnvelope(value: unknown, itemId: BoardItemId): ItemWorkspaceEnvelope {
  const payload = boardScalar(value) ?? {};
  const record = recordOf(payload);
  if (!record) throw new TypeError('Invalid item workspace response.');
  for (const key of ['updates', 'files', 'activity'] as const) {
    if (record[key] != null && !Array.isArray(record[key])) throw new TypeError(`Invalid item workspace ${key} collection response.`);
  }
  return {
    updates: Object.freeze(boardArray(record.updates).map((entry) => mapWorkspaceUpdate(entry, itemId))),
    files: Object.freeze(boardArray(record.files).map((entry) => mapWorkspaceFile(entry, itemId))),
    activity: Object.freeze(boardArray(record.activity).map((entry) => mapWorkspaceActivity(entry, itemId))),
  };
}
