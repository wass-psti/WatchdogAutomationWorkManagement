import type { BoardDomainService } from '../../../../../src/features/boards/contracts/service.ts';
import type { BoardLifecycleStatus } from '../../../../../src/features/boards/contracts/domain.ts';
import type { MutableBoardViewState } from '../../../../../src/features/boards/contracts/view-state.ts';
import type { BoardId } from '../../../../../src/types/identifiers.ts';
import { normalizeAppError } from '../../../platform/errors/app-error.ts';

export interface BoardDataControllerDependencies {
  readonly state: MutableBoardViewState;
  readonly service: BoardDomainService;
  readonly onListChange: () => void;
  readonly onBoardChange: () => void;
  readonly onBoardLoaded?: (() => void) | null;
  readonly onWarning?: ((message: string) => void) | null;
}

export interface BoardDataController {
  loadBoards(status?: BoardLifecycleStatus): Promise<boolean>;
  loadBoard(boardId: BoardId | string, options?: Readonly<{ quiet?: boolean }>): Promise<boolean>;
  cancelPending(): void;
}

const defaultPreferences = () => ({
  sort_column_id: null,
  sort_direction: null,
  column_filters: {},
  wrap_columns: [],
  column_widths: {},
  item_name_width: 280,
  collapsed_groups: [],
} as const);

export function createBoardDataController({
  state,
  service,
  onListChange,
  onBoardChange,
  onBoardLoaded = null,
  onWarning = null,
}: BoardDataControllerDependencies): BoardDataController {
  let epoch = 0;

  const loadBoards = async (status: BoardLifecycleStatus = state.status): Promise<boolean> => {
    const ticket = ++epoch;
    state.loading = true;
    state.error = '';
    onListChange();
    try {
      const rows = await service.list(status);
      if (ticket !== epoch) return false;
      state.boards = rows;
      return true;
    } catch (error) {
      if (ticket !== epoch) return false;
      state.error = normalizeAppError(error, { operation: 'boards.data.load-list', fallbackMessage: 'Boards could not be loaded. Try again.' }).message;
      return false;
    } finally {
      if (ticket === epoch) {
        state.loading = false;
        onListChange();
      }
    }
  };

  const loadBoard = async (boardId: BoardId | string, { quiet = false }: Readonly<{ quiet?: boolean }> = {}): Promise<boolean> => {
    const id = String(boardId) as BoardId;
    const ticket = ++epoch;
    if (!quiet) {
      state.loading = true;
      state.error = '';
      onBoardChange();
    }
    try {
      const data = await service.get(id);
      if (ticket !== epoch) return false;
      state.board = data;
      state.error = '';
      onBoardLoaded?.();
      if (state.prefsLoadedFor !== id) {
        try {
          state.boardPrefs = { ...defaultPreferences(), ...(await service.getPreferences(id)) };
          state.prefsLoadedFor = id;
        } catch (error) {
          state.boardPrefs = defaultPreferences();
          const normalized = normalizeAppError(error, { operation: 'boards.data.load-preferences', fallbackMessage: 'Your saved board view could not be loaded.' });
          onWarning?.(`Your saved board view could not be loaded: ${normalized.message}`);
        }
      }
      return true;
    } catch (error) {
      if (ticket !== epoch) return false;
      state.error = normalizeAppError(error, { operation: 'boards.data.load-board', fallbackMessage: 'This board could not be loaded. Try again.' }).message;
      return false;
    } finally {
      if (ticket === epoch) {
        state.loading = false;
        onBoardChange();
      }
    }
  };

  const cancelPending = (): void => { epoch += 1; };

  return Object.freeze({ loadBoards, loadBoard, cancelPending });
}
