import type { BoardMember } from '../../../../../src/features/boards/contracts/domain.ts';
import type { BoardWorkflowBaseDependencies } from '../../../../../src/features/boards/contracts/presentation.ts';
import { BOARD_ROLE_LABELS } from '../board-schema.ts';

const errorMessage = (error: unknown, fallback: string): string => error instanceof Error ? error.message : fallback;

/** Board membership management boundary. */
export function createMemberWorkflows({ commands, state, dialog, toast, escapeHtml, reloadBoard, confirmAction = (message) => globalThis.confirm(message) }: BoardWorkflowBaseDependencies) {
  const esc = escapeHtml;
  let generation = 0;

  function open() {
    const board = state.board;
    if (!board) return null;
    const boardRecord = board.board;
    if (!boardRecord?.id) return null;
    const ticket = ++generation;
    const members: readonly BoardMember[] = board.members;
    const modal = dialog({
      title: 'Manage board access',
      body: `<p class="field-help">Choose who can access this board and what they can change.</p><div class="member-list">${members.map((member) => `<div class="member-row"><div><strong>${esc(member.display_name)}</strong><small>${esc(member.email)} · ${esc(BOARD_ROLE_LABELS[member.role] ?? member.role)}</small></div>${member.role !== 'owner' ? `<button type="button" data-remove-member="${member.user_id}" aria-label="Remove ${esc(member.display_name)} from this board">Remove access</button>` : '<span class="owner-badge">Owner</span>'}</div>`).join('')}</div><hr>
        <label class="field-label">Account email<input name="email" type="email" placeholder="name@company.com" autocomplete="email"></label>
        <label class="field-label">Board access<select name="role"><option value="editor">Editor</option><option value="viewer">Viewer</option></select></label>`,
      submitLabel: 'Add member',
      onSubmit: async (fd) => {
        const email = String(fd.get('email') || '').trim();
        const role = fd.get('role') === 'viewer' ? 'viewer' : 'editor';
        if (!email) throw new Error('Enter the email address of the account you want to add.');
        await commands.addMember({ boardId: boardRecord.id, email, role });
        toast(`${email} now has access to this board.`);
        await reloadBoard();
      },
    });
    modal.wrap.addEventListener('click', async (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const button = target?.closest<HTMLButtonElement>('[data-remove-member]') ?? null;
      if (!button || ticket !== generation) return;
      event.preventDefault();
      if (!confirmAction('Remove this member’s board access? They will no longer be able to open or edit this board.')) return;
      const member = members.find((entry) => String(entry.user_id) === String(button.dataset.removeMember));
      if (!member) return;
      button.disabled = true;
      try {
        await commands.removeMember({ boardId: boardRecord.id, userId: member.user_id });
        toast('Board access removed for this member.');
        modal.close();
        await reloadBoard();
        if (ticket === generation) open();
      } catch (error) {
        toast(errorMessage(error, 'Board access could not be removed.'), 'warning');
        button.disabled = false;
      }
    });
    return modal;
  }

  function reset(): void { generation += 1; }
  return Object.freeze({ open, reset });
}
