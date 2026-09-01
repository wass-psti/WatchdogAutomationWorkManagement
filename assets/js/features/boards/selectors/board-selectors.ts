import type {
  BoardCellValue,
  BoardColumn,
  BoardItem,
  BoardMember,
  StatusBoardColumn,
  StatusLabel,
  TimelineValue,
} from '../../../../../src/features/boards/contracts/domain.ts';
import type { MutableBoardViewState } from '../../../../../src/features/boards/contracts/view-state.ts';
import type { BoardColumnId, BoardGroupId, StatusLabelId, UserId } from '../../../../../src/types/identifiers.ts';
import { STATUS_LABELS } from '../board-schema.ts';
import { normalizeStatusLabels } from '../status-labels.ts';

export interface BoardSortConfig {
  readonly id: BoardColumnId | null;
  readonly direction: 'asc' | 'desc' | null;
}

export interface BoardSelectors {
  memberMap(): ReadonlyMap<UserId, BoardMember>;
  allColumns(): readonly BoardColumn[];
  visibleColumns(): readonly BoardColumn[];
  columnWidth(columnId: BoardColumnId | string): number;
  itemNameWidth(): number;
  isGroupCollapsed(groupId: BoardGroupId | string): boolean;
  isWrapped(columnId: BoardColumnId | string): boolean;
  activeColumnFilter(columnId: BoardColumnId | string): string;
  sortConfig(): BoardSortConfig;
  populatedColumnValueCount(column: BoardColumn | null | undefined): number;
  getCellValue(item: BoardItem, column: BoardColumn): BoardCellValue;
  optionList(column: BoardColumn | null | undefined): readonly string[];
  systemStatusColumn(): StatusBoardColumn | null;
  statusLabelsFor(column: BoardColumn | null | undefined): readonly StatusLabel[];
  statusLabelForValue(column: BoardColumn | null | undefined, value: unknown): StatusLabel | null;
  boardStatusLabels(): readonly StatusLabel[];
  searchableCellText(item: BoardItem, column: BoardColumn): string;
  itemMatches(item: BoardItem): boolean;
  compareItems(left: BoardItem, right: BoardItem): number;
}

const clamp = (value: unknown, min: number, max: number, fallback: number): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
};

const isTimeline = (value: BoardCellValue): value is TimelineValue =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value) && 'start' in value && 'end' in value);

export function createBoardSelectors(state: MutableBoardViewState): BoardSelectors {
  const memberMap = (): ReadonlyMap<UserId, BoardMember> =>
    new Map((state.board?.members ?? []).map((member) => [member.user_id, member]));

  const allColumns = (): readonly BoardColumn[] =>
    [...(state.board?.columns ?? [])].sort((a, b) => (a.position - b.position) || String(a.id).localeCompare(String(b.id)));

  const visibleColumns = (): readonly BoardColumn[] => allColumns().filter((column) => column.visible !== false);

  const columnWidth = (columnId: BoardColumnId | string): number =>
    clamp(state.boardPrefs.column_widths?.[String(columnId)], 96, 720, 160);

  const itemNameWidth = (): number => clamp(state.boardPrefs.item_name_width, 180, 720, 280);

  const isGroupCollapsed = (groupId: BoardGroupId | string): boolean =>
    (state.boardPrefs.collapsed_groups ?? []).map(String).includes(String(groupId));

  const isWrapped = (columnId: BoardColumnId | string): boolean =>
    (state.boardPrefs.wrap_columns ?? []).map(String).includes(String(columnId));

  const activeColumnFilter = (columnId: BoardColumnId | string): string =>
    String(state.boardPrefs.column_filters?.[String(columnId)] ?? '').trim();

  const sortConfig = (): BoardSortConfig => ({
    id: state.boardPrefs.sort_column_id ?? null,
    direction: state.boardPrefs.sort_direction ?? null,
  });

  const populatedColumnValueCount = (column: BoardColumn | null | undefined): number => {
    if (!column || column.system_key) return 0;
    return (state.board?.values ?? []).filter((value) =>
      String(value.column_id) === String(column.id)
      && value.value !== null
      && value.value !== undefined
      && value.value !== '',
    ).length;
  };

  const valueMap = (): ReadonlyMap<string, BoardCellValue> =>
    new Map((state.board?.values ?? []).map((value) => [`${value.item_id}:${value.column_id}`, value.value]));

  const getCellValue = (item: BoardItem, column: BoardColumn): BoardCellValue => {
    if (column.system_key === 'title') return item.title;
    if (column.system_key === 'status') return item.status;
    if (column.system_key === 'assignee') return item.assignee_id ?? null;
    if (column.system_key === 'due_date') return item.due_date ?? null;
    if (column.system_key === 'notes') return item.notes ?? '';
    return valueMap().get(`${item.id}:${column.id}`) ?? null;
  };

  const optionList = (column: BoardColumn | null | undefined): readonly string[] =>
    column?.data_type === 'dropdown' && Array.isArray(column.config.options)
      ? column.config.options.map(String)
      : [];

  const systemStatusColumn = (): StatusBoardColumn | null => {
    const column = allColumns().find((candidate) => candidate.system_key === 'status');
    return column?.data_type === 'status' ? column : null;
  };

  const statusLabelsFor = (column: BoardColumn | null | undefined): readonly StatusLabel[] => normalizeStatusLabels(column ?? {});

  const statusLabelForValue = (column: BoardColumn | null | undefined, value: unknown): StatusLabel | null => {
    const labels = statusLabelsFor(column);
    const id = String(value ?? '');
    return labels.find((label) => String(label.id) === id)
      ?? labels.find((label) => label.name === id)
      ?? null;
  };

  const boardStatusLabels = (): readonly StatusLabel[] => {
    const column = systemStatusColumn();
    if (column) return statusLabelsFor(column);
    const colors = ['#7f8a9a', '#4f7df3', '#e64f70', '#23b784'] as const;
    return Object.entries(STATUS_LABELS).map(([id, name], position) => ({
      id: id as StatusLabelId,
      name,
      color: colors[position] ?? '#7f8a9a',
      active: true,
      description: '',
      position,
    }));
  };

  const searchableCellText = (item: BoardItem, column: BoardColumn): string => {
    const value = getCellValue(item, column);
    if (value === null || value === undefined) return '';
    if (column.data_type === 'people') {
      const member = memberMap().get(String(value));
      return `${member?.display_name ?? ''} ${member?.email ?? ''}`;
    }
    if (column.data_type === 'timeline' && isTimeline(value)) return `${value.start ?? ''} ${value.end ?? ''}`;
    if (column.data_type === 'status') {
      const label = statusLabelForValue(column, value);
      return `${String(value)} ${label?.name ?? ''} ${label?.description ?? ''}`;
    }
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };

  const itemMatches = (item: BoardItem): boolean => {
    const query = state.itemSearch.trim().toLowerCase();
    if (Boolean(item.archived_at) !== Boolean(state.showArchived)) return false;
    if (state.itemStatus !== 'all' && String(item.status ?? '') !== String(state.itemStatus)) return false;
    const filters = state.boardPrefs.column_filters ?? {};
    for (const [columnId, rawFilter] of Object.entries(filters)) {
      const filter = String(rawFilter ?? '').trim();
      if (!filter) continue;
      const column = allColumns().find((candidate) => String(candidate.id) === String(columnId));
      if (!column) continue;
      if (!searchableCellText(item, column).toLowerCase().includes(filter.toLowerCase())) return false;
    }
    if (!query) return true;
    if (String(item.title ?? '').toLowerCase().includes(query)) return true;
    return allColumns().some((column) => searchableCellText(item, column).toLowerCase().includes(query));
  };

  const compareItems = (left: BoardItem, right: BoardItem): number => {
    const { id, direction } = sortConfig();
    const stableOrder = (): number => (left.position - right.position) || String(left.id).localeCompare(String(right.id));
    if (!id || !direction) return stableOrder();
    const column = allColumns().find((candidate) => String(candidate.id) === String(id));
    if (!column) return stableOrder();
    const leftValue = getCellValue(left, column);
    const rightValue = getCellValue(right, column);
    let result = 0;
    if (leftValue == null && rightValue != null) result = 1;
    else if (leftValue != null && rightValue == null) result = -1;
    else if (column.data_type === 'number') result = Number(leftValue ?? 0) - Number(rightValue ?? 0);
    else if (column.data_type === 'date') result = String(leftValue ?? '').localeCompare(String(rightValue ?? ''));
    else if (column.data_type === 'status') {
      const leftLabel = statusLabelForValue(column, leftValue);
      const rightLabel = statusLabelForValue(column, rightValue);
      result = Number(leftLabel?.position ?? 999) - Number(rightLabel?.position ?? 999)
        || String(leftLabel?.name ?? leftValue ?? '').localeCompare(String(rightLabel?.name ?? rightValue ?? ''), undefined, { numeric: true, sensitivity: 'base' });
    } else {
      result = searchableCellText(left, column).localeCompare(searchableCellText(right, column), undefined, { numeric: true, sensitivity: 'base' });
    }
    return direction === 'desc' ? -result : result;
  };

  return Object.freeze({
    memberMap,
    allColumns,
    visibleColumns,
    columnWidth,
    itemNameWidth,
    isGroupCollapsed,
    isWrapped,
    activeColumnFilter,
    sortConfig,
    populatedColumnValueCount,
    getCellValue,
    optionList,
    systemStatusColumn,
    statusLabelsFor,
    statusLabelForValue,
    boardStatusLabels,
    searchableCellText,
    itemMatches,
    compareItems,
  });
}
