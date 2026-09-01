import type { BoardCellValue, BoardColumn, BoardColumnType, BoardItem, TimelineValue } from '../../../../../src/features/boards/contracts/domain.ts';
import type { BoardCommandService } from '../../../../../src/features/boards/contracts/commands.ts';
import type { BoardDialog } from '../../../../../src/features/boards/contracts/presentation.ts';
import type { BoardPreferencePatchService } from '../../../../../src/features/boards/contracts/preference-patches.ts';
import type { MutableBoardViewState } from '../../../../../src/features/boards/contracts/view-state.ts';
import type { OverlayManager } from '../../../../../src/platform/contracts/overlay.ts';
import type { EscapeHtml, IconSet, ToastRenderer } from '../../../../../src/platform/contracts/ui.ts';
import type { BoardColumnId, BoardId } from '../../../../../src/types/identifiers.ts';
import { COLUMN_TYPES, defaultColumnName } from '../board-schema.ts';
import { getBoardColumnType, normalizeBoardCellValue } from '../grid/column-type-registry.ts';
import { normalizeStatusLabels } from '../status-labels.ts';

interface ColumnWorkflowsDependencies {
  readonly state: MutableBoardViewState;
  readonly commands: BoardCommandService;
  readonly dialog: BoardDialog;
  readonly icons: IconSet;
  readonly toast: ToastRenderer;
  readonly escapeHtml: EscapeHtml;
  readonly asArray?: (value: unknown) => readonly unknown[];
  readonly canEdit: () => boolean;
  readonly allColumns: () => readonly BoardColumn[];
  readonly optionList: (column: BoardColumn) => readonly string[];
  readonly columnTypeLabel: (type: BoardColumnType) => string;
  readonly activeColumnFilter: (columnId: BoardColumnId | string) => string;
  readonly persistBoardPrefs: () => void | Promise<unknown>;
  readonly removeColumnPreferenceReferences: (columnId: BoardColumnId | string) => void | Promise<unknown>;
  readonly populatedColumnValueCount: (column: BoardColumn) => number;
  readonly getCellValue: (item: BoardItem, column: BoardColumn) => BoardCellValue;
  readonly renderBoardData: () => void;
  readonly loadBoard: (boardId: BoardId | string, options?: Readonly<{ quiet?: boolean }>) => Promise<unknown>;
  readonly overlayCoordinator?: OverlayManager | null;
  readonly preferencePatches: BoardPreferencePatchService;
}

type PickerMode = 'add' | 'change';
interface PickerContext {
  readonly mode: PickerMode;
  readonly position: number | null;
  readonly column: BoardColumn | null;
}
interface PickerOptions {
  readonly mode?: PickerMode;
  readonly position?: number | null;
  readonly column?: BoardColumn | null;
  readonly anchor?: HTMLElement | null;
  readonly quick?: boolean;
}
interface DeleteOptions { readonly returnToManager?: boolean; }

const errorMessage = (error: unknown): string => error instanceof Error ? error.message : 'The column action could not be completed.';
const elementTarget = (event: Event): Element | null => event.target instanceof Element ? event.target : null;
const isColumnType = (value: unknown): value is BoardColumnType => typeof value === 'string' && getBoardColumnType(value) !== null;
const metaFor = (type: BoardColumnType) => {
  const definition = getBoardColumnType(type);
  if (!definition) throw new Error(`Unsupported Board column type: ${String(type)}`);
  return definition;
};
const assertNever = (value: never): never => { throw new Error(`Unsupported Board column type: ${String(value)}`); };

/** Work Board column workflow controller. */
export function createColumnWorkflows({
  state,
  commands,
  dialog,
  icons,
  toast,
  escapeHtml,
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
  overlayCoordinator = null,
  preferencePatches,
}: ColumnWorkflowsDependencies) {
  const esc = escapeHtml;
  let pickerContext: PickerContext | null = null;

  const boardId = (): BoardId | null => state.board?.board?.id ?? null;

  function typeOptionsConfig(type: BoardColumnType, config: object = {}): string {
    const configRecord = config as { readonly options?: unknown };
    if (type === 'status') {
      const labels = normalizeStatusLabels({ config });
      return `<div class="status-config-summary"><strong>${labels.length} configurable status label${labels.length === 1 ? '' : 's'}</strong><span>${labels.slice(0, 4).map((label) => `<i style="--status-color:${esc(label.color)}">${esc(label.name)}</i>`).join('')}</span><p class="field-help">Status labels use stable internal IDs. Open any Status cell and choose <strong>Manage labels</strong> to rename, recolor, reorder, activate, deactivate, or delete them.</p></div>`;
    }
    if (type !== 'dropdown') return '';
    const options = Array.isArray(configRecord.options) ? configRecord.options.map(String) : [];
    return `<label class="field-label">Options<textarea name="options" rows="5" maxlength="3000" placeholder="Enter one option per line">${esc(options.join('\n'))}</textarea><span class="field-help">One unique option per line, up to 50 options.</span></label>`;
  }

  function openFilter(column: BoardColumn | null | undefined): void {
    if (!column) return;
    const current = activeColumnFilter(column.id);
    let control = '';
    if (column.data_type === 'status' || column.data_type === 'dropdown') {
      const opts: readonly (readonly [string, string])[] = column.data_type === 'status'
        ? normalizeStatusLabels(column).map((label) => [label.id, `${label.name}${label.active === false ? ' (inactive)' : ''}`] as const)
        : optionList(column).map((value) => [value, value] as const);
      control = `<select name="filter"><option value="">Any option</option>${opts.map(([value, label]) => `<option value="${esc(value)}" ${current === value ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select>`;
    } else {
      control = `<input name="filter" value="${esc(current)}" maxlength="240" placeholder="Enter text to find" autocomplete="off">`;
    }
    dialog({
      title: `Filter ${column.name}`,
      body: `<label class="field-label">Filter ${esc(column.name)}${control}</label><p class="field-help">This filter is saved to your account and syncs across sessions.</p>`,
      submitLabel: 'Apply filter',
      onSubmit: (formData) => {
        const value = String(formData.get('filter') || '').trim();
        state.boardPrefs = preferencePatches.withColumnFilter(state.boardPrefs, column.id, value || null);
        void persistBoardPrefs();
        renderBoardData();
      },
    });
  }

  function openDuplicate(column: BoardColumn | null | undefined): void {
    const activeBoardId = boardId();
    if (!column || !canEdit() || !activeBoardId) return;
    dialog({
      title: `Duplicate ${column.name}`,
      body: '<p>Choose whether the new column starts empty or copies the values already in this column.</p><label class="choice-card"><input type="radio" name="mode" value="schema" checked><span><strong>Column only</strong><small>Copy the type and settings, but leave every item empty.</small></span></label><label class="choice-card"><input type="radio" name="mode" value="values"><span><strong>Column and values</strong><small>Copy the type, settings, and current values.</small></span></label>',
      submitLabel: 'Duplicate column',
      onSubmit: async (formData) => {
        await commands.duplicateColumn(column.id, formData.get('mode') === 'values');
        toast(`“${column.name}” duplicated.`);
        await loadBoard(activeBoardId, { quiet: true });
      },
    });
  }

  function openPicker({ mode = 'add', position = null, column = null, anchor = null }: PickerOptions = {}): void {
    pickerContext = { mode, position, column };
    const activeBoardId = boardId();
    if (!activeBoardId) return;
    if (anchor && mode === 'add') {
      overlayCoordinator?.closeAll({ restoreFocus: false });
      document.querySelectorAll('.column-quick-picker').forEach((node) => node.remove());
      const previous = document.activeElement;
      const pop = document.createElement('section');
      pop.className = 'column-quick-picker';
      pop.setAttribute('role', 'dialog');
      pop.setAttribute('aria-label', 'Add column');
      pop.innerHTML = `<label class="column-type-search">${icons.search}<input type="search" placeholder="Search column types" aria-label="Search column types" data-column-type-search></label><div class="column-quick-section"><small>Column types</small><div class="column-quick-grid">${Object.entries(COLUMN_TYPES).map(([type, meta]) => `<button type="button" data-column-type="${type}" data-search="${esc(`${meta.label} ${meta.hint}`.toLowerCase())}"><span class="column-type-icon">${esc(meta.icon)}</span><span>${esc(meta.label)}</span></button>`).join('')}</div></div><footer><button type="button" data-open-full-column-picker>Open advanced setup</button></footer>`;
      document.body.appendChild(pop);
      const rect = anchor.getBoundingClientRect();
      const place = (): void => {
        const box = pop.getBoundingClientRect();
        const pad = 10;
        const gap = 6;
        let left = Math.min(rect.left, innerWidth - box.width - pad);
        left = Math.max(pad, left);
        let top = rect.bottom + gap;
        if (top + box.height > innerHeight - pad && rect.top - box.height - gap > pad) top = rect.top - box.height - gap;
        pop.style.left = `${Math.round(left)}px`;
        pop.style.top = `${Math.round(Math.max(pad, top))}px`;
      };
      place();
      requestAnimationFrame(() => pop.querySelector<HTMLInputElement>('[data-column-type-search]')?.focus());
      let outside: ((event: PointerEvent) => void) | null = null;
      const close = (restore = true, fromCoordinator = false): void => {
        if (outside) document.removeEventListener('pointerdown', outside, true);
        outside = null;
        pop.remove();
        if (!fromCoordinator) overlayCoordinator?.release('column-picker');
        if (restore && previous instanceof HTMLElement && previous.isConnected) previous.focus();
      };
      overlayCoordinator?.open({ id: 'column-picker', element: pop, trigger: anchor, close: ({ restoreFocus = false, fromCoordinator = false } = {}) => close(restoreFocus, fromCoordinator) });
      pop.addEventListener('input', (event: Event) => {
        const target = elementTarget(event);
        const input = target?.closest<HTMLInputElement>('[data-column-type-search]') ?? null;
        if (!input) return;
        const query = input.value.trim().toLowerCase();
        pop.querySelectorAll<HTMLElement>('[data-column-type]').forEach((button) => {
          button.hidden = Boolean(query) && !String(button.dataset.search || '').includes(query);
        });
      });
      pop.addEventListener('click', (event: MouseEvent) => {
        void (async () => {
          const target = elementTarget(event);
          const more = target?.closest<HTMLElement>('[data-open-full-column-picker]') ?? null;
          if (more) { close(false); openPicker({ mode, position, column }); return; }
          const button = target?.closest<HTMLButtonElement>('[data-column-type]') ?? null;
          if (!button || !isColumnType(button.dataset.columnType)) return;
          const type = button.dataset.columnType;
          const name = defaultColumnName(type, allColumns().map((entry) => entry.name));
          button.disabled = true;
          try {
            await commands.createColumn({ boardId: activeBoardId, name, dataType: type, config: {}, position });
            toast(`Column “${name}” added.`);
            close(false);
            await loadBoard(activeBoardId, { quiet: true });
          } catch (error) {
            button.disabled = false;
            toast(errorMessage(error), 'warning');
          }
        })();
      });
      if (!overlayCoordinator) {
        outside = (event: PointerEvent): void => {
          const target = event.target instanceof Node ? event.target : null;
          if (target && !pop.contains(target) && !anchor.contains(target)) close(false);
        };
        document.addEventListener('pointerdown', outside, true);
      }
      pop.addEventListener('keydown', (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); close(); } });
      return;
    }

    overlayCoordinator?.closeAll({ restoreFocus: false });
    const overlay = document.querySelector<HTMLElement>('#overlayRoot') || document.body;
    const previous = document.activeElement;
    const wrap = document.createElement('div');
    wrap.className = 'column-picker-backdrop';
    wrap.innerHTML = `<section class="column-picker" role="dialog" aria-modal="true" aria-labelledby="columnPickerTitle"><header><div><span class="top-eyebrow">BOARD COLUMNS</span><h2 id="columnPickerTitle">${mode === 'change' ? 'Change column type' : 'Add a column'}</h2></div><button type="button" data-close-column-picker aria-label="Close">×</button></header><label class="column-type-search">${icons.search}<input type="search" placeholder="Search column types" aria-label="Search column types" data-column-type-search></label><div class="column-type-grid" role="list">${Object.entries(COLUMN_TYPES).map(([type, meta]) => `<button type="button" role="listitem" data-column-type="${type}"><span class="column-type-icon">${esc(meta.icon)}</span><span><strong>${esc(meta.label)}</strong><small>${esc(meta.hint)}</small></span></button>`).join('')}</div><footer>Choose the type that best matches the information you want to track.</footer></section>`;
    overlay.appendChild(wrap);
    const input = wrap.querySelector<HTMLInputElement>('[data-column-type-search]');
    requestAnimationFrame(() => input?.focus());
    const close = (restore = true, fromCoordinator = false): void => {
      wrap.remove();
      if (!fromCoordinator) overlayCoordinator?.release('column-picker');
      if (restore && previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
    overlayCoordinator?.open({ id: 'column-picker', element: wrap, trigger: previous instanceof HTMLElement ? previous : null, close: ({ restoreFocus = false, fromCoordinator = false } = {}) => close(restoreFocus, fromCoordinator) });
    wrap.addEventListener('click', (event: MouseEvent) => {
      const target = elementTarget(event);
      if (event.target === wrap || target?.closest('[data-close-column-picker]')) { close(); return; }
      const button = target?.closest<HTMLElement>('[data-column-type]') ?? null;
      if (!button || !isColumnType(button.dataset.columnType)) return;
      const type = button.dataset.columnType;
      const context = pickerContext;
      pickerContext = null;
      close();
      if (context?.mode === 'change' && context.column) openChangeType(context.column, type);
      else openEditor(null, type, context?.position ?? null);
    });
    input?.addEventListener('input', () => {
      const query = input.value.trim().toLowerCase();
      wrap.querySelectorAll<HTMLElement>('[data-column-type]').forEach((button) => {
        if (!isColumnType(button.dataset.columnType)) { button.hidden = true; return; }
        const meta = metaFor(button.dataset.columnType);
        button.hidden = Boolean(query) && !`${meta.label} ${meta.hint}`.toLowerCase().includes(query);
      });
    });
    wrap.addEventListener('keydown', (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); pickerContext = null; close(); } });
  }

  function openEditor(column: BoardColumn | null = null, type: BoardColumnType | null = null, position: number | null = null): void {
    const activeBoardId = boardId();
    if (!canEdit() || !activeBoardId) return;
    const dataType = column?.data_type || type;
    if (!dataType || !isColumnType(dataType)) { toast('This column type is not available.', 'warning'); return; }
    const meta = metaFor(dataType);
    const system = Boolean(column?.system_key);
    const existingNames = new Set(allColumns().filter((entry) => entry.id !== column?.id).map((entry) => entry.name.trim().toLowerCase()));
    const body = `<label class="field-label">Column name<input name="name" required maxlength="80" value="${esc(column?.name || defaultColumnName(dataType, allColumns().map((entry) => entry.name)))}" autocomplete="off"></label><div class="column-type-summary"><span class="column-type-icon">${esc(meta.icon)}</span><div><strong>${esc(meta.label)}</strong><small>${esc(meta.hint)}</small></div>${system ? '<span class="owner-badge">Built-in field</span>' : ''}</div>${typeOptionsConfig(dataType, column?.config || {})}<label class="check-field"><input type="checkbox" name="visible" ${column?.visible === false ? '' : 'checked'}><span>Show this column in Table view</span></label>${column?.system_key === 'title' ? '<p class="field-help">Removing this column does not remove the item name shown by the board.</p>' : ''}`;
    dialog({
      title: column ? 'Edit column' : 'Add a column',
      body,
      submitLabel: column ? 'Save changes' : 'Add column',
      onSubmit: async (formData) => {
        const name = String(formData.get('name') || '').trim();
        if (existingNames.has(name.toLowerCase())) throw new Error(`A column named “${name}” already exists.`);
        const options = dataType === 'dropdown' ? String(formData.get('options') || '').split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean) : [];
        const config: Readonly<Record<string, unknown>> = dataType === 'status' ? { ...(column?.config || {}) } : options.length ? { options } : {};
        const visible = formData.get('visible') === 'on';
        if (column) {
          await commands.updateColumn({ columnId: column.id, name, config, visible });
          toast(`Column “${name}” updated.`);
        } else {
          await commands.createColumn({ boardId: activeBoardId, name, dataType, config, position });
          toast(position == null ? `Column “${name}” added.` : `Column “${name}” added to the right.`);
        }
        await loadBoard(activeBoardId, { quiet: true });
      },
    });
  }

  function openChangeType(column: BoardColumn | null | undefined, newType: BoardColumnType | string): void {
    const activeBoardId = boardId();
    if (!column || column.system_key || !isColumnType(newType) || !activeBoardId) return;
    if (newType === column.data_type) { toast('This column already uses the selected type.', 'warning'); return; }
    const hasValues = Boolean(state.board?.values.some((value) => value.column_id === column.id && value.value != null));
    const needsClear = hasValues && !((column.data_type === 'text' || column.data_type === 'long_text') && (newType === 'text' || newType === 'long_text'));
    const meta = metaFor(newType);
    dialog({
      title: `Change ${column.name} type`,
      body: `<div class="column-type-summary"><span class="column-type-icon">${esc(meta.icon)}</span><div><strong>${esc(meta.label)}</strong><small>${esc(meta.hint)}</small></div></div>${typeOptionsConfig(newType, {})}${needsClear ? '<div class="warning-panel"><strong>Current values can’t be kept.</strong><p>Changing to this type requires permanently clearing the values already stored in this column.</p></div><label class="check-field"><input type="checkbox" name="clear" required><span>Clear the current values and change the column type</span></label>' : '<p class="field-help">Compatible values will be kept.</p>'}`,
      submitLabel: 'Change type',
      onSubmit: async (formData) => {
        const options = newType === 'dropdown' ? String(formData.get('options') || '').split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean) : [];
        await commands.changeColumnType({ columnId: column.id, dataType: newType, config: options.length ? { options } : {}, clearValues: needsClear && formData.get('clear') === 'on' });
        toast(`“${column.name}” changed to ${meta.label}.`);
        await loadBoard(activeBoardId, { quiet: true });
      },
    });
  }

  function openManager(): void {
    const activeBoardId = boardId();
    if (!canEdit() || !activeBoardId) return;
    const columns = allColumns();
    const modal = dialog({
      title: 'Manage columns',
      body: `<p class="column-manager-intro">Customize the information this board tracks. Reorder, configure, hide, duplicate, or delete columns as your workflow changes.</p><div class="column-manager-list">${columns.length ? columns.map((column, index) => `<article class="column-manager-row" data-manage-column="${column.id}"><span class="column-type-icon">${esc(metaFor(column.data_type).icon || '•')}</span><div><strong>${esc(column.name)}</strong><small>${esc(columnTypeLabel(column.data_type))}${column.system_key ? ' · Built-in' : ''}${column.visible === false ? ' · Hidden' : ''}</small></div><div class="column-manager-actions"><button type="button" data-column-up="${column.id}" ${index === 0 ? 'disabled' : ''} aria-label="Move ${esc(column.name)} one position left">←</button><button type="button" data-column-down="${column.id}" ${index === columns.length - 1 ? 'disabled' : ''} aria-label="Move ${esc(column.name)} one position right">→</button><button type="button" data-column-configure="${column.id}">Configure</button><button type="button" class="danger-text" data-column-remove="${column.id}" aria-label="Delete ${esc(column.name)} column permanently">Delete column</button></div></article>`).join('') : '<div class="column-manager-empty"><strong>No custom columns yet</strong><small>Add a column when you’re ready to track more information.</small></div>'}</div><button type="button" class="secondary-btn full-width" data-column-manager-add>+ Add column</button>`,
      submitLabel: 'Done',
      onSubmit: () => undefined,
    });
    const submit = modal.wrap.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (submit) {
      submit.type = 'button';
      submit.textContent = 'Done';
      submit.addEventListener('click', modal.close);
    }
    modal.wrap.addEventListener('click', (event: MouseEvent) => {
      void (async () => {
        const target = elementTarget(event);
        const edit = target?.closest<HTMLElement>('[data-column-configure]') ?? null;
        if (edit) {
          const selected = allColumns().find((entry) => entry.id === edit.dataset.columnConfigure);
          modal.close();
          openEditor(selected || null);
          return;
        }
        if (target?.closest('[data-column-manager-add]')) { modal.close(); openPicker(); return; }
        const up = target?.closest<HTMLElement>('[data-column-up]') ?? null;
        const down = target?.closest<HTMLElement>('[data-column-down]') ?? null;
        if (up || down) {
          const id = up?.dataset.columnUp || down?.dataset.columnDown;
          const selected = allColumns().find((entry) => entry.id === id);
          if (!selected) return;
          const targetPosition = selected.position + (up ? -1 : 1);
          try {
            await commands.moveColumn({ columnId: selected.id, position: targetPosition });
            modal.close();
            await loadBoard(activeBoardId, { quiet: true });
            openManager();
          } catch (error) { toast(errorMessage(error), 'warning'); }
          return;
        }
        const remove = target?.closest<HTMLElement>('[data-column-remove]') ?? null;
        if (remove) {
          const selected = allColumns().find((entry) => entry.id === remove.dataset.columnRemove);
          if (!selected) return;
          modal.close();
          openDelete(selected, { returnToManager: true });
        }
      })();
    });
  }

  function openDelete(column: BoardColumn | null | undefined, { returnToManager = false }: DeleteOptions = {}): void {
    const activeBoardId = boardId();
    if (!canEdit() || !column || !activeBoardId) return;
    const populated = populatedColumnValueCount(column);
    const impact = populated
      ? `<div class="warning-panel"><strong>${populated} item value${populated === 1 ? '' : 's'} will be permanently removed.</strong><p>This permanently removes the column and every value stored in it. Items and other columns are not affected.</p></div><label class="check-field"><input type="checkbox" name="confirm_delete" required><span>I understand these values will be permanently deleted.</span></label>`
      : '<div class="warning-panel"><strong>This column has no saved values.</strong><p>The column will be permanently removed. Items and other columns are not affected.</p></div>';
    dialog({
      title: `Delete ${column.name}?`,
      body: `<div class="column-delete-summary"><span class="column-type-icon">${esc(metaFor(column.data_type).icon || '•')}</span><div><strong>${esc(column.name)}</strong><small>${esc(columnTypeLabel(column.data_type))}${column.system_key ? ' · Built-in field' : ' · Custom column'}</small></div></div>${impact}<p class="field-help">Any saved filters, sorting, wrapping, or width settings for this column will be removed automatically.</p>`,
      submitLabel: 'Delete column',
      danger: true,
      onSubmit: async () => {
        await commands.deleteColumn(column.id);
        await removeColumnPreferenceReferences(column.id);
        toast(`Column “${column.name}” deleted permanently.`);
        await loadBoard(activeBoardId, { quiet: true });
        if (returnToManager) requestAnimationFrame(openManager);
      },
    });
  }

  function cellInput(column: BoardColumn, value: BoardCellValue): string {
    const textValue = value == null ? '' : String(value);
    switch (column.data_type) {
      case 'people':
        return `<label class="field-label">${esc(column.name)}<select name="value"><option value="">Unassigned</option>${(state.board?.members || []).map((member) => `<option value="${member.user_id}" ${String(value || '') === member.user_id ? 'selected' : ''}>${esc(member.display_name || '')} · ${esc(member.email || '')}</option>`).join('')}</select></label>`;
      case 'status': {
        const options = normalizeStatusLabels(column).filter((label) => label.active !== false || String(value || '') === String(label.id));
        return `<label class="field-label">${esc(column.name)}<select name="value"><option value="">No value</option>${options.map((label) => `<option value="${esc(label.id)}" ${String(value || '') === String(label.id) ? 'selected' : ''}>${esc(label.name)}${label.active === false ? ' (inactive)' : ''}</option>`).join('')}</select></label>`;
      }
      case 'dropdown':
        return `<label class="field-label">${esc(column.name)}<select name="value"><option value="">No value</option>${optionList(column).map((entry) => `<option value="${esc(entry)}" ${String(value || '') === entry ? 'selected' : ''}>${esc(entry)}</option>`).join('')}</select></label>`;
      case 'checkbox':
        return `<label class="check-field large"><input type="checkbox" name="value" ${value === true ? 'checked' : ''}><span>${esc(column.name)}</span></label>`;
      case 'timeline': {
        const timeline = value && typeof value === 'object' && !Array.isArray(value) ? value as TimelineValue : null;
        return `<div class="form-grid"><label class="field-label">Start date<input type="date" name="start" value="${esc(timeline?.start || '')}"></label><label class="field-label">End date<input type="date" name="end" value="${esc(timeline?.end || '')}"></label></div>`;
      }
      case 'long_text':
        return `<label class="field-label">${esc(column.name)}<textarea name="value" rows="7" maxlength="5000">${esc(textValue)}</textarea></label>`;
      case 'number':
        return `<label class="field-label">${esc(column.name)}<input type="number" name="value" value="${esc(textValue)}" step="any"></label>`;
      case 'date':
        return `<label class="field-label">${esc(column.name)}<input type="date" name="value" value="${esc(textValue)}"></label>`;
      case 'email':
        return `<label class="field-label">${esc(column.name)}<input type="email" name="value" value="${esc(textValue)}" maxlength="320"></label>`;
      case 'url':
        return `<label class="field-label">${esc(column.name)}<input type="url" name="value" value="${esc(textValue)}" maxlength="2000"></label>`;
      case 'text':
        return `<label class="field-label">${esc(column.name)}<input type="text" name="value" value="${esc(textValue)}" maxlength="1000"></label>`;
      default:
        return assertNever(column);
    }
  }

  function normalizeCellForm(column: BoardColumn, formData: FormData): BoardCellValue {
    switch (column.data_type) {
      case 'checkbox':
        return normalizeBoardCellValue('checkbox', formData.get('value') === 'on');
      case 'timeline': {
        const start = String(formData.get('start') || '');
        const end = String(formData.get('end') || '');
        return normalizeBoardCellValue('timeline', !start && !end ? null : { start, end });
      }
      case 'number':
      case 'date':
      case 'email':
      case 'url':
      case 'text':
      case 'long_text':
      case 'people':
      case 'status':
      case 'dropdown':
        return normalizeBoardCellValue(column.data_type, String(formData.get('value') || '').trim());
      default:
        return assertNever(column);
    }
  }

  function openCell(item: BoardItem, column: BoardColumn): void {
    const activeBoardId = boardId();
    if (!activeBoardId) return;
    const value = getCellValue(item, column);
    dialog({
      title: `Edit ${column.name}`,
      body: `<div class="cell-editor-context"><strong>${esc(item.title)}</strong><small>${esc(columnTypeLabel(column.data_type))}</small></div>${cellInput(column, value)}`,
      submitLabel: 'Save field value',
      onSubmit: async (formData) => {
        const next = normalizeCellForm(column, formData);
        await commands.setCell({ itemId: item.id, columnId: column.id, value: next });
        toast(`“${column.name}” updated for this item.`);
        await loadBoard(activeBoardId, { quiet: true });
      },
    });
  }

  function reset(): void { pickerContext = null; }

  return Object.freeze({ openFilter, openDuplicate, openPicker, openEditor, openChangeType, openManager, openDelete, openCell, reset });
}
