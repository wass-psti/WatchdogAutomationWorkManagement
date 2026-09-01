import type { BoardEvent } from './domain.ts';
import type { BoardDomainService } from './service.ts';
import type { MutableBoardViewState } from './view-state.ts';

export type BoardActivityLoadResult =
  | Readonly<{ status: 'applied'; events: readonly BoardEvent[] }>
  | Readonly<{ status: 'stale'; events: readonly BoardEvent[] }>;

export interface BoardActivityRuntimeDependencies {
  readonly state: MutableBoardViewState;
  readonly service: BoardDomainService;
}

export interface BoardActivityRuntime {
  loadRecent(limit?: number): Promise<BoardActivityLoadResult>;
  cancelPending(): void;
}
