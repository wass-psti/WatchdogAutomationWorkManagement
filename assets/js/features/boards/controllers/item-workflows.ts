import type { BoardGroup, BoardItem, BoardMember, StatusLabel } from '../../../../../src/features/boards/contracts/domain.ts';
import type { BoardWorkflowBaseDependencies } from '../../../../../src/features/boards/contracts/presentation.ts';
import type { BoardGroupId, BoardItemId, ISODate, StatusLabelId, UserId } from '../../../../../src/types/identifiers.ts';

interface ItemWorkflowDefaults {
  readonly status?: StatusLabelId | string | null;
  readonly assignee_id?: UserId | string | null;
  readonly due_date?: ISODate | string | null;
  readonly notes?: string | null;
  readonly group_id?: BoardGroupId | string | null;
}

export interface ItemWorkflowDependencies extends BoardWorkflowBaseDependencies {
  readonly getStatusLabels?: () => readonly StatusLabel[];
  readonly getDefaultStatus?: () => StatusLabelId | string | null;
}

const errorMessage = (error: unknown, fallback: string): string => error instanceof Error ? error.message : fallback;
const asIsoDate = (value: FormDataEntryValue | null): ISODate | null => {
  const text = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text as ISODate : null;
};

/** Base item create/edit/archive workflows. Custom typed cells remain table-owned. */
export function createItemWorkflows({
  commands,
  state,
  dialog,
  toast,
  escapeHtml,
  reloadBoard,
  getStatusLabels = () => [],
  getDefaultStatus = () => 'not_started',
  confirmAction = (message) => globalThis.confirm(message),
}: ItemWorkflowDependencies) {
  const esc = escapeHtml;

  function open(item: BoardItem | null = null, groupId: BoardGroupId | string | null = null, defaults: ItemWorkflowDefaults = {}) {
    const board = state.board;
    if (!board) return null;
    const boardRecord = board.board;
    if (!boardRecord?.id) return null;
    const members: readonly BoardMember[] = board.members;
    const groups: readonly BoardGroup[] = board.groups;
    const labels = getStatusLabels();
    const hasStatusDefault = Object.prototype.hasOwnProperty.call(defaults, 'status');
    const initialStatus = hasStatusDefault ? defaults.status : (getDefaultStatus() || 'not_started');
    const value = item || {
      title: '',
      status: initialStatus,
      assignee_id: defaults.assignee_id || '',
      due_date: defaults.due_date || '',
      notes: defaults.notes || '',
      group_id: groupId || defaults.group_id || groups[0]?.id || '',
    };
    return dialog({
      title: item ? `Edit “${item.title}”` : 'Add an item',
      body: `<label class="field-label">Item name<input name="title" required maxlength="240" value="${esc(value.title)}"></label>
        <div class="form-grid"><label class="field-label">Group<select name="group">${groups.map((group) => `<option value="${group.id}" ${String(value.group_id) === String(group.id) ? 'selected' : ''}>${esc(group.title)}</option>`).join('')}</select></label>
        <label class="field-label">Status<select name="status"><option value="">No status</option>${labels.filter((label) => label.active || String(label.id) === String(value.status)).map((label) => `<option value="${esc(label.id)}" ${String(value.status) === String(label.id) ? 'selected' : ''}>${esc(label.name)}${label.active ? '' : ' (inactive)'}</option>`).join('')}</select></label></div>
        <label class="field-label">Assignee<select name="assignee"><option value="">Unassigned</option>${members.map((member) => `<option value="${member.user_id}" ${String(value.assignee_id) === String(member.user_id) ? 'selected' : ''}>${esc(member.display_name)} · ${esc(member.email)}</option>`).join('')}</select></label>
        <label class="field-label">Due date<input type="date" name="due" value="${esc(value.due_date || '')}"></label>
        <label class="field-label">Notes<textarea name="notes" rows="5" maxlength="5000" placeholder="Add context, instructions, or other details">${esc(value.notes || '')}</textarea></label>
        <p class="field-help">You can edit custom column values directly from the board after you create the item.</p>`,
      submitLabel: item ? 'Save changes' : 'Add item',
      onSubmit: async (fd) => {
        const title = String(fd.get('title') || '');
        const selectedGroupRaw = String(fd.get('group') || groupId || groups[0]?.id || '');
        const selectedGroup = groups.find((group) => String(group.id) === selectedGroupRaw)?.id;
        if (!selectedGroup) throw new Error('Choose a valid board group.');
        const selectedStatusRaw = String(fd.get('status') || '');
        const selectedStatus = selectedStatusRaw ? labels.find((label) => String(label.id) === selectedStatusRaw)?.id ?? null : null;
        if (selectedStatusRaw && !selectedStatus) throw new Error('Choose a valid Status label.');
        const assigneeRaw = String(fd.get('assignee') || '');
        const assigneeId = assigneeRaw ? members.find((member) => String(member.user_id) === assigneeRaw)?.user_id ?? null : null;
        if (assigneeRaw && !assigneeId) throw new Error('Choose a valid board member.');
        const dueDate = asIsoDate(fd.get('due'));
        const notes = String(fd.get('notes') || '');
        if (item) {
          await commands.updateItem({ itemId: item.id, title, status: selectedStatus, assigneeId, dueDate, notes });
          if (selectedGroup !== item.group_id) await commands.moveItem({ itemId: item.id, groupId: selectedGroup, position: 9999, status: selectedStatus });
          toast(`“${title}” updated.`);
        } else {
          await commands.createItem({ boardId: boardRecord.id, groupId: selectedGroup, title, status: selectedStatus, assigneeId, dueDate, notes });
          toast(`“${title}” added to the board.`);
        }
        await reloadBoard();
      },
    });
  }

  async function archive(itemId: BoardItemId | string, archiveItem = true): Promise<boolean> {
    if (!itemId) return false;
    const item = state.board?.items.find((entry) => String(entry.id) === String(itemId));
    if (!item) return false;
    if (archiveItem && !confirmAction('Archive this item? It will be hidden from the active board until you show archived items or restore it.')) return false;
    try {
      await commands.archiveItem(item.id, archiveItem);
      toast(archiveItem ? 'Item archived and hidden from the active board.' : 'Item restored to the active board.');
      await reloadBoard();
      return true;
    } catch (error) {
      toast(errorMessage(error, 'The item could not be updated.'), 'warning');
      return false;
    }
  }

  return Object.freeze({ open, archive, reset() {} });
}
