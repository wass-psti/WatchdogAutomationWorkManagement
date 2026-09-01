import type { ColumnResizeDependencies } from '../../../../../src/features/boards/contracts/presentation.ts';

const ITEM_COLUMN_KEY = '__item';
const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

/** Pointer-driven column resizing persisted in per-member board preferences. */
export function createColumnResizeController({ state, preferencePatches, persistPreferences, history, renderBoardData }: ColumnResizeDependencies) {
  let cleanup: (() => void) | null = null;

  const widthFor = (key: string): number => key === ITEM_COLUMN_KEY
    ? Number(state.boardPrefs?.item_name_width || 280)
    : Number(state.boardPrefs?.column_widths?.[key] || 160);

  function applyWidth(root: HTMLElement, key: string, width: number): void {
    root.querySelectorAll<HTMLElement>(`[data-column-width-key="${CSS.escape(key)}"]`).forEach((node) => {
      node.style.width = `${width}px`;
      node.style.minWidth = `${width}px`;
      node.style.maxWidth = `${width}px`;
    });
  }

  function saveWidth(key: string, width: number): void {
    state.boardPrefs = key === ITEM_COLUMN_KEY
      ? preferencePatches.withItemNameWidth(state.boardPrefs, width)
      : preferencePatches.withColumnWidth(state.boardPrefs, key, width);
    void persistPreferences();
  }

  function begin(event: PointerEvent, root: HTMLElement): boolean {
    const target = event.target instanceof Element ? event.target : null;
    const handle = target?.closest<HTMLElement>('[data-column-resize]') ?? null;
    if (!handle || event.button !== 0) return false;
    const key = handle.dataset.columnResize;
    if (!key) return false;
    const startWidth = widthFor(key);
    const min = key === ITEM_COLUMN_KEY ? 180 : 96;
    const max = 720;
    const startX = event.clientX;
    handle.setPointerCapture?.(event.pointerId);
    root.classList.add('is-resizing-column');
    let latest = startWidth;
    const move = (moveEvent: PointerEvent): void => {
      latest = clamp(Math.round(startWidth + moveEvent.clientX - startX), min, max);
      applyWidth(root, key, latest);
    };
    const end = (): void => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      root.classList.remove('is-resizing-column');
      if (latest !== startWidth) {
        saveWidth(key, latest);
        history?.push({
          label: 'column width',
          undo: async () => { saveWidth(key, startWidth); renderBoardData(); },
          redo: async () => { saveWidth(key, latest); renderBoardData(); },
        });
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end, { once: true });
    window.addEventListener('pointercancel', end, { once: true });
    event.preventDefault();
    return true;
  }

  function bind(root: HTMLElement): void {
    cleanup?.();
    const onPointerDown = (event: PointerEvent): void => { begin(event, root); };
    root.addEventListener('pointerdown', onPointerDown);
    cleanup = () => {
      root.removeEventListener('pointerdown', onPointerDown);
      cleanup = null;
    };
  }

  function dispose(): void { cleanup?.(); }
  return Object.freeze({ bind, dispose, widthFor });
}
