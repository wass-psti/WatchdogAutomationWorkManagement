import type { OverlayCloseOptions, OverlayManager } from '../../../../../src/platform/contracts/overlay.ts';
import type { EscapeHtml } from '../../../../../src/platform/contracts/ui.ts';

interface BoardMenuControllerOptions {
  readonly root: HTMLElement;
  readonly escapeHtml?: EscapeHtml;
  readonly overlayCoordinator?: OverlayManager | null;
}

interface BoardMenuCloseOptions extends OverlayCloseOptions {}

/** Unified Work Boards floating-menu controller. */
export function createBoardMenuController({ root, escapeHtml: _escapeHtml = (value) => String(value ?? ''), overlayCoordinator = null }: BoardMenuControllerOptions) {
  if (!(root instanceof HTMLElement)) throw new Error('Board menu controller requires a root element.');
  const abort = new AbortController();
  let activeTrigger: HTMLElement | null = null;
  let overlayLayer: HTMLDivElement | null = null;
  let menu: HTMLDivElement | null = null;

  const ensureMenu = (): HTMLDivElement => {
    if (menu?.isConnected) return menu;
    if (!overlayLayer?.isConnected) {
      overlayLayer = document.createElement('div');
      overlayLayer.className = 'board-overlay-layer';
      overlayLayer.dataset.boardOverlayLayer = 'true';
      root.appendChild(overlayLayer);
    }
    menu = document.createElement('div');
    menu.className = 'board-floating-menu';
    menu.setAttribute('role', 'menu');
    menu.hidden = true;
    menu.removeAttribute('aria-hidden');
    overlayLayer.appendChild(menu);
    return menu;
  };

  const position = (): void => {
    if (!activeTrigger || !menu || menu.hidden || !activeTrigger.isConnected) return;
    const anchor = activeTrigger.getBoundingClientRect();
    const rect = menu.getBoundingClientRect();
    const gap = 7;
    const pad = 10;
    const width = Math.min(Math.max(rect.width || 196, 176), Math.max(176, window.innerWidth - pad * 2));
    const below = window.innerHeight - anchor.bottom - gap - pad;
    const above = anchor.top - gap - pad;
    const desiredHeight = Math.min(rect.height || 260, 420);
    const openAbove = below < Math.min(desiredHeight, 190) && above > below;
    const maxHeight = Math.max(120, Math.min(420, openAbove ? above : below));
    const left = Math.max(pad, Math.min(anchor.right - width, window.innerWidth - width - pad));
    let top = openAbove ? anchor.top - Math.min(desiredHeight, maxHeight) - gap : anchor.bottom + gap;
    top = Math.max(pad, Math.min(top, window.innerHeight - Math.min(desiredHeight, maxHeight) - pad));
    menu.style.setProperty('--board-menu-origin-x', `${Math.round(Math.min(width - 16, Math.max(16, anchor.left + anchor.width / 2 - left)))}px`);
    menu.style.left = `${Math.round(left)}px`;
    menu.style.top = `${Math.round(top)}px`;
    menu.style.width = `${Math.round(width)}px`;
    menu.style.maxHeight = `${Math.round(maxHeight)}px`;
  };

  const close = ({ restoreFocus = false, fromCoordinator = false }: BoardMenuCloseOptions = {}): void => {
    if (activeTrigger) {
      activeTrigger.setAttribute('aria-expanded', 'false');
      const details = activeTrigger.closest<HTMLDetailsElement>('details');
      if (details) details.open = false;
    }
    const previous = activeTrigger;
    activeTrigger = null;
    if (menu) {
      menu.hidden = true;
      menu.innerHTML = '';
      menu.removeAttribute('data-menu-kind');
      menu.removeAttribute('aria-label');
    }
    if (!fromCoordinator) overlayCoordinator?.release('board-menu');
    if (restoreFocus && previous?.isConnected) previous.focus({ preventScroll: true });
  };

  const open = (trigger: HTMLElement): boolean => {
    const host = trigger.closest<HTMLElement>('[data-board-menu-host]');
    const template = host?.querySelector(':scope > template[data-board-menu-template]');
    if (!(template instanceof HTMLTemplateElement)) return false;
    if (activeTrigger === trigger && menu && !menu.hidden) {
      close({ restoreFocus: true });
      return true;
    }
    close();
    const target = ensureMenu();
    target.innerHTML = template.innerHTML;
    target.hidden = false;
    target.dataset.menuKind = trigger.dataset.boardMenuTrigger || 'board';
    const menuLabel = trigger.getAttribute('aria-label');
    if (menuLabel) target.setAttribute('aria-label', menuLabel);
    else target.removeAttribute('aria-label');
    activeTrigger = trigger;
    const nativeDetails = trigger.closest<HTMLDetailsElement>('details');
    if (nativeDetails) nativeDetails.open = false;
    trigger.setAttribute('aria-expanded', 'true');
    overlayCoordinator?.open({ id: 'board-menu', element: target, trigger, close });
    requestAnimationFrame(() => {
      position();
      const first = target.querySelector<HTMLElement>('button:not(:disabled),[role="menuitem"]:not([aria-disabled="true"])');
      if (trigger.matches(':focus-visible')) first?.focus({ preventScroll: true });
    });
    return true;
  };

  const handleTrigger = (target: EventTarget | null): boolean => {
    const trigger = target instanceof Element ? target.closest<HTMLElement>('[data-board-menu-trigger]') : null;
    if (!trigger || !root.contains(trigger)) return false;
    return open(trigger);
  };

  const handleKeydown = (event: KeyboardEvent): boolean => {
    if (!menu || menu.hidden) return false;
    if (event.key === 'Escape') {
      event.preventDefault();
      close({ restoreFocus: true });
      return true;
    }
    const items = [...menu.querySelectorAll<HTMLElement>('button:not(:disabled),[role="menuitem"]:not([aria-disabled="true"])')].filter((element) => !element.hidden);
    if (!items.length) return false;
    const current = document.activeElement;
    const index = items.indexOf(current as HTMLElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      const nextIndex = index < 0 ? (delta > 0 ? 0 : items.length - 1) : (index + delta + items.length) % items.length;
      items[nextIndex]?.focus();
      return true;
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      (event.key === 'Home' ? items[0] : items.at(-1))?.focus();
      return true;
    }
    return false;
  };

  document.addEventListener('keydown', (event: KeyboardEvent) => { handleKeydown(event); }, { signal: abort.signal });
  window.addEventListener('resize', () => { if (activeTrigger) position(); }, { passive: true, signal: abort.signal });
  root.addEventListener('scroll', (event: Event) => {
    if (!activeTrigger || menu?.hidden) return;
    if (event.target instanceof Element && event.target.closest('.board-table-scroll,.kanban-board,.board-view-region')) close();
  }, { capture: true, passive: true, signal: abort.signal });

  return Object.freeze({
    open,
    close,
    handleTrigger,
    position,
    get active() { return Boolean(activeTrigger && menu && !menu.hidden); },
    dispose(): void {
      abort.abort();
      close();
      menu?.remove();
      menu = null;
      overlayLayer?.remove();
      overlayLayer = null;
    },
  });
}
