import type {
  BoardActivityLoadResult,
  BoardActivityRuntime,
  BoardActivityRuntimeDependencies,
} from '../../../../../src/features/boards/contracts/activity.ts';
import { normalizeAppError } from '../../../platform/errors/app-error.ts';

export function createBoardActivityRuntime({ state, service }: BoardActivityRuntimeDependencies): BoardActivityRuntime {
  let epoch = 0;

  const loadRecent = async (limit = 100): Promise<BoardActivityLoadResult> => {
    const boardId = state.board?.board?.id;
    if (!boardId) return Object.freeze({ status: 'stale', events: Object.freeze([]) });
    const ticket = ++epoch;
    try {
      const events = await service.events(boardId, Math.max(1, Math.min(500, Math.trunc(limit))));
      if (ticket !== epoch || state.board?.board?.id !== boardId) return Object.freeze({ status: 'stale', events: Object.freeze([]) });
      return Object.freeze({ status: 'applied', events });
    } catch (error) {
      if (ticket !== epoch || state.board?.board?.id !== boardId) return Object.freeze({ status: 'stale', events: Object.freeze([]) });
      throw normalizeAppError(error, { operation: 'boards.activity.load', fallbackMessage: 'Recent board activity could not be retrieved. Try again.' });
    }
  };

  const cancelPending = (): void => { epoch += 1; };
  return Object.freeze({ loadRecent, cancelPending });
}
