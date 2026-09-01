import type { BoardCommandService } from '../../../../../src/features/boards/contracts/commands.ts';
import type { BoardColumn, BoardGroup } from '../../../../../src/features/boards/contracts/domain.ts';
import type { MutableBoardViewState } from '../../../../../src/features/boards/contracts/view-state.ts';
import type { ToastRenderer } from '../../../../../src/platform/contracts/ui.ts';
import type { BoardHistoryController } from './history-controller.ts';

interface StructureDragDependencies {
  readonly state: MutableBoardViewState;
  readonly commands: BoardCommandService;
  readonly canEdit: () => boolean;
  readonly toast: ToastRenderer;
  readonly renderBoardData: () => void;
  readonly history?: BoardHistoryController | null;
}

type StructureType = 'column' | 'group';
interface ActiveStructureDrag { readonly type: StructureType; readonly id: string; }
interface Positionable { readonly id: string; position: number; }
interface PositionSnapshot { readonly id: string; readonly position: number; }
interface ReorderResult<T extends Positionable> {
  readonly before: readonly PositionSnapshot[];
  readonly after: readonly PositionSnapshot[];
  readonly source: T;
  readonly index: number;
}

const errorMessage = (error: unknown): string => error instanceof Error ? error.message : 'Unknown error.';

function reorderLocal<T extends Positionable>(list: readonly T[], sourceId: string, targetIndex: number): ReorderResult<T> | null {
  const ordered = [...list].sort((a, b) => a.position - b.position);
  const sourceIndex = ordered.findIndex((entry) => String(entry.id) === String(sourceId));
  if (sourceIndex < 0) return null;
  const before = ordered.map((entry) => ({ id: entry.id, position: entry.position }));
  const source = ordered.splice(sourceIndex, 1)[0];
  if (!source) return null;
  const index = Math.max(0, Math.min(targetIndex, ordered.length));
  ordered.splice(index, 0, source);
  ordered.forEach((entry, idx) => { entry.position = idx; });
  return { before, after: ordered.map((entry) => ({ id: entry.id, position: entry.position })), source, index };
}

function restorePositions<T extends Positionable>(list: readonly T[], snapshot: readonly PositionSnapshot[]): void {
  const map = new Map(snapshot.map((entry) => [String(entry.id), entry.position]));
  list.forEach((entry) => {
    const position = map.get(String(entry.id));
    if (position !== undefined) entry.position = position;
  });
}

/** Drag ordering for groups and columns. Keeps structural ordering server-authoritative with optimistic local feedback. */
export function createBoardStructureDragController({ state, commands, canEdit, toast, renderBoardData, history }: StructureDragDependencies) {
  let active: ActiveStructureDrag | null = null;
  let cleanup: (() => void) | null = null;

  function bind(root: HTMLElement): void {
    cleanup?.();
    const abort = new AbortController();
    const options: AddEventListenerOptions = { signal: abort.signal };

    root.addEventListener('dragstart', (event: DragEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const handle = target?.closest<HTMLElement>('[data-column-drag],[data-group-drag]') ?? null;
      if (!handle || !canEdit() || !event.dataTransfer) return;
      const type: StructureType = handle.hasAttribute('data-column-drag') ? 'column' : 'group';
      const id = type === 'column' ? handle.dataset.columnDrag : handle.dataset.groupDrag;
      if (!id) return;
      active = { type, id };
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', `${type}:${id}`);
      handle.closest<HTMLElement>('[data-column-id],[data-group-id]')?.classList.add('structure-dragging');
    }, options);

    root.addEventListener('dragend', () => {
      root.querySelectorAll('.structure-dragging,.structure-drop-target').forEach((node) => node.classList.remove('structure-dragging', 'structure-drop-target'));
      active = null;
    }, options);

    root.addEventListener('dragover', (event: DragEvent) => {
      if (!active) return;
      const targetNode = event.target instanceof Element ? event.target : null;
      const target = active.type === 'column'
        ? targetNode?.closest<HTMLElement>('[data-column-id]')
        : targetNode?.closest<HTMLElement>('.board-group[data-group-id]');
      if (!target) return;
      event.preventDefault();
      target.classList.add('structure-drop-target');
    }, options);

    root.addEventListener('dragleave', (event: DragEvent) => {
      const targetNode = event.target instanceof Element ? event.target : null;
      const target = targetNode?.closest<HTMLElement>('[data-column-id],.board-group[data-group-id]') ?? null;
      if (!target) return;
      if (event.relatedTarget instanceof Node && target.contains(event.relatedTarget)) return;
      target.classList.remove('structure-drop-target');
    }, options);

    root.addEventListener('drop', (event: DragEvent) => {
      void (async () => {
        const current = active;
        if (!current) return;
        const targetNode = event.target instanceof Element ? event.target : null;
        const target = current.type === 'column'
          ? targetNode?.closest<HTMLElement>('[data-column-id]')
          : targetNode?.closest<HTMLElement>('.board-group[data-group-id]');
        if (!target) return;
        event.preventDefault();
        const targetId = current.type === 'column' ? target.dataset.columnId : target.dataset.groupId;
        if (!targetId || targetId === current.id) {
          active = null;
          return;
        }
        const board = state.board;
        if (!board) {
          active = null;
          return;
        }

        if (current.type === 'column') {
          const list: readonly BoardColumn[] = board.columns;
          const targetIndex = [...list].sort((a, b) => a.position - b.position).findIndex((entry) => String(entry.id) === targetId);
          const result = reorderLocal(list, current.id, targetIndex);
          active = null;
          if (!result) return;
          renderBoardData();
          const persist = (position: number): Promise<void> => commands.moveColumn({ columnId: current.id, position });
          try {
            await persist(result.index);
            toast('Column order updated.');
            history?.push({
              label: 'column order',
              undo: async () => {
                const sourceBefore = result.before.find((entry) => String(entry.id) === current.id);
                restorePositions(list, result.before);
                renderBoardData();
                await persist(sourceBefore?.position ?? 0);
              },
              redo: async () => {
                restorePositions(list, result.after);
                renderBoardData();
                await persist(result.index);
              },
            });
          } catch (error) {
            restorePositions(list, result.before);
            renderBoardData();
            toast(`Column order couldn’t be saved. ${errorMessage(error)}`, 'warning');
          }
          return;
        }

        const list: readonly BoardGroup[] = board.groups;
        const targetIndex = [...list].sort((a, b) => a.position - b.position).findIndex((entry) => String(entry.id) === targetId);
        const result = reorderLocal(list, current.id, targetIndex);
        active = null;
        if (!result) return;
        renderBoardData();
        const persist = (position: number): Promise<void> => commands.moveGroup({ groupId: current.id, position });
        try {
          await persist(result.index);
          toast('Group order updated.');
          history?.push({
            label: 'group order',
            undo: async () => {
              const sourceBefore = result.before.find((entry) => String(entry.id) === current.id);
              restorePositions(list, result.before);
              renderBoardData();
              await persist(sourceBefore?.position ?? 0);
            },
            redo: async () => {
              restorePositions(list, result.after);
              renderBoardData();
              await persist(result.index);
            },
          });
        } catch (error) {
          restorePositions(list, result.before);
          renderBoardData();
          toast(`Group order couldn’t be saved. ${errorMessage(error)}`, 'warning');
        }
      })();
    }, options);

    cleanup = () => {
      abort.abort();
      active = null;
      cleanup = null;
    };
  }

  function dispose(): void { cleanup?.(); }
  return Object.freeze({ bind, dispose });
}
