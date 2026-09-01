import type { ItemWorkspaceTab } from '../../../../../src/features/boards/contracts/view-state.ts';

interface ItemPanelRendererDependencies {
  readonly getHost?: () => HTMLElement | null;
  readonly patchFull?: (host: HTMLElement, html: string) => boolean;
  readonly reducedMotion?: () => boolean;
}

const TAB_ORDER: Readonly<Record<ItemWorkspaceTab, number>> = Object.freeze({ updates: 0, files: 1, activity: 2 });
const asTab = (value: string | undefined, fallback: ItemWorkspaceTab): ItemWorkspaceTab => value === 'files' || value === 'activity' || value === 'updates' ? value : fallback;

/** Stable Item Workspace renderer that preserves the drawer shell across tab changes. */
export function createItemPanelRenderer({
  getHost = () => document.querySelector<HTMLElement>('[data-item-panel-host]'),
  patchFull = (host, html) => { host.innerHTML = html; return true; },
  reducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true,
}: ItemPanelRendererDependencies = {}) {
  const scrollByTab = new Map<ItemWorkspaceTab, number>();
  let animation: Animation | null = null;
  let epoch = 0;

  function cancel(): void {
    epoch += 1;
    try { animation?.cancel(); } catch { /* Web Animations cancellation is best-effort. */ }
    animation = null;
  }

  function syncRegion(current: Element | null, next: Element | null): boolean {
    if (!current || !next || current.innerHTML === next.innerHTML) return false;
    current.innerHTML = next.innerHTML;
    return true;
  }

  function render(html: string): boolean {
    const host = getHost();
    if (!host) return false;
    if (!html) {
      cancel();
      scrollByTab.clear();
      return patchFull(host, '');
    }

    const template = document.createElement('template');
    template.innerHTML = String(html).trim();
    const nextPanel = template.content.querySelector<HTMLElement>('[data-item-panel]');
    const nextScrim = template.content.querySelector<HTMLElement>('.item-panel-scrim');
    const currentPanel = host.querySelector<HTMLElement>('[data-item-panel]');
    const currentScrim = host.querySelector<HTMLElement>('.item-panel-scrim');

    if (!currentPanel || !nextPanel || currentPanel.dataset.itemId !== nextPanel.dataset.itemId) {
      cancel();
      scrollByTab.clear();
      return patchFull(host, html);
    }

    if (!currentScrim && nextScrim) host.prepend(nextScrim.cloneNode(true));

    const previousTab = asTab(currentPanel.dataset.activeTab, 'updates');
    const nextTab = asTab(nextPanel.dataset.activeTab, previousTab);
    const tabChanged = previousTab !== nextTab;
    const currentBody = currentPanel.querySelector<HTMLElement>('[data-item-panel-body]');
    const nextBody = nextPanel.querySelector<HTMLElement>('[data-item-panel-body]');
    if (currentBody) scrollByTab.set(previousTab, currentBody.scrollTop);

    syncRegion(currentPanel.querySelector('.item-panel-head'), nextPanel.querySelector('.item-panel-head'));

    const currentTabs = currentPanel.querySelector<HTMLElement>('.item-panel-tabs');
    const nextTabs = nextPanel.querySelector<HTMLElement>('.item-panel-tabs');
    if (currentTabs && nextTabs) {
      const nextButtons = new Map([...nextTabs.querySelectorAll<HTMLElement>('[data-item-panel-tab]')].map((button) => [button.dataset.itemPanelTab, button]));
      currentTabs.querySelectorAll<HTMLElement>('[data-item-panel-tab]').forEach((button) => {
        const fresh = nextButtons.get(button.dataset.itemPanelTab);
        if (!fresh) return;
        button.className = fresh.className;
        button.setAttribute('aria-selected', fresh.getAttribute('aria-selected') || 'false');
        button.setAttribute('aria-controls', fresh.getAttribute('aria-controls') || '');
        if (button.innerHTML !== fresh.innerHTML) button.innerHTML = fresh.innerHTML;
      });
    }

    currentPanel.dataset.activeTab = nextTab;
    if (!currentBody || !nextBody) return true;

    cancel();
    const ticket = epoch;
    const nextStage = nextBody.querySelector<HTMLElement>('[data-item-tab-stage]')?.cloneNode(true);
    if (!(nextStage instanceof HTMLElement)) {
      currentBody.innerHTML = nextBody.innerHTML;
      return true;
    }

    currentBody.replaceChildren(nextStage);
    const desiredScroll = tabChanged ? (scrollByTab.get(nextTab) || 0) : (scrollByTab.get(previousTab) || 0);
    currentBody.scrollTop = desiredScroll;
    requestAnimationFrame(() => {
      if (ticket !== epoch || !currentBody.isConnected) return;
      currentBody.scrollTop = desiredScroll;
    });

    if (tabChanged && !reducedMotion() && typeof nextStage.animate === 'function') {
      const direction = (TAB_ORDER[nextTab] ?? 0) >= (TAB_ORDER[previousTab] ?? 0) ? 1 : -1;
      animation = nextStage.animate([
        { opacity: 0.72, transform: `translate3d(${direction * 8}px,0,0)` },
        { opacity: 1, transform: 'translate3d(0,0,0)' },
      ], { duration: 150, easing: 'cubic-bezier(.2,.8,.2,1)' });
      void animation.finished.catch(() => undefined).finally(() => {
        if (ticket === epoch) animation = null;
      });
    }
    return true;
  }

  function reset(): void {
    cancel();
    scrollByTab.clear();
  }

  return Object.freeze({ render, reset, cancel, scrollByTab });
}
