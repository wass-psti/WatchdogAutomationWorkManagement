import type { StatusColumnConfig, StatusLabel } from '../../../../../src/features/boards/contracts/domain.ts';
import type { StatusLabelId } from '../../../../../src/types/identifiers.ts';
import {
  STATUS_COLOR_PALETTE,
  createStatusLabelId,
  normalizeStatusLabels,
  serializeStatusConfig,
} from '../status-labels.ts';

export interface StatusLabelEditorSnapshot {
  readonly labels: readonly StatusLabel[];
  readonly defaultId: StatusLabelId | null;
}

export interface StatusLabelEditor {
  snapshot(): StatusLabelEditorSnapshot;
  label(labelId: StatusLabelId | string): StatusLabel | null;
  rename(labelId: StatusLabelId | string, name: string): void;
  setDescription(labelId: StatusLabelId | string, description: string): void;
  recolor(labelId: StatusLabelId | string, color: string): void;
  move(labelId: StatusLabelId | string, direction: 'up' | 'down'): void;
  setDefault(labelId: StatusLabelId | string): void;
  toggleActive(labelId: StatusLabelId | string): void;
  add(name?: string): StatusLabelId;
  remove(labelId: StatusLabelId | string): StatusLabel;
  reset(): void;
  isDirty(): boolean;
  serialize(): StatusColumnConfig;
}

const colorAt = (index: number): string => STATUS_COLOR_PALETTE[index % STATUS_COLOR_PALETTE.length] ?? '#7f8a9a';

export function createStatusLabelEditor(column: unknown): StatusLabelEditor {
  let labels = normalizeStatusLabels(column).map((label) => ({ ...label }));
  const columnRecord = column && typeof column === 'object' ? column as { config?: { default_label_id?: unknown } } : {};
  const configured = String(columnRecord.config?.default_label_id ?? '').trim();
  let defaultId: StatusLabelId | null = labels.some((label) => label.id === configured && label.active)
    ? configured
    : labels.find((label) => label.active)?.id ?? null;

  const initialLabels = labels.map((label) => ({ ...label }));
  const initialDefaultId = defaultId;

  const indexOf = (labelId: StatusLabelId | string): number => labels.findIndex((label) => String(label.id) === String(labelId));
  const requireIndex = (labelId: StatusLabelId | string): number => {
    const index = indexOf(labelId);
    if (index < 0) throw new Error(`Unknown status label identifier: ${String(labelId)}`);
    return index;
  };
  const labelAt = (index: number): StatusLabel => {
    const entry = labels[index];
    if (!entry) throw new Error(`Status label index is out of range: ${index}`);
    return entry;
  };
  const normalizePositions = (): void => { labels = labels.map((label, position) => ({ ...label, position })); };

  const snapshot = (): StatusLabelEditorSnapshot => Object.freeze({ labels: labels.map((label) => ({ ...label })), defaultId });
  const label = (labelId: StatusLabelId | string): StatusLabel | null => labels[indexOf(labelId)] ?? null;

  const rename = (labelId: StatusLabelId | string, name: string): void => {
    const index = requireIndex(labelId);
    labels[index] = { ...labelAt(index), name: String(name ?? '') };
  };

  const setDescription = (labelId: StatusLabelId | string, description: string): void => {
    const index = requireIndex(labelId);
    labels[index] = { ...labelAt(index), description: String(description ?? '').slice(0, 240) };
  };

  const recolor = (labelId: StatusLabelId | string, color: string): void => {
    if (!/^#[0-9a-f]{6}$/i.test(String(color ?? ''))) throw new Error('Choose a valid status color.');
    const index = requireIndex(labelId);
    labels[index] = { ...labelAt(index), color: String(color).toLowerCase() };
  };

  const move = (labelId: StatusLabelId | string, direction: 'up' | 'down'): void => {
    const index = requireIndex(labelId);
    const target = index + (direction === 'up' ? -1 : 1);
    if (target < 0 || target >= labels.length) return;
    const next = [...labels];
    const current = labelAt(index);
    const destination = labelAt(target);
    next[index] = destination;
    next[target] = current;
    labels = next;
    normalizePositions();
  };

  const setDefault = (labelId: StatusLabelId | string): void => {
    const entry = label(labelId);
    if (!entry) throw new Error(`Unknown status label identifier: ${String(labelId)}`);
    if (!entry.active) throw new Error('Activate this status label before making it the default.');
    defaultId = entry.id;
  };

  const toggleActive = (labelId: StatusLabelId | string): void => {
    const index = requireIndex(labelId);
    const current = labelAt(index);
    const updated = { ...current, active: !current.active };
    labels[index] = updated;
    if (defaultId === current.id && updated.active === false) defaultId = labels.find((entry) => entry.active && entry.id !== current.id)?.id ?? null;
  };

  const add = (name = 'New label'): StatusLabelId => {
    const id = createStatusLabelId(name);
    labels = [...labels, { id, name, color: colorAt(labels.length), active: true, description: '', position: labels.length }];
    if (!defaultId) defaultId = id;
    return id;
  };

  const remove = (labelId: StatusLabelId | string): StatusLabel => {
    if (labels.length <= 1) throw new Error('Keep at least one status label.');
    const index = requireIndex(labelId);
    const removed = labelAt(index);
    labels = labels.filter((_, candidate) => candidate !== index);
    normalizePositions();
    if (defaultId === removed.id) defaultId = labels.find((entry) => entry.active)?.id ?? null;
    return removed;
  };

  const reset = (): void => {
    labels = initialLabels.map((label) => ({ ...label }));
    defaultId = initialDefaultId;
  };

  const isDirty = (): boolean => JSON.stringify({ labels, defaultId }) !== JSON.stringify({ labels: initialLabels, defaultId: initialDefaultId });
  const serialize = (): StatusColumnConfig => serializeStatusConfig(labels, defaultId);

  return Object.freeze({ snapshot, label, rename, setDescription, recolor, move, setDefault, toggleActive, add, remove, reset, isDirty, serialize });
}
