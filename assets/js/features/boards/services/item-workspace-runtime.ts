import type { ItemWorkspaceRuntime, ItemWorkspaceRuntimeDependencies } from '../../../../../src/features/boards/contracts/item-workspace.ts';
import type { ItemWorkspaceTab } from '../../../../../src/features/boards/contracts/view-state.ts';
import type { BoardId, BoardItemId } from '../../../../../src/types/identifiers.ts';
import { resetItemPanel } from '../board-state.ts';
import { WorkManagementError, normalizeAppError } from '../../../platform/errors/app-error.ts';

const VALID_TABS = new Set(['updates', 'files', 'activity'] as const);

export function createItemWorkspaceRuntime({
  state,
  service,
  onChange = null,
}: ItemWorkspaceRuntimeDependencies): ItemWorkspaceRuntime {
  let epoch = 0;
  let uploadEpoch = 0;

  const notify = (): void => { onChange?.(); };
  const isCurrent = (ticket: number, itemId: BoardItemId): boolean => ticket === epoch && state.itemPanel.itemId === itemId;
  const activeItemId = (): BoardItemId | null => state.itemPanel.itemId;

  const load: ItemWorkspaceRuntime['load'] = async (itemId = activeItemId(), { quiet = false } = {}) => {
    if (!itemId) return false;
    const id = String(itemId) as BoardItemId;
    const ticket = ++epoch;
    if (!quiet && state.itemPanel.itemId === id) {
      state.itemPanel.loading = true;
      state.itemPanel.error = '';
      notify();
    }
    try {
      const data = await service.getItemWorkspace(id);
      if (!isCurrent(ticket, id)) return false;
      state.itemPanel.data = data;
      state.itemPanel.error = '';
      return true;
    } catch (error) {
      if (!isCurrent(ticket, id)) return false;
      state.itemPanel.error = normalizeAppError(error, {
        operation: 'boards.item-workspace.load',
        fallbackMessage: 'Item details couldn’t be loaded. Try again.',
      }).message;
      return false;
    } finally {
      if (isCurrent(ticket, id)) {
        state.itemPanel.loading = false;
        notify();
      }
    }
  };

  const open = (itemId: BoardItemId | string): void => {
    const id = String(itemId) as BoardItemId;
    epoch += 1;
    uploadEpoch += 1;
    state.itemPanel = {
      ...state.itemPanel,
      itemId: id,
      tab: 'updates',
      loading: true,
      error: '',
      data: { updates: [], files: [], activity: [] },
      uploading: false,
    };
    notify();
  };

  const close = (): void => {
    epoch += 1;
    uploadEpoch += 1;
    resetItemPanel(state);
    notify();
  };

  const reset = (): void => {
    epoch += 1;
    uploadEpoch += 1;
    resetItemPanel(state);
  };

  const cancelPending = (): void => {
    epoch += 1;
    uploadEpoch += 1;
  };

  const setTab = (tab: unknown): tab is 'updates' | 'files' | 'activity' => {
    if (typeof tab !== 'string' || !VALID_TABS.has(tab as 'updates' | 'files' | 'activity')) return false;
    const nextTab = tab as ItemWorkspaceTab;
    if (state.itemPanel.tab === nextTab) return true;
    state.itemPanel.tab = nextTab;
    notify();
    return true;
  };

  const postUpdate = async (body: unknown): Promise<boolean> => {
    const text = String(body ?? '').trim();
    if (!text) return false;
    if (text.length > 5000) throw new WorkManagementError('Update is limited to 5000 characters.', { code: 'WM_VALIDATION', category: 'validation' });
    const itemId = activeItemId();
    if (!itemId) return false;
    const ticket = epoch;
    try {
      await service.addItemUpdate(itemId, text);
      if (!isCurrent(ticket, itemId)) return false;
      await load(itemId, { quiet: true });
      return state.itemPanel.itemId === itemId;
    } catch (error) {
      if (!isCurrent(ticket, itemId)) return false;
      throw normalizeAppError(error, { operation: 'boards.item-workspace.post-update' });
    }
  };

  const uploadFiles = async (files: readonly File[]): Promise<number | null> => {
    if (!files.length) return 0;
    const boardId = state.board?.board?.id as BoardId | undefined;
    const itemId = activeItemId();
    if (!boardId || !itemId) return null;
    const ticket = ++uploadEpoch;
    state.itemPanel.uploading = true;
    notify();
    let uploaded = 0;
    try {
      for (const file of files) {
        await service.uploadItemFile(boardId, itemId, file);
        uploaded += 1;
      }
      if (ticket !== uploadEpoch || state.itemPanel.itemId !== itemId) return null;
      await load(itemId, { quiet: true });
      return uploaded;
    } catch (error) {
      if (ticket !== uploadEpoch || state.itemPanel.itemId !== itemId) return null;
      await load(itemId, { quiet: true });
      throw normalizeAppError(error, { operation: 'boards.item-workspace.upload-files' });
    } finally {
      if (ticket === uploadEpoch && state.itemPanel.itemId === itemId) {
        state.itemPanel.uploading = false;
        notify();
      }
    }
  };

  const deleteUpdate = async (updateId: string | number): Promise<boolean> => {
    const itemId = activeItemId();
    if (!itemId) return false;
    const ticket = epoch;
    try {
      await service.deleteItemUpdate(updateId);
      if (!isCurrent(ticket, itemId)) return false;
      await load(itemId, { quiet: true });
      return state.itemPanel.itemId === itemId;
    } catch (error) {
      if (!isCurrent(ticket, itemId)) return false;
      throw normalizeAppError(error, { operation: 'boards.item-workspace.delete-update' });
    }
  };

  const openFile = async (fileId: string): Promise<boolean> => {
    const file = state.itemPanel.data.files.find((entry) => entry.id === fileId);
    if (!file) return false;
    try {
      await service.openItemFile(file);
      return true;
    } catch (error) {
      throw normalizeAppError(error, { operation: 'boards.item-workspace.open-file' });
    }
  };

  const deleteFile = async (fileId: string): Promise<boolean> => {
    const file = state.itemPanel.data.files.find((entry) => entry.id === fileId);
    const itemId = activeItemId();
    if (!file || !itemId) return false;
    const ticket = epoch;
    try {
      await service.deleteItemFile(file);
      if (!isCurrent(ticket, itemId)) return false;
      await load(itemId, { quiet: true });
      return state.itemPanel.itemId === itemId;
    } catch (error) {
      if (!isCurrent(ticket, itemId)) return false;
      throw normalizeAppError(error, { operation: 'boards.item-workspace.delete-file' });
    }
  };

  return Object.freeze({
    get currentItemId() { return activeItemId(); },
    open,
    close,
    reset,
    cancelPending,
    setTab,
    load,
    postUpdate,
    uploadFiles,
    deleteUpdate,
    openFile,
    deleteFile,
  });
}
