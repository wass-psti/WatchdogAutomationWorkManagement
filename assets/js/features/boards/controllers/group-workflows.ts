import type { BoardGroup } from '../../../../../src/features/boards/contracts/domain.ts';
import type { BoardWorkflowBaseDependencies } from '../../../../../src/features/boards/contracts/presentation.ts';
import type { BoardGroupId } from '../../../../../src/types/identifiers.ts';

const errorMessage = (error: unknown, fallback: string): string => error instanceof Error ? error.message : fallback;
const GROUP_ACCENT_PALETTE = Object.freeze([
  ['#5b7cfa', 'Blue'], ['#7c5ce7', 'Violet'], ['#e06083', 'Rose'], ['#dc7a34', 'Amber'],
  ['#2f9e73', 'Emerald'], ['#2186a8', 'Teal'], ['#8b6b45', 'Sand'], ['#65758b', 'Slate'],
] as const);

/** Group create/rename/delete workflow boundary for Work Boards. */
export function createGroupWorkflows({ commands, state, dialog, toast, escapeHtml, reloadBoard, confirmAction = (message) => globalThis.confirm(message) }: BoardWorkflowBaseDependencies) {
  const esc = escapeHtml;

  function open(group: BoardGroup | null = null) {
    const boardId = state.board?.board?.id;
    if (!boardId) return null;
    return dialog({
      title: group ? 'Rename group' : 'Add a group',
      body: `<label class="field-label">Group name<input name="title" required maxlength="120" value="${esc(group?.title || '')}"></label>`,
      submitLabel: group ? 'Save name' : 'Add group',
      onSubmit: async (fd) => {
        const title = String(fd.get('title') || '');
        if (group) await commands.renameGroup({ groupId: group.id, title });
        else await commands.createGroup({ boardId, title });
        toast(group ? 'Group name updated.' : 'Group added.');
        await reloadBoard();
      },
    });
  }

  function openAccent(group: BoardGroup | null | undefined) {
    if (!group) return null;
    const current = /^#[0-9a-f]{6}$/i.test(String(group.accent_color || '')) ? String(group.accent_color).toLowerCase() : '#5b7cfa';
    return dialog({
      title: `Group color — ${group.title}`,
      body: `<fieldset class="group-accent-picker"><legend>Accent color</legend>${GROUP_ACCENT_PALETTE.map(([color, label]) => `<label class="group-accent-choice" style="--choice-color:${color}"><input type="radio" name="accent_color" value="${color}" ${current === color ? 'checked' : ''}><span aria-hidden="true"></span><strong>${label}</strong></label>`).join('')}</fieldset><p class="field-help">The accent identifies this group across its header and table boundary without changing item data.</p>`,
      submitLabel: 'Save group color',
      onSubmit: async (fd) => {
        const color = String(fd.get('accent_color') || '').toLowerCase();
        if (!/^#[0-9a-f]{6}$/.test(color)) throw new Error('Choose a valid group color.');
        await commands.setGroupAccent({ groupId: group.id, accentColor: color });
        toast(`Group color updated for “${group.title}”.`);
        await reloadBoard();
      },
    });
  }

  async function remove(groupId: BoardGroupId | string): Promise<boolean> {
    const group = state.board?.groups.find((entry) => String(entry.id) === String(groupId));
    if (!group) return false;
    const groupName = group.title || 'this group';
    if (!confirmAction(`Delete “${groupName}” permanently? Every item in this group will also be deleted. This cannot be undone.`)) return false;
    try {
      await commands.deleteGroup(group.id);
      toast(`“${groupName}” and its items were deleted permanently.`);
      await reloadBoard();
      return true;
    } catch (error) {
      toast(errorMessage(error, 'The group could not be deleted.'), 'warning');
      return false;
    }
  }

  return Object.freeze({ open, openAccent, remove, reset() {} });
}
