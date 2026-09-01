import type {
  BoardPreferencePersistenceController,
  BoardPreferencePersistenceDependencies,
} from '../../../../../src/features/boards/contracts/preferences.ts';
import type { BoardColumnId } from '../../../../../src/types/identifiers.ts';
import { normalizeAppError } from '../../../platform/errors/app-error.ts';

/** Owns debounced and immediate persistence of per-member Board view preferences. */
export function createBoardPreferencePersistenceController({
  state,
  commands,
  patches,
  onWarning = null,
  delayMs = 180,
}: BoardPreferencePersistenceDependencies): BoardPreferencePersistenceController {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;
  let saveEpoch = 0;

  const warn = (message: string): void => { onWarning?.(message); };
  const cancel = (): void => {
    saveEpoch += 1;
    if (timer) clearTimeout(timer);
    timer = null;
  };

  const saveNow = async (): Promise<boolean> => {
    if (disposed) return false;
    if (timer) clearTimeout(timer);
    timer = null;
    const boardId = state.board?.board?.id;
    if (!boardId) return false;
    const ticket = ++saveEpoch;
    try {
      const saved = await commands.savePreferences(boardId, state.boardPrefs);
      if (disposed || ticket !== saveEpoch || state.board?.board?.id !== boardId) return false;
      state.boardPrefs = saved;
      return true;
    } catch (error) {
      if (disposed || ticket !== saveEpoch || state.board?.board?.id !== boardId) return false;
      const normalized = normalizeAppError(error, {
        operation: 'boards.preferences.save',
        fallbackMessage: 'Your board view settings could not be saved.',
      });
      warn(`Your board view settings could not be saved: ${normalized.message}`);
      return false;
    }
  };

  const schedule = (): void => {
    if (disposed || !state.board?.board?.id) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { void saveNow(); }, Math.max(0, Math.trunc(delayMs)));
  };

  const removeColumnReferences = async (columnId: BoardColumnId | string): Promise<boolean> => {
    if (disposed || !state.board?.board?.id) return false;
    state.boardPrefs = patches.withoutColumnReferences(state.boardPrefs, columnId);
    if (timer) clearTimeout(timer);
    timer = null;
    const boardId = state.board.board.id;
    const ticket = ++saveEpoch;
    try {
      const saved = await commands.savePreferences(boardId, state.boardPrefs);
      if (disposed || ticket !== saveEpoch || state.board?.board?.id !== boardId) return false;
      state.boardPrefs = saved;
      return true;
    } catch (error) {
      if (disposed || ticket !== saveEpoch || state.board?.board?.id !== boardId) return false;
      const normalized = normalizeAppError(error, {
        operation: 'boards.preferences.remove-column-references',
        fallbackMessage: 'Related board view settings could not be cleared.',
      });
      warn(`The column was deleted, but related view settings could not be cleared: ${normalized.message}`);
      return false;
    }
  };

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    cancel();
  };

  return Object.freeze({ schedule, saveNow, removeColumnReferences, cancel, dispose });
}
