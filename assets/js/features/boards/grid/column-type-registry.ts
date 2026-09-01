import type { BoardColumnType, BoardValueByColumnType, TimelineValue } from '../../../../../src/features/boards/contracts/domain.ts';
import type { CompleteBoardEditorRegistry } from '../../../../../src/features/boards/contracts/editor.ts';
import type {
  BoardColumnTypeDefinition,
  CompleteBoardColumnRegistry,
} from '../../../../../src/features/boards/contracts/column-registry.ts';
import type { StatusLabelId, UserId } from '../../../../../src/types/identifiers.ts';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const nullableString = (value: unknown): string | null => value == null || value === '' ? null : String(value).trim();

const boundedString = (value: unknown, maxLength: number, message: string): string | null => {
  const next = nullableString(value);
  if (next === null) return null;
  if (next.length > maxLength) throw new Error(message);
  return next;
};

const nullableStatus = (value: unknown): StatusLabelId | null => {
  const next = nullableString(value);
  if (next === null) return null;
  if (!/^[A-Za-z0-9_:-]{1,96}$/.test(next)) throw new Error('Choose a valid status label.');
  return next as StatusLabelId;
};

const nullableUser = (value: unknown): UserId | null => {
  const next = nullableString(value);
  if (next === null) return null;
  if (next.length > 160) throw new Error('Choose a valid board member.');
  return next as UserId;
};

const normalizeDate = (value: unknown): string | null => {
  const next = nullableString(value);
  if (next === null) return null;
  if (!ISO_DATE.test(next)) throw new Error('Enter a valid date.');
  const parsed = new Date(`${next}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== next) throw new Error('Enter a valid date.');
  return next;
};

const normalizeNumber = (value: unknown): number | null => {
  if (value == null || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error('Enter a valid number.');
  return number;
};

const normalizeEmail = (value: unknown): string | null => {
  const next = boundedString(value, 320, 'Email addresses cannot exceed 320 characters.')?.toLowerCase() ?? null;
  if (next === null) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next)) throw new Error('Enter a valid email address.');
  return next;
};

const normalizeUrl = (value: unknown): string | null => {
  const next = boundedString(value, 2000, 'Web addresses cannot exceed 2,000 characters.');
  if (next === null) return null;
  let parsed: URL;
  try { parsed = new URL(next); } catch { throw new Error('Enter a valid web address starting with http:// or https://.'); }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('Enter a valid web address starting with http:// or https://.');
  return next;
};

const normalizeCheckbox = (value: unknown): boolean | null => {
  if (value == null || value === '') return null;
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1' || value === 'true') return true;
  if (value === 0 || value === '0' || value === 'false') return false;
  throw new Error('Choose a valid checkbox value.');
};

const normalizeTimeline = (value: unknown): TimelineValue | null => {
  if (value == null || value === '') return null;
  if (typeof value !== 'object' || Array.isArray(value)) throw new Error('Enter a valid start and end date.');
  const record = value as Record<string, unknown>;
  const start = normalizeDate(record.start);
  const end = normalizeDate(record.end);
  if (!start && !end) return null;
  if (!start || !end) throw new Error('Timeline values require both a start and end date.');
  if (end < start) throw new Error('Timeline end date cannot be before its start date.');
  return { start, end };
};


const inlinePolicy = Object.freeze({ surface: 'inline-input', explicitSave: true, explicitCancel: true, saveOnEnter: true, cancelOnEscape: true, commitOnBlur: false, focusTarget: 'input', clearable: true } as const);
const popoverPolicy = Object.freeze({ surface: 'popover', explicitSave: false, explicitCancel: true, saveOnEnter: false, cancelOnEscape: true, commitOnBlur: false, focusTarget: 'first-option', clearable: true } as const);
const formPopoverPolicy = Object.freeze({ surface: 'popover', explicitSave: true, explicitCancel: true, saveOnEnter: false, cancelOnEscape: true, commitOnBlur: false, focusTarget: 'input', clearable: true } as const);
const togglePolicy = Object.freeze({ surface: 'toggle', explicitSave: false, explicitCancel: false, saveOnEnter: false, cancelOnEscape: true, commitOnBlur: false, focusTarget: 'none', clearable: true } as const);

const editorRegistry = {
  text: { type: 'text', policy: inlinePolicy, draftFromValue: (value) => value ?? '', normalizeDraft: (draft) => boundedString(draft, 1000, 'Text values cannot exceed 1,000 characters.') },
  long_text: { type: 'long_text', policy: formPopoverPolicy, draftFromValue: (value) => value ?? '', normalizeDraft: (draft) => boundedString(draft, 5000, 'Long text values cannot exceed 5,000 characters.') },
  number: { type: 'number', policy: inlinePolicy, draftFromValue: (value) => value == null ? '' : String(value), normalizeDraft: normalizeNumber },
  status: { type: 'status', policy: popoverPolicy, draftFromValue: (value) => value, normalizeDraft: nullableStatus },
  dropdown: { type: 'dropdown', policy: popoverPolicy, draftFromValue: (value) => value, normalizeDraft: (draft) => boundedString(draft, 80, 'Dropdown values cannot exceed 80 characters.') },
  date: { type: 'date', policy: inlinePolicy, draftFromValue: (value) => value ?? '', normalizeDraft: normalizeDate },
  people: { type: 'people', policy: popoverPolicy, draftFromValue: (value) => value, normalizeDraft: nullableUser },
  checkbox: { type: 'checkbox', policy: togglePolicy, draftFromValue: (value) => value, normalizeDraft: normalizeCheckbox },
  timeline: { type: 'timeline', policy: formPopoverPolicy, draftFromValue: (value) => ({ start: value?.start ?? '', end: value?.end ?? '' }), normalizeDraft: (draft) => normalizeTimeline(draft) },
  email: { type: 'email', policy: inlinePolicy, draftFromValue: (value) => value ?? '', normalizeDraft: normalizeEmail },
  url: { type: 'url', policy: inlinePolicy, draftFromValue: (value) => value ?? '', normalizeDraft: normalizeUrl },
} as const satisfies CompleteBoardEditorRegistry;

const completeRegistry = {
  text: { id: 'text', label: 'Text', hint: 'Short text for names, codes, or brief details.', icon: 'T', editor: 'text', editorContract: editorRegistry.text, sortable: true, filterable: true, defaultValue: () => null, normalize: (value: unknown) => boundedString(value, 1000, 'Text values cannot exceed 1,000 characters.') },
  long_text: { id: 'long_text', label: 'Long text', hint: 'Multi-line notes or detailed context.', icon: '¶', editor: 'long-text', editorContract: editorRegistry.long_text, sortable: true, filterable: true, defaultValue: () => null, normalize: (value: unknown) => boundedString(value, 5000, 'Long text values cannot exceed 5,000 characters.') },
  number: { id: 'number', label: 'Number', hint: 'Whole numbers or decimals.', icon: '#', editor: 'number', editorContract: editorRegistry.number, sortable: true, filterable: true, defaultValue: () => null, normalize: normalizeNumber },
  status: { id: 'status', label: 'Status', hint: 'Track progress with configurable colored labels.', icon: '●', editor: 'status', editorContract: editorRegistry.status, sortable: true, filterable: true, defaultValue: () => null, normalize: nullableStatus },
  dropdown: { id: 'dropdown', label: 'Dropdown', hint: 'Choose from a custom list of options.', icon: '⌄', editor: 'dropdown', editorContract: editorRegistry.dropdown, sortable: true, filterable: true, defaultValue: () => null, normalize: (value: unknown) => boundedString(value, 80, 'Dropdown values cannot exceed 80 characters.') },
  date: { id: 'date', label: 'Date', hint: 'A single calendar date.', icon: '□', editor: 'date', editorContract: editorRegistry.date, sortable: true, filterable: true, defaultValue: () => null, normalize: normalizeDate },
  people: { id: 'people', label: 'People', hint: 'Assign a member of this board.', icon: '◉', editor: 'people', editorContract: editorRegistry.people, sortable: true, filterable: true, defaultValue: () => null, normalize: nullableUser },
  checkbox: { id: 'checkbox', label: 'Checkbox', hint: 'Track a simple yes-or-no value.', icon: '✓', editor: 'checkbox', editorContract: editorRegistry.checkbox, sortable: true, filterable: true, defaultValue: () => null, normalize: normalizeCheckbox },
  timeline: { id: 'timeline', label: 'Timeline', hint: 'A start and end date range.', icon: '↔', editor: 'timeline', editorContract: editorRegistry.timeline, sortable: true, filterable: true, defaultValue: () => null, normalize: normalizeTimeline },
  email: { id: 'email', label: 'Email', hint: 'An email address with format validation.', icon: '@', editor: 'email', editorContract: editorRegistry.email, sortable: true, filterable: true, defaultValue: () => null, normalize: normalizeEmail },
  url: { id: 'url', label: 'Link', hint: 'A web address beginning with http:// or https://.', icon: '↗', editor: 'url', editorContract: editorRegistry.url, sortable: true, filterable: true, defaultValue: () => null, normalize: normalizeUrl },
} as const satisfies CompleteBoardColumnRegistry;

const registry = new Map<BoardColumnType, BoardColumnTypeDefinition>();

export function registerBoardColumnType<TType extends BoardColumnType>(definition: BoardColumnTypeDefinition<TType>): BoardColumnTypeDefinition<TType> {
  if (registry.has(definition.id)) throw new Error(`Board column type “${definition.id}” is already registered.`);
  const entry = Object.freeze({ ...definition });
  registry.set(definition.id, entry as BoardColumnTypeDefinition);
  return entry;
}

(Object.keys(completeRegistry) as BoardColumnType[]).forEach((type) => registerBoardColumnType(completeRegistry[type]));

export function getBoardColumnType<TType extends BoardColumnType>(id: TType): BoardColumnTypeDefinition<TType>;
export function getBoardColumnType(id: string): BoardColumnTypeDefinition | null;
export function getBoardColumnType(id: string): BoardColumnTypeDefinition | null {
  return registry.get(id as BoardColumnType) ?? null;
}

export function boardColumnTypes(): readonly BoardColumnTypeDefinition[] {
  return Object.freeze([...registry.values()]);
}

export function boardColumnTypeMap(): Readonly<Record<string, Readonly<Omit<BoardColumnTypeDefinition, 'normalize' | 'defaultValue' | 'editorContract' | 'id'>>>> {
  return Object.freeze(Object.fromEntries([...registry.entries()].map(([id, entry]) => [id, Object.freeze({
    label: entry.label,
    hint: entry.hint,
    icon: entry.icon,
    editor: entry.editor,
    sortable: entry.sortable,
    filterable: entry.filterable,
  })])));
}

export function normalizeBoardCellValue<TType extends BoardColumnType>(type: TType, value: unknown): BoardValueByColumnType[TType] {
  const entry = registry.get(type);
  if (!entry) throw new Error(`Unsupported column type: ${type}`);
  return entry.normalize(value) as BoardValueByColumnType[TType];
}

export function defaultBoardCellValue<TType extends BoardColumnType>(type: TType): BoardValueByColumnType[TType] {
  const entry = registry.get(type);
  if (!entry) throw new Error(`Unsupported column type: ${type}`);
  return entry.defaultValue() as BoardValueByColumnType[TType];
}

export const boardColumnRegistry = Object.freeze(completeRegistry);

export function getBoardCellEditorContract<TType extends BoardColumnType>(type: TType) {
  return editorRegistry[type];
}
