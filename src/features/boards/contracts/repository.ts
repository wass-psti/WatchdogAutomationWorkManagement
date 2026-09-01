import type { BoardColumnId, BoardGroupId, BoardId, BoardItemId, StatusLabelId, UserId } from '../../../types/identifiers.ts';
import type { BoardRole } from '../../../types/auth.ts';
import type { QueryClient } from '../../../platform/contracts/query.ts';
import type {
  BoardCellValue,
  BoardColumnType,
  BoardEnvelope,
  BoardEvent,
  BoardItem,
  BoardLifecycleStatus,
  BoardPreferences,
  BoardRecord,
  BoardViewMode,
  ItemWorkspaceEnvelope,
  ItemWorkspaceFile,
  StatusLabel,
} from './domain.ts';

export interface CreateBoardColumnInput {
  readonly name: string;
  readonly data_type: BoardColumnType;
  readonly config?: Readonly<Record<string, unknown>>;
}

export interface BoardRepository {
  readonly queryClient: QueryClient;
  list(status?: BoardLifecycleStatus): Promise<readonly BoardRecord[]>;
  get(boardId: BoardId, options?: Readonly<{ force?: boolean }>): Promise<BoardEnvelope | null>;
  create(name: string, description?: string, columns?: readonly CreateBoardColumnInput[]): Promise<BoardId>;
  update(boardId: BoardId, name: string, description?: string): Promise<void>;
  setStatus(boardId: BoardId, status: BoardLifecycleStatus): Promise<void>;
  removePermanently(boardId: BoardId): Promise<void>;
  duplicate(boardId: BoardId): Promise<BoardId>;
  addGroup(boardId: BoardId, title: string): Promise<BoardGroupId>;
  updateGroup(groupId: BoardGroupId, title: string): Promise<void>;
  setGroupAccent(groupId: BoardGroupId, accentColor: string): Promise<void>;
  deleteGroup(groupId: BoardGroupId): Promise<void>;
  moveGroup(groupId: BoardGroupId, position: number): Promise<void>;
  addItem(boardId: BoardId, groupId: BoardGroupId, title: string): Promise<BoardItemId>;
  updateItem(item: Pick<BoardItem, 'id' | 'title' | 'status'> & Partial<Pick<BoardItem, 'assignee_id' | 'due_date' | 'notes'>>): Promise<void>;
  moveItem(itemId: BoardItemId, groupId: BoardGroupId, position: number, status?: StatusLabelId | null): Promise<void>;
  duplicateItem(itemId: BoardItemId): Promise<BoardItemId>;
  deleteItem(itemId: BoardItemId): Promise<void>;
  archiveItem(itemId: BoardItemId, archived?: boolean): Promise<void>;
  setView(boardId: BoardId, view: BoardViewMode): Promise<void>;
  addMember(boardId: BoardId, email: string, role?: BoardRole): Promise<void>;
  removeMember(boardId: BoardId, userId: UserId): Promise<void>;
  events(boardId: BoardId, limit?: number): Promise<readonly BoardEvent[]>;
  addColumn(boardId: BoardId, name: string, dataType: BoardColumnType, config?: Readonly<Record<string, unknown>>, position?: number | null): Promise<BoardColumnId>;
  updateColumn(columnId: BoardColumnId, name: string, config?: Readonly<Record<string, unknown>>, visible?: boolean): Promise<void>;
  setStatusLabels(columnId: BoardColumnId, labels?: readonly StatusLabel[], defaultLabelId?: StatusLabelId | null): Promise<void>;
  moveColumn(columnId: BoardColumnId, position: number): Promise<void>;
  deleteColumn(columnId: BoardColumnId): Promise<void>;
  setCell(itemId: BoardItemId, columnId: BoardColumnId, value: BoardCellValue): Promise<void>;
  getPreferences(boardId: BoardId, options?: Readonly<{ force?: boolean }>): Promise<BoardPreferences>;
  setPreferences(boardId: BoardId, preferences?: BoardPreferences): Promise<BoardPreferences>;
  duplicateColumn(columnId: BoardColumnId, withValues?: boolean): Promise<BoardColumnId>;
  changeColumnType(columnId: BoardColumnId, dataType: BoardColumnType, config?: Readonly<Record<string, unknown>>, clearValues?: boolean): Promise<void>;
  getItemWorkspace(itemId: BoardItemId, options?: Readonly<{ force?: boolean }>): Promise<ItemWorkspaceEnvelope>;
  addItemUpdate(itemId: BoardItemId, body: string): Promise<void>;
  deleteItemUpdate(updateId: string | number): Promise<void>;
  uploadItemFile(boardId: BoardId, itemId: BoardItemId, file: File): Promise<string>;
  openItemFile(file: ItemWorkspaceFile): Promise<void>;
  deleteItemFile(file: ItemWorkspaceFile): Promise<void>;
  invalidate(): void;
  clearCache(): void;
}
