import type { BoardColumn, BoardGroup, BoardItem } from '../../../../../src/features/boards/contracts/domain.ts';
import type { MutableBoardViewState } from '../../../../../src/features/boards/contracts/view-state.ts';
import type { BoardColumnId, BoardItemId } from '../../../../../src/types/identifiers.ts';
import type { EscapeHtml } from '../../../../../src/platform/contracts/ui.ts';

export interface BoardTableRenderOptions {
  readonly state: MutableBoardViewState;
  readonly groups: readonly BoardGroup[];
  readonly items: readonly BoardItem[];
  readonly visibleColumns: () => readonly BoardColumn[];
  readonly allColumns: () => readonly BoardColumn[];
  readonly canEdit: () => boolean;
  readonly itemMatches: (item: BoardItem) => boolean;
  readonly compareItems: (left: BoardItem, right: BoardItem) => number;
  readonly renderColumnHeader: (column: BoardColumn) => string;
  readonly renderItemRow: (item: BoardItem, group: BoardGroup, columns: readonly BoardColumn[]) => string;
  readonly escapeHtml: EscapeHtml;
  readonly isSelected?: (itemId: BoardItemId) => boolean;
  readonly itemNameWidth?: number;
  readonly columnWidth?: (columnId: BoardColumnId) => number;
}

const GROUP_ACCENTS = Object.freeze(['#5b7cfa', '#7c5ce7', '#e06083', '#dc7a34', '#2f9e73', '#2186a8', '#8b6b45', '#65758b'] as const);

/** Presentation-only interactive Table renderer for Work Boards. */
export function renderBoardTableView({
  state,
  groups,
  items,
  visibleColumns,
  allColumns,
  canEdit,
  itemMatches,
  compareItems,
  renderColumnHeader,
  renderItemRow,
  escapeHtml,
  isSelected: _isSelected = () => false,
  itemNameWidth = 280,
  columnWidth = () => 160,
}: BoardTableRenderOptions): string {
  const esc = escapeHtml;
  const columns = visibleColumns().filter((column) => column.system_key !== 'title');
  const filtered = Boolean(state.itemSearch || state.itemStatus !== 'all' || Object.values(state.boardPrefs.column_filters ?? {}).some(Boolean));
  const selected = new Set((state.selectedItems || []).map(String));
  const collapsed = new Set((state.boardPrefs.collapsed_groups || []).map(String));
  const itemsByGroup = new Map<string, BoardItem[]>();
  for (const item of items) {
    if (!itemMatches(item)) continue;
    const key = String(item.group_id);
    const list = itemsByGroup.get(key);
    if (list) list.push(item);
    else itemsByGroup.set(key, [item]);
  }
  for (const list of itemsByGroup.values()) list.sort(compareItems);
  const safeAccent = (group: BoardGroup, index: number): string => /^#[0-9a-f]{6}$/i.test(String(group.accent_color || ''))
    ? String(group.accent_color)
    : (GROUP_ACCENTS[index % GROUP_ACCENTS.length] ?? '#65758b');

  return `<div class="board-table-view board-sheet-view" role="region" aria-label="Board table">${groups.map((group, groupIndex) => {
    const list = itemsByGroup.get(String(group.id)) ?? [];
    const isCollapsed = collapsed.has(String(group.id));
    const groupVisibleIds = list.map((item) => String(item.id));
    const allGroupSelected = groupVisibleIds.length > 0 && groupVisibleIds.every((id) => selected.has(id));
    const colCount = columns.length + 4;
    const accent = safeAccent(group, groupIndex);
    const countLabel = `${list.length} ${list.length === 1 ? 'item' : 'items'}${filtered ? ' visible' : ''}`;
    return `<section class="board-group board-sheet-group ${isCollapsed ? 'is-collapsed' : ''}" data-group-id="${group.id}" style="--group-accent:${accent}">
      <header class="board-group-header board-sheet-group-header" data-group-id="${group.id}" data-drop-group="${group.id}">
        <div class="board-group-identity"><span class="group-accent-rail" aria-hidden="true"></span><span class="group-drag-handle" draggable="${canEdit() ? 'true' : 'false'}" data-group-drag="${group.id}" aria-label="Reorder group: ${esc(group.title)}" title="Drag to reorder group">⋮⋮</span><button type="button" class="group-collapse" data-toggle-group="${group.id}" aria-expanded="${!isCollapsed}" aria-label="${isCollapsed ? 'Expand' : 'Collapse'} ${esc(group.title)}">${isCollapsed ? '›' : '⌄'}</button><div class="group-heading-copy"><button type="button" class="group-title-inline" data-rename-group-inline="${group.id}" ${canEdit() ? '' : 'disabled'} title="${canEdit() ? 'Rename group' : esc(group.title)}"><span>${esc(group.title)}</span></button><small>${countLabel}</small></div></div>
        ${canEdit() ? `<div class="board-group-actions"><button type="button" class="group-add-item-button" data-inline-add-focus="${group.id}">+ Add item</button><span class="board-menu-host" data-board-menu-host><button type="button" class="group-more-trigger" data-board-menu-trigger="group" aria-label="More actions for group ${esc(group.title)}" aria-haspopup="menu" aria-expanded="false">•••</button><template data-board-menu-template><button role="menuitem" data-rename-group="${group.id}">Rename group</button><button role="menuitem" data-group-accent="${group.id}">Change group color</button><hr><button role="menuitem" class="danger-text" data-delete-group="${group.id}">Delete group and items</button></template></span></div>` : ''}
      </header>
      ${isCollapsed ? '' : `<div class="board-table-scroll" data-group-table-scroll="${group.id}"><table class="board-data-table interactive-board-table board-sheet-table" aria-label="${esc(group.title)} items"><colgroup><col class="select-col"><col class="drag-col"><col data-column-width-key="__item" style="width:${itemNameWidth}px;min-width:${itemNameWidth}px;max-width:${itemNameWidth}px">${columns.map((column) => { const width = columnWidth(column.id); return `<col data-column-width-key="${column.id}" style="width:${width}px;min-width:${width}px;max-width:${width}px">`; }).join('')}<col class="actions-col"></colgroup><thead><tr><th class="selection-cell"><input type="checkbox" data-select-visible="${group.id}" ${allGroupSelected ? 'checked' : ''} aria-label="Select all visible items in ${esc(group.title)}"></th><th class="drag-cell"></th><th class="board-item-name-head" data-column-width-key="__item"><div class="identity-column-head"><span>Item</span><small>ITEM NAME</small><span class="column-resize-handle" data-column-resize="__item" role="separator" aria-orientation="vertical" aria-label="Resize item column"></span></div></th>${columns.map(renderColumnHeader).join('')}<th class="actions-head">${canEdit() ? '<button type="button" class="add-column-head" data-add-column aria-label="Add column"><span aria-hidden="true">+</span><span>Column</span></button>' : 'Actions'}</th></tr></thead><tbody class="board-item-list" data-drop-group="${group.id}">${list.length ? list.map((item) => renderItemRow(item, group, columns)).join('') : `<tr><td class="group-empty" colspan="${colCount}">${filtered ? 'No items match the current view.' : 'No items in this group yet.'}</td></tr>`}${canEdit() ? `<tr class="inline-add-row board-group-add-row"><td class="selection-cell" aria-hidden="true"></td><td class="drag-cell" aria-hidden="true"></td><td class="inline-add-cell" colspan="${columns.length + 1}"><div class="inline-add-shell"><span class="inline-add-plus" aria-hidden="true">+</span><input type="text" data-inline-add-item="${group.id}" maxlength="240" placeholder="Add item" aria-label="Add an item to ${esc(group.title)}"><small>Enter to add · Shift+Enter to add another</small></div></td><td class="item-actions"></td></tr>` : ''}</tbody></table></div>`}
    </section>`;
  }).join('')}${canEdit() ? '<div class="board-add-group-separator"><button type="button" data-add-group><span aria-hidden="true">+</span> Add new group</button></div>' : ''}${!allColumns().length ? `<div class="board-schema-hint"><span>No custom columns yet.</span>${canEdit() ? '<button type="button" data-add-column>+ Add column</button>' : ''}</div>` : ''}</div>`;
}
