import type { BoardRecord } from '../../../../../src/features/boards/contracts/domain.ts';
import type { MutableBoardViewState } from '../../../../../src/features/boards/contracts/view-state.ts';
import type { BoardRole } from '../../../../../src/types/auth.ts';
import type { DateFormatter, EscapeHtml, IconSet } from '../../../../../src/platform/contracts/ui.ts';
import { CAPABILITIES, hasBoardCapability } from '../../../platform/auth/permissions.ts';
import { BOARD_TABS, BOARD_TAB_LABELS, BOARD_ROLE_LABELS } from '../board-schema.ts';
import { buttonClass, fieldControlClass, iconButtonClass, toolbarClass } from '../../../platform/ui/primitives.ts';

type BoardListRecord = BoardRecord & Readonly<{ item_count?: number | string | null }>;

export interface BoardToolbarRenderOptions {
  readonly state: MutableBoardViewState;
  readonly icons: IconSet;
  readonly escapeHtml: EscapeHtml;
}

export interface BoardCardRenderOptions {
  readonly escapeHtml: EscapeHtml;
  readonly formatDate: DateFormatter;
}

export interface BoardListStateRenderOptions extends BoardCardRenderOptions {
  readonly state: MutableBoardViewState;
}

function boardRoleLabel(role: BoardRole | undefined): string {
  if (!role) return 'Viewer';
  return BOARD_ROLE_LABELS[role] ?? role;
}

export function renderBoardToolbar({ state, icons, escapeHtml }: BoardToolbarRenderOptions): string {
  const esc = escapeHtml;
  return `<div class="${toolbarClass('board-list-toolbar')}" role="toolbar" aria-label="Board list controls">
    <div class="wm-segmented board-tabs" role="group" aria-label="Board status">${BOARD_TABS.map((tab) => `<button class="${buttonClass({ tone: 'ghost', size: 'sm', state: state.status === tab ? 'selected' : 'default' }, `board-tab ${state.status === tab ? 'active' : ''}`)}" data-board-status="${tab}" aria-pressed="${state.status === tab}">${esc(BOARD_TAB_LABELS[tab])}</button>`).join('')}</div>
    <label class="wm-search board-search">${icons.search}<input class="${fieldControlClass({ kind: 'search' })}" type="search" data-board-search value="${esc(state.search)}" placeholder="Search boards by name or description" aria-label="Search boards by name or description"></label>
    <button class="${buttonClass({ tone: 'primary' }, 'primary-btn')}" data-board-create>+ New board</button>
  </div>`;
}

export function renderBoardCard(board: BoardListRecord, { escapeHtml, formatDate }: BoardCardRenderOptions): string {
  const esc = escapeHtml;
  const role = boardRoleLabel(board.member_role);
  const actions = board.status === 'active'
    ? `<button role="menuitem" data-board-open="${board.id}">Open board</button><button role="menuitem" data-board-duplicate="${board.id}">Duplicate board</button>${hasBoardCapability(board.member_role, CAPABILITIES.BOARD_MANAGE) ? `<button role="menuitem" data-board-status-action="${board.id}" data-status="archived">Archive board</button><button role="menuitem" class="danger-text" data-board-status-action="${board.id}" data-status="trashed">Move board to trash</button>` : ''}`
    : board.status === 'archived'
      ? `${hasBoardCapability(board.member_role, CAPABILITIES.BOARD_MANAGE) ? `<button role="menuitem" data-board-status-action="${board.id}" data-status="active">Restore board</button><button role="menuitem" class="danger-text" data-board-status-action="${board.id}" data-status="trashed">Move board to trash</button>` : ''}`
      : `${hasBoardCapability(board.member_role, CAPABILITIES.BOARD_MANAGE) ? `<button role="menuitem" data-board-status-action="${board.id}" data-status="active">Restore board</button><button role="menuitem" class="danger-text" data-board-delete="${board.id}">Delete board permanently</button>` : ''}`;
  const count = Number(board.item_count ?? 0);
  return `<article class="board-card" data-board-id="${board.id}" role="link" tabindex="0" aria-label="Open board: ${esc(board.name)}">
    <div class="board-card-icon" aria-hidden="true">▦</div><div class="board-card-main"><div class="board-card-meta"><span>${esc(role)}</span><span>${count} item${count === 1 ? '' : 's'}</span></div>
    <h3 title="${esc(board.name)}">${esc(board.name)}</h3><p>${esc(board.description || 'No description yet.')}</p><small>Updated ${esc(formatDate(board.updated_at))}</small></div>
    <span class="board-menu-host" data-board-menu-host><button type="button" class="${iconButtonClass({ tone: 'ghost', size: 'sm' }, 'board-card-more-trigger')}" data-board-menu-trigger="board-card" aria-label="More actions for ${esc(board.name)}" aria-haspopup="menu" aria-expanded="false">•••</button><template data-board-menu-template>${actions}</template></span>
  </article>`;
}

export function renderBoardListState({ state, escapeHtml, formatDate }: BoardListStateRenderOptions): string {
  const esc = escapeHtml;
  if (state.loading) return '<div class="boards-state"><span class="button-spinner"></span><h3>Loading boards</h3><p>Getting the boards available to your account…</p></div>';
  if (state.error) return `<div class="boards-state error"><h3>Boards couldn’t load</h3><p>${esc(state.error)}</p><button class="${buttonClass({ tone: 'secondary' }, 'secondary-btn')}" data-board-retry>Try again</button></div>`;
  const q = state.search.trim().toLowerCase();
  const list = state.boards.filter((board) => !q || `${board.name} ${board.description}`.toLowerCase().includes(q));
  if (!list.length) {
    const title = q ? 'No boards match your search' : state.status === 'active' ? 'Create your first board' : state.status === 'archived' ? 'No archived boards' : 'Trash is empty';
    const body = q ? 'Try a different board name or clear the search.' : state.status === 'active' ? 'Start with an empty board or choose the columns your workflow needs.' : state.status === 'archived' ? 'Boards you archive will appear here until you restore or move them to trash.' : 'Boards moved to trash will stay here until you restore or permanently delete them.';
    return `<div class="boards-state"><div class="empty-glyph" aria-hidden="true">▦</div><h3>${title}</h3><p>${body}</p>${state.status === 'active' && !q ? `<button class="${buttonClass({ tone: 'primary' }, 'primary-btn')}" data-board-create>+ Create board</button>` : ''}</div>`;
  }
  return `<div class="board-grid">${list.map((board) => renderBoardCard(board as BoardListRecord, { escapeHtml, formatDate })).join('')}</div>`;
}
