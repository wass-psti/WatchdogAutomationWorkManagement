import type { StatusLabelId } from '../../../../src/types/identifiers.ts';
import type { StatusColumnConfig, StatusLabel } from '../../../../src/features/boards/contracts/domain.ts';
import { parseStatusColumnConfig } from '../../../../src/features/boards/contracts/status-schema.ts';

export const STATUS_COLOR_PALETTE = Object.freeze([
  '#7f8a9a', '#4f7df3', '#ef8f3c', '#e64f70', '#23b784', '#6d5bd0', '#2a9bb8', '#d9a227',
  '#e0563f', '#d54a9c', '#9d55d4', '#6f65df', '#5473e8', '#3d8bd3', '#45a5c5', '#49b8ac',
  '#74b748', '#a6c93d', '#d2bd3f', '#de9b48', '#d67a58', '#ca6684', '#b36da7', '#8c72b5',
] as const);

export const DEFAULT_STATUS_LABELS: readonly StatusLabel[] = Object.freeze([
  Object.freeze({ id: 'not_started', name: 'Not started', color: '#7f8a9a', active: true, description: '', position: 0 }),
  Object.freeze({ id: 'in_progress', name: 'In progress', color: '#4f7df3', active: true, description: '', position: 1 }),
  Object.freeze({ id: 'blocked', name: 'Blocked', color: '#e64f70', active: true, description: '', position: 2 }),
  Object.freeze({ id: 'done', name: 'Done', color: '#23b784', active: true, description: '', position: 3 }),
]);

/** Removing a label clears persisted item references through wm_set_board_status_labels. */
export const STATUS_REFERENCE_POLICY = 'clear-on-label-delete' as const;

type UnknownRecord = Record<string, unknown>;
const recordOf = (value: unknown): UnknownRecord | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : null;
const asArray = (value: unknown): readonly unknown[] => Array.isArray(value) ? value : [];
const isHex = (value: unknown): value is string => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
const slug = (value: unknown): string => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 48) || 'status';
const colorAt = (index: number): string => STATUS_COLOR_PALETTE[index % STATUS_COLOR_PALETTE.length] ?? '#7f8a9a';

export function createStatusLabelId(name = 'status'): StatusLabelId {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `status_${uuid}`;
  return `status_${slug(name)}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function labelFromUnknown(entry: unknown, index: number, usedIds: Set<string>): StatusLabel {
  const record = recordOf(entry) ?? {};
  const name = String(record.name || '').trim() || `Status ${index + 1}`;
  const baseId = String(record.id || '').trim() || `status_${slug(name)}`;
  let id = baseId;
  let suffix = 2;
  while (usedIds.has(id)) {
    id = `${baseId}_${suffix}`;
    suffix += 1;
  }
  usedIds.add(id);
  const position = Number(record.position);
  return {
    id,
    name,
    color: isHex(record.color) ? record.color.toLowerCase() : colorAt(index),
    active: record.active !== false,
    description: String(record.description || '').trim().slice(0, 240),
    position: Number.isFinite(position) ? position : index,
  };
}

function configRecord(column: unknown): UnknownRecord {
  const columnRecord = recordOf(column);
  return recordOf(columnRecord?.config) ?? {};
}

export function normalizeStatusLabels(column: unknown): StatusLabel[] {
  const columnRecord = recordOf(column);
  const config = configRecord(column);
  const rawLabels = asArray(config.labels);
  if (rawLabels.length > 0) {
    const usedIds = new Set<string>();
    return rawLabels
      .map((entry, index) => labelFromUnknown(entry, index, usedIds))
      .sort((left, right) => left.position - right.position || left.name.localeCompare(right.name))
      .map((label, position) => ({ ...label, position }));
  }

  const options = asArray(config.options).map(String).map((name) => name.trim()).filter(Boolean);
  if (options.length > 0) {
    return options.map((name, index) => ({
      id: columnRecord?.system_key === 'status' && DEFAULT_STATUS_LABELS[index]?.name === name
        ? DEFAULT_STATUS_LABELS[index]?.id ?? (`status_${slug(name)}` as StatusLabelId)
        : (`status_${slug(name)}` as StatusLabelId),
      name,
      color: colorAt(index),
      active: true,
      description: '',
      position: index,
    }));
  }

  return DEFAULT_STATUS_LABELS.map((label) => ({ ...label }));
}

export function statusConfig(column: unknown): Readonly<{ labels: StatusLabel[]; defaultLabelId: StatusLabelId | null }> {
  const labels = normalizeStatusLabels(column);
  const config = configRecord(column);
  const configuredDefault = String(config.default_label_id || '').trim();
  const defaultLabelId = labels.some((label) => label.id === configuredDefault && label.active)
    ? configuredDefault as StatusLabelId
    : labels.find((label) => label.id === 'not_started' && label.active)?.id
      ?? labels.find((label) => label.active)?.id
      ?? null;
  return Object.freeze({ labels, defaultLabelId });
}

export function statusLabelMap(column: unknown): Map<string, StatusLabel> {
  return new Map(normalizeStatusLabels(column).map((label) => [String(label.id), label]));
}

export function activeStatusLabels(column: unknown, currentValue: string | null = null): StatusLabel[] {
  const current = String(currentValue || '');
  return normalizeStatusLabels(column).filter((label) => label.active || label.id === current);
}

export function serializeStatusConfig(labels: readonly StatusLabel[], defaultLabelId: StatusLabelId | null = null): StatusColumnConfig {
  if (labels.length === 0) throw new Error('Keep at least one status label.');
  const normalized = labels.map((label, index) => ({
    id: String(label.id || '').trim(),
    name: String(label.name || '').trim(),
    color: isHex(label.color) ? label.color.toLowerCase() : colorAt(index),
    active: label.active !== false,
    description: String(label.description || '').trim().slice(0, 240),
    position: index,
  }));
  const requestedDefault = String(defaultLabelId || '').trim();
  const effectiveDefault = normalized.some((label) => label.id === requestedDefault && label.active)
    ? requestedDefault
    : normalized.find((label) => label.active)?.id ?? null;
  return parseStatusColumnConfig({ labels: normalized, default_label_id: effectiveDefault });
}

function replaceLabel(config: StatusColumnConfig, labelId: StatusLabelId, update: (label: StatusLabel) => StatusLabel): StatusColumnConfig {
  let found = false;
  const labels = config.labels.map((label) => {
    if (label.id !== labelId) return label;
    found = true;
    return update(label);
  });
  if (!found) throw new Error(`Unknown status label identifier: ${labelId}`);
  return serializeStatusConfig(labels, config.default_label_id);
}

export function renameStatusLabel(config: StatusColumnConfig, labelId: StatusLabelId, name: string): StatusColumnConfig {
  return replaceLabel(config, labelId, (label) => ({ ...label, name: name.trim() }));
}

export function recolorStatusLabel(config: StatusColumnConfig, labelId: StatusLabelId, color: string): StatusColumnConfig {
  if (!isHex(color)) throw new Error('Choose a valid status color.');
  return replaceLabel(config, labelId, (label) => ({ ...label, color: color.toLowerCase() }));
}

export function setStatusLabelActive(config: StatusColumnConfig, labelId: StatusLabelId, active: boolean): StatusColumnConfig {
  return replaceLabel(config, labelId, (label) => ({ ...label, active }));
}

export function reorderStatusLabels(config: StatusColumnConfig, orderedIds: readonly StatusLabelId[]): StatusColumnConfig {
  if (orderedIds.length !== config.labels.length || new Set(orderedIds).size !== orderedIds.length) {
    throw new Error('Status label order must include each label exactly once.');
  }
  const byId = new Map(config.labels.map((label) => [label.id, label]));
  const labels = orderedIds.map((id, position) => {
    const label = byId.get(id);
    if (!label) throw new Error(`Unknown status label identifier: ${id}`);
    return { ...label, position };
  });
  return serializeStatusConfig(labels, config.default_label_id);
}

export function addStatusLabel(config: StatusColumnConfig, input: Readonly<{ name: string; color?: string; description?: string }> ): StatusColumnConfig {
  const label: StatusLabel = {
    id: createStatusLabelId(input.name),
    name: input.name.trim(),
    color: input.color && isHex(input.color) ? input.color.toLowerCase() : colorAt(config.labels.length),
    active: true,
    description: String(input.description || '').trim().slice(0, 240),
    position: config.labels.length,
  };
  return serializeStatusConfig([...config.labels, label], config.default_label_id);
}

export function removeStatusLabel(config: StatusColumnConfig, labelId: StatusLabelId): StatusColumnConfig {
  const labels = config.labels.filter((label) => label.id !== labelId);
  if (labels.length === config.labels.length) throw new Error(`Unknown status label identifier: ${labelId}`);
  if (labels.length === 0) throw new Error('Keep at least one status label.');
  return serializeStatusConfig(labels, config.default_label_id === labelId ? null : config.default_label_id);
}
