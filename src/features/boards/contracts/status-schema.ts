import type { StatusLabelId } from '../../../types/identifiers.ts';
import type { StatusBoardColumn, StatusColumnConfig, StatusLabel } from './domain.ts';

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const STATUS_ID = /^[A-Za-z0-9_:-]{1,96}$/;

const recordOf = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

export function isStatusLabel(value: unknown): value is StatusLabel {
  const item = recordOf(value);
  return Boolean(
    item
      && typeof item.id === 'string'
      && STATUS_ID.test(item.id)
      && typeof item.name === 'string'
      && item.name.trim().length > 0
      && item.name.length <= 80
      && typeof item.color === 'string'
      && HEX_COLOR.test(item.color)
      && typeof item.active === 'boolean'
      && typeof item.description === 'string'
      && item.description.length <= 240
      && typeof item.position === 'number'
      && Number.isFinite(item.position),
  );
}

export function parseStatusColumnConfig(value: unknown): StatusColumnConfig {
  const config = recordOf(value);
  if (!config || !Array.isArray(config.labels) || config.labels.length === 0) {
    throw new TypeError('Status configuration must contain at least one label.');
  }
  if (config.labels.length > 50) throw new TypeError('Status configuration supports at most 50 labels.');
  if (!config.labels.every(isStatusLabel)) throw new TypeError('Status configuration contains an invalid label.');

  const ids = new Set<string>();
  const names = new Set<string>();
  for (const label of config.labels) {
    const normalizedName = label.name.trim().toLowerCase();
    if (ids.has(label.id)) throw new TypeError('Status label identifiers must be unique.');
    if (names.has(normalizedName)) throw new TypeError('Status label names must be unique.');
    ids.add(label.id);
    names.add(normalizedName);
  }
  if (!config.labels.some((label) => label.active)) throw new TypeError('Status configuration requires at least one active label.');

  const rawDefault = config.default_label_id;
  const defaultId: StatusLabelId | null = typeof rawDefault === 'string' && rawDefault.trim() ? rawDefault : null;
  if (defaultId !== null && !config.labels.some((label) => label.id === defaultId && label.active)) {
    throw new TypeError('Default status label must reference an active label.');
  }

  return Object.freeze({
    labels: Object.freeze([...config.labels].sort((a, b) => a.position - b.position)),
    default_label_id: defaultId,
  });
}

export function assertStatusValue(column: StatusBoardColumn, value: unknown): StatusLabelId | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') throw new TypeError('Status values must use stable label identifiers.');
  const config = parseStatusColumnConfig(column.config);
  if (!config.labels.some((label) => label.id === value)) throw new TypeError(`Unknown status label identifier: ${value}`);
  return value;
}
