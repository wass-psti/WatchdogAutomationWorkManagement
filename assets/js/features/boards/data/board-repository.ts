import type { BoardRole } from '../../../../../src/types/auth.ts';
import type { DiagnosticsPort } from '../../../../../src/platform/contracts/diagnostics.ts';
import type { QueryClient, QueryKey } from '../../../../../src/platform/contracts/query.ts';
import type { AuthTransportPort, BackendClient } from '../../../../../src/platform/contracts/transport.ts';
import type {
  BoardCellValue,
  BoardColumnType,
  BoardItem,
  BoardLifecycleStatus,
  BoardPreferences,
  BoardViewMode,
  ItemWorkspaceFile,
  StatusLabel,
} from '../../../../../src/features/boards/contracts/domain.ts';
import type { BoardRepository, CreateBoardColumnInput } from '../../../../../src/features/boards/contracts/repository.ts';
import type {
  BoardColumnId,
  BoardGroupId,
  BoardId,
  BoardItemId,
  StatusLabelId,
  UserId,
} from '../../../../../src/types/identifiers.ts';
import { createBackendClient } from '../../../platform/data/backend-client.ts';
import { createQueryClient } from '../../../platform/data/query-client.ts';
import { normalizeAppError, WorkManagementError } from '../../../platform/errors/app-error.ts';
import {
  assertBoardEnvelope,
  assertWorkspaceEnvelope,
  boardScalar,
  mapBoardEvents,
  mapBoardList,
  mapBoardPreferences,
  recordOf,
} from './board-contracts.ts';
import { serializeStatusConfig } from '../status-labels.ts';

export interface BoardRepositoryOptions {
  readonly queryClient?: QueryClient | null;
  readonly backendClient?: BackendClient | null;
  readonly diagnostics?: DiagnosticsPort | null;
}

type MutationOptions = Readonly<{ invalidate?: boolean }>;

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const scalarId = <TId extends string>(value: unknown, operation: string): TId => {
  const scalar = boardScalar(value);
  const id = typeof scalar === 'string' ? scalar.trim() : '';
  if (!id) {
    throw new WorkManagementError('The server returned an invalid identifier. Refresh and try again.', {
      code: 'WM_BOARD_IDENTIFIER_INVALID',
      category: 'internal',
      retryable: true,
      operation,
      cause: value,
    });
  }
  return id as TId;
};

const errorCode = (error: unknown): string => {
  const record = recordOf(error);
  return typeof record?.code === 'string' ? record.code : '';
};

const errorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  const record = recordOf(error);
  return typeof record?.message === 'string' ? record.message : String(error ?? '');
};

const mapExternalResponse = <T>(operation: string, mapper: () => T): T => {
  try {
    return mapper();
  } catch (error: unknown) {
    if (error instanceof WorkManagementError) throw error;
    throw new WorkManagementError('The server returned Board data in an unexpected format. Refresh and try again.', {
      code: 'WM_BOARD_PAYLOAD_INVALID',
      category: 'internal',
      retryable: true,
      operation,
      cause: error,
      detail: error instanceof Error ? error.message : null,
    });
  }
};

const configuredCreateUnavailable = (error: unknown): boolean => {
  const code = errorCode(error).toUpperCase();
  const message = errorMessage(error).toLowerCase();
  return code === 'PGRST202'
    || (message.includes('wm_create_board_configured')
      && (message.includes('schema cache')
        || message.includes('could not find the function')
        || (message.includes('function') && message.includes('not found'))));
};

const backendMismatchError = (): WorkManagementError => new WorkManagementError(
  'Boards are not available in this environment yet. No board was created. Ask an administrator to finish the Board setup, then try again.',
  { code: 'WM_BOARD_BACKEND_OUTDATED', category: 'backend', retryable: true, operation: 'boards.create' },
);

/** Authoritative typed Boards repository and DTO/domain boundary. */
export function createBoardRepository(auth: AuthTransportPort, options: BoardRepositoryOptions = {}): BoardRepository {
  const diagnostics = options.diagnostics ?? null;
  const backend = options.backendClient ?? createBackendClient(auth, { diagnostics });
  const queries = options.queryClient ?? createQueryClient({ diagnostics, defaultStaleTime: 8_000 });

  const scope = (): readonly [string, string] => ['boards-user', String(auth.user?.id || 'anonymous')];
  const key = (...parts: readonly (string | number | boolean | null)[]): QueryKey => [...scope(), ...parts];
  const invalidationTargets = (): readonly QueryKey[] => [key('list'), key('board'), key('item-workspace'), key('events')];

  const invalidateBoardState = (): void => {
    for (const target of invalidationTargets()) queries.invalidateQueries(target);
  };

  const rpc = (name: string, body: Readonly<Record<string, unknown>> = {}): Promise<unknown> => backend.rpc(name, body);

  async function mutate<TResult>(operation: string, fn: () => Promise<TResult> | TResult, mutationOptions: MutationOptions = {}): Promise<TResult> {
    try {
      return await queries.mutate({
        key: key('mutation', operation),
        input: undefined,
        mutationFn: fn,
        invalidate: mutationOptions.invalidate === false ? [] : invalidationTargets(),
      });
    } catch (error: unknown) {
      throw normalizeAppError(error, { operation });
    }
  }

  async function mutateVoid(operation: string, fn: () => Promise<unknown>, mutationOptions: MutationOptions = {}): Promise<void> {
    await mutate(operation, async () => { await fn(); }, mutationOptions);
  }

  async function removeItemFile(file: ItemWorkspaceFile): Promise<void> {
    await backend.storageDelete('work-board-files', file.storage_path, { ignoreMissing: true });
    await rpc('wm_delete_board_item_file', { p_file_id: file.id });
    queries.invalidateQueries(key('item-workspace', String(file.item_id || '')));
  }

  const repository: BoardRepository = {
    queryClient: queries,

    async list(status: BoardLifecycleStatus = 'active') {
      return queries.fetchQuery({
        key: key('list', status),
        staleTime: 8_000,
        queryFn: async () => { const payload = await rpc('wm_list_boards', { p_status: status }); return mapExternalResponse('boards.list', () => mapBoardList(payload)); },
      });
    },

    async get(boardId: BoardId, { force = false } = {}) {
      return queries.fetchQuery({
        key: key('board', boardId),
        force,
        staleTime: 3_000,
        queryFn: async () => { const payload = await rpc('wm_get_board', { p_board_id: boardId }); return mapExternalResponse('boards.get', () => assertBoardEnvelope(payload, 'board.get')); },
      });
    },

    async create(name: string, description = '', columns: readonly CreateBoardColumnInput[] = []) {
      const payload = { p_name: name, p_description: description, p_columns: columns };
      // Safety contract: never fall back to the legacy wm_create_board RPC because it cannot atomically preserve configured/empty schema intent.
      return mutate('boards.create', async () => {
        try {
          return scalarId<BoardId>(await rpc('wm_create_board_configured', payload), 'boards.create');
        } catch (error: unknown) {
          if (!configuredCreateUnavailable(error)) throw error;
          await wait(700);
          try {
            return scalarId<BoardId>(await rpc('wm_create_board_configured', payload), 'boards.create');
          } catch (retryError: unknown) {
            if (configuredCreateUnavailable(retryError)) throw backendMismatchError();
            throw retryError;
          }
        }
      });
    },

    async update(boardId: BoardId, name: string, description = '') {
      await mutateVoid('boards.update', () => rpc('wm_update_board', { p_board_id: boardId, p_name: name, p_description: description }));
    },
    async setStatus(boardId: BoardId, status: BoardLifecycleStatus) {
      await mutateVoid('boards.set-status', () => rpc('wm_set_board_status', { p_board_id: boardId, p_status: status }));
    },
    async removePermanently(boardId: BoardId) {
      await mutateVoid('boards.delete', () => rpc('wm_delete_board_permanently', { p_board_id: boardId }));
    },
    async duplicate(boardId: BoardId) {
      return mutate('boards.duplicate', async () => scalarId<BoardId>(await rpc('wm_duplicate_board', { p_board_id: boardId }), 'boards.duplicate'));
    },
    async addGroup(boardId: BoardId, title: string) {
      return mutate('boards.group.add', async () => scalarId<BoardGroupId>(await rpc('wm_add_board_group', { p_board_id: boardId, p_title: title }), 'boards.group.add'));
    },
    async updateGroup(groupId: BoardGroupId, title: string) {
      await mutateVoid('boards.group.update', () => rpc('wm_update_board_group', { p_group_id: groupId, p_title: title }));
    },
    async setGroupAccent(groupId: BoardGroupId, accentColor: string) {
      await mutateVoid('boards.group.accent', () => rpc('wm_set_board_group_accent', { p_group_id: groupId, p_accent_color: accentColor }));
    },
    async deleteGroup(groupId: BoardGroupId) {
      await mutateVoid('boards.group.delete', () => rpc('wm_delete_board_group', { p_group_id: groupId }));
    },
    async moveGroup(groupId: BoardGroupId, position: number) {
      await mutateVoid('boards.group.move', () => rpc('wm_move_board_group', { p_group_id: groupId, p_position: Number(position) }));
    },
    async addItem(boardId: BoardId, groupId: BoardGroupId, title: string) {
      return mutate('boards.item.add', async () => scalarId<BoardItemId>(await rpc('wm_add_board_item', { p_board_id: boardId, p_group_id: groupId, p_title: title }), 'boards.item.add'));
    },
    async updateItem(item: Pick<BoardItem, 'id' | 'title' | 'status'> & Partial<Pick<BoardItem, 'assignee_id' | 'due_date' | 'notes'>>) {
      await mutateVoid('boards.item.update', () => rpc('wm_update_board_item', {
        p_item_id: item.id,
        p_title: item.title,
        p_status: item.status,
        p_assignee_id: item.assignee_id ?? null,
        p_due_date: item.due_date ?? null,
        p_notes: item.notes ?? '',
      }));
    },
    async moveItem(itemId: BoardItemId, groupId: BoardGroupId, position: number, status?: StatusLabelId | null) {
      await mutateVoid('boards.item.move', () => rpc('wm_move_board_item', {
        p_item_id: itemId,
        p_group_id: groupId,
        p_position: position,
        p_status: status === undefined ? null : (status ?? ''),
      }));
    },
    async duplicateItem(itemId: BoardItemId) {
      return mutate('boards.item.duplicate', async () => scalarId<BoardItemId>(await rpc('wm_duplicate_board_item', { p_item_id: itemId }), 'boards.item.duplicate'));
    },
    async deleteItem(itemId: BoardItemId) {
      await mutateVoid('boards.item.delete', async () => {
        const workspace = await queries.fetchQuery({
          key: key('item-workspace', itemId),
          force: true,
          staleTime: 0,
          queryFn: async () => { const payload = await rpc('wm_get_board_item_workspace', { p_item_id: itemId }); return mapExternalResponse('boards.item-workspace', () => assertWorkspaceEnvelope(payload, itemId)); },
        });
        if (workspace.files.some((file) => file.can_delete !== true)) {
          throw new WorkManagementError(
            'This item contains files owned by another collaborator. The board owner must permanently delete it, or the files must be removed first.',
            { code: 'WM_BOARD_FILE_OWNERSHIP', category: 'authorization' },
          );
        }
        for (const file of workspace.files) await removeItemFile(file);
        await rpc('wm_delete_board_item', { p_item_id: itemId });
      });
    },
    async archiveItem(itemId: BoardItemId, archived = true) {
      await mutateVoid('boards.item.archive', () => rpc('wm_set_board_item_archived', { p_item_id: itemId, p_archived: Boolean(archived) }));
    },
    async setView(boardId: BoardId, view: BoardViewMode) {
      await mutateVoid('boards.view.update', () => rpc('wm_set_board_view', { p_board_id: boardId, p_view: view }));
    },
    async addMember(boardId: BoardId, email: string, role: BoardRole = 'viewer') {
      await mutateVoid('boards.member.add', () => rpc('wm_add_board_member', { p_board_id: boardId, p_email: email, p_role: role }));
    },
    async removeMember(boardId: BoardId, userId: UserId) {
      await mutateVoid('boards.member.remove', () => rpc('wm_remove_board_member', { p_board_id: boardId, p_user_id: userId }));
    },
    async events(boardId: BoardId, limit = 80) {
      return queries.fetchQuery({
        key: key('events', boardId, Number(limit)),
        staleTime: 2_000,
        queryFn: async () => { const payload = await rpc('wm_list_board_events', { p_board_id: boardId, p_limit: limit }); return mapExternalResponse('boards.events', () => mapBoardEvents(payload)); },
      });
    },
    async addColumn(boardId: BoardId, name: string, dataType: BoardColumnType, config: Readonly<Record<string, unknown>> = {}, position: number | null = null) {
      return mutate('boards.column.add', async () => {
        const positioned = position !== null && position !== undefined;
        const result = await rpc(positioned ? 'wm_add_board_column_at' : 'wm_add_board_column', positioned
          ? { p_board_id: boardId, p_name: name, p_data_type: dataType, p_config: config, p_position: Number(position) }
          : { p_board_id: boardId, p_name: name, p_data_type: dataType, p_config: config });
        return scalarId<BoardColumnId>(result, 'boards.column.add');
      });
    },
    async updateColumn(columnId: BoardColumnId, name: string, config: Readonly<Record<string, unknown>> = {}, visible = true) {
      await mutateVoid('boards.column.update', () => rpc('wm_update_board_column', { p_column_id: columnId, p_name: name, p_config: config, p_visible: Boolean(visible) }));
    },
    async setStatusLabels(columnId: BoardColumnId, labels: readonly StatusLabel[] = [], defaultLabelId: StatusLabelId | null = null) {
      let config;
      try {
        config = serializeStatusConfig(labels, defaultLabelId);
      } catch (error: unknown) {
        throw normalizeAppError(error, { operation: 'boards.status-labels.update', categoryHint: 'validation' });
      }
      await mutateVoid('boards.status-labels.update', () => rpc('wm_set_board_status_labels', {
        p_column_id: columnId,
        p_labels: config.labels,
        p_default_label_id: config.default_label_id,
      }));
    },
    async moveColumn(columnId: BoardColumnId, position: number) {
      await mutateVoid('boards.column.move', () => rpc('wm_move_board_column', { p_column_id: columnId, p_position: Number(position) }));
    },
    async deleteColumn(columnId: BoardColumnId) {
      await mutateVoid('boards.column.delete', () => rpc('wm_delete_board_column', { p_column_id: columnId }));
    },
    async setCell(itemId: BoardItemId, columnId: BoardColumnId, value: BoardCellValue) {
      await mutateVoid('boards.cell.update', () => rpc('wm_set_board_cell', { p_item_id: itemId, p_column_id: columnId, p_value: value }));
    },
    async getPreferences(boardId: BoardId, { force = false } = {}) {
      return queries.fetchQuery({
        key: key('preferences', boardId),
        force,
        staleTime: 15_000,
        queryFn: async () => { const payload = await rpc('wm_get_board_preferences', { p_board_id: boardId }); return mapExternalResponse('boards.preferences.get', () => mapBoardPreferences(payload)); },
      });
    },
    async setPreferences(boardId: BoardId, preferences: BoardPreferences = {}) {
      const result = await mutate('boards.preferences.update', async () => {
        const payload = await rpc('wm_set_board_preferences', { p_board_id: boardId, p_preferences: preferences });
        return mapExternalResponse('boards.preferences.update', () => mapBoardPreferences(payload));
      }, { invalidate: false });
      queries.setQueryData(key('preferences', boardId), result);
      return result;
    },
    async duplicateColumn(columnId: BoardColumnId, withValues = false) {
      return mutate('boards.column.duplicate', async () => scalarId<BoardColumnId>(await rpc('wm_duplicate_board_column', {
        p_column_id: columnId,
        p_with_values: Boolean(withValues),
      }), 'boards.column.duplicate'));
    },
    async changeColumnType(columnId: BoardColumnId, dataType: BoardColumnType, config: Readonly<Record<string, unknown>> = {}, clearValues = false) {
      await mutateVoid('boards.column.type', () => rpc('wm_change_board_column_type', {
        p_column_id: columnId,
        p_data_type: dataType,
        p_config: config,
        p_clear_values: Boolean(clearValues),
      }));
    },
    async getItemWorkspace(itemId: BoardItemId, { force = false } = {}) {
      return queries.fetchQuery({
        key: key('item-workspace', itemId),
        force,
        staleTime: 2_000,
        queryFn: async () => { const payload = await rpc('wm_get_board_item_workspace', { p_item_id: itemId }); return mapExternalResponse('boards.item-workspace', () => assertWorkspaceEnvelope(payload, itemId)); },
      });
    },
    async addItemUpdate(itemId: BoardItemId, body: string) {
      await mutateVoid('boards.update.add', async () => {
        await rpc('wm_add_board_item_update', { p_item_id: itemId, p_body: body });
        queries.invalidateQueries(key('item-workspace', itemId));
      });
    },
    async deleteItemUpdate(updateId: string | number) {
      await mutateVoid('boards.update.delete', () => rpc('wm_delete_board_item_update', { p_update_id: Number(updateId) }));
    },
    async uploadItemFile(boardId: BoardId, itemId: BoardItemId, file: File) {
      if (!(file instanceof File)) throw new WorkManagementError('Choose a valid file.', { code: 'WM_FILE_INVALID', category: 'validation' });
      if (file.size > 20 * 1024 * 1024) throw new WorkManagementError('Files must be 20 MB or smaller.', { code: 'WM_FILE_TOO_LARGE', category: 'validation' });
      const safeName = String(file.name || 'attachment').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-160) || 'attachment';
      const unique = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const storagePath = `${boardId}/${itemId}/${unique}-${safeName}`;
      return mutate('boards.file.upload', async () => {
        await backend.storageUpload('work-board-files', storagePath, file, { contentType: file.type || 'application/octet-stream', upsert: false });
        try {
          return scalarId<string>(await rpc('wm_register_board_item_file', {
            p_item_id: itemId,
            p_storage_path: storagePath,
            p_file_name: file.name || safeName,
            p_mime_type: file.type || 'application/octet-stream',
            p_size_bytes: file.size,
          }), 'boards.file.upload');
        } catch (error: unknown) {
          try { await backend.storageDelete('work-board-files', storagePath, { ignoreMissing: true }); } catch { /* best-effort rollback */ }
          throw error;
        }
      });
    },
    async openItemFile(file: ItemWorkspaceFile) {
      const data = recordOf(await backend.storageSign('work-board-files', file.storage_path, 120));
      const signed = typeof data?.signedURL === 'string' ? data.signedURL : typeof data?.signedUrl === 'string' ? data.signedUrl : '';
      if (!signed) throw new WorkManagementError('This attachment could not be opened securely. Try again.', { code: 'WM_FILE_SIGN', category: 'storage', retryable: true });
      const url = signed.startsWith('http') ? signed : `${auth.backend.supabaseUrl}/storage/v1${signed}`;
      window.open(url, '_blank', 'noopener,noreferrer');
    },
    async deleteItemFile(file: ItemWorkspaceFile) {
      await mutateVoid('boards.file.delete', () => removeItemFile(file));
    },
    invalidate: invalidateBoardState,
    clearCache: () => queries.clear(),
  };

  return Object.freeze(repository);
}
