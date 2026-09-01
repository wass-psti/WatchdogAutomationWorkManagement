import type { BoardColumn, BoardColumnType, BoardGroup, BoardItem, BoardRecord, StatusLabel } from '../../../../../src/features/boards/contracts/domain.ts';
import type { MutableBoardViewState } from '../../../../../src/features/boards/contracts/view-state.ts';
import type { BoardColumnId } from '../../../../../src/types/identifiers.ts';
import type { EscapeHtml, IconSet } from '../../../../../src/platform/contracts/ui.ts';
import { BOARD_ROLE_LABELS } from '../board-schema.ts';
import { buttonClass, fieldControlClass, iconButtonClass, toolbarClass } from '../../../platform/ui/primitives.ts';


export interface BoardHistoryPresentationState {
  readonly canUndo?: boolean;
  readonly canRedo?: boolean;
  readonly undoLabel?: string | null;
  readonly redoLabel?: string | null;
}

export interface BoardSortPresentationState {
  readonly id: BoardColumnId | string | null;
  readonly direction: 'asc' | 'desc' | null;
}

export interface BoardHeaderRenderOptions {
  readonly board: BoardRecord;
  readonly canEdit: boolean;
  readonly canManage: boolean;
  readonly icons: IconSet;
  readonly escapeHtml: EscapeHtml;
}

export interface BoardControlsRenderOptions {
  readonly state: MutableBoardViewState;
  readonly canEdit: boolean;
  readonly icons: IconSet;
  readonly escapeHtml: EscapeHtml;
  readonly historyState?: BoardHistoryPresentationState;
  readonly statusLabels?: readonly StatusLabel[];
}

export interface BoardItemRowRenderOptions {
  readonly state: MutableBoardViewState;
  readonly item: BoardItem;
  readonly group: BoardGroup;
  readonly columns: readonly BoardColumn[];
  readonly canEdit: boolean;
  readonly isWrapped: (columnId: BoardColumnId | string) => boolean;
  readonly formatCell: (item: BoardItem, column: BoardColumn) => string;
  readonly escapeHtml: EscapeHtml;
  readonly isSelected?: boolean;
}

export interface BoardColumnHeaderRenderOptions {
  readonly column: BoardColumn;
  readonly canEdit: boolean;
  readonly sort: BoardSortPresentationState;
  readonly filter: string;
  readonly wrapped: boolean;
  readonly columnTypeLabel: (columnType: BoardColumnType) => string;
  readonly escapeHtml: EscapeHtml;
}

/** Shared board workspace chrome and Table composition primitives. */
export function renderBoardHeader({ board, canEdit, canManage, icons, escapeHtml }: BoardHeaderRenderOptions): string {
  const esc = escapeHtml;
  const roleLabel = board.member_role ? (BOARD_ROLE_LABELS[board.member_role] ?? board.member_role) : 'Viewer';
  const secondary = buttonClass({ tone: 'secondary' }, 'secondary-btn');
  const more = iconButtonClass({ tone: 'ghost' }, 'secondary-btn board-more-trigger');
  return `<section class="board-detail-head"><button class="${buttonClass({ tone: 'ghost' }, 'board-back')}" data-board-back>${icons.back} All boards</button><div class="board-title-row"><div><span class="top-eyebrow">${esc(roleLabel.toUpperCase())}</span><h2 title="${esc(board.name)}">${esc(board.name)}</h2><p>${esc(board.description || 'No description yet.')}</p></div><div class="${toolbarClass('board-head-actions')}">${canManage ? `<button class="${secondary}" data-board-members title="Manage board access and member roles">Members</button>` : ''}${canEdit ? `<button class="${secondary}" data-board-columns title="Add, reorder, configure, hide, or delete columns">Columns</button><button class="${secondary}" data-board-edit>Edit board</button>` : ''}<button class="${secondary}" data-board-activity title="Review recent changes to this board">Activity</button><span class="board-menu-host" data-board-menu-host><button type="button" class="${more}" data-board-menu-trigger="board" aria-label="More actions for this board" aria-haspopup="menu" aria-expanded="false">•••</button><template data-board-menu-template>${canEdit ? '<button role="menuitem" data-board-duplicate-current>Duplicate board</button>' : ''}${canManage ? '<button role="menuitem" data-board-archive-current>Archive board</button><button role="menuitem" class="danger-text" data-board-trash-current>Move board to trash</button>' : ''}</template></span></div></div></section>`;
}

export function renderBoardControls({ state, canEdit, icons, escapeHtml, historyState = {}, statusLabels = [] }: BoardControlsRenderOptions): string {
  const esc = escapeHtml;
  const filtered = Object.values(state.boardPrefs.column_filters ?? {}).some((value) => String(value ?? '').trim());
  const sorted = Boolean(state.boardPrefs.sort_column_id && state.boardPrefs.sort_direction);
  const view = state.board?.board?.view_mode ?? state.board?.board?.view ?? 'table';
  const firstGroup = state.board?.groups[0]?.id || '';
  const secondary = buttonClass({ tone: 'secondary' }, 'secondary-btn');
  return `<section class="${toolbarClass('board-controls board-controls-rich')}" data-wrap="true" aria-label="Board workspace controls">
    <div class="board-controls-primary">${canEdit && firstGroup ? `<button type="button" class="${buttonClass({ tone: 'primary' }, 'primary-btn board-new-item')}" data-inline-add-focus="${firstGroup}">+ Add item</button>` : ''}<div class="wm-segmented view-switch" role="group" aria-label="Board view"><button data-board-view="table" class="${view === 'table' ? 'active' : ''}" aria-pressed="${view === 'table'}">Table</button><button data-board-view="kanban" class="${view === 'kanban' ? 'active' : ''}" aria-pressed="${view === 'kanban'}">Kanban</button></div></div>
    <div class="board-controls-query"><label class="wm-search board-search compact">${icons.search}<input class="${fieldControlClass({ kind: 'search', compact: true })}" type="search" data-item-search value="${esc(state.itemSearch)}" placeholder="Search items and field values" aria-label="Search items and field values on this board"></label><label class="wm-field board-filter"><span class="wm-field-label">Status</span><select class="${fieldControlClass({ kind: 'select', compact: true })}" data-item-status><option value="all">Any status</option>${statusLabels.filter((label) => label.active || String(label.id) === String(state.itemStatus)).map((label) => `<option value="${esc(label.id)}" ${String(state.itemStatus) === String(label.id) ? 'selected' : ''}>${esc(label.name)}${label.active ? '' : ' (inactive)'}</option>`).join('')}</select></label></div>
    <div class="board-controls-secondary"><button class="${buttonClass({ tone: 'secondary', state: state.showArchived ? 'selected' : 'default' }, 'secondary-btn')}" data-toggle-archived-items aria-pressed="${state.showArchived}">${state.showArchived ? 'Hide archived' : 'Show archived'}</button><button class="${secondary} board-view-reset" data-reset-board-view ${filtered || sorted ? '' : 'disabled'} title="Reset filters, sorting, wrapping, column widths, and collapsed groups">Reset view</button>${canEdit ? `<button class="${secondary}" data-add-group>+ Add group</button>` : ''}<div class="board-history-controls" role="group" aria-label="Undo and redo"><button type="button" class="${iconButtonClass({ tone: 'ghost', size: 'sm' }, 'icon-btn')}" data-board-undo ${historyState.canUndo ? '' : 'disabled'} title="${historyState.undoLabel ? `Undo ${esc(historyState.undoLabel)}` : 'Nothing to undo'}" aria-label="Undo">↶</button><button type="button" class="${iconButtonClass({ tone: 'ghost', size: 'sm' }, 'icon-btn')}" data-board-redo ${historyState.canRedo ? '' : 'disabled'} title="${historyState.redoLabel ? `Redo ${esc(historyState.redoLabel)}` : 'Nothing to redo'}" aria-label="Redo">↷</button></div></div>
  </section>`;
}

export function renderBoardItemRow({ state, item, group, columns, canEdit, isWrapped, formatCell, escapeHtml, isSelected = false }: BoardItemRowRenderOptions): string {
  const esc = escapeHtml;
  return `<tr class="board-item-row ${state.itemPanel.itemId === item.id ? 'is-detail-open' : ''} ${isSelected ? 'is-selected' : ''}" draggable="${canEdit}" data-item-id="${item.id}" data-group-id="${group.id}">
    <td class="selection-cell"><input class="wm-checkbox" type="checkbox" data-select-item="${item.id}" ${isSelected ? 'checked' : ''} aria-label="Select item: ${esc(item.title)}"></td>
    <td class="drag-cell"><span class="drag-handle" aria-hidden="true" title="Drag to reorder item">⋮⋮</span></td>
    <td class="board-item-name-cell" data-column-width-key="__item"><div class="board-item-name-shell"><button type="button" class="item-inline-title" data-open-item="${item.id}" title="Open ${esc(item.title)}">${esc(item.title)}</button>${canEdit ? `<button type="button" class="wm-icon-button wm-icon-button--ghost wm-control--sm item-title-edit-button" data-edit-item-title="${item.id}" aria-label="Rename ${esc(item.title)}" title="Rename item">✎</button>` : ''}<button type="button" class="wm-icon-button wm-icon-button--ghost wm-control--sm item-details-bubble" data-open-item="${item.id}" aria-label="Open details for ${esc(item.title)}">↗</button></div></td>
    ${columns.map((column) => `<td class="board-data-cell ${isWrapped(column.id) ? 'is-wrapped' : ''}" data-column-type="${column.data_type}" data-column-id="${column.id}" data-column-width-key="${column.id}"><button type="button" class="board-cell-button" data-edit-cell="${item.id}" data-column-id="${column.id}" ${canEdit ? '' : 'disabled'} aria-label="${canEdit ? 'Edit' : 'View'} ${esc(column.name)} for ${esc(item.title)}">${formatCell(item, column)}</button></td>`).join('')}
    <td class="item-actions"><span class="board-menu-host item-menu-host" data-board-menu-host><button type="button" class="wm-icon-button wm-icon-button--ghost wm-control--sm item-more-trigger" data-board-menu-trigger="item" aria-label="More actions for ${esc(item.title)}" aria-haspopup="menu" aria-expanded="false">•••</button><template data-board-menu-template><button role="menuitem" data-open-item="${item.id}">Open item details</button>${canEdit ? `<button role="menuitem" data-edit-item="${item.id}">Edit item</button><button role="menuitem" data-duplicate-item="${item.id}">Duplicate item</button><button role="menuitem" data-archive-item="${item.id}" data-archive="${item.archived_at ? 'false' : 'true'}">${item.archived_at ? 'Restore item' : 'Archive item'}</button><button role="menuitem" class="danger-text" data-delete-item="${item.id}">Delete item permanently</button>` : ''}</template></span></td>
  </tr>`;
}

export function renderBoardColumnHeader({ column, canEdit, sort, filter, wrapped, columnTypeLabel, escapeHtml }: BoardColumnHeaderRenderOptions): string {
  const esc = escapeHtml;
  const sorted = sort.id === column.id;
  const nextDirection = !sorted ? 'asc' : sort.direction === 'asc' ? 'desc' : 'none';
  const sortLabel = !sorted ? `Sort ${column.name} ascending` : sort.direction === 'asc' ? `Sort ${column.name} descending` : `Clear ${column.name} sorting`;
  return `<th scope="col" data-column-id="${column.id}" data-column-width-key="${column.id}" class="board-column-head ${filter ? 'has-filter' : ''} ${sorted ? 'is-sorted' : ''}"><div class="column-head-shell"><span class="column-drag-handle" draggable="${canEdit}" data-column-drag="${column.id}" aria-label="Drag ${esc(column.name)} column" title="Drag to reorder column">⋮</span><button type="button" class="column-header-button" data-rename-column-inline="${column.id}" ${canEdit ? '' : 'disabled'} aria-label="${canEdit ? 'Rename' : 'View'} ${esc(column.name)} column"><span title="${esc(column.name)}">${esc(column.name)}</span><small>${esc(columnTypeLabel(column.data_type))}${filter ? ' · Filtered' : ''}</small></button><button type="button" class="wm-icon-button wm-icon-button--ghost wm-control--sm column-quick-sort ${sorted ? 'active' : ''}" data-column-quick-sort="${column.id}" data-direction="${nextDirection}" aria-label="${esc(sortLabel)}" title="${esc(sortLabel)}">${!sorted ? '↕' : sort.direction === 'asc' ? '↑' : '↓'}</button><details class="column-context-menu" data-board-menu-host><summary aria-label="${esc(column.name)} column actions" aria-haspopup="menu" aria-expanded="false" data-board-menu-trigger="column">•••</summary><template data-board-menu-template>${canEdit ? `<button role="menuitem" data-edit-column="${column.id}">Configure column</button>` : ''}<button role="menuitem" data-column-filter="${column.id}">${filter ? 'Edit filter' : 'Filter column'}</button><button role="menuitem" data-column-sort="${column.id}" data-direction="asc">Sort ascending${sorted && sort.direction === 'asc' ? ' ✓' : ''}</button><button role="menuitem" data-column-sort="${column.id}" data-direction="desc">Sort descending${sorted && sort.direction === 'desc' ? ' ✓' : ''}</button>${sorted ? `<button role="menuitem" data-column-sort="${column.id}" data-direction="none">Clear sorting</button>` : ''}<button role="menuitem" data-column-wrap="${column.id}">${wrapped ? 'Unwrap text' : 'Wrap text'}</button>${canEdit ? `<hr><button role="menuitem" data-column-duplicate="${column.id}">Duplicate column</button><button role="menuitem" data-column-add-right="${column.id}">Add column to right</button>${column.system_key ? '' : `<button role="menuitem" data-column-change-type="${column.id}">Change column type</button>`}<button role="menuitem" data-column-hide="${column.id}">Hide column</button><hr><button class="danger-text" role="menuitem" data-column-delete="${column.id}">Delete column permanently</button>` : ''}</template></details><span class="column-resize-handle" data-column-resize="${column.id}" role="separator" aria-orientation="vertical" aria-label="Resize ${esc(column.name)} column"></span></div></th>`;
}
