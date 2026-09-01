import type { BoardEvent } from '../../../../../src/features/boards/contracts/domain.ts';
import type { BoardActivityWorkflowDependencies } from '../../../../../src/features/boards/contracts/presentation.ts';
import { createBoardActivityRuntime } from '../services/board-activity-runtime.ts';

const errorMessage = (error: unknown, fallback: string): string => error instanceof Error ? error.message : fallback;

/** Presentation adapter around the typed Board activity query runtime. */
export function createActivityWorkflows({ api, state, dialog, toast, escapeHtml, formatDate }: BoardActivityWorkflowDependencies) {
  const esc = escapeHtml;
  const activity = createBoardActivityRuntime({ state, service: api });

  function activityMarkup(rows: readonly BoardEvent[]): string {
    return `<div class="board-event-list">${rows.length ? rows.map((event) => `<article><span class="event-dot"></span><div><strong>${esc(event.message)}</strong><p>${esc(event.actor_name)} · ${esc(formatDate(event.created_at))}</p>${event.entity_type ? `<small>${esc(event.entity_type === 'board_item' ? 'Item' : event.entity_type === 'board_group' ? 'Group' : event.entity_type === 'board_column' ? 'Column' : event.entity_type === 'board' ? 'Board' : 'Board activity')}</small>` : ''}</div></article>`).join('') : '<div class="boards-state compact"><h3>No board activity yet</h3><p>Board, group, column, and item changes will appear here as they happen.</p></div>'}</div>`;
  }

  async function open() {
    if (!state.board?.board?.id) return null;
    const modal = dialog({
      title: 'Board activity',
      body: '<div class="boards-state compact" data-board-activity-loading><span class="spinner"></span><h3>Loading board activity…</h3><p>Fetching recent changes to this board.</p></div>',
      submitLabel: 'Close',
      onSubmit: async () => {},
    });
    const submit = modal.wrap.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (submit) {
      submit.type = 'button';
      submit.textContent = 'Close';
      submit.addEventListener('click', modal.close);
    }
    const cancel = modal.wrap.querySelector<HTMLElement>('.wm-modal-cancel');
    if (cancel) cancel.hidden = true;
    try {
      const result = await activity.loadRecent(100);
      if (result.status === 'stale' || !modal.wrap.isConnected) return modal;
      const body = modal.wrap.querySelector<HTMLElement>('.wm-modal-body');
      if (body) body.innerHTML = `${activityMarkup(result.events)}<div class="wm-modal-error" data-modal-error role="alert" hidden></div>`;
    } catch (error) {
      if (!modal.wrap.isConnected) return modal;
      const message = errorMessage(error, 'Recent board activity could not be retrieved. Try again.');
      const body = modal.wrap.querySelector<HTMLElement>('.wm-modal-body');
      if (body) body.innerHTML = `<div class="boards-state compact"><h3>Board activity couldn’t load</h3><p>${esc(message)}</p></div><div class="wm-modal-error" data-modal-error role="alert" hidden></div>`;
      toast(errorMessage(error, 'Recent board activity could not be loaded.'), 'warning');
    }
    return modal;
  }

  function reset(): void { activity.cancelPending(); }
  return Object.freeze({ open, reset });
}
