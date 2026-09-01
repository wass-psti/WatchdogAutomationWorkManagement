import type {
  OverlayManager,
  OverlayManagerOptions,
  OverlayRegistration,
} from '../../../../src/platform/contracts/overlay.ts';

type OverlayEntry = Readonly<{
  id: string;
  element: HTMLElement;
  trigger: HTMLElement | null;
  close: OverlayRegistration['close'];
  parentId: string | null;
}>;

/**
 * Shared portal/overlay lifecycle coordinator.
 * It supports a single active branch, explicit parent-child overlays, Escape,
 * outside dismissal, focus restoration, and click-through suppression hooks.
 */
export function createOverlayManager({
  scope = 'platform',
  documentRef = globalThis.document,
  replacementTrigger = () => false,
  underlyingAction = () => null,
}: OverlayManagerOptions = {}): OverlayManager {
  const stack: OverlayEntry[] = [];
  const abort = new AbortController();
  let closing = false;
  let suppressClickTarget: Element | null = null;
  const doc = documentRef;
  const indexOf = (id: string): number => stack.findIndex((entry) => entry.id === id);
  const top = (): OverlayEntry | null => stack.at(-1) ?? null;

  const release = (id: string): void => {
    const index = indexOf(id);
    if (index >= 0) stack.splice(index, 1);
  };

  const invokeClose = (entry: OverlayEntry | null, restoreFocus = false): void => {
    if (!entry) return;
    try { entry.close({ restoreFocus, fromCoordinator: true }); } catch { /* Overlay cleanup must remain best-effort. */ }
    release(entry.id);
  };

  const closeTop: OverlayManager['closeTop'] = ({ restoreFocus = true } = {}) => {
    const entry = top();
    if (!entry || closing) return false;
    closing = true;
    invokeClose(entry, restoreFocus);
    closing = false;
    return true;
  };

  const closeAll: OverlayManager['closeAll'] = ({ restoreFocus = false, except = null } = {}) => {
    if (closing) return;
    closing = true;
    const currentTop = top();
    for (const entry of [...stack].reverse()) {
      if (except && entry.id === except) continue;
      invokeClose(entry, restoreFocus && entry === currentTop);
    }
    closing = false;
  };

  const open = (registration: OverlayRegistration): boolean => {
    const { id, element, trigger = null, close, parentId = null } = registration;
    if (!id || !(element instanceof HTMLElement) || typeof close !== 'function') return false;
    const existing = indexOf(id);
    if (existing >= 0) stack.splice(existing, 1);
    if (parentId) {
      const parentIndex = indexOf(parentId);
      const descendants = parentIndex >= 0 ? [...stack].slice(parentIndex + 1) : [...stack];
      for (const entry of descendants.reverse()) invokeClose(entry, false);
    } else {
      for (const entry of [...stack].reverse()) invokeClose(entry, false);
    }
    stack.push(Object.freeze({
      id: String(id),
      element,
      trigger: trigger instanceof HTMLElement ? trigger : null,
      close,
      parentId: parentId ? String(parentId) : null,
    }));
    return true;
  };

  const containsTarget = (entry: OverlayEntry | null, target: EventTarget | null): boolean =>
    Boolean(entry && target instanceof Node && (entry.element.contains(target) || entry.trigger?.contains(target)));

  doc?.addEventListener('pointerdown', (event) => {
    if (!stack.length) return;
    const current = top();
    if (containsTarget(current, event.target)) return;
    if (current?.parentId) {
      const parent = stack.find((entry) => entry.id === current.parentId) ?? null;
      if (containsTarget(parent, event.target)) {
        closeTop({ restoreFocus: false });
        return;
      }
    }
    const isReplacement = event.target instanceof Element && replacementTrigger(event.target);
    const underlying = isReplacement ? null : underlyingAction(event.target);
    suppressClickTarget = underlying;
    if (underlying?.matches('[draggable="true"],[data-column-resize]')) event.preventDefault();
    closeAll({ restoreFocus: false });
  }, { capture: true, signal: abort.signal });

  doc?.addEventListener('click', (event) => {
    if (!suppressClickTarget) return;
    const target = suppressClickTarget;
    suppressClickTarget = null;
    if (!(event.target instanceof Node) || !(target === event.target || target.contains(event.target))) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, { capture: true, signal: abort.signal });

  doc?.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !stack.length) return;
    event.preventDefault();
    event.stopPropagation();
    closeTop({ restoreFocus: true });
  }, { capture: true, signal: abort.signal });

  return Object.freeze({
    open,
    release,
    closeTop,
    closeAll,
    get active() { return stack.length > 0; },
    get topId() { return top()?.id ?? null; },
    snapshot: () => Object.freeze(stack.map((entry) => Object.freeze({ id: entry.id, parentId: entry.parentId }))),
    dispose() {
      suppressClickTarget = null;
      abort.abort();
      closeAll();
    },
    scope: String(scope),
  });
}
