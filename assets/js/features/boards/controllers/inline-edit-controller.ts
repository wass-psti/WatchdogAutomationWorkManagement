import type { BoardCommandService } from '../../../../../src/features/boards/contracts/commands.ts';
import type { BoardCellValue, BoardColumn, BoardGroup, BoardItem, StatusLabel, TimelineValue } from '../../../../../src/features/boards/contracts/domain.ts';
import type { ReloadBoard } from '../../../../../src/features/boards/contracts/presentation.ts';
import type { BoardPreferencePatchService } from '../../../../../src/features/boards/contracts/preference-patches.ts';
import type { MutableBoardViewState } from '../../../../../src/features/boards/contracts/view-state.ts';
import type { OverlayManager } from '../../../../../src/platform/contracts/overlay.ts';
import type { EscapeHtml, ToastRenderer } from '../../../../../src/platform/contracts/ui.ts';
import type { BoardColumnId, BoardGroupId, BoardItemId, StatusLabelId } from '../../../../../src/types/identifiers.ts';
import type { BoardHistoryController } from './history-controller.ts';
import { STATUS_COLOR_PALETTE, activeStatusLabels } from '../status-labels.ts';
import { createStatusLabelEditor } from '../services/status-label-editor.ts';
import { getBoardCellEditorContract, normalizeBoardCellValue } from '../grid/column-type-registry.ts';

interface BoardInlineEditDependencies {
  readonly state: MutableBoardViewState;
  readonly api?: unknown;
  readonly commands: BoardCommandService;
  readonly toast: ToastRenderer;
  readonly canEdit: () => boolean;
  readonly allColumns: () => readonly BoardColumn[];
  readonly getCellValue: (item: BoardItem, column: BoardColumn) => BoardCellValue;
  readonly optionList: (column: BoardColumn) => readonly string[];
  readonly renderBoardData: () => void;
  readonly history?: BoardHistoryController | null;
  readonly escapeHtml: EscapeHtml;
  readonly overlayCoordinator?: OverlayManager | null;
  readonly reloadBoard?: ReloadBoard | null;
  readonly preferencePatches: BoardPreferencePatchService;
  readonly statusLabelsFor?: (column: BoardColumn) => readonly StatusLabel[];
  readonly statusLabelForValue?: (column: BoardColumn, value: unknown) => StatusLabel | null;
}

interface CommitOptions { readonly label?: string; readonly deferRender?: boolean; }
interface CloseOptions { readonly restore?: boolean; readonly fromCoordinator?: boolean; readonly cancel?: boolean; }
interface PopoverOptions {
  readonly className?: string;
  readonly onClick?: ((event: MouseEvent, popover: HTMLDivElement) => void) | null;
  readonly onInput?: ((event: Event, popover: HTMLDivElement) => void) | null;
  readonly onChange?: ((event: Event, popover: HTMLDivElement) => void) | null;
  readonly onSubmit?: ((event: SubmitEvent, popover: HTMLDivElement) => void) | null;
}
interface ExplicitInputOptions {
  readonly anchor: HTMLElement;
  readonly container: HTMLElement;
  readonly value: unknown;
  readonly maxLength?: number;
  readonly ariaLabel: string;
  readonly onSave: (value: string) => Promise<boolean>;
  readonly type?: string;
}
interface ActivePopover { readonly inline: false; readonly popover: HTMLDivElement; readonly anchor: HTMLElement; }
interface ActiveInline { readonly inline: true; readonly anchor: HTMLElement; readonly container: HTMLElement; readonly input: HTMLInputElement; readonly restore: () => void; }
type ActiveEditor = ActivePopover | ActiveInline;
interface StatusDraft {
  labels: StatusLabel[];
  defaultId: StatusLabelId | null;
  expandedId: StatusLabelId | null;
  colorId: StatusLabelId | null;
  saving: boolean;
}

const errorMessage = (error: unknown, fallback: string): string => error instanceof Error ? error.message : fallback;
const elementTarget = (event: Event): Element | null => event.target instanceof Element ? event.target : null;

function cloneCellValue(value: BoardCellValue): BoardCellValue {
  if (Array.isArray(value)) return [...value];
  if (value && typeof value === 'object') return { ...(value as TimelineValue) };
  return value;
}

/** Direct Board editing with explicit save/cancel contracts and configurable Status labels. */
export function createBoardInlineEditController({
  state,
  commands,
  toast,
  canEdit,
  allColumns,
  getCellValue,
  optionList,
  renderBoardData,
  history,
  escapeHtml,
  overlayCoordinator = null,
  reloadBoard = null,
  preferencePatches,
}: BoardInlineEditDependencies) {
  const esc = escapeHtml;
  let active: ActiveEditor | null = null;

  const findItem = (id: BoardItemId | string): BoardItem | undefined => state.board?.items.find((item) => String(item.id) === String(id));
  const findColumn = (id: BoardColumnId | string): BoardColumn | undefined => allColumns().find((column) => String(column.id) === String(id));
  const findGroup = (id: BoardGroupId | string): BoardGroup | undefined => state.board?.groups.find((group) => String(group.id) === String(id));

  function applyLocal(item: BoardItem, column: BoardColumn, value: BoardCellValue): void {
    if (column.system_key === 'title') Object.assign(item, { title: String(value || '') });
    else if (column.system_key === 'status') Object.assign(item, { status: value == null || value === '' ? null : String(value) });
    else if (column.system_key === 'assignee') Object.assign(item, { assignee_id: value == null || value === '' ? null : String(value) });
    else if (column.system_key === 'due_date') Object.assign(item, { due_date: value == null || value === '' ? null : String(value) });
    else if (column.system_key === 'notes') Object.assign(item, { notes: value == null ? '' : String(value) });
    else {
      const board = state.board;
      if (!board) return;
      const values = [...board.values];
      const index = values.findIndex((entry) => String(entry.item_id) === String(item.id) && String(entry.column_id) === String(column.id));
      if (value == null || value === '') {
        if (index >= 0) values.splice(index, 1);
      } else if (index >= 0) {
        const current = values[index];
        if (current) values[index] = { ...current, value: cloneCellValue(value), updated_at: new Date().toISOString() };
      } else {
        values.push({ item_id: item.id, column_id: column.id, value: cloneCellValue(value), updated_at: new Date().toISOString() });
      }
      state.board = { ...board, values };
    }
  }

  const persistValue = (item: BoardItem, column: BoardColumn, value: BoardCellValue): Promise<void> => commands.setCell({ itemId: item.id, columnId: column.id, value });

  async function commitCell(item: BoardItem, column: BoardColumn, next: BoardCellValue, { label = `${column.name} changed`, deferRender = false }: CommitOptions = {}): Promise<boolean> {
    if (!canEdit()) return false;
    const previous = cloneCellValue(getCellValue(item, column));
    if (JSON.stringify(previous) === JSON.stringify(next)) return true;
    applyLocal(item, column, next);
    if (!deferRender) renderBoardData();
    try {
      await persistValue(item, column, next);
      history?.push({
        label,
        undo: async () => { applyLocal(item, column, previous); renderBoardData(); await persistValue(item, column, previous); },
        redo: async () => { applyLocal(item, column, next); renderBoardData(); await persistValue(item, column, next); },
      });
      return true;
    } catch (error) {
      applyLocal(item, column, previous);
      if (!deferRender) renderBoardData();
      toast(errorMessage(error, 'This value could not be saved. Your previous value was restored.'), 'warning');
      return false;
    }
  }

  async function commitTitle(item: BoardItem, nextTitle: unknown, { deferRender = false }: CommitOptions = {}): Promise<boolean> {
    const title = String(nextTitle || '').trim();
    if (!title) { toast('Enter an item name before saving.', 'warning'); return false; }
    if (title.length > 240) { toast('Item names can be up to 240 characters.', 'warning'); return false; }
    const previous = item.title;
    if (previous === title) return true;
    const save = (value: string): Promise<void> => commands.updateItem({ itemId: item.id, title: value, status: item.status, assigneeId: item.assignee_id || null, dueDate: item.due_date || null, notes: item.notes || '' });
    Object.assign(item, { title });
    if (!deferRender) renderBoardData();
    try {
      await save(title);
      history?.push({
        label: 'item name change',
        undo: async () => { Object.assign(item, { title: previous }); renderBoardData(); await save(previous); },
        redo: async () => { Object.assign(item, { title }); renderBoardData(); await save(title); },
      });
      return true;
    } catch (error) {
      Object.assign(item, { title: previous });
      if (!deferRender) renderBoardData();
      toast(errorMessage(error, 'The item name could not be saved. Your previous name was restored.'), 'warning');
      return false;
    }
  }

  function normalize(column: BoardColumn, raw: unknown): BoardCellValue {
    return normalizeBoardCellValue(column.data_type, raw);
  }

  function releaseOverlay(): void { overlayCoordinator?.release('inline-editor'); }

  function close({ restore = true, fromCoordinator = false, cancel = true }: CloseOptions = {}): void {
    if (!active) return;
    const current = active;
    active = null;
    if (current.inline && cancel) current.restore();
    if (!current.inline) current.popover.remove();
    if (!fromCoordinator) releaseOverlay();
    if (restore && current.anchor.isConnected) current.anchor.focus({ preventScroll: true });
  }

  function position(popover: HTMLDivElement, anchor: HTMLElement): void {
    const rect = anchor.getBoundingClientRect();
    const pad = 10;
    const gap = 7;
    popover.style.visibility = 'hidden';
    requestAnimationFrame(() => {
      if (!popover.isConnected) return;
      const box = popover.getBoundingClientRect();
      const left = Math.max(pad, Math.min(rect.left, innerWidth - box.width - pad));
      let top = rect.bottom + gap;
      if (top + box.height > innerHeight - pad && rect.top - box.height - gap > pad) top = rect.top - box.height - gap;
      popover.style.left = `${Math.round(left)}px`;
      popover.style.top = `${Math.round(Math.max(pad, Math.min(top, innerHeight - box.height - pad)))}px`;
      popover.style.visibility = 'visible';
    });
  }

  function openPopover(anchor: HTMLElement, html: string, { className = '', onClick = null, onInput = null, onChange = null, onSubmit = null }: PopoverOptions = {}): HTMLDivElement {
    close({ restore: false });
    const popover = document.createElement('div');
    popover.className = `board-inline-popover ${className}`.trim();
    popover.setAttribute('role', 'dialog');
    popover.innerHTML = html;
    document.body.appendChild(popover);
    active = { popover, anchor, inline: false };
    overlayCoordinator?.open({ id: 'inline-editor', element: popover, trigger: anchor, close: ({ restoreFocus = false, fromCoordinator = false } = {}) => close({ restore: restoreFocus, fromCoordinator, cancel: true }) });
    position(popover, anchor);
    if (onClick) popover.addEventListener('click', (event: MouseEvent) => onClick(event, popover));
    if (onInput) popover.addEventListener('input', (event: Event) => onInput(event, popover));
    if (onChange) popover.addEventListener('change', (event: Event) => onChange(event, popover));
    if (onSubmit) popover.addEventListener('submit', (event: SubmitEvent) => onSubmit(event, popover));
    requestAnimationFrame(() => popover.querySelector<HTMLElement>('input,textarea,button:not([disabled]),[tabindex]')?.focus());
    return popover;
  }

  function setFormPending(form: HTMLFormElement | null, pending: boolean, message = ''): void {
    if (!form) return;
    form.dataset.saving = pending ? 'true' : 'false';
    form.setAttribute('aria-busy', pending ? 'true' : 'false');
    form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLButtonElement>('button,input,textarea,select').forEach((control) => { control.disabled = pending; });
    let status = form.querySelector<HTMLElement>('.inline-save-status');
    if (!status && message) {
      status = document.createElement('span');
      status.className = 'inline-save-status';
      form.querySelector(':scope > div:last-child')?.prepend(status);
    }
    if (status) status.textContent = message;
  }

  function setFormError(form: HTMLFormElement | null, message = ''): void {
    let error = form?.querySelector<HTMLElement>('.inline-save-error') ?? null;
    if (!message) { error?.remove(); return; }
    if (!error) {
      error = document.createElement('p');
      error.className = 'inline-save-error';
      error.setAttribute('role', 'alert');
      form?.appendChild(error);
    }
    error.textContent = message;
  }

  function statusUsageCount(column: BoardColumn, labelId: StatusLabelId | string, labelName = ''): number {
    if (column.system_key === 'status') return (state.board?.items || []).filter((item) => String(item.status || '') === String(labelId) || String(item.status || '') === labelName).length;
    return (state.board?.values || []).filter((entry) => String(entry.column_id) === String(column.id) && (String(entry.value || '') === String(labelId) || String(entry.value || '') === labelName)).length;
  }

  function statusChoiceMarkup(column: BoardColumn, value: BoardCellValue): string {
    const current = value == null ? null : String(value);
    const labels = activeStatusLabels(column, current);
    return `<div class="board-status-picker" aria-label="Choose ${esc(column.name)} status"><div class="status-choice-list" role="listbox"><button type="button" class="status-choice clear" data-status-choice="" role="option"><span class="status-choice-swatch empty" aria-hidden="true"></span><span>Clear value</span></button>${labels.map((label) => `<button type="button" class="status-choice ${String(value || '') === String(label.id) ? 'selected' : ''}" data-status-choice="${esc(label.id)}" role="option" aria-selected="${String(value || '') === String(label.id)}" style="--status-color:${esc(label.color)}"><span class="status-choice-swatch" aria-hidden="true"></span><span>${esc(label.name)}</span>${label.active === false ? '<small>Inactive</small>' : ''}</button>`).join('')}</div><footer class="status-picker-footer"><button type="button" data-manage-status-labels>Manage labels</button></footer></div>`;
  }

  function openStatusEditor(item: BoardItem, column: BoardColumn, anchor: HTMLElement): void {
    const value = getCellValue(item, column);
    const popover = openPopover(anchor, statusChoiceMarkup(column, value), { className: 'board-status-popover' });
    const showQuick = (): void => {
      if (!popover.isConnected) return;
      popover.innerHTML = statusChoiceMarkup(column, getCellValue(item, column));
      position(popover, anchor);
      requestAnimationFrame(() => popover.querySelector<HTMLElement>('[data-status-choice].selected,[data-status-choice]')?.focus());
    };
    const editor = createStatusLabelEditor(column);
    const initialDraft = editor.snapshot();
    const draft: StatusDraft = { labels: initialDraft.labels.map((label) => ({ ...label })), defaultId: initialDraft.defaultId, expandedId: null, colorId: null, saving: false };
    let managerError = '';
    const syncDraft = (): void => {
      const snapshot = editor.snapshot();
      draft.labels = snapshot.labels.map((label) => ({ ...label }));
      draft.defaultId = snapshot.defaultId;
    };

    const managerMarkup = (): string => `<section class="status-label-manager" aria-labelledby="statusManagerTitle" data-status-manager-dirty="${editor.isDirty() ? 'true' : 'false'}"><header><div><span class="status-manager-eyebrow">STATUS LABELS</span><h3 id="statusManagerTitle">Manage ${esc(column.name)}</h3><p>Rename, recolor, reorder, activate, or remove labels while preserving their stable IDs.</p></div><button type="button" class="status-manager-close" data-status-manager-cancel aria-label="Discard status label changes and return to choices">×</button></header>${editor.isDirty() ? '<div class="status-manager-change-note" role="status">Unsaved label changes</div>' : ''}${managerError ? `<p class="status-manager-error" role="alert">${esc(managerError)}</p>` : ''}<div class="status-label-list">${draft.labels.map((label, index) => `<article class="status-label-row ${label.active === false ? 'is-inactive' : ''}" data-status-label-row="${esc(label.id)}" style="--status-color:${esc(label.color)}"><div class="status-label-main"><div class="status-reorder-controls" role="group" aria-label="Reorder ${esc(label.name)}"><button type="button" data-status-move="up" data-status-label-id="${esc(label.id)}" ${index === 0 ? 'disabled' : ''} aria-label="Move ${esc(label.name)} up">↑</button><button type="button" data-status-move="down" data-status-label-id="${esc(label.id)}" ${index === draft.labels.length - 1 ? 'disabled' : ''} aria-label="Move ${esc(label.name)} down">↓</button></div><button type="button" class="status-color-button" data-status-color-toggle="${esc(label.id)}" aria-expanded="${draft.colorId === label.id}" aria-label="Change color for ${esc(label.name)}"><span aria-hidden="true"></span></button><input type="text" maxlength="80" value="${esc(label.name)}" data-status-label-name="${esc(label.id)}" aria-label="Status label name" ${draft.saving ? 'disabled' : ''}><button type="button" class="status-label-more" data-status-more="${esc(label.id)}" aria-expanded="${draft.expandedId === label.id}" aria-label="More options for ${esc(label.name)}">•••</button></div>${draft.colorId === label.id ? `<div class="status-color-palette" role="group" aria-label="Choose a color for ${esc(label.name)}">${STATUS_COLOR_PALETTE.map((color) => `<button type="button" data-status-color="${color}" data-status-label-id="${esc(label.id)}" style="--swatch:${color}" class="${color.toLowerCase() === String(label.color).toLowerCase() ? 'selected' : ''}" aria-pressed="${color.toLowerCase() === String(label.color).toLowerCase()}" aria-label="Use ${color}"><span></span></button>`).join('')}</div>` : ''}${draft.expandedId === label.id ? `<div class="status-label-options"><label>Description <input type="text" maxlength="240" value="${esc(label.description || '')}" data-status-description="${esc(label.id)}" placeholder="Optional context for this label"></label><div><button type="button" data-status-default="${esc(label.id)}" ${label.active === false ? 'disabled' : ''}>${draft.defaultId === label.id ? 'Default label ✓' : 'Set as default'}</button><button type="button" data-status-toggle-active="${esc(label.id)}">${label.active === false ? 'Activate label' : 'Deactivate label'}</button><button type="button" class="danger-text" data-status-delete="${esc(label.id)}">Delete label</button></div></div>` : ''}</article>`).join('')}</div><button type="button" class="status-add-label" data-status-add>+ New label</button><footer class="status-manager-actions"><button type="button" data-status-manager-cancel>Cancel changes</button><button type="button" class="primary-btn" data-status-apply ${draft.saving ? 'disabled' : ''}>${draft.saving ? 'Saving…' : 'Apply changes'}</button></footer></section>`;

    const renderManager = (focusSelector: string | null = null): void => {
      if (!popover.isConnected) return;
      syncDraft();
      popover.innerHTML = managerMarkup();
      position(popover, anchor);
      if (focusSelector) requestAnimationFrame(() => popover.querySelector<HTMLElement>(focusSelector)?.focus());
    };

    const syncManagerDirtyState = (): void => {
      const manager = popover.querySelector<HTMLElement>('.status-label-manager');
      if (!manager) return;
      const dirty = editor.isDirty();
      manager.dataset.statusManagerDirty = dirty ? 'true' : 'false';
      let note = manager.querySelector<HTMLElement>('.status-manager-change-note');
      if (dirty && !note) {
        note = document.createElement('div');
        note.className = 'status-manager-change-note';
        note.setAttribute('role', 'status');
        note.textContent = 'Unsaved label changes';
        const error = manager.querySelector('.status-manager-error');
        const list = manager.querySelector('.status-label-list');
        manager.insertBefore(note, error ?? list ?? manager.firstChild);
      } else if (!dirty) note?.remove();
      manager.querySelector('.status-manager-error')?.remove();
    };

    popover.addEventListener('input', (event: Event) => {
      const target = elementTarget(event);
      managerError = '';
      const name = target?.closest<HTMLInputElement>('[data-status-label-name]') ?? null;
      if (name) {
        const id = name.dataset.statusLabelName;
        if (id) { try { editor.rename(id, name.value); } catch { /* Validation is shown on apply. */ } }
        syncManagerDirtyState();
        return;
      }
      const description = target?.closest<HTMLInputElement>('[data-status-description]') ?? null;
      if (description) {
        const id = description.dataset.statusDescription;
        if (id) { try { editor.setDescription(id, description.value); } catch { /* Validation is shown on apply. */ } }
        syncManagerDirtyState();
      }
    });

    popover.addEventListener('keydown', (event: KeyboardEvent) => {
      const target = elementTarget(event);
      const current = target?.closest<HTMLElement>('[data-status-choice]') ?? null;
      if (!current || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      const choices = [...popover.querySelectorAll<HTMLElement>('[data-status-choice]:not(:disabled)')];
      if (!choices.length) return;
      event.preventDefault();
      const index = Math.max(0, choices.indexOf(current));
      const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? choices.length - 1 : event.key === 'ArrowDown' ? (index + 1) % choices.length : (index - 1 + choices.length) % choices.length;
      choices[nextIndex]?.focus();
    });

    popover.addEventListener('click', (event: MouseEvent) => {
      void (async () => {
        const target = elementTarget(event);
        const choice = target?.closest<HTMLElement>('[data-status-choice]') ?? null;
        if (choice) {
          event.preventDefault();
          event.stopPropagation();
          const next = getBoardCellEditorContract('status').normalizeDraft((choice.dataset.statusChoice || null) as StatusLabelId | null);
          close({ restore: false, cancel: false });
          await commitCell(item, column, next, { label: `${column.name} change` });
          return;
        }
        if (target?.closest('[data-manage-status-labels]')) { event.preventDefault(); renderManager('[data-status-label-name]'); return; }
        if (target?.closest('[data-status-manager-cancel]')) { event.preventDefault(); editor.reset(); managerError = ''; draft.expandedId = null; draft.colorId = null; showQuick(); return; }
        if (target?.closest('[data-status-add]')) {
          const id = editor.add('New label');
          const selector = `[data-status-label-name="${CSS.escape(id)}"]`;
          renderManager(selector);
          requestAnimationFrame(() => popover.querySelector<HTMLInputElement>(selector)?.select());
          return;
        }
        const move = target?.closest<HTMLElement>('[data-status-move]') ?? null;
        if (move) {
          const id = move.dataset.statusLabelId;
          if (!id) return;
          try { editor.move(id, move.dataset.statusMove === 'up' ? 'up' : 'down'); renderManager(`[data-status-label-id="${CSS.escape(id)}"]`); }
          catch (error) { toast(errorMessage(error, 'Status labels could not be reordered.'), 'warning'); }
          return;
        }
        const more = target?.closest<HTMLElement>('[data-status-more]') ?? null;
        if (more) {
          const id = more.dataset.statusMore || null;
          draft.expandedId = draft.expandedId === id ? null : id;
          draft.colorId = null;
          if (id) renderManager(`[data-status-more="${CSS.escape(id)}"]`); else renderManager();
          return;
        }
        const colorToggle = target?.closest<HTMLElement>('[data-status-color-toggle]') ?? null;
        if (colorToggle) {
          const id = colorToggle.dataset.statusColorToggle || null;
          draft.colorId = draft.colorId === id ? null : id;
          draft.expandedId = null;
          if (id) renderManager(`[data-status-color-toggle="${CSS.escape(id)}"]`); else renderManager();
          return;
        }
        const color = target?.closest<HTMLElement>('[data-status-color]') ?? null;
        if (color) {
          const id = color.dataset.statusLabelId;
          const nextColor = color.dataset.statusColor;
          if (!id || !nextColor) return;
          try { editor.recolor(id, nextColor); }
          catch (error) { toast(errorMessage(error, 'Choose a valid status color.'), 'warning'); return; }
          draft.colorId = null;
          renderManager(`[data-status-color-toggle="${CSS.escape(id)}"]`);
          return;
        }
        const defaultButton = target?.closest<HTMLElement>('[data-status-default]') ?? null;
        if (defaultButton) {
          const id = defaultButton.dataset.statusDefault;
          if (!id) return;
          try { editor.setDefault(id); }
          catch (error) { toast(errorMessage(error, 'The default label could not be changed.'), 'warning'); return; }
          renderManager(`[data-status-more="${CSS.escape(id)}"]`);
          return;
        }
        const toggle = target?.closest<HTMLElement>('[data-status-toggle-active]') ?? null;
        if (toggle) {
          const id = toggle.dataset.statusToggleActive;
          if (!id) return;
          try { editor.toggleActive(id); }
          catch (error) { toast(errorMessage(error, 'The label state could not be changed.'), 'warning'); return; }
          renderManager(`[data-status-more="${CSS.escape(id)}"]`);
          return;
        }
        const remove = target?.closest<HTMLElement>('[data-status-delete]') ?? null;
        if (remove) {
          const id = remove.dataset.statusDelete;
          if (!id) return;
          const label = editor.label(id);
          if (!label) return;
          const used = statusUsageCount(column, label.id, label.name);
          if (used && !globalThis.confirm(`Delete “${label.name}”? ${used} item${used === 1 ? '' : 's'} currently use this label. Those values will be cleared.`)) return;
          try { editor.remove(label.id); }
          catch (error) { toast(errorMessage(error, 'The status label could not be deleted.'), 'warning'); return; }
          draft.expandedId = null;
          draft.colorId = null;
          renderManager();
          return;
        }
        const apply = target?.closest<HTMLButtonElement>('[data-status-apply]') ?? null;
        if (!apply || draft.saving) return;
        let config;
        try { config = editor.serialize(); managerError = ''; }
        catch (error) { managerError = errorMessage(error, 'Status labels are invalid.'); renderManager('[data-status-apply]'); return; }
        draft.saving = true;
        renderManager();
        try {
          await commands.setStatusLabels({ columnId: column.id, labels: config.labels, defaultLabelId: config.default_label_id });
          const validIds = new Set(config.labels.map((label) => String(label.id)));
          if (column.system_key === 'status' && state.itemStatus !== 'all' && !validIds.has(String(state.itemStatus))) state.itemStatus = 'all';
          const currentFilter = String(state.boardPrefs?.column_filters?.[column.id] || '');
          const hadFilter = Boolean(currentFilter);
          if (currentFilter && !validIds.has(currentFilter)) state.boardPrefs = preferencePatches.withColumnFilter(state.boardPrefs, column.id, null);
          const activeBoardId = state.board?.board?.id;
          if (hadFilter && !state.boardPrefs?.column_filters?.[column.id] && activeBoardId) {
            try { state.boardPrefs = await commands.savePreferences(activeBoardId, state.boardPrefs); } catch { /* Filter cleanup is best-effort after server label update. */ }
          }
          close({ restore: false, cancel: false });
          toast(`Status labels updated for “${column.name}”.`);
          if (reloadBoard) await reloadBoard(); else renderBoardData();
        } catch (error) {
          draft.saving = false;
          managerError = errorMessage(error, 'Status labels could not be saved.');
          renderManager('[data-status-apply]');
        }
      })();
    });
  }

  function openExplicitInput({ anchor, container, value, maxLength = 240, ariaLabel, onSave, type = 'text' }: ExplicitInputOptions): void {
    close({ restore: false });
    const original = container.innerHTML;
    const shell = document.createElement('div');
    shell.className = 'board-inline-editor-shell';
    shell.setAttribute('data-inline-editor-state', 'editing');
    const input = document.createElement('input');
    input.className = 'board-inline-input';
    input.type = type;
    input.maxLength = maxLength;
    input.value = value == null ? '' : String(value);
    input.setAttribute('aria-label', ariaLabel);
    input.setAttribute('aria-describedby', 'boardInlineEditorStatus');
    const actions = document.createElement('span');
    actions.className = 'board-inline-editor-actions';
    actions.innerHTML = '<button type="button" class="inline-confirm" aria-label="Save changes" title="Save (Enter)">✓</button><button type="button" class="inline-cancel" aria-label="Cancel editing" title="Cancel (Escape)">×</button>';
    const status = document.createElement('span');
    status.id = 'boardInlineEditorStatus';
    status.className = 'board-inline-editor-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    shell.append(input, actions, status);
    container.innerHTML = '';
    container.appendChild(shell);
    let closed = false;
    let pending = false;
    const restore = (): void => { if (container.isConnected) container.innerHTML = original; };
    active = { inline: true, anchor, container, input, restore };
    overlayCoordinator?.open({ id: 'inline-editor', element: shell, trigger: anchor, close: ({ restoreFocus = false, fromCoordinator = false } = {}) => close({ restore: restoreFocus, fromCoordinator, cancel: true }) });

    const setPending = (next: boolean): void => {
      pending = next;
      shell.dataset.inlineEditorState = next ? 'saving' : 'editing';
      shell.setAttribute('aria-busy', next ? 'true' : 'false');
      input.disabled = next;
      actions.querySelectorAll<HTMLButtonElement>('button').forEach((button) => { button.disabled = next; });
      if (next) status.textContent = 'Saving…';
    };

    const cancel = (): void => {
      if (closed || pending) return;
      closed = true;
      active = null;
      releaseOverlay();
      restore();
      if (anchor.isConnected) anchor.focus({ preventScroll: true });
    };

    const save = async (): Promise<void> => {
      if (closed || pending) return;
      input.removeAttribute('aria-invalid');
      status.textContent = '';
      setPending(true);
      const ok = await onSave(input.value);
      if (ok) {
        closed = true;
        active = null;
        releaseOverlay();
        return;
      }
      setPending(false);
      shell.dataset.inlineEditorState = 'error';
      input.setAttribute('aria-invalid', 'true');
      status.textContent = 'Not saved. Review the value and try again.';
      requestAnimationFrame(() => {
        if (!input.isConnected) return;
        input.focus({ preventScroll: true });
        if (['text', 'email', 'url'].includes(input.type)) input.select();
      });
    };

    actions.addEventListener('pointerdown', (event: PointerEvent) => event.preventDefault());
    actions.addEventListener('click', (event: MouseEvent) => {
      const target = elementTarget(event);
      if (target?.closest('.inline-confirm')) void save();
      else if (target?.closest('.inline-cancel')) cancel();
    });
    input.addEventListener('input', () => {
      if (shell.dataset.inlineEditorState === 'error') {
        shell.dataset.inlineEditorState = 'editing';
        input.removeAttribute('aria-invalid');
        status.textContent = '';
      }
    });
    input.addEventListener('keydown', (event: KeyboardEvent) => {
      if (event.key === 'Enter') { event.preventDefault(); void save(); }
      else if (event.key === 'Escape') { event.preventDefault(); cancel(); }
    });
    requestAnimationFrame(() => {
      input.focus();
      if (['text', 'email', 'url'].includes(input.type)) input.select();
      if (input.type === 'date') input.showPicker?.();
    });
  }

  function open(itemId: BoardItemId | string, columnId: BoardColumnId | string, anchor: HTMLElement): void {
    if (!canEdit()) return;
    const item = findItem(itemId);
    const column = findColumn(columnId);
    if (!item || !column) return;
    const value = getCellValue(item, column);

    switch (column.data_type) {
      case 'checkbox': {
        const editor = getBoardCellEditorContract('checkbox');
        const current = editor.normalizeDraft(value === true ? true : value === false ? false : null);
        void commitCell(item, column, current === true ? false : true, { label: `${column.name} toggle` });
        return;
      }
      case 'status':
        openStatusEditor(item, column, anchor);
        return;
      case 'dropdown': {
        const choices = optionList(column).map((entry) => [entry, entry] as const);
        openPopover(anchor, `<div class="board-choice-editor"><button type="button" data-inline-choice="">Clear value</button>${choices.map(([choice, label]) => `<button type="button" data-inline-choice="${esc(choice)}" class="${String(value || '') === String(choice) ? 'selected' : ''}">${esc(label)}</button>`).join('')}</div>`, {
          onClick: (event) => {
            const button = elementTarget(event)?.closest<HTMLElement>('[data-inline-choice]') ?? null;
            if (!button) return;
            event.stopPropagation();
            const next = getBoardCellEditorContract('dropdown').normalizeDraft(button.dataset.inlineChoice || null);
            close({ restore: false, cancel: false });
            void commitCell(item, column, next, { label: `${column.name} change` });
          },
        });
        return;
      }
      case 'people': {
        const pop = openPopover(anchor, `<div class="board-person-editor"><label class="inline-picker-search"><input type="search" placeholder="Search board members" aria-label="Search board members" data-inline-person-search></label><div data-inline-person-list><button type="button" data-inline-person="">Unassigned</button>${(state.board?.members || []).map((member) => `<button type="button" data-inline-person="${member.user_id}" data-search="${esc(`${member.display_name || ''} ${member.email || ''}`.toLowerCase())}" class="${String(value || '') === String(member.user_id) ? 'selected' : ''}"><strong>${esc(member.display_name || '')}</strong><small>${esc(member.email || '')}</small></button>`).join('')}</div></div>`, {
          onClick: (event) => {
            const button = elementTarget(event)?.closest<HTMLElement>('[data-inline-person]') ?? null;
            if (!button) return;
            event.stopPropagation();
            const next = getBoardCellEditorContract('people').normalizeDraft(button.dataset.inlinePerson || null);
            close({ restore: false, cancel: false });
            void commitCell(item, column, next, { label: `${column.name} assignment` });
          },
        });
        const search = pop.querySelector<HTMLInputElement>('[data-inline-person-search]');
        search?.addEventListener('input', () => {
          const query = search.value.trim().toLowerCase();
          pop.querySelectorAll<HTMLElement>('[data-inline-person][data-search]').forEach((button) => { button.hidden = Boolean(query) && !String(button.dataset.search || '').includes(query); });
        });
        return;
      }
      case 'timeline': {
        const editor = getBoardCellEditorContract('timeline');
        const timeline = editor.draftFromValue(normalizeBoardCellValue('timeline', value));
        openPopover(anchor, `<form class="board-inline-form"><label>Start date<input type="date" name="start" value="${esc(timeline?.start || '')}"></label><label>End date<input type="date" name="end" value="${esc(timeline?.end || '')}"></label><div><button type="button" data-inline-cancel>Cancel</button><button type="button" data-inline-clear>Clear dates</button><button type="submit" class="primary-btn">Save dates</button></div></form>`, {
          onClick: (event) => {
            if (elementTarget(event)?.closest('[data-inline-cancel]')) { close(); return; }
            if (elementTarget(event)?.closest('[data-inline-clear]')) {
              close({ restore: false, cancel: false });
              void commitCell(item, column, null, { label: `${column.name} clear` });
            }
          },
          onSubmit: (event) => {
            void (async () => {
              event.preventDefault();
              const form = event.target instanceof HTMLFormElement ? event.target : null;
              if (!form || form.dataset.saving === 'true') return;
              const fd = new FormData(form);
              const start = String(fd.get('start') || '');
              const end = String(fd.get('end') || '');
              if ((start && !end) || (!start && end)) { setFormError(form, 'Choose both a start and end date.'); return; }
              if (start && end && end < start) { setFormError(form, 'End date cannot be before start date.'); return; }
              setFormError(form, '');
              setFormPending(form, true, 'Saving…');
              const next = start || end ? editor.normalizeDraft({ start, end }) : null;
              const ok = await commitCell(item, column, next, { label: `${column.name} change`, deferRender: true });
              if (ok) { close({ restore: false, cancel: false }); renderBoardData(); return; }
              setFormPending(form, false, 'Not saved');
              setFormError(form, 'This value could not be saved. Your draft is still here—review it and try again.');
            })();
          },
        });
        return;
      }
      case 'long_text': {
        const editor = getBoardCellEditorContract('long_text');
        const draft = editor.draftFromValue(normalizeBoardCellValue('long_text', value));
        openPopover(anchor, `<form class="board-inline-form board-inline-form-wide"><textarea name="value" rows="5" maxlength="5000" placeholder="Enter details" aria-label="Edit ${esc(column.name)}">${esc(draft)}</textarea><div><button type="button" data-inline-cancel>Discard changes</button><button type="submit" class="primary-btn">Save text</button></div></form>`, {
          onClick: (event) => { if (elementTarget(event)?.closest('[data-inline-cancel]')) close(); },
          onSubmit: (event) => {
            void (async () => {
              event.preventDefault();
              const form = event.target instanceof HTMLFormElement ? event.target : null;
              if (!form || form.dataset.saving === 'true') return;
              let next;
              try { next = editor.normalizeDraft(String(new FormData(form).get('value') || '')); }
              catch (error) { setFormError(form, errorMessage(error, 'Enter a valid value.')); return; }
              setFormError(form, '');
              setFormPending(form, true, 'Saving…');
              const ok = await commitCell(item, column, next, { label: `${column.name} change`, deferRender: true });
              if (ok) { close({ restore: false, cancel: false }); renderBoardData(); return; }
              setFormPending(form, false, 'Not saved');
              setFormError(form, 'This value could not be saved. Your draft is still here—review it and try again.');
            })();
          },
        });
        return;
      }
      case 'number':
      case 'date':
      case 'email':
      case 'url':
      case 'text': {
        const cell = anchor.closest<HTMLElement>('.board-data-cell');
        if (!cell) return;
        const inputType = column.data_type === 'number' ? 'number' : column.data_type === 'date' ? 'date' : column.data_type === 'email' ? 'email' : column.data_type === 'url' ? 'url' : 'text';
        const maxLength = column.data_type === 'email' ? 320 : column.data_type === 'url' ? 2000 : 1000;
        openExplicitInput({
          anchor,
          container: cell,
          value,
          ariaLabel: `Edit ${column.name}`,
          type: inputType,
          maxLength,
          onSave: async (raw) => {
            let next: BoardCellValue;
            try { next = normalize(column, raw); }
            catch (error) { toast(errorMessage(error, 'Enter a valid value.'), 'warning'); return false; }
            const ok = await commitCell(item, column, next, { label: `${column.name} change`, deferRender: true });
            if (ok) renderBoardData();
            return ok;
          },
        });
        return;
      }
      default: {
        const unsupported: never = column;
        void unsupported;
        throw new Error('Unsupported Board column editor.');
      }
    }
  }

  function openTitle(itemId: BoardItemId | string, anchor: HTMLElement): void {
    if (!canEdit()) return;
    const item = findItem(itemId);
    const cell = anchor.closest<HTMLElement>('.board-item-name-cell');
    if (!item || !cell) return;
    openExplicitInput({ anchor, container: cell, value: item.title, ariaLabel: `Rename ${item.title}`, maxLength: 240, onSave: async (next) => { const ok = await commitTitle(item, next, { deferRender: true }); if (ok) renderBoardData(); return ok; } });
  }

  function openColumnTitle(columnId: BoardColumnId | string, anchor: HTMLElement): void {
    if (!canEdit()) return;
    const column = findColumn(columnId);
    const cell = anchor.closest<HTMLElement>('.board-column-head');
    if (!column || !cell) return;
    openExplicitInput({
      anchor,
      container: cell,
      value: column.name,
      ariaLabel: `Rename ${column.name} column`,
      maxLength: 80,
      onSave: async (next) => {
        const name = String(next || '').trim();
        if (!name) { toast('Enter a column name before saving.', 'warning'); return false; }
        if (allColumns().some((entry) => entry.id !== column.id && entry.name.trim().toLowerCase() === name.toLowerCase())) { toast(`A column named “${name}” already exists.`, 'warning'); return false; }
        const previous = column.name;
        try {
          await commands.updateColumn({ columnId: column.id, name, config: { ...column.config }, visible: column.visible !== false });
          Object.assign(column, { name });
          renderBoardData();
          history?.push({
            label: 'column rename',
            undo: async () => { await commands.updateColumn({ columnId: column.id, name: previous, config: { ...column.config }, visible: column.visible !== false }); Object.assign(column, { name: previous }); renderBoardData(); },
            redo: async () => { await commands.updateColumn({ columnId: column.id, name, config: { ...column.config }, visible: column.visible !== false }); Object.assign(column, { name }); renderBoardData(); },
          });
          return true;
        } catch (error) { toast(errorMessage(error, 'The column name could not be saved.'), 'warning'); return false; }
      },
    });
  }

  function openGroupTitle(groupId: BoardGroupId | string, anchor: HTMLElement): void {
    if (!canEdit()) return;
    const group = findGroup(groupId);
    const host = anchor.closest<HTMLElement>('.group-heading-copy') || anchor.parentElement;
    if (!group || !host) return;
    openExplicitInput({
      anchor,
      container: host,
      value: group.title,
      ariaLabel: `Rename ${group.title} group`,
      maxLength: 120,
      onSave: async (next) => {
        const name = String(next || '').trim();
        if (!name) { toast('Enter a group name before saving.', 'warning'); return false; }
        const previous = group.title;
        try {
          await commands.renameGroup({ groupId: group.id, title: name });
          Object.assign(group, { title: name });
          renderBoardData();
          history?.push({
            label: 'group rename',
            undo: async () => { await commands.renameGroup({ groupId: group.id, title: previous }); Object.assign(group, { title: previous }); renderBoardData(); },
            redo: async () => { await commands.renameGroup({ groupId: group.id, title: name }); Object.assign(group, { title: name }); renderBoardData(); },
          });
          return true;
        } catch (error) { toast(errorMessage(error, 'The group name could not be saved.'), 'warning'); return false; }
      },
    });
  }

  function handleDocumentPointer(): void { /* Outside dismissal is centralized by overlayCoordinator. */ }
  function dismissPopover({ restore = false }: Readonly<{ restore?: boolean }> = {}): void { if (active && !active.inline) close({ restore }); }
  function repositionPopover(): void { if (active && !active.inline && active.anchor.isConnected) position(active.popover, active.anchor); }
  function reset(): void { close({ restore: false }); }

  return Object.freeze({ open, openTitle, openColumnTitle, openGroupTitle, commitCell, commitTitle, handleDocumentPointer, dismissPopover, repositionPopover, reset });
}
