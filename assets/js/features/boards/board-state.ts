import type { MutableBoardViewState, MutableItemWorkspaceState } from '../../../../src/features/boards/contracts/view-state.ts';

function emptyWorkspaceData(): MutableItemWorkspaceState['data'] {
  return { updates: [], files: [], activity: [] };
}

function emptyItemPanel(): MutableItemWorkspaceState {
  return {
    itemId: null,
    tab: 'updates',
    loading: false,
    error: '',
    data: emptyWorkspaceData(),
    uploading: false,
  };
}

export function createBoardViewState(): MutableBoardViewState {
  return {
    status: 'active',
    search: '',
    boards: [],
    board: null,
    loading: false,
    error: '',
    itemSearch: '',
    itemStatus: 'all',
    showArchived: false,
    boardPrefs: {
      sort_column_id: null,
      sort_direction: null,
      column_filters: {},
      wrap_columns: [],
      column_widths: {},
      item_name_width: 280,
      collapsed_groups: [],
    },
    prefsLoadedFor: null,
    selectedItems: [],
    selectionAnchor: null,
    inlineDraft: null,
    itemPanel: emptyItemPanel(),
  };
}

export function resetItemPanel(state: MutableBoardViewState): MutableItemWorkspaceState {
  state.itemPanel = {
    ...state.itemPanel,
    ...emptyItemPanel(),
  };
  return state.itemPanel;
}

export function resetBoardInteractionState(state: MutableBoardViewState): void {
  state.selectedItems = [];
  state.selectionAnchor = null;
  state.inlineDraft = null;
}
