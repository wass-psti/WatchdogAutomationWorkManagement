import type { BoardCommandService } from '../../src/features/boards/contracts/commands.ts';
import type { BoardColumn, BoardColumnType, BoardEnvelope, BoardGroup, BoardItem, BoardLifecycleStatus, BoardRecord, BoardViewMode, TimelineValue } from '../../src/features/boards/contracts/domain.ts';
import type { BoardDialogOptions } from '../../src/features/boards/contracts/presentation.ts';
import type { BoardDomainService } from '../../src/features/boards/contracts/service.ts';
import type { BoardHistorySnapshot } from './features/boards/controllers/history-controller.ts';
import type { UiAuthPort, WorkspaceRenderer, TopbarRenderer, ToastRenderer, Navigate, IconSet } from '../../src/platform/contracts/ui.ts';
import { normalizeAppError } from './platform/errors/app-error.ts';
import { COLUMN_TYPES, startingColumns } from './features/boards/board-schema.ts';
import { createBoardViewState, resetBoardInteractionState } from './features/boards/board-state.ts';
import { renderBoardToolbar, renderBoardListState } from './features/boards/views/board-list-view.ts';
import { renderItemWorkspace } from './features/boards/views/item-workspace-view.ts';
import { renderBoardTableView } from './features/boards/views/table-view.ts';
import { renderBoardKanbanView } from './features/boards/views/kanban-view.ts';
import { renderBoardHeader, renderBoardControls, renderBoardItemRow, renderBoardColumnHeader } from './features/boards/views/board-workspace-view.ts';
import { createBoardDialogController } from './features/boards/controllers/dialog-controller.ts';
import { createColumnWorkflows } from './features/boards/controllers/column-workflows.ts';
import { createGroupWorkflows } from './features/boards/controllers/group-workflows.ts';
import { createItemWorkflows } from './features/boards/controllers/item-workflows.ts';
import { createMemberWorkflows } from './features/boards/controllers/member-workflows.ts';
import { createActivityWorkflows } from './features/boards/controllers/activity-workflows.ts';
import { createItemWorkspaceController } from './features/boards/controllers/item-workspace-controller.ts';
import { createBoardDragDropController } from './features/boards/controllers/drag-drop-controller.ts';
import { createBoardHistoryController } from './features/boards/controllers/history-controller.ts';
import { createBoardSelectionController } from './features/boards/controllers/selection-controller.ts';
import { createBoardInlineEditController } from './features/boards/controllers/inline-edit-controller.ts';
import { createColumnResizeController } from './features/boards/controllers/column-resize-controller.ts';
import { createBoardStructureDragController } from './features/boards/controllers/structure-drag-controller.ts';
import { createBoardMenuController } from './features/boards/controllers/board-menu-controller.ts';
import { createBoardDataController } from './features/boards/controllers/board-data-controller.ts';
import { createBoardPreferencePersistenceController } from './features/boards/controllers/board-preference-controller.ts';
import { createItemPanelRenderer } from './features/boards/controllers/item-panel-renderer.ts';
import { createBoardOverlayCoordinator } from './features/boards/controllers/overlay-coordinator.ts';
import { statusConfig } from './features/boards/status-labels.ts';
import { createBoardPreferencePatchService } from './features/boards/services/board-preferences-service.ts';
import { createBoardSelectors } from './features/boards/selectors/board-selectors.ts';
import { CAPABILITIES, hasBoardCapability } from './platform/auth/permissions.ts';
const ESCAPE_MAP: Readonly<Record<string, string>> = Object.freeze({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'});
const esc = (value: unknown): string => String(value ?? '').replace(/[&<>'"]/g, (character) => ESCAPE_MAP[character] ?? character);
const fmtDate = (value: unknown): string => value ? new Date(String(value)).toLocaleString() : '—';
const day = (value: unknown): string => value ? new Date(`${String(value)}T00:00:00`).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}) : '—';
const asArray = <T>(value: readonly T[] | null | undefined): readonly T[] => Array.isArray(value) ? value : [];
const eventElement = (event: Event): Element | null => event.target instanceof Element ? event.target : null;
const errorMessage = (error: unknown, fallback = 'The operation could not be completed.'): string => normalizeAppError(error, { fallbackMessage: fallback }).message;
const isTimelineValue = (value: unknown): value is TimelineValue => Boolean(value && typeof value === 'object' && !Array.isArray(value) && 'start' in value && 'end' in value);
const assertNever = (value: never): never => { throw new TypeError(`Unsupported Board column type: ${String(value)}`); };

interface BoardsFeatureOptions {
  readonly auth: UiAuthPort;
  readonly renderWorkspace: WorkspaceRenderer;
  readonly topbar: TopbarRenderer;
  readonly toast: ToastRenderer;
  readonly navigate: Navigate;
  readonly icons: IconSet;
  readonly service?: BoardDomainService | null;
  readonly commands?: BoardCommandService | null;
}

interface BoardViewGeometry {
  readonly tables: ReadonlyMap<string, number>;
  readonly kanbanLeft: number;
}

export function createBoardsFeature({ auth, renderWorkspace, topbar, toast, navigate, icons, service = null, commands = null }: BoardsFeatureOptions) {
  // Transport injection is the v1.23 feature boundary. The compatibility fallback keeps direct consumers working.
  if (!service) throw new TypeError('Board domain service is required. Construct it through the feature/composition boundary.');
  const api = service;
  if (!commands) throw new TypeError('Board command service is required. Construct it through the feature/composition boundary.');
  const commandService = commands;
  void auth;
  const state = createBoardViewState();
  const preferencePatches = createBoardPreferencePatchService();
  const selectors = createBoardSelectors(state);
  let itemSearchFrame = 0;
  let boardResizeCleanup: (() => void) | null = null;
  let listMenuController: ReturnType<typeof createBoardMenuController> | null = null;
  let boardMenuController: ReturnType<typeof createBoardMenuController> | null = null;
  let selection: ReturnType<typeof createBoardSelectionController>;
  const boardMarkup = new WeakMap<HTMLElement, string>();

  const overlayCoordinator = createBoardOverlayCoordinator();
  const dialogs = createBoardDialogController({ toast, escapeHtml: esc });
  const dialog = (options: BoardDialogOptions) => { overlayCoordinator.closeAll({ restoreFocus:false }); return dialogs.open(options); };
  const preferencePersistence = createBoardPreferencePersistenceController({
    state,
    commands: commandService,
    patches: preferencePatches,
    onWarning: (message) => toast(message, 'warning'),
  });

  function boardToolbar() {
    return renderBoardToolbar({ state, icons, escapeHtml: esc });
  }

  function renderBoardListBody() {
    listMenuController?.close();
    const main = document.querySelector('#boardsMain');
    if (!main) return;
    main.innerHTML = renderBoardListState({ state, escapeHtml: esc, formatDate: fmtDate });
  }

  const dataController = createBoardDataController({
    state,
    service: api,
    onListChange: renderBoardListBody,
    onBoardChange: renderBoardData,
    onBoardLoaded: () => selection.normalize(),
    onWarning: (message) => toast(message, 'warning'),
  });
  const loadBoards = (status = state.status) => dataController.loadBoards(status);
  const loadBoard = (boardId: string, options: Readonly<{ quiet?: boolean }> = {}) => dataController.loadBoard(boardId, options);

  function renderBoards() {
    boardMenuController?.dispose(); boardMenuController = null;
    state.board=null;itemWorkspace.reset();itemPanelRenderer.reset();
    const content=`${topbar('Boards','Plan, track, and collaborate on shared work.')}
      <main id="main" class="page boards-page"><section class="boards-intro"><div><span class="top-eyebrow">WORK MANAGEMENT</span><h2>Boards</h2><p>Plan work, organize items, and collaborate with your team in one place.</p></div></section>${boardToolbar()}<section id="boardsMain" aria-live="polite"></section></main>`;
    renderWorkspace(content,'boards','page'); attachListEvents(); loadBoards();
  }

  function attachListEvents(): void {
    const root = document.querySelector<HTMLElement>('.boards-page');
    if (!root || root.dataset.bound === '1') return;
    root.dataset.bound = '1';
    listMenuController?.dispose();
    listMenuController = createBoardMenuController({ root, escapeHtml: esc });

    root.addEventListener('input', (event: Event) => {
      const target = event.target;
      if (target instanceof HTMLInputElement && target.matches('[data-board-search]')) {
        state.search = target.value;
        renderBoardListBody();
      }
    });

    root.addEventListener('click', async (event: MouseEvent) => {
      const target = eventElement(event);
      if (!target) return;
      if (listMenuController?.handleTrigger(target)) {
        event.preventDefault();
        return;
      }
      const card = target.closest<HTMLElement>('.board-card[data-board-id]');
      const interactive = target.closest('button,summary,details,a,input,select,textarea,label');
      if (card && !interactive) {
        const boardId = card.dataset.boardId;
        if (boardId) navigate(`boards/${boardId}`);
        return;
      }
      const btn = target.closest<HTMLButtonElement>('button');
      if (!btn) return;
      if (btn.closest('.board-floating-menu')) listMenuController?.close();
      if (btn.matches('[data-board-status]')) {
        const status = btn.dataset.boardStatus;
        if (status === 'active' || status === 'archived' || status === 'trashed') {
          state.status = status;
          renderBoards();
        }
        return;
      }
      if (btn.matches('[data-board-retry]')) { void loadBoards(); return; }
      if (btn.matches('[data-board-create]')) { openCreateBoard(); return; }
      if (btn.matches('[data-board-open]')) {
        const boardId = btn.dataset.boardOpen;
        if (boardId) navigate(`boards/${boardId}`);
        return;
      }
      if (btn.matches('[data-board-duplicate]')) {
        const boardId = btn.dataset.boardDuplicate;
        if (!boardId) return;
        try {
          btn.disabled = true;
          const id = await commandService.duplicateBoard(boardId);
          toast('Board duplicated.');
          navigate(`boards/${id}`);
        } catch (error) {
          toast(errorMessage(error, 'The board could not be duplicated.'), 'warning');
        } finally {
          btn.disabled = false;
        }
        return;
      }
      if (btn.matches('[data-board-status-action]')) {
        const status = btn.dataset.status;
        const boardId = btn.dataset.boardStatusAction;
        if (!boardId || (status !== 'active' && status !== 'archived' && status !== 'trashed')) return;
        const message = status === 'trashed'
          ? 'Move this board to trash? You can restore it until it is permanently deleted.'
          : status === 'archived'
            ? 'Archive this board? You can restore it later from Archived.'
            : 'Restore this board to your active boards?';
        if (!confirm(message)) return;
        try {
          await commandService.setBoardLifecycle({ boardId, status });
          toast(status === 'active' ? 'Board restored to active boards.' : status === 'archived' ? 'Board archived.' : 'Board moved to trash.');
          void loadBoards();
        } catch (error) {
          toast(errorMessage(error, 'The board status could not be changed.'), 'warning');
        }
        return;
      }
      if (btn.matches('[data-board-delete]')) {
        const boardId = btn.dataset.boardDelete;
        if (!boardId || !confirm('Delete this board permanently? All groups, items, values, updates, and attachments associated with it will be removed. This cannot be undone.')) return;
        try {
          await commandService.deleteBoard(boardId);
          toast('Board deleted permanently.');
          void loadBoards();
        } catch (error) {
          toast(errorMessage(error, 'The board could not be deleted.'), 'warning');
        }
      }
    });

    root.addEventListener('keydown', (event: KeyboardEvent) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const target = eventElement(event);
      const card = target?.closest<HTMLElement>('.board-card[data-board-id]');
      if (!card || target !== card) return;
      event.preventDefault();
      const boardId = card.dataset.boardId;
      if (boardId) navigate(`boards/${boardId}`);
    });
  }

  function openCreateBoard(): void {
    const typeChoices = Object.entries(COLUMN_TYPES).map(([type, meta]) => `<label class="board-setup-column"><input type="checkbox" name="setup_column" value="${type}"><span class="column-type-icon">${esc(meta.icon)}</span><span><strong>${esc(meta.label)}</strong><small>${esc(meta.hint)}</small></span></label>`).join('');
    const modal = dialog({
      title: 'Create a board',
      body: `<label class="field-label">Board name<input name="name" required maxlength="120" value="New board" placeholder="For example, Project delivery plan" autocomplete="off"></label><label class="field-label">Description<textarea name="description" maxlength="1200" rows="3" placeholder="Describe the purpose of this board"></textarea></label><fieldset class="board-setup-fieldset"><legend>Starting setup</legend><label class="choice-card"><input type="radio" name="setup_mode" value="empty" checked><span><strong>Start empty</strong><small>Create the board without custom columns. Add them whenever you need them.</small></span></label><label class="choice-card"><input type="radio" name="setup_mode" value="custom"><span><strong>Choose starting columns</strong><small>Choose the columns you want to start with. You can change or remove them later.</small></span></label><div class="board-setup-columns" data-board-setup-columns hidden>${typeChoices}</div></fieldset><p class="field-help">Your board stays flexible. Add, rename, reorder, configure, duplicate, hide, or delete columns as your workflow changes.</p>`,
      submitLabel: 'Create board',
      onSubmit: async (fd) => {
        const mode = String(fd.get('setup_mode') || 'empty');
        const types = mode === 'custom' ? fd.getAll('setup_column').map(String) : [];
        if (mode === 'custom' && !types.length) throw new Error('Choose at least one starting column, or select Start empty.');
        const columns = startingColumns(types);
        const id = await commandService.createBoard({
          name: String(fd.get('name') || '').trim(),
          description: String(fd.get('description') || ''),
          columns,
        });
        toast(columns.length ? `Board created with ${columns.length} starting column${columns.length === 1 ? '' : 's'}.` : 'Board created. Add columns whenever you need them.');
        navigate(`boards/${id}`);
      },
    });
    const sync = (): void => {
      const custom = modal.wrap.querySelector<HTMLInputElement>('input[name="setup_mode"][value="custom"]')?.checked === true;
      const panel = modal.wrap.querySelector<HTMLElement>('[data-board-setup-columns]');
      if (panel) panel.hidden = !custom;
    };
    modal.wrap.addEventListener('change', (event: Event) => {
      const target = eventElement(event);
      if (target?.matches('input[name="setup_mode"]')) sync();
    });
    sync();
  }

  function canEdit(){return hasBoardCapability(state.board?.board?.member_role,CAPABILITIES.BOARD_EDIT);}
  function canManage(){return hasBoardCapability(state.board?.board?.member_role,CAPABILITIES.BOARD_MANAGE);}
  const memberMap = selectors.memberMap;
  const allColumns = selectors.allColumns;
  const visibleColumns = selectors.visibleColumns;
  const columnWidth = selectors.columnWidth;
  const itemNameWidth = selectors.itemNameWidth;
  const isGroupCollapsed = selectors.isGroupCollapsed;
  const isWrapped = selectors.isWrapped;
  const activeColumnFilter = selectors.activeColumnFilter;
  const sortConfig = selectors.sortConfig;
  const populatedColumnValueCount = selectors.populatedColumnValueCount;
  const getCellValue = selectors.getCellValue;
  const optionList = selectors.optionList;
  const systemStatusColumn = selectors.systemStatusColumn;
  const statusLabelsFor = selectors.statusLabelsFor;
  const statusLabelForValue = selectors.statusLabelForValue;
  const boardStatusLabels = selectors.boardStatusLabels;
  const itemMatches = selectors.itemMatches;
  const compareItems = selectors.compareItems;
  function columnTypeLabel(type: BoardColumnType): string { return COLUMN_TYPES[type]?.label || type; }
  const persistBoardPrefs = (): void => { preferencePersistence.schedule(); };
  const removeColumnPreferenceReferences = (columnId: string): void => { preferencePersistence.removeColumnReferences(columnId); };

  function formatCell(item: BoardItem, column: BoardColumn): string {
    const value = getCellValue(item, column);
    if (value === null || value === undefined || value === '') return '<span class="board-cell-empty">—</span>';
    switch (column.data_type) {
      case 'people': {
        const member = memberMap().get(String(value));
        return `<span class="board-person-cell">${esc(member?.display_name || 'Unknown member')}</span>`;
      }
      case 'date':
        return esc(day(value));
      case 'timeline':
        return isTimelineValue(value)
          ? `<span class="timeline-cell">${esc(day(value.start))} → ${esc(day(value.end))}</span>`
          : '<span class="board-cell-empty">—</span>';
      case 'checkbox': {
        const checked = value === true;
        return `<span class="check-cell ${checked ? 'checked' : ''}" aria-label="${checked ? 'Checked' : 'Unchecked'}">${checked ? '✓' : '○'}</span>`;
      }
      case 'number':
        return esc(new Intl.NumberFormat(undefined, { maximumFractionDigits: 6 }).format(Number(value)));
      case 'status': {
        const label = statusLabelForValue(column, value);
        const name = label?.name || String(value);
        const color = label?.color || '#7f8a9a';
        return `<span class="status-pill configurable-status${label?.active === false ? ' is-inactive' : ''}" style="--status-color:${esc(color)}" data-status-id="${esc(value)}">${esc(name)}</span>`;
      }
      case 'dropdown':
        return `<span class="choice-pill">${esc(value)}</span>`;
      case 'url':
        return `<span class="link-cell">${esc(value)}</span>`;
      case 'email':
        return `<span class="email-cell">${esc(value)}</span>`;
      case 'text':
      case 'long_text': {
        const text = String(value);
        return `<span class="board-text-cell" title="${esc(text)}">${esc(text)}</span>`;
      }
      default:
        return assertNever(column);
    }
  }

  const columnWorkflows = createColumnWorkflows({
    state,
    commands: commandService,
    dialog,
    icons,
    toast,
    escapeHtml: esc,
    canEdit,
    allColumns,
    optionList,
    columnTypeLabel,
    activeColumnFilter,
    persistBoardPrefs,
    removeColumnPreferenceReferences,
    populatedColumnValueCount,
    getCellValue,
    renderBoardData,
    loadBoard,
    overlayCoordinator,
    preferencePatches,
  });


  const reloadCurrentBoard = (): Promise<unknown> => {
    const boardId = state.board?.board?.id;
    return boardId ? loadBoard(boardId, { quiet: true }) : Promise.resolve(false);
  };
  const syncHistoryControls = (snapshot?: BoardHistorySnapshot): void => {
    const value = snapshot ?? history.snapshot();
    const undo = document.querySelector<HTMLButtonElement>('[data-board-undo]');
    const redo = document.querySelector<HTMLButtonElement>('[data-board-redo]');
    if (undo) {
      undo.disabled = !value.canUndo;
      undo.title = value.undoLabel ? `Undo ${value.undoLabel}` : 'Nothing to undo';
    }
    if (redo) {
      redo.disabled = !value.canRedo;
      redo.title = value.redoLabel ? `Redo ${value.redoLabel}` : 'Nothing to redo';
    }
  };
  const history = createBoardHistoryController({ toast, onChange: syncHistoryControls });
  const visibleItemsForSelection = (): readonly BoardItem[] => asArray(state.board?.items).filter(itemMatches).sort(compareItems);
  selection = createBoardSelectionController({ state, commands: commandService, toast, getVisibleItems: visibleItemsForSelection, reloadBoard: reloadCurrentBoard, escapeHtml: esc, canEdit });

  const groupWorkflows = createGroupWorkflows({ commands: commandService, state, dialog, toast, escapeHtml: esc, reloadBoard: reloadCurrentBoard });
  const itemWorkflows = createItemWorkflows({ commands: commandService, state, dialog, toast, escapeHtml: esc, reloadBoard: reloadCurrentBoard, getStatusLabels:boardStatusLabels, getDefaultStatus:()=>statusConfig(systemStatusColumn()).defaultLabelId });
  const memberWorkflows = createMemberWorkflows({ commands: commandService, state, dialog, toast, escapeHtml: esc, reloadBoard: reloadCurrentBoard });
  const activityWorkflows = createActivityWorkflows({ api, state, dialog, toast, escapeHtml: esc, formatDate: fmtDate });
  const inlineEdit = createBoardInlineEditController({ state, api, commands: commandService, toast, canEdit, allColumns, getCellValue, optionList, renderBoardData, history, escapeHtml:esc, overlayCoordinator, reloadBoard:reloadCurrentBoard, preferencePatches, statusLabelsFor, statusLabelForValue });
  const columnResize = createColumnResizeController({ state, preferencePatches, persistPreferences:persistBoardPrefs, history, renderBoardData });
  const structureDrag = createBoardStructureDragController({ state, commands: commandService, canEdit, toast, renderBoardData, history });

  function activeBoardEnvelope(): BoardEnvelope | null {
    return state.board?.board ? state.board : null;
  }

  function boardHeader(): string {
    const envelope = activeBoardEnvelope();
    return envelope?.board
      ? renderBoardHeader({ board: envelope.board, canEdit: canEdit(), canManage: canManage(), icons, escapeHtml: esc })
      : '';
  }

  function boardControls(): string {
    return renderBoardControls({ state, canEdit: canEdit(), icons, escapeHtml: esc, historyState: history.snapshot(), statusLabels: boardStatusLabels() });
  }

  function itemRow(item: BoardItem, group: BoardGroup, columns: readonly BoardColumn[]): string {
    return renderBoardItemRow({ state, item, group, columns, canEdit: canEdit(), isWrapped, formatCell, escapeHtml: esc, isSelected: selection.isSelected(item.id) });
  }

  function columnHeader(column: BoardColumn): string {
    return renderBoardColumnHeader({ column, canEdit: canEdit(), sort: sortConfig(), filter: activeColumnFilter(column.id), wrapped: isWrapped(column.id), columnTypeLabel, escapeHtml: esc });
  }

  function tableView(): string {
    const envelope = activeBoardEnvelope();
    if (!envelope) return '';
    return renderBoardTableView({
      state,
      groups: [...envelope.groups].sort((left, right) => left.position - right.position),
      items: envelope.items,
      visibleColumns,
      allColumns,
      canEdit,
      itemMatches,
      compareItems,
      renderColumnHeader: columnHeader,
      renderItemRow: itemRow,
      escapeHtml: esc,
      isSelected: selection.isSelected,
      itemNameWidth: itemNameWidth(),
      columnWidth,
    });
  }

  function kanbanView(): string {
    const envelope = activeBoardEnvelope();
    if (!envelope) return '';
    return renderBoardKanbanView({
      state,
      items: envelope.items,
      groups: envelope.groups,
      itemMatches,
      canEdit,
      memberMap,
      statusLabels: boardStatusLabels().filter((label) => label.active !== false),
      escapeHtml: esc,
      formatDay: day,
    });
  }

  function itemPanelMarkup(): string {
    return renderItemWorkspace({ state, canEdit, escapeHtml: esc, formatDate: fmtDate, formatDay: day });
  }

  function patchHost(host: HTMLElement | null, html: string): boolean {
    if (!host) return false;
    if (boardMarkup.get(host) === html) return false;
    host.innerHTML = html;
    boardMarkup.set(host, html);
    return true;
  }

  // v1.32.4: persistent Item Workspace shell with content-scoped tab transitions.
  const itemPanelRenderer = createItemPanelRenderer({
    getHost: () => document.querySelector<HTMLElement>('[data-item-panel-host]'),
    patchFull: patchHost,
  });

  function renderItemPanel(): void {
    itemPanelRenderer.render(itemPanelMarkup());
    document.body.classList.toggle('board-item-panel-open', Boolean(state.itemPanel.itemId));
  }

  const itemWorkspace = createItemWorkspaceController({ api, state, toast, renderBoard: renderBoardData, renderPanel: renderItemPanel });
  const dragDrop = createBoardDragDropController({ commands: commandService, state, canEdit, getItems: () => state.board?.items ?? [], toast, renderBoard: renderBoardData, history });

  function ensureBoardWorkspaceShell(main: HTMLElement): void {
    if (main.querySelector('[data-board-workspace-shell]')) return;
    main.innerHTML = `<div class="board-state-host" data-board-state-host></div><div class="board-workspace-shell" data-board-workspace-shell hidden><div data-board-header-host></div><div data-board-controls-host></div><section class="board-view-region" data-board-view-host aria-live="polite"></section><div data-board-selection-host></div><div data-item-panel-host></div></div>`;
  }

  function captureBoardViewGeometry(host: HTMLElement | null): BoardViewGeometry {
    const tables = new Map<string, number>();
    host?.querySelectorAll<HTMLElement>('.board-group[data-group-id] .board-table-scroll').forEach((scroll) => {
      const group = scroll.closest<HTMLElement>('.board-group[data-group-id]');
      if (group) tables.set(String(group.dataset.groupId ?? ''), scroll.scrollLeft);
    });
    return { tables, kanbanLeft: host?.querySelector<HTMLElement>('.kanban-board')?.scrollLeft ?? 0 };
  }

  function restoreBoardViewGeometry(host: HTMLElement | null, snapshot: BoardViewGeometry): void {
    if (!host) return;
    requestAnimationFrame(() => {
      host.querySelectorAll<HTMLElement>('.board-group[data-group-id] .board-table-scroll').forEach((scroll) => {
        const group = scroll.closest<HTMLElement>('.board-group[data-group-id]');
        const left = group ? snapshot.tables.get(String(group.dataset.groupId ?? '')) : 0;
        if (Number.isFinite(left)) scroll.scrollLeft = left ?? 0;
      });
      const kanban = host.querySelector<HTMLElement>('.kanban-board');
      if (kanban && Number.isFinite(snapshot.kanbanLeft)) kanban.scrollLeft = snapshot.kanbanLeft;
    });
  }

  function renderBoardViewOnly(): void {
    const main = document.querySelector<HTMLElement>('#boardMain');
    const host = main?.querySelector<HTMLElement>('[data-board-view-host]') ?? null;
    const envelope = activeBoardEnvelope();
    if (!main || !host || !envelope?.board) return;
    const geometry = captureBoardViewGeometry(host);
    const nextMarkup = (envelope.board.view_mode ?? envelope.board.view) === 'kanban' ? kanbanView() : tableView();
    if (boardMarkup.get(host) !== nextMarkup) boardMenuController?.close();
    patchHost(host, nextMarkup);
    restoreBoardViewGeometry(host, geometry);
    patchHost(main.querySelector<HTMLElement>('[data-board-selection-host]'), selection.renderToolbar());
    syncHistoryControls();
  }

  function renderBoardData(): void {
    const main = document.querySelector<HTMLElement>('#boardMain');
    if (!main) return;
    ensureBoardWorkspaceShell(main);
    const stateHost = main.querySelector<HTMLElement>('[data-board-state-host]');
    const workspace = main.querySelector<HTMLElement>('[data-board-workspace-shell]');
    if (!stateHost || !workspace) return;
    if (state.loading) {
      workspace.hidden = true;
      stateHost.hidden = false;
      patchHost(stateHost, '<div class="boards-state"><span class="button-spinner"></span><h3>Loading board</h3><p>Fetching groups, items, columns, and your saved view…</p></div>');
      return;
    }
    if (state.error) {
      workspace.hidden = true;
      stateHost.hidden = false;
      patchHost(stateHost, `<div class="boards-state error"><h3>This board couldn’t load</h3><p>${esc(state.error)}</p><button class="secondary-btn" data-board-detail-retry>Try again</button></div>`);
      return;
    }
    const envelope = activeBoardEnvelope();
    if (!envelope?.board) {
      workspace.hidden = true;
      stateHost.hidden = false;
      patchHost(stateHost, '<div class="boards-state"><h3>Board not found</h3><p>This board may have been deleted, moved, or you may no longer have access.</p></div>');
      return;
    }
    stateHost.hidden = true;
    patchHost(stateHost, '');
    workspace.hidden = false;
    patchHost(main.querySelector<HTMLElement>('[data-board-header-host]'), boardHeader());
    patchHost(main.querySelector<HTMLElement>('[data-board-controls-host]'), boardControls());
    const viewHost = main.querySelector<HTMLElement>('[data-board-view-host]');
    const geometry = captureBoardViewGeometry(viewHost);
    const nextView = (envelope.board.view_mode ?? envelope.board.view) === 'kanban' ? kanbanView() : tableView();
    if (viewHost && boardMarkup.get(viewHost) !== nextView) boardMenuController?.close();
    patchHost(viewHost, nextView);
    restoreBoardViewGeometry(viewHost, geometry);
    patchHost(main.querySelector<HTMLElement>('[data-board-selection-host]'), selection.renderToolbar());
    patchHost(main.querySelector<HTMLElement>('[data-item-panel-host]'), itemPanelMarkup());
    document.body.classList.toggle('board-item-panel-open', Boolean(state.itemPanel.itemId));
    syncHistoryControls();
  }

  function renderBoard(boardId: string): void {
    listMenuController?.dispose();
    listMenuController = null;
    itemWorkspace.reset();
    itemPanelRenderer.reset();
    resetBoardInteractionState(state);
    history.reset();
    const content = `${topbar('Board', 'Shared work items, ownership and workflow state.')}
      <main id="main" class="page board-detail-page"><section id="boardMain" data-wm-motion-static="true" aria-live="polite"><div class="board-state-host" data-board-state-host><div class="boards-state"><span class="button-spinner"></span><h3>Loading board</h3><p>Fetching groups, items, columns, and your saved view…</p></div></div><div class="board-workspace-shell" data-board-workspace-shell hidden><div data-board-header-host></div><div data-board-controls-host></div><section class="board-view-region" data-board-view-host aria-live="polite"></section><div data-board-selection-host></div><div data-item-panel-host></div></div></section></main>`;
    renderWorkspace(content, 'boards', 'page');
    attachBoardEvents();
    void loadBoard(boardId);
  }

  function closeColumnMenus(root: ParentNode = document): void {
    root.querySelectorAll<HTMLDetailsElement>('.column-context-menu[open]').forEach((menu) => {
      menu.open = false;
      const pop = menu.querySelector<HTMLElement>('.column-context-pop');
      if (pop) {
        pop.style.left = '';
        pop.style.top = '';
        pop.style.maxHeight = '';
        pop.style.visibility = '';
      }
    });
  }

  function closeItemMenus(): void { boardMenuController?.close(); }

  function replaceActiveBoardItems(boardId: string, update: (items: readonly BoardItem[]) => readonly BoardItem[]): void {
    const envelope = state.board;
    if (!envelope?.board || String(envelope.board.id) !== String(boardId)) return;
    state.board = { ...envelope, items: update(envelope.items) };
  }

  function replaceActiveBoardRecord(boardId: string, update: (board: BoardRecord) => BoardRecord): void {
    const envelope = state.board;
    if (!envelope?.board || String(envelope.board.id) !== String(boardId)) return;
    state.board = { ...envelope, board: update(envelope.board) };
  }

  const focusInlineAdd = (groupId: string): void => {
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-inline-add-item="${CSS.escape(groupId)}"]`)?.focus());
  };

  async function createInlineItem(input: HTMLInputElement, keepAdding = false): Promise<void> {
    if (!canEdit()) return;
    const envelope = state.board;
    const board = envelope?.board;
    const groupId = input.dataset.inlineAddItem;
    if (!envelope || !board || !groupId) return;

    const title = input.value.trim();
    if (!title) return;
    if (title.length > 240) {
      toast('Item name is limited to 240 characters.', 'warning');
      return;
    }

    const peers = envelope.items.filter((item) => String(item.group_id) === groupId && !item.archived_at);
    const tempId = `temp:${crypto.randomUUID?.() || Date.now()}`;
    const tempItem: BoardItem = {
      id: tempId,
      board_id: board.id,
      group_id: groupId,
      title,
      status: statusConfig(systemStatusColumn()).defaultLabelId,
      assignee_id: null,
      due_date: null,
      notes: '',
      position: peers.length,
      archived_at: null,
    };

    state.board = { ...envelope, items: [...envelope.items, tempItem] };
    input.value = '';
    renderBoardData();
    if (keepAdding) focusInlineAdd(groupId);

    try {
      let currentId = await commandService.addItem(board.id, groupId, title);
      replaceActiveBoardItems(board.id, (items) => items.map((item) => item.id === tempId ? { ...item, id: currentId } : item));
      history.push({
        label: 'item creation',
        undo: async () => {
          await commandService.deleteItem(currentId);
          replaceActiveBoardItems(board.id, (items) => items.filter((item) => String(item.id) !== String(currentId)));
          renderBoardData();
        },
        redo: async () => {
          currentId = await commandService.addItem(board.id, groupId, title);
          replaceActiveBoardItems(board.id, (items) => [...items, { ...tempItem, id: currentId }]);
          renderBoardData();
        },
      });
      toast('Item added to the board.');
      renderBoardData();
      if (keepAdding) focusInlineAdd(groupId);
    } catch (error) {
      replaceActiveBoardItems(board.id, (items) => items.filter((item) => item.id !== tempId));
      renderBoardData();
      toast(errorMessage(error, 'The item could not be added.'), 'warning');
    }
  }

  type GridNavigationKey = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown' | 'Home' | 'End';

  function isGridNavigationKey(key: string): key is GridNavigationKey {
    return key === 'ArrowLeft' || key === 'ArrowRight' || key === 'ArrowUp' || key === 'ArrowDown' || key === 'Home' || key === 'End';
  }

  function isBoardViewMode(value: string | undefined): value is BoardViewMode {
    return value === 'table' || value === 'kanban';
  }

  function isSortDirection(value: string | undefined): value is 'asc' | 'desc' | 'none' {
    return value === 'asc' || value === 'desc' || value === 'none';
  }

  function focusAdjacentCell(target: HTMLElement, key: GridNavigationKey): boolean {
    const row = target.closest<HTMLElement>('.board-item-row');
    if (!row) return false;
    const rows = [...document.querySelectorAll<HTMLElement>('.board-item-row')].filter((entry) => entry.offsetParent !== null);
    const cells = [...row.querySelectorAll<HTMLElement>('.item-inline-title,.board-cell-button')];
    const index = cells.indexOf(target);
    if (index < 0) return false;

    let next: HTMLElement | undefined;
    if (key === 'ArrowLeft') next = cells[index - 1];
    if (key === 'ArrowRight') next = cells[index + 1];
    if (key === 'Home') next = cells[0];
    if (key === 'End') next = cells.at(-1);
    if (key === 'ArrowUp' || key === 'ArrowDown') {
      const rowIndex = rows.indexOf(row);
      const nextRow = rows[rowIndex + (key === 'ArrowDown' ? 1 : -1)];
      next = nextRow?.querySelectorAll<HTMLElement>('.item-inline-title,.board-cell-button')[index];
    }
    if (!next) return false;
    next.focus();
    return true;
  }

  let syncingBoardTableScroll = false;

  function attachBoardEvents(): void {
    const root = document.querySelector<HTMLElement>('.board-detail-page');
    if (!root || root.dataset.bound === '1') return;
    root.dataset.bound = '1';

    boardMenuController?.dispose();
    boardMenuController = createBoardMenuController({ root, escapeHtml: esc, overlayCoordinator });

    root.addEventListener('pointerdown', (event: PointerEvent) => {
      inlineEdit.handleDocumentPointer();
      const target = eventElement(event);
      if (!target) return;
      if (!target.closest('.column-context-menu')) closeColumnMenus(root);
      if (!target.closest('[data-board-menu-trigger],.board-floating-menu')) closeItemMenus();
    });

    root.addEventListener('keydown', (event: KeyboardEvent) => {
      const target = eventElement(event);
      if (!(target instanceof HTMLElement)) return;
      const editable = target.matches('input,textarea,[contenteditable="true"]');
      if ((event.metaKey || event.ctrlKey) && !editable && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        void (event.shiftKey ? history.redo() : history.undo());
        return;
      }
      if ((event.ctrlKey || event.metaKey) && !editable && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        void history.redo();
        return;
      }
      if (target instanceof HTMLInputElement && target.matches('[data-inline-add-item]') && event.key === 'Enter') {
        event.preventDefault();
        void createInlineItem(target, event.shiftKey);
        return;
      }
      if (target.matches('.item-inline-title,.board-cell-button') && isGridNavigationKey(event.key)) {
        if (focusAdjacentCell(target, event.key)) event.preventDefault();
        return;
      }
      if (target.matches('.item-inline-title,.board-cell-button') && event.key === 'Enter') {
        event.preventDefault();
        target.click();
        return;
      }
      if (event.key === 'Escape' && overlayCoordinator.active) return;
      itemWorkspace.handleKeydown(event);
    });

    root.addEventListener('scroll', (event: Event) => {
      const target = eventElement(event);
      const scroller = target?.closest<HTMLElement>('.board-table-scroll');
      if (!scroller) return;
      closeColumnMenus(root);
      inlineEdit.dismissPopover({ restore: false });
      if (syncingBoardTableScroll) return;
      syncingBoardTableScroll = true;
      const left = scroller.scrollLeft;
      root.querySelectorAll<HTMLElement>('.board-table-scroll').forEach((peer) => {
        if (peer !== scroller && Math.abs(peer.scrollLeft - left) > 1) peer.scrollLeft = left;
      });
      requestAnimationFrame(() => { syncingBoardTableScroll = false; });
    }, true);

    boardResizeCleanup?.();
    const onBoardResize = (): void => {
      if (!root.isConnected) {
        boardResizeCleanup?.();
        return;
      }
      boardMenuController?.position();
      inlineEdit.repositionPopover();
    };
    window.addEventListener('resize', onBoardResize, { passive: true });
    boardResizeCleanup = () => {
      window.removeEventListener('resize', onBoardResize);
      boardResizeCleanup = null;
    };

    root.addEventListener('input', (event: Event) => {
      if (itemWorkspace.handleInput(event)) return;
      const target = event.target;
      if (!(target instanceof HTMLInputElement) || !target.matches('[data-item-search]')) return;
      state.itemSearch = target.value;
      cancelAnimationFrame(itemSearchFrame);
      itemSearchFrame = requestAnimationFrame(() => {
        itemSearchFrame = 0;
        renderBoardViewOnly();
      });
    });

    root.addEventListener('submit', (event: SubmitEvent) => { void itemWorkspace.submitUpdate(event); });
    root.addEventListener('change', (event: Event) => { void itemWorkspace.uploadFiles(event); });
    root.addEventListener('change', (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLSelectElement) || !target.matches('[data-item-status]')) return;
      state.itemStatus = target.value;
      renderBoardData();
    });

    root.addEventListener('click', async (event: MouseEvent) => {
      const target = eventElement(event);
      if (!(target instanceof HTMLElement)) return;
      if (itemWorkspace.handleScrim(target)) return;
      if (boardMenuController?.handleTrigger(target)) {
        event.preventDefault();
        return;
      }

      const envelope = state.board;
      const board = envelope?.board;
      const boardId = board?.id;

      const rowSelect = target.closest<HTMLElement>('[data-select-item]');
      if (rowSelect) {
        const itemId = rowSelect.dataset.selectItem;
        if (itemId) selection.toggle(itemId, { range: event.shiftKey });
        renderBoardData();
        return;
      }

      const selectVisible = target.closest<HTMLInputElement>('[data-select-visible]');
      if (selectVisible) {
        selection.selectVisible(selectVisible.checked, selectVisible.dataset.selectVisible || null);
        renderBoardData();
        return;
      }

      const btn = target.closest<HTMLButtonElement>('button');
      if (!btn) return;
      if (btn.closest('.board-floating-menu')) boardMenuController?.close();

      if (btn.matches('[data-board-back]')) { navigate('boards'); return; }
      if (btn.matches('[data-board-detail-retry]')) { if (boardId) void loadBoard(boardId); return; }
      if (btn.matches('[data-board-undo]')) { await history.undo(); return; }
      if (btn.matches('[data-board-redo]')) { await history.redo(); return; }
      if (btn.matches('[data-selection-clear]')) { selection.clear(); renderBoardData(); return; }
      if (btn.matches('[data-selection-duplicate]')) { await selection.duplicateSelected(); return; }
      if (btn.matches('[data-selection-archive]')) { await selection.archiveSelected(); return; }
      if (btn.matches('[data-selection-delete]')) { await selection.deleteSelected(); return; }
      if (btn.matches('[data-selection-export]')) { selection.exportSelected(); return; }
      if (btn.matches('[data-selection-move]')) { selection.openMoveDialog(dialog); return; }

      if (btn.matches('[data-inline-add-focus]')) {
        const groupId = btn.dataset.inlineAddFocus;
        if (!groupId) return;
        const group = btn.closest<HTMLElement>('.board-group');
        if (group?.classList.contains('is-collapsed')) {
          state.boardPrefs = preferencePatches.withGroupCollapsed(state.boardPrefs, groupId, false);
          persistBoardPrefs();
          renderBoardData();
        }
        focusInlineAdd(groupId);
        return;
      }

      if (btn.matches('[data-toggle-group]')) {
        const groupId = btn.dataset.toggleGroup;
        if (!groupId) return;
        state.boardPrefs = preferencePatches.withGroupCollapsed(state.boardPrefs, groupId, !isGroupCollapsed(groupId));
        persistBoardPrefs();
        renderBoardData();
        return;
      }

      if (btn.matches('[data-toggle-archived-items]')) {
        state.showArchived = !state.showArchived;
        selection.clear();
        renderBoardData();
        return;
      }

      if (btn.matches('[data-board-view]')) {
        const view = btn.dataset.boardView;
        if (!boardId || !board || !isBoardViewMode(view) || board.view_mode === view) return;
        const region = root.querySelector<HTMLElement>('[data-board-view-host]');
        region?.classList.add('is-view-switching');
        replaceActiveBoardRecord(boardId, (record) => ({ ...record, view_mode: view }));
        renderBoardData();
        requestAnimationFrame(() => region?.classList.remove('is-view-switching'));
        void commandService.setView(boardId, view).catch((error) => toast(errorMessage(error, 'The Board view could not be changed.'), 'warning'));
        return;
      }

      if (btn.matches('[data-board-edit]')) { openEditBoard(); return; }
      if (btn.matches('[data-board-members]')) { memberWorkflows.open(); return; }
      if (btn.matches('[data-board-columns]')) { columnWorkflows.openManager(); return; }
      if (btn.matches('[data-add-column]')) { columnWorkflows.openPicker({ anchor: btn, quick: true }); return; }
      if (btn.matches('[data-edit-column]')) { columnWorkflows.openEditor(allColumns().find((column) => column.id === btn.dataset.editColumn)); return; }

      if (btn.matches('[data-edit-cell]')) {
        const itemId = btn.dataset.editCell;
        const columnId = btn.dataset.columnId;
        if (!itemId || !columnId) return;
        closeColumnMenus(root);
        closeItemMenus();
        inlineEdit.open(itemId, columnId, btn);
        return;
      }
      if (btn.matches('[data-edit-item-title]')) {
        const itemId = btn.dataset.editItemTitle;
        if (itemId) inlineEdit.openTitle(itemId, btn);
        return;
      }
      if (btn.matches('[data-rename-column-inline]')) {
        const columnId = btn.dataset.renameColumnInline;
        if (columnId) inlineEdit.openColumnTitle(columnId, btn);
        return;
      }
      if (btn.matches('[data-rename-group-inline]')) {
        const groupId = btn.dataset.renameGroupInline;
        if (groupId) inlineEdit.openGroupTitle(groupId, btn);
        return;
      }
      if (btn.matches('[data-reset-board-view]')) {
        state.boardPrefs = preferencePatches.resetView(state.boardPrefs);
        persistBoardPrefs();
        renderBoardData();
        toast('Board view settings reset.');
        return;
      }
      if (btn.matches('[data-column-filter]')) {
        columnWorkflows.openFilter(allColumns().find((column) => column.id === btn.dataset.columnFilter));
        return;
      }
      if (btn.matches('[data-column-sort],[data-column-quick-sort]')) {
        const columnId = btn.dataset.columnSort || btn.dataset.columnQuickSort;
        const direction = btn.dataset.direction;
        if (!columnId || !isSortDirection(direction)) return;
        state.boardPrefs = direction === 'none'
          ? preferencePatches.withSort(state.boardPrefs, null, null)
          : preferencePatches.withSort(state.boardPrefs, columnId, direction);
        persistBoardPrefs();
        renderBoardData();
        return;
      }
      if (btn.matches('[data-column-wrap]')) {
        const columnId = btn.dataset.columnWrap;
        if (!columnId) return;
        state.boardPrefs = preferencePatches.withColumnWrap(state.boardPrefs, columnId, !isWrapped(columnId));
        persistBoardPrefs();
        renderBoardData();
        return;
      }
      if (btn.matches('[data-column-hide]')) {
        const column = allColumns().find((candidate) => candidate.id === btn.dataset.columnHide);
        if (!column || !canEdit() || !boardId) return;
        try {
          await commandService.updateColumn({ columnId: column.id, name: column.name, config: { ...column.config }, visible: false });
          toast(`Column “${column.name}” hidden from Table view.`);
          await loadBoard(boardId, { quiet: true });
        } catch (error) {
          toast(errorMessage(error, 'The column could not be hidden.'), 'warning');
        }
        return;
      }
      if (btn.matches('[data-column-duplicate]')) { columnWorkflows.openDuplicate(allColumns().find((column) => column.id === btn.dataset.columnDuplicate)); return; }
      if (btn.matches('[data-column-add-right]')) {
        const column = allColumns().find((candidate) => candidate.id === btn.dataset.columnAddRight);
        if (column) columnWorkflows.openPicker({ position: column.position + 1, anchor: btn, quick: true });
        return;
      }
      if (btn.matches('[data-column-change-type]')) {
        const column = allColumns().find((candidate) => candidate.id === btn.dataset.columnChangeType);
        if (column && !column.system_key) columnWorkflows.openPicker({ mode: 'change', column });
        return;
      }
      if (btn.matches('[data-column-delete]')) {
        const column = allColumns().find((candidate) => candidate.id === btn.dataset.columnDelete);
        if (column) columnWorkflows.openDelete(column);
        return;
      }
      if (btn.matches('[data-board-activity]')) { activityWorkflows.open(); return; }

      if (btn.matches('[data-board-duplicate-current]')) {
        if (!boardId) return;
        try {
          const duplicateId = await commandService.duplicateBoard(boardId);
          toast('Board duplicated.');
          navigate(`boards/${duplicateId}`);
        } catch (error) {
          toast(errorMessage(error, 'The board could not be duplicated.'), 'warning');
        }
        return;
      }

      if (btn.matches('[data-board-archive-current],[data-board-trash-current]')) {
        if (!boardId) return;
        const status: BoardLifecycleStatus = btn.matches('[data-board-trash-current]') ? 'trashed' : 'archived';
        const message = status === 'archived'
          ? 'Archive this board? You can restore it later from Archived.'
          : 'Move this board to trash? You can restore it until it is permanently deleted.';
        if (!confirm(message)) return;
        try {
          await commandService.setBoardLifecycle({ boardId, status });
          toast(status === 'archived' ? 'Board archived.' : 'Board moved to trash.');
          navigate('boards');
        } catch (error) {
          toast(errorMessage(error, 'The board state could not be changed.'), 'warning');
        }
        return;
      }

      if (btn.matches('[data-kanban-add-status]')) {
        const status = btn.dataset.kanbanAddStatus;
        itemWorkflows.open(null, btn.dataset.kanbanAddGroup || null, { status: status === '' ? null : (status ?? null) });
        return;
      }
      if (btn.matches('[data-add-group]')) { groupWorkflows.open(); return; }
      if (btn.matches('[data-rename-group]')) {
        const group = envelope?.groups.find((candidate) => candidate.id === btn.dataset.renameGroup);
        const anchor = group ? root.querySelector<HTMLElement>(`[data-rename-group-inline="${CSS.escape(group.id)}"]`) : null;
        if (group && anchor) inlineEdit.openGroupTitle(group.id, anchor);
        else groupWorkflows.open(group);
        return;
      }
      if (btn.matches('[data-group-accent]')) {
        groupWorkflows.openAccent(envelope?.groups.find((group) => String(group.id) === String(btn.dataset.groupAccent)));
        return;
      }
      if (btn.matches('[data-delete-group]')) {
        const groupId = btn.dataset.deleteGroup;
        if (groupId) await groupWorkflows.remove(groupId);
        return;
      }
      if (btn.matches('[data-open-item]')) {
        const itemId = btn.dataset.openItem;
        if (itemId) itemWorkspace.open(itemId);
        return;
      }
      if (await itemWorkspace.handleButton(btn)) return;
      if (btn.matches('[data-add-item]')) {
        const groupId = btn.dataset.addItem;
        if (groupId) focusInlineAdd(groupId);
        return;
      }
      if (btn.matches('[data-edit-item]')) {
        itemWorkflows.open(envelope?.items.find((item) => item.id === btn.dataset.editItem));
        return;
      }
      if (btn.matches('[data-duplicate-item]')) {
        const source = envelope?.items.find((item) => String(item.id) === String(btn.dataset.duplicateItem));
        if (!source) return;
        try {
          let duplicateId = await commandService.duplicateItem(source.id);
          toast(`“${source.title}” duplicated.`);
          await reloadCurrentBoard();
          history.push({
            label: 'item duplication',
            undo: async () => { await commandService.deleteItem(duplicateId); await reloadCurrentBoard(); },
            redo: async () => { duplicateId = await commandService.duplicateItem(source.id); await reloadCurrentBoard(); },
          });
        } catch (error) {
          toast(errorMessage(error, 'The item could not be duplicated.'), 'warning');
        }
        return;
      }
      if (btn.matches('[data-delete-item]')) {
        const item = envelope?.items.find((candidate) => String(candidate.id) === String(btn.dataset.deleteItem));
        if (!item) return;
        if (!confirm(`Delete “${item.title}” permanently? Its values, updates, and attachments will be removed. This cannot be undone.`)) return;
        try {
          await commandService.deleteItem(item.id);
          selection.clear();
          toast('Item deleted permanently.');
          await reloadCurrentBoard();
        } catch (error) {
          toast(errorMessage(error, 'The item could not be deleted.'), 'warning');
        }
        return;
      }
      if (btn.matches('[data-archive-item]')) {
        const item = envelope?.items.find((candidate) => String(candidate.id) === String(btn.dataset.archiveItem));
        if (!item) return;
        const archive = btn.dataset.archive !== 'false';
        const previous = Boolean(item.archived_at);
        if (await itemWorkflows.archive(item.id, archive)) {
          history.push({
            label: archive ? 'item archive' : 'item restore',
            undo: async () => { await commandService.archiveItem(item.id, previous); await reloadCurrentBoard(); },
            redo: async () => { await commandService.archiveItem(item.id, archive); await reloadCurrentBoard(); },
          });
        }
        return;
      }
    });

    dragDrop.bind(root);
    structureDrag.bind(root);
    columnResize.bind(root);
  }

  function openEditBoard(): void {
    const envelope = state.board;
    const board = envelope?.board;
    if (!board) return;
    dialog({
      title: `Edit “${board.name}”`,
      body: `<label class="field-label">Board name<input name="name" required maxlength="120" value="${esc(board.name)}"></label><label class="field-label">Description<textarea name="description" maxlength="1200" rows="4" placeholder="Describe this board’s purpose or scope">${esc(board.description || '')}</textarea></label>`,
      submitLabel: 'Save board details',
      onSubmit: async (formData) => {
        const name = String(formData.get('name') ?? '').trim();
        const description = String(formData.get('description') ?? '');
        await commandService.updateBoard({ boardId: board.id, name, description });
        toast(`“${name}” updated.`);
        await loadBoard(board.id, { quiet: true });
      },
    });
  }

  function activate() {
    // Invalidate any stale async load left behind by a prior route ownership cycle.
    dataController.cancelPending();
  }

  function deactivate() {
    // Invalidate in-flight loads and cancel deferred preference writes when leaving the feature.
    dataController.cancelPending();
    boardResizeCleanup?.();
    preferencePersistence.cancel();
    cancelAnimationFrame(itemSearchFrame);
    itemSearchFrame = 0;
    dragDrop.dispose();
    structureDrag.dispose();
    columnResize.dispose();
    inlineEdit.reset();
    selection.clear();
    history.reset();
    closeColumnMenus();
    closeItemMenus();
    boardMenuController?.dispose(); boardMenuController=null;
    overlayCoordinator.closeAll({restoreFocus:false});
    listMenuController?.dispose(); listMenuController=null;
    itemWorkspace.reset();
    itemPanelRenderer.reset();
    columnWorkflows.reset();
    groupWorkflows.reset();
    itemWorkflows.reset();
    memberWorkflows.reset();
    activityWorkflows.reset();
    dialogs.closeAll();
  }

  return Object.freeze({ renderBoards, renderBoard, activate, deactivate });
}
