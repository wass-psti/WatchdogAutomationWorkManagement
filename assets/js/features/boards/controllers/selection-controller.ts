import type { BoardCommandService } from '../../../../../src/features/boards/contracts/commands.ts';
import type { BoardItem } from '../../../../../src/features/boards/contracts/domain.ts';
import type { BoardDialog, ConfirmAction, ReloadBoard } from '../../../../../src/features/boards/contracts/presentation.ts';
import type { MutableBoardViewState } from '../../../../../src/features/boards/contracts/view-state.ts';
import type { EscapeHtml, ToastRenderer } from '../../../../../src/platform/contracts/ui.ts';
import { createBoardSelectionService } from '../services/board-selection-service.ts';

interface BoardSelectionControllerDependencies {
  readonly state: MutableBoardViewState;
  readonly commands: BoardCommandService;
  readonly toast: ToastRenderer;
  readonly getVisibleItems: () => readonly BoardItem[];
  readonly reloadBoard: ReloadBoard;
  readonly escapeHtml: EscapeHtml;
  readonly canEdit?: () => boolean;
  readonly confirmAction?: ConfirmAction;
}

const errorMessage = (error: unknown, fallback: string): string => error instanceof Error ? error.message : fallback;

/** Presentation adapter for Board selection. Selection state and bulk mutation behavior are authoritative TypeScript. */
export function createBoardSelectionController({
  state,
  commands,
  toast,
  getVisibleItems,
  reloadBoard,
  escapeHtml,
  canEdit = () => false,
  confirmAction = (message) => globalThis.confirm(message),
}: BoardSelectionControllerDependencies) {
  const esc = escapeHtml;
  const selection = createBoardSelectionService({ state, commands, getVisibleItems });

  function renderToolbar(): string {
    const items = selection.selectedItems();
    if (!items.length) return '';
    const count = items.length;
    return `<aside class="board-selection-bar" data-board-selection-bar role="region" aria-label="Actions for selected items">
      <div class="selection-count"><span>${count}</span><strong>${count === 1 ? 'item selected' : 'items selected'}</strong></div>
      <div class="selection-actions">
        ${canEdit() ? '<button type="button" data-selection-duplicate title="Duplicate selected items">Duplicate</button><button type="button" data-selection-move title="Move selected items to another group">Move</button><button type="button" data-selection-archive title="Archive selected items">Archive</button>' : ''}
        <button type="button" data-selection-export title="Export selected items as CSV">Export CSV</button>
        ${canEdit() ? '<button type="button" class="danger-text" data-selection-delete title="Permanently delete selected items">Delete permanently</button>' : ''}
      </div>
      <button type="button" class="selection-close" data-selection-clear aria-label="Clear selection">×</button>
    </aside>`;
  }

  async function runEditable(action: () => Promise<number>, successMessage: (count: number) => string): Promise<boolean> {
    if (!canEdit()) {
      toast('You need edit access to change items on this board.', 'warning');
      return false;
    }
    try {
      const count = await action();
      if (!count) return false;
      toast(successMessage(count));
      await reloadBoard();
      return true;
    } catch (error) {
      toast(errorMessage(error, 'The selected items could not be updated.'), 'warning');
      return false;
    }
  }

  const duplicateSelected = (): Promise<boolean> => runEditable(
    () => selection.duplicateSelected(),
    (count) => `${count} selected item${count === 1 ? '' : 's'} duplicated.`,
  );

  const archiveSelected = (): Promise<boolean> => runEditable(
    () => selection.archiveSelected(),
    (count) => `${count} selected item${count === 1 ? '' : 's'} archived.`,
  );

  async function deleteSelected(): Promise<boolean> {
    if (!canEdit()) {
      toast('You need edit access to change items on this board.', 'warning');
      return false;
    }
    const count = selection.selectedItems().length;
    if (!count) return false;
    if (!confirmAction(`Delete ${count} selected item${count === 1 ? '' : 's'} permanently? Their item data cannot be recovered.`)) return false;
    return runEditable(
      () => selection.deleteSelected(),
      (deleted) => `${deleted} selected item${deleted === 1 ? '' : 's'} deleted permanently.`,
    );
  }

  function exportSelected(): void {
    const items = selection.selectedItems();
    if (!items.length) return;
    const rows: string[][] = [['Item', 'Group', 'Status', 'Due date']];
    const groups = new Map((state.board?.groups || []).map((group) => [String(group.id), group.title]));
    items.forEach((item) => rows.push([item.title, groups.get(String(item.group_id)) || '', item.status || '', item.due_date || '']));
    const csv = rows.map((row) => row.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'selected-board-items.csv';
    link.click();
    globalThis.setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Selected items exported as CSV.');
  }

  function openMoveDialog(dialog: BoardDialog): void {
    if (!canEdit()) {
      toast('You need edit access to change items on this board.', 'warning');
      return;
    }
    const items = selection.selectedItems();
    if (!items.length) return;
    const groups = state.board?.groups || [];
    dialog({
      title: `Move ${items.length} selected item${items.length === 1 ? '' : 's'}`,
      body: `<label class="field-label">Move to group<select name="group" required>${groups.map((group) => `<option value="${group.id}">${esc(group.title)}</option>`).join('')}</select></label><p class="field-help">Selected items move to the end of this group and keep their current status.</p>`,
      submitLabel: 'Move items',
      onSubmit: async (fd) => {
        const groupId = String(fd.get('group') || '');
        const count = await selection.moveSelected(groupId);
        toast(`${count} selected item${count === 1 ? '' : 's'} moved.`);
        await reloadBoard();
      },
    });
  }

  return Object.freeze({
    normalize: selection.normalize,
    isSelected: selection.isSelected,
    clear: selection.clear,
    toggle: selection.toggle,
    selectVisible: selection.selectVisible,
    selectedItems: selection.selectedItems,
    renderToolbar,
    duplicateSelected,
    archiveSelected,
    deleteSelected,
    exportSelected,
    openMoveDialog,
  });
}
