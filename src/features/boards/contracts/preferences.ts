import type { BoardCommandService } from './commands.ts';
import type { MutableBoardViewState } from './view-state.ts';
import type { BoardPreferencePatchService } from './preference-patches.ts';
import type { BoardColumnId } from '../../../types/identifiers.ts';

export interface BoardPreferencePersistenceDependencies {
  readonly state: MutableBoardViewState;
  readonly commands: BoardCommandService;
  readonly patches: BoardPreferencePatchService;
  readonly onWarning?: ((message: string) => void) | null;
  readonly delayMs?: number;
}

export interface BoardPreferencePersistenceController {
  schedule(): void;
  saveNow(): Promise<boolean>;
  removeColumnReferences(columnId: BoardColumnId | string): Promise<boolean>;
  cancel(): void;
  dispose(): void;
}
