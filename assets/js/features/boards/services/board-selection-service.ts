import type { BoardItem } from '../../../../../src/features/boards/contracts/domain.ts';
import type { BoardSelectionService, BoardSelectionServiceDependencies } from '../../../../../src/features/boards/contracts/selection.ts';
import type { BoardGroupId, BoardItemId } from '../../../../../src/types/identifiers.ts';
import { normalizeAppError } from '../../../platform/errors/app-error.ts';

export function createBoardSelectionService({ state, commands, getVisibleItems }: BoardSelectionServiceDependencies): BoardSelectionService {
  const selectedSet = (): Set<string> => new Set(state.selectedItems.map(String));

  const normalize = (): void => {
    const valid = new Set((state.board?.items ?? []).map((item) => String(item.id)));
    state.selectedItems = state.selectedItems.map(String).filter((id) => valid.has(id));
    if (state.selectionAnchor && !valid.has(String(state.selectionAnchor))) state.selectionAnchor = null;
  };

  const isSelected = (itemId: BoardItemId | string): boolean => selectedSet().has(String(itemId));

  const clear = (): void => {
    state.selectedItems = [];
    state.selectionAnchor = null;
  };

  const toggle = (itemId: BoardItemId | string, { range = false }: Readonly<{ range?: boolean }> = {}): void => {
    const id = String(itemId ?? '');
    if (!id) return;
    const selected = selectedSet();
    const visible = getVisibleItems().map((item) => String(item.id));
    if (range && state.selectionAnchor && visible.includes(String(state.selectionAnchor)) && visible.includes(id)) {
      const anchorIndex = visible.indexOf(String(state.selectionAnchor));
      const itemIndex = visible.indexOf(id);
      const [start, end] = anchorIndex < itemIndex ? [anchorIndex, itemIndex] : [itemIndex, anchorIndex];
      visible.slice(start, end + 1).forEach((entry) => selected.add(entry));
    } else if (selected.has(id)) selected.delete(id);
    else selected.add(id);
    state.selectedItems = [...selected];
    state.selectionAnchor = id;
  };

  const selectVisible = (checked = true, groupId: BoardGroupId | string | null = null): void => {
    const visible = getVisibleItems()
      .filter((item) => groupId == null || String(item.group_id) === String(groupId))
      .map((item) => String(item.id));
    if (!checked) {
      const visibleSet = new Set(visible);
      state.selectedItems = state.selectedItems.filter((id) => !visibleSet.has(String(id)));
      return;
    }
    const selected = selectedSet();
    visible.forEach((id) => selected.add(id));
    state.selectedItems = [...selected];
    state.selectionAnchor = visible.at(-1) ?? null;
  };

  const selectedItems = (): readonly BoardItem[] => {
    const selected = selectedSet();
    return (state.board?.items ?? []).filter((item) => selected.has(String(item.id)));
  };

  const runSelected = async (operation: string, handler: (item: BoardItem, index: number) => Promise<unknown>): Promise<number> => {
    const items = [...selectedItems()];
    if (!items.length) return 0;
    try {
      for (const [index, item] of items.entries()) await handler(item, index);
      clear();
      return items.length;
    } catch (error) {
      throw normalizeAppError(error, { operation });
    }
  };

  const duplicateSelected = (): Promise<number> => runSelected('boards.selection.duplicate', (item) => commands.duplicateItem(item.id));
  const archiveSelected = (): Promise<number> => runSelected('boards.selection.archive', (item) => commands.archiveItem(item.id, true));
  const deleteSelected = (): Promise<number> => runSelected('boards.selection.delete', (item) => commands.deleteItem(item.id));

  const moveSelected = (groupId: BoardGroupId | string): Promise<number> => {
    const id = String(groupId ?? '') as BoardGroupId;
    const startPosition = (state.board?.items ?? []).filter((item) => String(item.group_id) === id && !item.archived_at).length;
    return runSelected('boards.selection.move', (item, index) => commands.moveItem({
      itemId: item.id,
      groupId: id,
      position: startPosition + index,
      status: item.status,
    }));
  };

  return Object.freeze({ normalize, isSelected, clear, toggle, selectVisible, selectedItems, duplicateSelected, archiveSelected, deleteSelected, moveSelected });
}
