import type { BoardColumnType } from '../../../../src/features/boards/contracts/domain.ts';
import type { CreateBoardColumnInput } from '../../../../src/features/boards/contracts/repository.ts';
import type { BoardRole } from '../../../../src/types/auth.ts';
import { boardColumnTypeMap, getBoardColumnType } from './grid/column-type-registry.ts';

export const STATUS_LABELS = Object.freeze({
  not_started: 'Not started',
  in_progress: 'In progress',
  blocked: 'Blocked',
  done: 'Done',
} as const);

export const BOARD_TABS = Object.freeze(['active', 'archived', 'trashed'] as const);
export type BoardTab = (typeof BOARD_TABS)[number];

// Internal keys stay stable for persistence/routing; presentation labels are centralized here.
export const BOARD_TAB_LABELS = Object.freeze({ active: 'Boards', archived: 'Archived', trashed: 'Trash' } satisfies Record<BoardTab, string>);
export const BOARD_ROLE_LABELS = Object.freeze({ owner: 'Owner', editor: 'Editor', viewer: 'Viewer' } satisfies Record<BoardRole, string>);

export const COLUMN_TYPES = boardColumnTypeMap();

function asSupportedColumnType(value: string): BoardColumnType {
  const meta = getBoardColumnType(value);
  if (!meta) throw new Error(`Unsupported column type: ${value}`);
  return meta.id;
}

export function defaultColumnName(dataType: BoardColumnType | string, existingNames: readonly string[] = []): string {
  const type = asSupportedColumnType(String(dataType));
  const meta = getBoardColumnType(type);
  const base = `New ${meta.label}`;
  const used = new Set(existingNames.map((name) => String(name ?? '').trim().toLowerCase()));
  if (!used.has(base.toLowerCase())) return base;
  let suffix = 2;
  while (used.has(`${base} ${suffix}`.toLowerCase())) suffix += 1;
  return `${base} ${suffix}`;
}

export function startingColumns(types: readonly (BoardColumnType | string)[] = []): readonly CreateBoardColumnInput[] {
  const names: string[] = [];
  return types.map((rawType) => {
    const dataType = asSupportedColumnType(String(rawType));
    const name = defaultColumnName(dataType, names);
    names.push(name);
    return Object.freeze({ name, data_type: dataType, config: {} });
  });
}
