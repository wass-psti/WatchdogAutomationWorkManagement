import type { BoardPreferences } from '../../../../../src/features/boards/contracts/domain.ts';
import type { BoardColumnId } from '../../../../../src/types/identifiers.ts';

import type { BoardPreferencePatchService } from '../../../../../src/features/boards/contracts/preference-patches.ts';

const clampWidth = (value: number, min: number): number => Math.max(min, Math.min(720, Math.round(value)));

export function createBoardPreferencePatchService(): BoardPreferencePatchService {
  const withColumnFilter = (preferences: BoardPreferences, columnId: BoardColumnId | string, value: string | null): BoardPreferences => {
    const id = String(columnId);
    const filters = { ...(preferences.column_filters ?? {}) };
    const normalized = String(value ?? '').trim();
    if (normalized) filters[id] = normalized;
    else delete filters[id];
    return { ...preferences, column_filters: filters };
  };

  const withColumnWrap = (preferences: BoardPreferences, columnId: BoardColumnId | string, wrapped: boolean): BoardPreferences => {
    const id = String(columnId);
    const current = new Set((preferences.wrap_columns ?? []).map(String));
    if (wrapped) current.add(id);
    else current.delete(id);
    return { ...preferences, wrap_columns: [...current] };
  };

  const withColumnWidth = (preferences: BoardPreferences, columnId: BoardColumnId | string, width: number): BoardPreferences => ({
    ...preferences,
    column_widths: {
      ...(preferences.column_widths ?? {}),
      [String(columnId)]: clampWidth(width, 96),
    },
  });

  const withGroupCollapsed = (preferences: BoardPreferences, groupId: string, collapsed: boolean): BoardPreferences => {
    const current = new Set((preferences.collapsed_groups ?? []).map(String));
    if (collapsed) current.add(String(groupId));
    else current.delete(String(groupId));
    return { ...preferences, collapsed_groups: [...current] };
  };

  const resetView = (preferences: BoardPreferences): BoardPreferences => ({
    ...preferences,
    sort_column_id: null,
    sort_direction: null,
    column_filters: {},
    wrap_columns: [],
    column_widths: {},
    item_name_width: 280,
    collapsed_groups: [],
  });

  const withItemNameWidth = (preferences: BoardPreferences, width: number): BoardPreferences => ({
    ...preferences,
    item_name_width: clampWidth(width, 180),
  });

  const withSort = (preferences: BoardPreferences, columnId: BoardColumnId | string | null, direction: 'asc' | 'desc' | null): BoardPreferences => ({
    ...preferences,
    sort_column_id: columnId ? String(columnId) : null,
    sort_direction: columnId && direction ? direction : null,
  });

  const withoutColumnReferences = (preferences: BoardPreferences, columnId: BoardColumnId | string): BoardPreferences => {
    const id = String(columnId);
    const filters = { ...(preferences.column_filters ?? {}) };
    delete filters[id];
    const widths = { ...(preferences.column_widths ?? {}) };
    delete widths[id];
    const wraps = (preferences.wrap_columns ?? []).map(String).filter((entry) => entry !== id);
    const sortingMatches = String(preferences.sort_column_id ?? '') === id;
    return {
      ...preferences,
      sort_column_id: sortingMatches ? null : (preferences.sort_column_id ?? null),
      sort_direction: sortingMatches ? null : (preferences.sort_direction ?? null),
      column_filters: filters,
      wrap_columns: wraps,
      column_widths: widths,
    };
  };

  return Object.freeze({
    withColumnFilter,
    withColumnWrap,
    withColumnWidth,
    withGroupCollapsed,
    resetView,
    withItemNameWidth,
    withSort,
    withoutColumnReferences,
  });
}
