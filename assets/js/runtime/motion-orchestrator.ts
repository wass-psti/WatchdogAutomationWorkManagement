/*
 * Work Management Motion Orchestrator v1.30.0
 * Centralizes motion preference, content-exit choreography, shared navigation
 * indicators and progressive enhancement without owning business state.
 */
import type {
  MotionIndicatorMode,
  MotionInputMode,
  MotionPulseTone,
  MotionScope,
  MotionExitOptions,
  WorkManagementMotionApi,
} from '../../../src/platform/contracts/motion.ts';

interface IndicatorBinding {
  readonly indicator: HTMLElement;
  readonly mutation: MutationObserver;
  readonly resize: ResizeObserver | null;
  readonly onScroll: () => void;
  readonly mode: MotionIndicatorMode;
}

declare global {
  var __WM_MOTION_ORCHESTRATOR__: boolean | undefined;
  var WorkManagementMotion: WorkManagementMotionApi | undefined;
}

if (!globalThis.__WM_MOTION_ORCHESTRATOR__) {
  globalThis.__WM_MOTION_ORCHESTRATOR__ = true;

  const root = document.documentElement;
  const reducedQuery = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
  const coarseQuery = globalThis.matchMedia?.('(pointer: coarse)');
  const indicatorBindings = new WeakMap<HTMLElement, IndicatorBinding>();
  let transitionEpoch = 0;

  const isReduced = (): boolean => Boolean(reducedQuery?.matches);
  const inputMode = (): MotionInputMode => coarseQuery?.matches ? 'coarse' : 'fine';
  const syncEnvironment = (): void => {
    root.dataset.wmMotion = isReduced() ? 'reduced' : 'full';
    root.dataset.wmInput = inputMode();
  };
  syncEnvironment();
  reducedQuery?.addEventListener('change', syncEnvironment);
  coarseQuery?.addEventListener('change', syncEnvironment);

  const nextFrame = (): Promise<void> => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  const wait = (ms: number): Promise<void> => new Promise((resolve) => window.setTimeout(resolve, ms));

  async function exitThen(update: () => void, {
    selector = '#main, .auth-panel, [data-motion-view]',
    kind = 'route',
    duration = 110,
  }: MotionExitOptions = {}): Promise<boolean> {
    const epoch = ++transitionEpoch;
    const target = document.querySelector<HTMLElement>(selector);
    if (isReduced() || !target || typeof target.animate !== 'function' || kind === 'state') {
      update();
      return true;
    }

    target.dataset.wmMotionExit = kind;
    const compact = globalThis.matchMedia?.('(max-width: 720px)')?.matches;
    const distance = compact ? 4 : 7;
    const animation = target.animate([
      { opacity: 1, transform: 'translate3d(0,0,0)', filter: 'blur(0)' },
      { opacity: .56, transform: `translate3d(0,-${distance}px,0)`, filter: 'blur(1.25px)' },
    ], {
      duration,
      easing: 'cubic-bezier(.4,0,1,1)',
      fill: 'forwards',
    });
    try { await animation.finished; } catch { /* interrupted transitions are expected */ }
    animation.cancel();
    delete target.dataset.wmMotionExit;
    if (epoch !== transitionEpoch) return false;
    update();
    return true;
  }

  function cancelTransitions(): void {
    transitionEpoch += 1;
  }

  function pulse(element: HTMLElement, tone: MotionPulseTone = 'neutral'): void {
    if (isReduced() || typeof element.animate !== 'function') return;
    const scale = tone === 'success' ? 1.025 : 1.015;
    element.animate([
      { transform: 'scale(1)' },
      { transform: `scale(${scale})`, offset: .45 },
      { transform: 'scale(1)' },
    ], { duration: 320, easing: 'cubic-bezier(.2,.9,.2,1)' });
  }

  const activeItem = (container: HTMLElement): HTMLElement | null => {
    const items = [...container.children].filter((item): item is HTMLElement => item instanceof HTMLElement && !item.classList.contains('wm-motion-indicator') && !item.hidden);
    return items.find((item) => item.matches('.active,[aria-current="page"],[aria-selected="true"],.selected[aria-pressed="true"]')) ?? null;
  };

  function updateIndicator(container: HTMLElement): void {
    const binding = indicatorBindings.get(container);
    if (!binding || !container.isConnected) return;
    if (!binding.indicator.isConnected || binding.indicator.parentElement !== container) {
      binding.mutation.disconnect();
      binding.resize?.disconnect();
      container.removeEventListener('scroll', binding.onScroll);
      indicatorBindings.delete(container);
      bindIndicator(container);
      return;
    }
    const item = activeItem(container);
    const indicator = binding.indicator;
    [...container.children].forEach((child) => {
      if (child instanceof HTMLElement && child !== indicator && !child.hidden) binding.resize?.observe(child);
    });
    if (!item) {
      indicator.style.opacity = '0';
      return;
    }
    const cr = container.getBoundingClientRect();
    const ir = item.getBoundingClientRect();
    const vertical = binding.mode === 'vertical';
    container.dataset.wmIndicatorMode = binding.mode;
    if (vertical) {
      indicator.style.setProperty('--wm-ind-x', '0px');
      indicator.style.setProperty('--wm-ind-y', `${Math.round(ir.top - cr.top + container.scrollTop)}px`);
      indicator.style.setProperty('--wm-ind-w', '3px');
      indicator.style.setProperty('--wm-ind-h', `${Math.round(ir.height)}px`);
    } else {
      indicator.style.setProperty('--wm-ind-x', `${Math.round(ir.left - cr.left + container.scrollLeft)}px`);
      indicator.style.setProperty('--wm-ind-y', `${Math.round(ir.bottom - cr.top + container.scrollTop - 3)}px`);
      indicator.style.setProperty('--wm-ind-w', `${Math.round(ir.width)}px`);
      indicator.style.setProperty('--wm-ind-h', '2px');
    }
    indicator.style.opacity = '1';
  }

  function bindIndicator(container: HTMLElement): void {
    const existing = indicatorBindings.get(container);
    if (existing?.indicator.isConnected && existing.indicator.parentElement === container) return;
    if (existing) {
      existing.mutation.disconnect();
      existing.resize?.disconnect();
      container.removeEventListener('scroll', existing.onScroll);
      indicatorBindings.delete(container);
    }
    const visibleItems = [...container.children].filter((element): element is HTMLElement => element instanceof HTMLElement && !element.hidden);
    if (visibleItems.length < 2) return;
    const style = getComputedStyle(container);
    const mode: MotionIndicatorMode = style.flexDirection === 'column' || container.matches('[data-shell-nav],.nav-list') ? 'vertical' : 'horizontal';
    const indicator = document.createElement('span');
    indicator.className = 'wm-motion-indicator';
    indicator.setAttribute('aria-hidden', 'true');
    container.prepend(indicator);
    container.classList.add('wm-motion-nav');

    const mutation = new MutationObserver(() => requestAnimationFrame(() => updateIndicator(container)));
    mutation.observe(container, { subtree: true, attributes: true, attributeFilter: ['class','aria-current','aria-selected','aria-pressed','hidden'] });
    const resize = 'ResizeObserver' in globalThis ? new ResizeObserver(() => updateIndicator(container)) : null;
    resize?.observe(container);
    visibleItems.forEach((item) => resize?.observe(item));
    const onScroll = (): void => updateIndicator(container);
    container.addEventListener('scroll', onScroll, { passive: true });
    indicatorBindings.set(container, { indicator, mutation, resize, onScroll, mode });
    requestAnimationFrame(() => updateIndicator(container));
  }

  const indicatorSelectors = [
    '[data-shell-nav]',
    'body[data-wm-surface="time-tracker"] .nav-tabs',
    'body[data-wm-surface="time-tracker"] .overview-record-tabs',
    'body[data-wm-surface="fueltrack"] .nav-list',
    'body[data-wm-surface="fueltrack"] .activity-view-tabs',
    'body[data-wm-surface="tradelink"] .nav-tabs',
    'body[data-wm-surface="tradelink"] .create-type-tabs',
    'body[data-wm-surface="tradelink"] .recovery-tabs',
    'body[data-wm-surface="shell"] .board-tabs',
    'body[data-wm-surface="shell"] .item-panel-tabs',
  ].join(',');

  function scanIndicators(scope: MotionScope = document): void {
    if (scope instanceof Element && scope.matches(indicatorSelectors) && scope instanceof HTMLElement) bindIndicator(scope);
    scope.querySelectorAll<HTMLElement>(indicatorSelectors).forEach(bindIndicator);
  }

  function refreshIndicators(scope: MotionScope = document): void {
    scanIndicators(scope);
    document.querySelectorAll<HTMLElement>('.wm-motion-nav').forEach(updateIndicator);
  }

  const overlaySelectors = '.wm-modal-backdrop,.command-backdrop,.modal-backdrop,.company-panel-backdrop,.sidebar-backdrop,.item-panel-scrim';
  const surfaceSelectors = '.wm-modal,.command-dialog,.modal,.company-panel,.item-panel,.context-menu,.context-menu-pop,.column-context-menu,.activity-more-popover,.modern-select-menu,.board-floating-menu';
  function tagMotionSurfaces(scope: MotionScope = document): void {
    const visit = (element: Element): void => {
      if (!(element instanceof HTMLElement)) return;
      if (element.matches(overlaySelectors)) element.dataset.wmMotionOverlay = '1';
      if (element.matches(surfaceSelectors)) element.dataset.wmMotionSurface = '1';
    };
    if (scope instanceof Element) visit(scope);
    scope.querySelectorAll(`${overlaySelectors},${surfaceSelectors}`).forEach(visit);
  }

  function enhance(scope: MotionScope = document): void {
    scanIndicators(scope);
    tagMotionSurfaces(scope);
  }

  const observer = new MutationObserver((records) => {
    let indicatorRefresh = false;
    for (const record of records) {
      if (record.type === 'attributes') {
        indicatorRefresh = true;
        continue;
      }
      for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue;
        enhance(node);
        indicatorRefresh = true;
      }
    }
    if (indicatorRefresh) requestAnimationFrame(() => refreshIndicators());
  });

  const start = (): void => {
    enhance(document);
    observer.observe(document.body, { childList: true, subtree: true });
    document.body.dataset.wmMotionOrchestrated = 'true';
    window.addEventListener('resize', () => refreshIndicators(), { passive: true });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();

  globalThis.WorkManagementMotion = Object.freeze({
    version: '1.30.0',
    reduced: isReduced,
    inputMode,
    exitThen,
    cancelTransitions,
    pulse,
    enhance,
    refreshIndicators,
    nextFrame,
    wait,
  } satisfies WorkManagementMotionApi);
}
