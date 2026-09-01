import type {
  BoardEnvelope,
  BoardLifecycleStatus,
  BoardPreferences,
  BoardRecord,
  ItemWorkspaceEnvelope,
} from './domain.ts';
import type { BoardId, BoardItemId, StatusLabelId } from '../../../types/identifiers.ts';

export type ItemWorkspaceTab = 'updates' | 'files' | 'activity';

export interface BoardInlineDraft {
  readonly kind?: string;
  readonly id?: string;
  readonly value?: unknown;
  readonly [key: string]: unknown;
}

export interface MutableItemWorkspaceState {
  itemId: BoardItemId | null;
  tab: ItemWorkspaceTab;
  loading: boolean;
  error: string;
  data: ItemWorkspaceEnvelope;
  uploading: boolean;
}

export interface MutableBoardViewState {
  status: BoardLifecycleStatus;
  search: string;
  boards: readonly BoardRecord[];
  board: BoardEnvelope | null;
  loading: boolean;
  error: string;
  itemSearch: string;
  itemStatus: StatusLabelId | 'all';
  showArchived: boolean;
  boardPrefs: BoardPreferences;
  prefsLoadedFor: BoardId | null;
  selectedItems: BoardItemId[];
  selectionAnchor: BoardItemId | null;
  inlineDraft: BoardInlineDraft | null;
  itemPanel: MutableItemWorkspaceState;
}
