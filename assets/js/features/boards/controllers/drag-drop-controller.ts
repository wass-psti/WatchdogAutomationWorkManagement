import type { BoardCommandService } from '../../../../../src/features/boards/contracts/commands.ts';
import type { BoardItem } from '../../../../../src/features/boards/contracts/domain.ts';
import type { MutableBoardViewState } from '../../../../../src/features/boards/contracts/view-state.ts';
import type { ToastRenderer } from '../../../../../src/platform/contracts/ui.ts';
import type { BoardGroupId, BoardItemId, StatusLabelId } from '../../../../../src/types/identifiers.ts';
import type { BoardHistoryController } from './history-controller.ts';

interface BoardDragDropDependencies {
  readonly commands: BoardCommandService;
  readonly state: MutableBoardViewState;
  readonly canEdit: () => boolean;
  readonly getItems: () => readonly BoardItem[];
  readonly toast: ToastRenderer;
  readonly renderBoard: () => void;
  readonly history?: BoardHistoryController | null;
}

interface BoardItemSnapshot {
  readonly id: BoardItemId;
  readonly group_id: BoardGroupId;
  readonly position: number;
  readonly status: StatusLabelId | null;
}

const errorMessage = (error: unknown): string => error instanceof Error ? error.message : 'The item could not be moved.';
const eventElement = (event: Event): Element | null => event.target instanceof Element ? event.target : null;
const isArchived = (item: BoardItem): boolean => Boolean(item.archived || item.archived_at);

/**
 * Work Board item drag/drop controller.
 * Supports table reordering, cross-group movement, Kanban status movement,
 * optimistic local updates, undo/redo integration, and explicit listener cleanup.
 */
export function createBoardDragDropController({ commands, state: _state, canEdit, getItems, toast, renderBoard, history }: BoardDragDropDependencies) {
  let dragItemId: BoardItemId | null = null;
  let cleanup: (() => void) | null = null;

  const clearVisualState = (root: HTMLElement | null): void => {
    root?.querySelectorAll<HTMLElement>('.dragging').forEach((node) => {
      node.classList.remove('dragging');
      node.removeAttribute('aria-grabbed');
    });
    root?.querySelectorAll<HTMLElement>('.drag-over,.item-drop-before,.item-drop-after').forEach((node) => node.classList.remove('drag-over', 'item-drop-before', 'item-drop-after'));
  };

  function announce(root: HTMLElement, message: string): void {
    let live = root.querySelector<HTMLElement>('[data-board-drag-live]');
    if (!live) {
      live = document.createElement('div');
      live.className = 'wm-visually-hidden';
      live.dataset.boardDragLive = '1';
      live.setAttribute('role', 'status');
      live.setAttribute('aria-live', 'polite');
      root.appendChild(live);
    }
    live.textContent = '';
    requestAnimationFrame(() => { if (live) live.textContent = message; });
  }

  function reset(root: HTMLElement | null = null): void {
    dragItemId = null;
    clearVisualState(root);
  }

  function snapshot(items: readonly BoardItem[]): BoardItemSnapshot[] {
    return items.map((item) => ({ id: item.id, group_id: item.group_id, position: item.position, status: item.status }));
  }

  function restore(items: readonly BoardItem[], snap: readonly BoardItemSnapshot[]): void {
    const map = new Map(snap.map((entry) => [String(entry.id), entry]));
    items.forEach((item) => {
      const value = map.get(String(item.id));
      if (value) Object.assign(item, value);
    });
  }

  function applyLocalMove(items: readonly BoardItem[], item: BoardItem, groupId: BoardGroupId, position: number, status: StatusLabelId | null): void {
    const active = items.filter((entry) => !isArchived(entry));
    const sourceGroup = item.group_id;
    active
      .filter((entry) => String(entry.group_id) === String(sourceGroup) && String(entry.id) !== String(item.id) && entry.position > item.position)
      .forEach((entry) => { Object.assign(entry, { position: entry.position - 1 }); });
    const targetPeers = active
      .filter((entry) => String(entry.group_id) === String(groupId) && String(entry.id) !== String(item.id))
      .sort((a, b) => a.position - b.position);
    const target = Math.max(0, Math.min(Number(position), targetPeers.length));
    targetPeers.filter((entry) => entry.position >= target).forEach((entry) => { Object.assign(entry, { position: entry.position + 1 }); });
    Object.assign(item, { group_id: groupId, position: target, status });
  }

  function bind(root: HTMLElement): () => void {
    cleanup?.();
    const abort = new AbortController();
    const options: AddEventListenerOptions = { signal: abort.signal };

    root.addEventListener('dragstart', (event: DragEvent) => {
      const target = eventElement(event);
      if (!target || target.closest('[data-column-drag],[data-group-drag]')) return;
      const interactive = target.closest('button,input,select,textarea,a,summary,[contenteditable="true"]');
      if (interactive && !target.closest('.drag-handle')) return;
      const item = target.closest<HTMLElement>('[data-item-id]');
      if (!item || !canEdit() || !event.dataTransfer) return;
      const id = item.dataset.itemId;
      if (!id) return;
      dragItemId = id;
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', id);
      item.classList.add('dragging');
      item.setAttribute('aria-grabbed', 'true');
      announce(root, 'Item picked up. Drop it on another row, group, or status lane.');
    }, options);

    root.addEventListener('dragend', () => {
      reset(root);
      announce(root, 'Drag ended.');
    }, options);

    root.addEventListener('dragover', (event: DragEvent) => {
      if (!dragItemId || !canEdit()) return;
      const target = eventElement(event);
      const row = target?.closest<HTMLElement>('.board-item-row[data-item-id]') ?? null;
      const zone = target?.closest<HTMLElement>('[data-drop-group],[data-drop-status]') ?? null;
      if (!row && !zone) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
      clearVisualState(root);
      root.querySelector<HTMLElement>(`[data-item-id="${CSS.escape(String(dragItemId))}"]`)?.classList.add('dragging');
      if (row && String(row.dataset.itemId) !== String(dragItemId)) {
        const rect = row.getBoundingClientRect();
        row.classList.add(event.clientY > rect.top + rect.height / 2 ? 'item-drop-after' : 'item-drop-before');
      } else {
        zone?.classList.add('drag-over');
      }
    }, options);

    root.addEventListener('dragleave', (event: DragEvent) => {
      const target = eventElement(event);
      const node = target?.closest<HTMLElement>('.board-item-row,[data-drop-group],[data-drop-status]') ?? null;
      if (!node) return;
      if (event.relatedTarget instanceof Node && node.contains(event.relatedTarget)) return;
      node.classList.remove('drag-over', 'item-drop-before', 'item-drop-after');
    }, options);

    root.addEventListener('drop', (event: DragEvent) => {
      void (async () => {
        const activeId = dragItemId;
        if (!activeId || !canEdit()) return;
        const items = getItems();
        const item = items.find((entry) => String(entry.id) === String(activeId));
        if (!item) {
          reset(root);
          return;
        }
        const target = eventElement(event);
        const row = target?.closest<HTMLElement>('.board-item-row[data-item-id]') ?? null;
        const zone = target?.closest<HTMLElement>('[data-drop-group],[data-drop-status]') ?? null;
        if (!row && !zone) return;
        event.preventDefault();

        let groupId: BoardGroupId = item.group_id;
        let status: StatusLabelId | null = item.status;
        let position = item.position;
        if (row && String(row.dataset.itemId) !== String(item.id)) {
          const targetItem = items.find((entry) => String(entry.id) === String(row.dataset.itemId));
          if (!targetItem) return;
          groupId = targetItem.group_id;
          status = item.status;
          const rect = row.getBoundingClientRect();
          position = targetItem.position + (event.clientY > rect.top + rect.height / 2 ? 1 : 0);
          if (String(groupId) === String(item.group_id) && item.position < position) position -= 1;
        } else if (zone) {
          groupId = zone.dataset.dropGroup || item.group_id;
          if (Object.prototype.hasOwnProperty.call(zone.dataset, 'dropStatus')) {
            status = zone.dataset.dropStatus === '' ? null : (zone.dataset.dropStatus ?? null);
          }
          position = items.filter((entry) => !isArchived(entry) && String(entry.group_id) === String(groupId) && String(entry.id) !== String(item.id)).length;
        }

        const noChange = String(groupId) === String(item.group_id) && String(status) === String(item.status) && position === item.position;
        if (noChange) {
          reset(root);
          announce(root, 'Item stayed in its current position.');
          return;
        }

        const before = snapshot(items);
        const old = { groupId: item.group_id, position: item.position, status: item.status };
        applyLocalMove(items, item, groupId, position, status);
        reset(root);
        renderBoard();
        try {
          await commands.moveItem({ itemId: item.id, groupId, position: item.position, status });
          toast('Item moved.');
          announce(root, 'Item moved successfully.');
          const after = snapshot(items);
          history?.push({
            label: 'item move',
            undo: async () => {
              restore(items, before);
              renderBoard();
              await commands.moveItem({ itemId: item.id, groupId: old.groupId, position: old.position, status: old.status });
            },
            redo: async () => {
              restore(items, after);
              renderBoard();
              const moved = items.find((entry) => String(entry.id) === String(item.id));
              if (!moved) return;
              await commands.moveItem({ itemId: item.id, groupId: moved.group_id, position: moved.position, status: moved.status });
            },
          });
        } catch (error) {
          restore(items, before);
          renderBoard();
          toast(errorMessage(error), 'warning');
          announce(root, 'Item couldn’t be moved. Try again.');
        }
      })();
    }, options);

    cleanup = () => {
      abort.abort();
      reset(root);
      cleanup = null;
    };
    return cleanup;
  }

  function dispose(): void {
    cleanup?.();
    cleanup = null;
    dragItemId = null;
  }

  return Object.freeze({ bind, reset, dispose, get activeItemId() { return dragItemId; } });
}
