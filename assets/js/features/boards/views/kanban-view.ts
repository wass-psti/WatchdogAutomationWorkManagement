import type { BoardGroup, BoardItem, StatusLabel } from '../../../../../src/features/boards/contracts/domain.ts';
import type { MutableBoardViewState } from '../../../../../src/features/boards/contracts/view-state.ts';
import type { UserId } from '../../../../../src/types/identifiers.ts';
import type { DateFormatter, EscapeHtml } from '../../../../../src/platform/contracts/ui.ts';

interface KanbanMember {
  readonly display_name?: string | null;
}

export interface BoardKanbanRenderOptions {
  readonly state: MutableBoardViewState;
  readonly items: readonly BoardItem[];
  readonly groups: readonly BoardGroup[];
  readonly itemMatches: (item: BoardItem) => boolean;
  readonly canEdit: () => boolean;
  readonly memberMap: () => ReadonlyMap<UserId | string | null | undefined, KanbanMember>;
  readonly statusLabels: readonly StatusLabel[] | Readonly<Record<string, string>>;
  readonly escapeHtml: EscapeHtml;
  readonly formatDay: DateFormatter;
}

interface KanbanStatusLabel {
  readonly id: string;
  readonly name: string;
  readonly color: string;
}

export function renderBoardKanbanView({
  state,
  items,
  groups,
  itemMatches,
  canEdit,
  memberMap,
  statusLabels,
  escapeHtml,
  formatDay,
}: BoardKanbanRenderOptions): string {
  const esc = escapeHtml;
  const visibleItems = items.filter(itemMatches);
  const members = memberMap();
  const groupsById = new Map(groups.map((group) => [String(group.id), group] as const));
  const itemsByStatus = new Map<string, BoardItem[]>();
  for (const item of visibleItems) {
    const key = item.status ? String(item.status) : '';
    const lane = itemsByStatus.get(key);
    if (lane) lane.push(item);
    else itemsByStatus.set(key, [item]);
  }
  const primaryGroup = groups[0]?.id || '';
  const configured: KanbanStatusLabel[] = Array.isArray(statusLabels)
    ? statusLabels.map((label) => ({ id: String(label.id), name: String(label.name), color: String(label.color || '#7f8a9a') }))
    : Object.entries(statusLabels).map(([id, name]) => ({ id, name, color: '#7f8a9a' }));
  if (visibleItems.some((item) => !item.status)) configured.push({ id: '', name: 'No status', color: '#a3aab5' });
  return `<div class="kanban-board" aria-label="Board Kanban view">${configured.map((statusLabel) => {
    const status = statusLabel.id;
    const label = statusLabel.name;
    const lane = itemsByStatus.get(status) ?? [];
    return `<section class="kanban-column" data-drop-status="${esc(status)}"><header class="kanban-lane-head"><div class="kanban-lane-title"><span class="status-dot configurable-status-dot" style="--status-color:${esc(statusLabel.color)}"></span><h3>${esc(label)}</h3><small>${lane.length}</small></div>${canEdit() && primaryGroup ? `<button type="button" class="kanban-add-item" data-kanban-add-status="${esc(status)}" data-kanban-add-group="${primaryGroup}" aria-label="Add an item with status ${esc(label)}">+ Add item</button>` : ''}</header><div class="kanban-list">${lane.map((item) => {
      const group = groupsById.get(String(item.group_id));
      const member = members.get(item.assignee_id);
      return `<article class="kanban-card ${state.itemPanel.itemId === item.id ? 'is-detail-open' : ''}" draggable="${canEdit()}" data-item-id="${item.id}" data-group-id="${item.group_id}"><button data-open-item="${item.id}"><strong title="${esc(item.title)}">${esc(item.title)}</strong><span title="${esc(group?.title || 'No group')}">${esc(group?.title || 'No group')}</span></button><footer><span>${esc(member?.display_name || 'Unassigned')}</span><span>${esc(formatDay(item.due_date))}</span></footer></article>`;
    }).join('') || `<div class="kanban-empty"><strong>No items with this status</strong><span>${canEdit() ? 'Drag an item here or add one directly.' : 'Items moved to this status will appear here.'}</span></div>`}</div></section>`;
  }).join('')}</div>`;
}
