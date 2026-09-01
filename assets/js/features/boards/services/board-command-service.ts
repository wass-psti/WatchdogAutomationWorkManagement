import type {
  AddBoardMemberCommand,
  ChangeColumnTypeCommand,
  CreateColumnCommand,
  BoardCommandService,
  BoardCommandServiceDependencies,
  CreateBoardCommand,
  CreateGroupCommand,
  CreateItemCommand,
  MoveColumnCommand,
  MoveGroupCommand,
  MoveItemCommand,
  RemoveBoardMemberCommand,
  RenameGroupCommand,
  SetBoardLifecycleCommand,
  SetCellCommand,
  SetStatusLabelsCommand,
  SetGroupAccentCommand,
  UpdateBoardCommand,
  UpdateColumnCommand,
  UpdateItemCommand,
} from '../../../../../src/features/boards/contracts/commands.ts';
import type { BoardColumnId, BoardGroupId, BoardId, BoardItemId } from '../../../../../src/types/identifiers.ts';
import { WorkManagementError, normalizeAppError } from '../../../platform/errors/app-error.ts';

const requiredText = (value: unknown, label: string, maxLength: number): string => {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new WorkManagementError(`${label} is required.`, { code: 'WM_VALIDATION', category: 'validation' });
  if (normalized.length > maxLength) throw new WorkManagementError(`${label} cannot exceed ${maxLength} characters.`, { code: 'WM_VALIDATION', category: 'validation' });
  return normalized;
};

const optionalText = (value: unknown, maxLength: number, label: string): string => {
  const normalized = String(value ?? '');
  if (normalized.length > maxLength) throw new WorkManagementError(`${label} cannot exceed ${maxLength} characters.`, { code: 'WM_VALIDATION', category: 'validation' });
  return normalized;
};

const run = async <T>(operation: string, task: () => Promise<T>): Promise<T> => {
  try { return await task(); }
  catch (error) { throw normalizeAppError(error, { operation }); }
};

export function createBoardCommandService({ service }: BoardCommandServiceDependencies): BoardCommandService {
  const createBoard = (command: CreateBoardCommand): Promise<BoardId> => run('boards.command.create-board', () =>
    service.create(requiredText(command.name, 'Board name', 120), optionalText(command.description, 1200, 'Board description'), command.columns ?? []));

  const updateBoard = (command: UpdateBoardCommand): Promise<void> => run('boards.command.update-board', () =>
    service.update(command.boardId, requiredText(command.name, 'Board name', 120), optionalText(command.description, 1200, 'Board description')));

  const setBoardLifecycle = (command: SetBoardLifecycleCommand): Promise<void> => run('boards.command.set-lifecycle', () =>
    service.setStatus(command.boardId, command.status));

  const duplicateBoard = (boardId: BoardId): Promise<BoardId> => run('boards.command.duplicate-board', () => service.duplicate(boardId));
  const deleteBoard = (boardId: BoardId): Promise<void> => run('boards.command.delete-board', () => service.removePermanently(boardId));

  const createGroup = (command: CreateGroupCommand): Promise<BoardGroupId> => run('boards.command.create-group', () =>
    service.addGroup(command.boardId, requiredText(command.title, 'Group name', 120)));

  const renameGroup = (command: RenameGroupCommand): Promise<void> => run('boards.command.rename-group', () =>
    service.updateGroup(command.groupId, requiredText(command.title, 'Group name', 120)));

  const moveGroup = (command: MoveGroupCommand): Promise<void> => run('boards.command.move-group', () =>
    service.moveGroup(command.groupId, Math.max(0, Math.trunc(command.position))));

  const setGroupAccent = (command: SetGroupAccentCommand): Promise<void> => {
    const accent = String(command.accentColor ?? '').trim().toLowerCase();
    if (!/^#[0-9a-f]{6}$/.test(accent)) throw new WorkManagementError('Choose a valid group color.', { code: 'WM_VALIDATION', category: 'validation' });
    return run('boards.command.set-group-accent', () => service.setGroupAccent(command.groupId, accent));
  };

  const deleteGroup = (groupId: BoardGroupId): Promise<void> => run('boards.command.delete-group', () => service.deleteGroup(groupId));

  const addItem = (boardId: BoardId, groupId: BoardGroupId, title: string): Promise<BoardItemId> => run('boards.command.add-item', () =>
    service.addItem(boardId, groupId, requiredText(title, 'Item name', 240)));

  const createItem = async (command: CreateItemCommand): Promise<BoardItemId> => run('boards.command.create-item', async () => {
    const title = requiredText(command.title, 'Item name', 240);
    const notes = optionalText(command.notes, 5000, 'Item notes');
    const itemId = await service.addItem(command.boardId, command.groupId, title);
    await service.updateItem({
      id: itemId,
      title,
      status: command.status ?? null,
      assignee_id: command.assigneeId ?? null,
      due_date: command.dueDate ?? null,
      notes,
    });
    return itemId;
  });

  const updateItem = (command: UpdateItemCommand): Promise<void> => run('boards.command.update-item', () =>
    service.updateItem({
      id: command.itemId,
      title: requiredText(command.title, 'Item name', 240),
      status: command.status ?? null,
      assignee_id: command.assigneeId ?? null,
      due_date: command.dueDate ?? null,
      notes: optionalText(command.notes, 5000, 'Item notes'),
    }));

  const moveItem = (command: MoveItemCommand): Promise<void> => run('boards.command.move-item', () =>
    service.moveItem(command.itemId, command.groupId, Math.max(0, Math.trunc(command.position)), command.status));

  const duplicateItem = (itemId: BoardItemId): Promise<BoardItemId> => run('boards.command.duplicate-item', () => service.duplicateItem(itemId));
  const deleteItem = (itemId: BoardItemId): Promise<void> => run('boards.command.delete-item', () => service.deleteItem(itemId));
  const archiveItem = (itemId: BoardItemId, archived = true): Promise<void> => run('boards.command.archive-item', () => service.archiveItem(itemId, archived));

  const setView: BoardCommandService['setView'] = (boardId, view) => run('boards.command.set-view', () => service.setView(boardId, view));

  const createColumn = (command: CreateColumnCommand): Promise<BoardColumnId> => run('boards.command.create-column', () =>
    service.addColumn(command.boardId, requiredText(command.name, 'Column name', 80), command.dataType, command.config ?? {}, command.position ?? null));

  const updateColumn = (command: UpdateColumnCommand): Promise<void> => run('boards.command.update-column', () =>
    service.updateColumn(command.columnId, requiredText(command.name, 'Column name', 80), command.config ?? {}, command.visible ?? true));

  const duplicateColumn = (columnId: BoardColumnId, withValues = false): Promise<BoardColumnId> => run('boards.command.duplicate-column', () =>
    service.duplicateColumn(columnId, withValues));

  const changeColumnType = (command: ChangeColumnTypeCommand): Promise<void> => run('boards.command.change-column-type', () =>
    service.changeColumnType(command.columnId, command.dataType, command.config ?? {}, Boolean(command.clearValues)));

  const moveColumn = (command: MoveColumnCommand): Promise<void> => run('boards.command.move-column', () =>
    service.moveColumn(command.columnId, Math.max(0, Math.trunc(command.position))));

  const deleteColumn = (columnId: BoardColumnId): Promise<void> => run('boards.command.delete-column', () => service.deleteColumn(columnId));

  const setStatusLabels = (command: SetStatusLabelsCommand): Promise<void> => run('boards.command.set-status-labels', () =>
    service.setStatusLabels(command.columnId, command.labels, command.defaultLabelId ?? null));

  const setCell = (command: SetCellCommand): Promise<void> => run('boards.command.set-cell', () =>
    service.setCell(command.itemId, command.columnId, command.value));

  const addMember = (command: AddBoardMemberCommand): Promise<void> => {
    const email = requiredText(command.email, 'Account email', 320).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new WorkManagementError('Enter a valid account email address.', { code: 'WM_VALIDATION', category: 'validation' });
    return run('boards.command.add-member', () => service.addMember(command.boardId, email, command.role ?? 'editor'));
  };

  const removeMember = (command: RemoveBoardMemberCommand): Promise<void> => run('boards.command.remove-member', () =>
    service.removeMember(command.boardId, command.userId));

  const savePreferences: BoardCommandService['savePreferences'] = (boardId, preferences) =>
    run('boards.command.save-preferences', () => service.setPreferences(boardId, preferences));

  return Object.freeze({
    createBoard,
    updateBoard,
    setBoardLifecycle,
    duplicateBoard,
    deleteBoard,
    createGroup,
    renameGroup,
    moveGroup,
    setGroupAccent,
    deleteGroup,
    addItem,
    createItem,
    updateItem,
    moveItem,
    duplicateItem,
    deleteItem,
    archiveItem,
    setView,
    createColumn,
    updateColumn,
    duplicateColumn,
    changeColumnType,
    moveColumn,
    deleteColumn,
    setStatusLabels,
    setCell,
    addMember,
    removeMember,
    savePreferences,
  });
}
