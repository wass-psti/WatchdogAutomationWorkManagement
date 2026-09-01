/* Work Management motion runtime v1.30.0 — shared across shell + embedded modules. */
declare global {
  var __WM_MOTION_RUNTIME__: boolean | undefined;
}

if (!globalThis.__WM_MOTION_RUNTIME__) {
  globalThis.__WM_MOTION_RUNTIME__ = true;

  const root = document.documentElement;
  const reducedQuery = matchMedia('(prefers-reduced-motion: reduce)');
  let reduced = reducedQuery.matches;
  root.dataset.wmMotion = reduced ? 'reduced' : 'full';

  const revealSelectors = [
    '.hero-panel','.module-card','.architecture-strip','.settings-card','.user-directory-card',
    '.board-card','.board-list-toolbar','.board-detail-head','.board-controls','.board-table-scroll','.kanban-column',
    '.clock-card','.side-panel','.report-card','.calendar-card','.overview-panel','.role-card','.ot-card','.evidence-card',
    '.panel','.card','.metric-card','.request-card','.analytics-panel','.queue-card','.lightfuel-card','.form-card','.activity-card',
    '.section-card','.create-commandbar','.create-workspace','.documents-commandbar','.documents-filter-panel','.template-card','.manual-card','.snapshot-card',
    '.recent-strip','.app-toolbar','.empty','.board-group','.activity-item','.rbac-user','.calendar-day','.form-section','.approval-card','.documents-table-wrap'
  ].join(',');

  const interactiveSelector = 'button,a,[role="button"],summary,.module-card,.board-card,.kanban-card';
  let pointerFrame = 0;
  let revealObserver: IntersectionObserver | null = null;

  const updateMotionMode = (): void => {
    reduced = reducedQuery.matches;
    root.dataset.wmMotion = reduced ? 'reduced' : 'full';
  };
  reducedQuery.addEventListener('change', updateMotionMode);

  const revealNow = (element: HTMLElement, delay = 0): void => {
    if (element.dataset.wmMotionBound === '1') return;
    element.dataset.wmMotionBound = '1';
    element.classList.add('wm-motion-reveal');
    element.style.setProperty('--wm-motion-delay', `${Math.min(delay, 180)}ms`);
    if (reduced) {
      element.classList.add('is-visible');
      return;
    }
    requestAnimationFrame(() => requestAnimationFrame(() => element.classList.add('is-visible')));
  };

  const observeReveal = (element: HTMLElement, delay = 0): void => {
    if (element.dataset.wmMotionBound === '1') return;
    if (!revealObserver || reduced) {
      revealNow(element, delay);
      return;
    }
    element.dataset.wmMotionBound = '1';
    element.classList.add('wm-motion-reveal');
    element.style.setProperty('--wm-motion-delay', `${Math.min(delay, 180)}ms`);
    revealObserver.observe(element);
  };

  if ('IntersectionObserver' in globalThis && !reduced) {
    revealObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-visible');
        revealObserver?.unobserve(entry.target);
      }
    }, { rootMargin: '60px 0px', threshold: 0.04 });
  }

  const scan = (scope: Document | Element): void => {
    const list: HTMLElement[] = [];
    if (scope instanceof HTMLElement && scope.matches(revealSelectors)) list.push(scope);
    scope.querySelectorAll<HTMLElement>(revealSelectors).forEach((element) => list.push(element));
    list
      .filter((element) => !element.closest('[data-wm-motion-static="true"]'))
      .forEach((element, index) => observeReveal(element, (index % 8) * 24));
  };

  const mutationObserver = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node instanceof Element) scan(node);
      }
    }
  });

  const start = (): void => {
    scan(document);
    mutationObserver.observe(document.body, { childList: true, subtree: true });
    document.body.dataset.wmMotionReady = 'true';
    globalThis.WorkManagementMotion?.enhance(document);
  };

  document.addEventListener('pointermove', (event) => {
    if (reduced || pointerFrame) return;
    pointerFrame = requestAnimationFrame(() => {
      pointerFrame = 0;
      root.style.setProperty('--motion-x', `${event.clientX}px`);
      root.style.setProperty('--motion-y', `${event.clientY}px`);
    });
  }, { passive: true });

  document.addEventListener('pointerdown', (event) => {
    if (reduced) return;
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>(interactiveSelector) : null;
    if (!target || target.matches(':disabled')) return;
    target.classList.remove('wm-motion-press');
    void target.offsetWidth;
    target.classList.add('wm-motion-press');
    window.setTimeout(() => target.classList.remove('wm-motion-press'), 360);
  }, { passive: true });

  document.addEventListener('animationend', (event) => {
    if (event.target instanceof HTMLElement && event.target.classList.contains('wm-motion-press')) {
      event.target.classList.remove('wm-motion-press');
    }
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
}

export {};
