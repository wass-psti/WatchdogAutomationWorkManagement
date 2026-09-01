import type {
  BoardColumn,
  ItemActivityEvent,
  ItemWorkspaceEnvelope,
  ItemWorkspaceUpdate,
} from '../../../../../src/features/boards/contracts/domain.ts';
import type { MutableBoardViewState, ItemWorkspaceTab } from '../../../../../src/features/boards/contracts/view-state.ts';
import type { DateFormatter, EscapeHtml } from '../../../../../src/platform/contracts/ui.ts';
import { STATUS_LABELS } from '../board-schema.ts';
import { normalizeStatusLabels } from '../status-labels.ts';
import { buttonClass, fieldControlClass, iconButtonClass, tabClass } from '../../../platform/ui/primitives.ts';

interface ItemWorkspaceViewOptions {
  readonly state: MutableBoardViewState;
  readonly canEdit: () => boolean;
  readonly escapeHtml: EscapeHtml;
  readonly formatDate: DateFormatter;
  readonly formatDay: DateFormatter;
}

interface ActivityCluster {
  readonly event: ItemActivityEvent;
  readonly key: string | null;
  count: number;
  oldestTimestamp: number;
}

interface UpdateKind { readonly key: 'decision' | 'blocker' | 'handoff' | 'progress'; readonly label: string; readonly icon: string; }

type ActivityPayload = Readonly<Record<string, unknown>>;

function bytesLabel(value: number | null | undefined): string {
  const n = Number(value || 0);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function mentionMarkup(body: string, esc: EscapeHtml): string {
  return esc(body).replace(/(^|\s)(@[A-Za-z0-9._-]+)/g, '$1<span class="item-mention">$2</span>').replace(/\n/g, '<br>');
}

function payloadOf(event: ItemActivityEvent): ActivityPayload {
  return event.payload && typeof event.payload === 'object' ? event.payload : {};
}

function humanActivityLabel(event: ItemActivityEvent): string {
  const payload = payloadOf(event);
  if (event.event_type === 'item.cell_updated') return `${String(payload.column_name || 'Field')} updated`;
  const labels: Readonly<Record<string, string>> = {
    'item.updated': 'Item details updated',
    'item.moved': 'Item moved',
    'item.archived': 'Item archived',
    'item.restored': 'Item restored',
    'item.duplicated': 'Item duplicated',
    'item.update_added': 'Update posted',
    'item.update_deleted': 'Update deleted',
    'item.file_added': 'File attached',
    'item.file_deleted': 'File removed',
  };
  return labels[event.event_type || ''] || event.message || 'Item activity';
}

function compactItemActivity(events: readonly ItemActivityEvent[]): ActivityCluster[] {
  const output: ActivityCluster[] = [];
  for (const event of events) {
    const isCell = event.event_type === 'item.cell_updated';
    const payload = payloadOf(event);
    const key = isCell ? `${event.actor_id || event.actor_name || ''}:${String(payload.column_id || payload.column_name || '')}` : null;
    const timestamp = Number(new Date(event.created_at || 0));
    const previous = output.at(-1);
    if (isCell && previous?.key === key && Math.abs(previous.oldestTimestamp - timestamp) <= 90000) {
      previous.count += 1;
      previous.oldestTimestamp = timestamp;
      continue;
    }
    output.push({ event, key, count: 1, oldestTimestamp: timestamp });
  }
  return output;
}

function updateComposer(): string {
  return `<section class="item-update-compose-shell" aria-labelledby="item-update-compose-title">
    <div class="item-update-compose-head">
      <div class="item-update-compose-titleline"><span class="item-update-compose-kicker">UPDATE</span><h3 id="item-update-compose-title">Share an update</h3><p>Keep progress, decisions, blockers, and handoffs with this item.</p></div>
      <span class="item-update-visibility" title="Visible to everyone with board access"><span aria-hidden="true">●</span> Board members</span>
    </div>
    <div class="item-update-typebar" aria-label="Choose an update type"><span class="item-update-type-label">Type</span><div class="item-update-prompts" role="group" aria-label="Update type shortcuts">
      <button type="button" data-update-template="progress" aria-pressed="false"><span aria-hidden="true">↗</span>Progress</button>
      <button type="button" data-update-template="decision" aria-pressed="false"><span aria-hidden="true">◆</span>Decision</button>
      <button type="button" data-update-template="blocker" aria-pressed="false"><span aria-hidden="true">!</span>Blocker</button>
      <button type="button" data-update-template="handoff" aria-pressed="false"><span aria-hidden="true">↔</span>Handoff</button>
    </div></div>
    <form class="item-update-composer" data-item-update-form><div class="item-update-editor-wrap"><textarea class="${fieldControlClass({ kind: 'textarea' })}" name="body" maxlength="5000" rows="4" placeholder="Share an update. Mention a teammate with @name." aria-label="Write an update for this item" data-item-update-input></textarea></div>
      <div class="item-update-compose-footer"><div class="item-update-compose-meta"><span class="item-update-shortcut"><kbd>⌘</kbd><span>/</span><kbd>Ctrl</kbd><span>+</span><kbd>Enter</kbd><span>to post</span></span><span class="item-update-count" data-item-update-count>0 / 5000</span></div><div class="item-update-compose-actions"><button type="button" class="item-update-clear" data-clear-update-draft hidden>Clear draft</button><button type="submit" class="${buttonClass({ tone: 'primary' }, 'primary-btn item-update-submit')}" disabled data-item-update-submit><span>Post update</span><span aria-hidden="true">↗</span></button></div></div>
    </form>
  </section>`;
}

function updateType(body = ''): UpdateKind | null {
  const value = String(body).trimStart().toLowerCase();
  if (value.startsWith('decision:')) return { key: 'decision', label: 'Decision', icon: '◆' };
  if (value.startsWith('blocker:')) return { key: 'blocker', label: 'Blocker', icon: '!' };
  if (value.startsWith('handoff:')) return { key: 'handoff', label: 'Handoff', icon: '↔' };
  if (value.startsWith('progress update:') || value.startsWith('progress:')) return { key: 'progress', label: 'Progress', icon: '↗' };
  return null;
}

function updateStream(data: ItemWorkspaceEnvelope, esc: EscapeHtml, formatDate: DateFormatter): string {
  const updates: readonly ItemWorkspaceUpdate[] = data.updates;
  const cards = updates.length ? updates.map((update) => {
    const type = updateType(update.body);
    const author = String(update.author_name || 'Unknown');
    return `<article class="item-update${type ? ` is-${type.key}` : ''}"><header>
      <span class="item-avatar" aria-hidden="true">${esc((author || '?').trim().slice(0, 1).toUpperCase())}</span>
      <div class="item-update-author"><strong>${esc(author)}</strong><small>${esc(formatDate(update.created_at))}</small></div>
      ${type ? `<span class="item-update-kind"><i aria-hidden="true">${type.icon}</i>${type.label}</span>` : ''}
      ${update.can_delete ? `<button type="button" class="wm-icon-button wm-icon-button--ghost wm-control--sm item-update-delete" data-delete-item-update="${update.id}" aria-label="Delete this update permanently" title="Delete update permanently">×</button>` : ''}
      </header><div class="item-update-copy">${mentionMarkup(update.body, esc)}</div></article>`;
  }).join('') : `<div class="item-panel-empty item-update-empty"><span class="item-empty-icon" aria-hidden="true">↗</span><div><strong>No updates yet</strong><p>Share the first update to keep progress, decisions, blockers, and handoffs visible to everyone with board access.</p></div><button type="button" class="${buttonClass({ tone: 'secondary' }, 'secondary-btn')}" data-focus-update-composer>Write an update</button></div>`;
  return `<section class="item-update-stream" aria-label="Item updates"><div class="item-update-stream-head"><div><span class="item-update-stream-kicker">UPDATES</span><h3>Update history</h3></div><span class="item-update-stream-count">${updates.length ? `${updates.length} ${updates.length === 1 ? 'update' : 'updates'}` : 'No updates'}</span></div><div class="item-update-list">${cards}</div></section>`;
}

export function renderItemWorkspace({ state, canEdit, escapeHtml, formatDate, formatDay }: ItemWorkspaceViewOptions): string {
  const esc = escapeHtml;
  const board = state.board;
  if (!board) return '';
  const item = board.items.find((entry) => entry.id === state.itemPanel.itemId) || null;
  if (!item) return '';
  const data = state.itemPanel.data;
  const tab = state.itemPanel.tab;
  const group = board.groups.find((entry) => entry.id === item.group_id);
  let content = '';
  if (state.itemPanel.loading) content = '<div class="item-panel-state"><span class="button-spinner"></span><strong>Loading item details</strong><p>Fetching updates, files, and activity…</p></div>';
  else if (state.itemPanel.error) content = `<div class="item-panel-state error"><strong>Item details couldn’t load</strong><p>${esc(state.itemPanel.error)}</p><button class="${buttonClass({ tone: 'secondary' }, 'secondary-btn')}" data-item-panel-retry>Try again</button></div>`;
  else if (tab === 'updates') content = `<div class="item-updates">${updateComposer()}${updateStream(data, esc, formatDate)}</div>`;
  else if (tab === 'files') {
    const fileMarkup = data.files.length ? data.files.map((file) => {
      const fileName = String(file.file_name || 'Attachment');
      const extension = (fileName.split('.').pop() || 'FILE').slice(0, 5).toUpperCase();
      return `<article class="item-file"><span class="item-file-type">${esc(extension)}</span><button type="button" class="item-file-open" data-open-item-file="${file.id}"><strong>${esc(fileName)}</strong><small>${esc(bytesLabel(file.size_bytes))} · ${esc(file.author_name || 'Unknown')} · ${esc(formatDate(file.created_at))}</small></button>${file.can_delete ? `<button type="button" class="wm-icon-button wm-icon-button--ghost wm-control--sm item-file-delete" data-delete-item-file="${file.id}" aria-label="Remove attachment: ${esc(fileName)}">×</button>` : ''}</article>`;
    }).join('') : '<div class="item-panel-empty"><span class="item-empty-icon" aria-hidden="true">↥</span><strong>No attachments yet</strong><p>Add documents, images, or other reference files so they stay connected to this item.</p></div>';
    content = `<section class="item-files"><div class="item-panel-section-head"><div><span>FILES</span><h3>Attachments</h3><p>Keep documents and reference files with this item.</p></div></div><label class="item-file-drop ${state.itemPanel.uploading ? 'is-busy' : ''}"><input type="file" data-item-file-input multiple ${state.itemPanel.uploading ? 'disabled' : ''}><span class="item-file-icon">↥</span><strong>${state.itemPanel.uploading ? 'Uploading files…' : 'Attach files'}</strong><small>Select one or more files, up to 20 MB each.</small></label><div class="item-file-list">${fileMarkup}</div></section>`;
  } else {
    const activity = compactItemActivity(data.activity);
    const activityMarkup = activity.length ? activity.map(({ event, count }) => {
      const payload = payloadOf(event);
      const detail = event.event_type === 'item.cell_updated' ? (payload.column_name ? `Changed field: ${String(payload.column_name)}` : 'Field value changed') : '';
      return `<article><span class="event-dot"></span><div class="activity-copy"><strong>${esc(humanActivityLabel(event))}</strong><p>${esc(event.actor_name || 'Unknown')} · ${esc(formatDate(event.created_at))}</p>${detail ? `<small>${esc(detail)}</small>` : ''}</div>${count > 1 ? `<span class="item-activity-count" title="${count} related changes">×${count}</span>` : ''}</article>`;
    }).join('') : '<div class="item-panel-empty"><span class="item-empty-icon" aria-hidden="true">⌁</span><strong>No activity yet</strong><p>Changes to this item, including moves, updates, and file actions, will appear here.</p></div>';
    content = `<section class="item-activity"><div class="item-panel-section-head"><div><span>ACTIVITY</span><h3>Item activity</h3><p>Review changes made to this item.</p></div></div><div class="item-activity-list">${activityMarkup}</div></section>`;
  }

  const titleId = `item-panel-title-${esc(item.id)}`;
  const panelId = `item-panel-content-${esc(item.id)}`;
  const tabButton = (id: ItemWorkspaceTab, label: string, count: number | '' = ''): string => `<button type="button" role="tab" aria-selected="${tab === id}" aria-controls="${panelId}" data-item-panel-tab="${id}" class="${tabClass(tab === id, tab === id ? 'active' : '')}"><span>${label}</span>${count ? ` <b>${count}</b>` : ''}</button>`;
  const statusColumn: BoardColumn | null = board.columns.find((column) => column.system_key === 'status') || null;
  const configuredStatus = statusColumn ? normalizeStatusLabels(statusColumn).find((label) => String(label.id) === String(item.status || '')) : null;
  const status = configuredStatus?.name || (item.status ? STATUS_LABELS[item.status as keyof typeof STATUS_LABELS] : '') || item.status || 'No status';
  const statusColor = configuredStatus?.color || '#7f8a9a';
  const archived = Boolean(item.archived_at || item.archived);
  return `<div class="item-panel-scrim" data-close-item-panel></div><aside class="board-item-panel" role="dialog" aria-modal="true" aria-labelledby="${titleId}" data-item-panel data-item-id="${esc(item.id)}" data-active-tab="${tab}">
    <header class="item-panel-head"><button type="button" class="${iconButtonClass({ tone: 'ghost' }, 'item-panel-close')}" data-close-item-panel aria-label="Close item panel">×</button>
      <div class="item-panel-identity"><div class="item-panel-breadcrumb"><span>${esc(group?.title || 'No group')}</span><span aria-hidden="true">/</span><span>${esc(status)}</span></div><h2 id="${titleId}" title="${esc(item.title)}">${esc(item.title)}</h2><div class="item-panel-meta"><span class="status-pill ${configuredStatus ? 'configurable-status' : esc(item.status || 'empty')}" style="--status-color:${esc(statusColor)}">${esc(status)}</span>${item.due_date ? `<span class="item-panel-due">Due ${esc(formatDay(item.due_date))}</span>` : '<span class="item-panel-due is-empty">No due date</span>'}</div></div>
      <span class="board-menu-host item-panel-action-host" data-board-menu-host><button type="button" class="${iconButtonClass({ tone: 'ghost' }, 'item-panel-more-trigger')}" data-board-menu-trigger="item-panel" aria-label="More actions for this item" aria-haspopup="menu" aria-expanded="false">•••</button><template data-board-menu-template>${canEdit() ? `<button type="button" role="menuitem" data-edit-item="${item.id}">Edit item</button><button type="button" role="menuitem" data-archive-item="${item.id}" data-archive="${archived ? 'false' : 'true'}">${archived ? 'Restore item' : 'Archive item'}</button>` : '<span class="item-panel-readonly" role="note">View-only board access</span>'}</template></span>
    </header>
    <nav class="wm-tabs item-panel-tabs" role="tablist" aria-label="Item details">${tabButton('updates', 'Updates', data.updates.length)}${tabButton('files', 'Files', data.files.length)}${tabButton('activity', 'Activity')}</nav>
    <div id="${panelId}" class="item-panel-body" role="tabpanel" data-item-panel-body><div class="item-panel-tab-stage" data-item-tab-stage data-item-tab-content="${tab}">${content}</div></div>
  </aside>`;
}
