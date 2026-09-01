import type { BoardRole } from '../../../types/auth.ts';
import type {
  BoardColumnId,
  BoardGroupId,
  BoardId,
  BoardItemId,
  ISODate,
  StatusLabelId,
  UserId,
} from '../../../types/identifiers.ts';
import type { CreateBoardColumnInput } from './repository.ts';
import type { BoardDomainService } from './service.ts';
import type { BoardCellValue, BoardColumnType, BoardLifecycleStatus, BoardPreferences, BoardViewMode, StatusLabel } from './domain.ts';

export interface CreateBoardCommand {
  readonly name: string;
  readonly description?: string;
  readonly columns?: readonly CreateBoardColumnInput[];
}
export interface UpdateBoardCommand { readonly boardId: BoardId; readonly name: string; readonly description?: string; }
export interface SetBoardLifecycleCommand { readonly boardId: BoardId; readonly status: BoardLifecycleStatus; }
export interface CreateGroupCommand { readonly boardId: BoardId; readonly title: string; }
export interface RenameGroupCommand { readonly groupId: BoardGroupId; readonly title: string; }
export interface MoveGroupCommand { readonly groupId: BoardGroupId; readonly position: number; }
export interface SetGroupAccentCommand { readonly groupId: BoardGroupId; readonly accentColor: string; }
export interface CreateItemCommand {
  readonly boardId: BoardId;
  readonly groupId: BoardGroupId;
  readonly title: string;
  readonly status?: StatusLabelId | null;
  readonly assigneeId?: UserId | null;
  readonly dueDate?: ISODate | null;
  readonly notes?: string;
}
export interface UpdateItemCommand {
  readonly itemId: BoardItemId;
  readonly title: string;
  readonly status?: StatusLabelId | null;
  readonly assigneeId?: UserId | null;
  readonly dueDate?: ISODate | null;
  readonly notes?: string;
}
export interface MoveItemCommand {
  readonly itemId: BoardItemId;
  readonly groupId: BoardGroupId;
  readonly position: number;
  readonly status?: StatusLabelId | null;
}

export interface CreateColumnCommand {
  readonly boardId: BoardId;
  readonly name: string;
  readonly dataType: BoardColumnType;
  readonly config?: Readonly<Record<string, unknown>>;
  readonly position?: number | null;
}
export interface UpdateColumnCommand {
  readonly columnId: BoardColumnId;
  readonly name: string;
  readonly config?: Readonly<Record<string, unknown>>;
  readonly visible?: boolean;
}
export interface ChangeColumnTypeCommand {
  readonly columnId: BoardColumnId;
  readonly dataType: BoardColumnType;
  readonly config?: Readonly<Record<string, unknown>>;
  readonly clearValues?: boolean;
}
export interface MoveColumnCommand { readonly columnId: BoardColumnId; readonly position: number; }
export interface SetStatusLabelsCommand { readonly columnId: BoardColumnId; readonly labels: readonly StatusLabel[]; readonly defaultLabelId?: StatusLabelId | null; }
export interface SetCellCommand { readonly itemId: BoardItemId; readonly columnId: BoardColumnId; readonly value: BoardCellValue; }

export interface AddBoardMemberCommand { readonly boardId: BoardId; readonly email: string; readonly role?: Exclude<BoardRole, 'owner'>; }
export interface RemoveBoardMemberCommand { readonly boardId: BoardId; readonly userId: UserId; }

export interface BoardCommandService {
  createBoard(command: CreateBoardCommand): Promise<BoardId>;
  updateBoard(command: UpdateBoardCommand): Promise<void>;
  setBoardLifecycle(command: SetBoardLifecycleCommand): Promise<void>;
  duplicateBoard(boardId: BoardId): Promise<BoardId>;
  deleteBoard(boardId: BoardId): Promise<void>;
  createGroup(command: CreateGroupCommand): Promise<BoardGroupId>;
  renameGroup(command: RenameGroupCommand): Promise<void>;
  moveGroup(command: MoveGroupCommand): Promise<void>;
  setGroupAccent(command: SetGroupAccentCommand): Promise<void>;
  deleteGroup(groupId: BoardGroupId): Promise<void>;
  addItem(boardId: BoardId, groupId: BoardGroupId, title: string): Promise<BoardItemId>;
  createItem(command: CreateItemCommand): Promise<BoardItemId>;
  updateItem(command: UpdateItemCommand): Promise<void>;
  moveItem(command: MoveItemCommand): Promise<void>;
  duplicateItem(itemId: BoardItemId): Promise<BoardItemId>;
  deleteItem(itemId: BoardItemId): Promise<void>;
  archiveItem(itemId: BoardItemId, archived?: boolean): Promise<void>;
  setView(boardId: BoardId, view: BoardViewMode): Promise<void>;
  createColumn(command: CreateColumnCommand): Promise<BoardColumnId>;
  updateColumn(command: UpdateColumnCommand): Promise<void>;
  duplicateColumn(columnId: BoardColumnId, withValues?: boolean): Promise<BoardColumnId>;
  changeColumnType(command: ChangeColumnTypeCommand): Promise<void>;
  moveColumn(command: MoveColumnCommand): Promise<void>;
  deleteColumn(columnId: BoardColumnId): Promise<void>;
  setStatusLabels(command: SetStatusLabelsCommand): Promise<void>;
  setCell(command: SetCellCommand): Promise<void>;
  addMember(command: AddBoardMemberCommand): Promise<void>;
  removeMember(command: RemoveBoardMemberCommand): Promise<void>;
  savePreferences(boardId: BoardId, preferences: BoardPreferences): Promise<BoardPreferences>;
}

export interface BoardCommandServiceDependencies { readonly service: BoardDomainService; }
