/** Stable scalar identifiers shared across domain boundaries. */
export type EntityId = string;
export type UserId = string;
export type BoardId = string;
export type BoardGroupId = string;
export type BoardItemId = string;
export type BoardColumnId = string;
export type StatusLabelId = string;
export type ModuleId = 'time-tracker' | 'fueltrack-plus' | 'tradelink';

export type ISODate = string;
export type ISODateTime = string;

export function asEntityId(value: unknown): EntityId {
  const id = typeof value === 'string' ? value.trim() : '';
  if (!id) throw new TypeError('A non-empty entity identifier is required.');
  return id;
}
