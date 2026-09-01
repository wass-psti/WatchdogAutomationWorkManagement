import type { BoardPreferences } from './domain.ts';
import type { BoardColumnId } from '../../../types/identifiers.ts';

export interface BoardPreferencePatchService {
  withColumnFilter(preferences: BoardPreferences, columnId: BoardColumnId | string, value: string | null): BoardPreferences;
  withColumnWrap(preferences: BoardPreferences, columnId: BoardColumnId | string, wrapped: boolean): BoardPreferences;
  withColumnWidth(preferences: BoardPreferences, columnId: BoardColumnId | string, width: number): BoardPreferences;
  withGroupCollapsed(preferences: BoardPreferences, groupId: string, collapsed: boolean): BoardPreferences;
  resetView(preferences: BoardPreferences): BoardPreferences;
  withItemNameWidth(preferences: BoardPreferences, width: number): BoardPreferences;
  withSort(preferences: BoardPreferences, columnId: BoardColumnId | string | null, direction: 'asc' | 'desc' | null): BoardPreferences;
  withoutColumnReferences(preferences: BoardPreferences, columnId: BoardColumnId | string): BoardPreferences;
}
