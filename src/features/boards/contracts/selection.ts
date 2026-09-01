import type { BoardItem } from './domain.ts';
import type { BoardGroupId, BoardItemId } from '../../../types/identifiers.ts';
import type { MutableBoardViewState } from './view-state.ts';
import type { BoardCommandService } from './commands.ts';

export interface BoardSelectionService {
  normalize(): void;
  isSelected(itemId: BoardItemId | string): boolean;
  clear(): void;
  toggle(itemId: BoardItemId | string, options?: Readonly<{ range?: boolean }>): void;
  selectVisible(checked?: boolean, groupId?: BoardGroupId | string | null): void;
  selectedItems(): readonly BoardItem[];
  duplicateSelected(): Promise<number>;
  archiveSelected(): Promise<number>;
  deleteSelected(): Promise<number>;
  moveSelected(groupId: BoardGroupId | string): Promise<number>;
}

export interface BoardSelectionServiceDependencies {
  readonly state: MutableBoardViewState;
  readonly commands: BoardCommandService;
  readonly getVisibleItems: () => readonly BoardItem[];
}
