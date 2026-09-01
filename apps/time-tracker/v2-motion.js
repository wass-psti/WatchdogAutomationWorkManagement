(() => {
  'use strict';

  if (globalThis.__TIMETRACKER_V2_MOTION__) return;
  globalThis.__TIMETRACKER_V2_MOTION__ = true;

  const root = document.documentElement;
  const reducedQuery = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
  const coarseQuery = globalThis.matchMedia?.('(pointer: coarse)');
  let pointerFrame = 0;
  let scrollFrame = 0;
  let pointerX = 0;
  let pointerY = 0;
  let pageVisible = !document.hidden;

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const motionEnabled = () => pageVisible && !(reducedQuery?.matches || coarseQuery?.matches);

  function publishMode() {
    const enabled = motionEnabled();
    root.dataset.ttV2Motion = enabled ? 'full' : 'reduced';
    if (!enabled) {
      root.style.setProperty('--tt-v2-pointer-x', '0');
      root.style.setProperty('--tt-v2-pointer-y', '0');
      root.style.setProperty('--tt-v2-scroll', '0');
    }
  }

  function commitPointer() {
    pointerFrame = 0;
    if (!motionEnabled()) return;
    root.style.setProperty('--tt-v2-pointer-x', pointerX.toFixed(4));
    root.style.setProperty('--tt-v2-pointer-y', pointerY.toFixed(4));
  }

  function onPointerMove(event) {
    if (!motionEnabled()) return;
    pointerX = clamp((event.clientX / Math.max(1, innerWidth) - 0.5) * 2, -1, 1);
    pointerY = clamp((event.clientY / Math.max(1, innerHeight) - 0.5) * 2, -1, 1);
    if (!pointerFrame) pointerFrame = requestAnimationFrame(commitPointer);
  }

  function commitScroll() {
    scrollFrame = 0;
    if (!motionEnabled()) return;
    const maxTravel = Math.max(1, Math.min(900, document.documentElement.scrollHeight - innerHeight));
    const progress = clamp(scrollY / maxTravel, 0, 1);
    root.style.setProperty('--tt-v2-scroll', progress.toFixed(4));
  }

  function onScroll() {
    if (!scrollFrame) scrollFrame = requestAnimationFrame(commitScroll);
  }

  const revealObserver = 'IntersectionObserver' in globalThis
    ? new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add('is-inview');
          revealObserver.unobserve(entry.target);
        }
      }, { rootMargin: '72px 0px', threshold: 0.04 })
    : null;

  function enhance(scope = document) {
    const nodes = [];
    if (scope instanceof Element && scope.matches('.tt-v2-reveal')) nodes.push(scope);
    scope.querySelectorAll?.('.tt-v2-reveal').forEach((node) => nodes.push(node));
    for (const [index, node] of nodes.entries()) {
      if (node.dataset.ttV2RevealBound === '1') continue;
      node.dataset.ttV2RevealBound = '1';
      node.style.setProperty('--tt-v2-reveal-order', String(Math.min(index, 8)));
      if (reducedQuery?.matches || !revealObserver) node.classList.add('is-inview');
      else revealObserver.observe(node);
    }
  }

  const mutationObserver = new MutationObserver((entries) => {
    for (const entry of entries) {
      for (const node of entry.addedNodes) {
        if (node instanceof Element) enhance(node);
      }
    }
  });

  function start() {
    publishMode();
    enhance(document);
    mutationObserver.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    reducedQuery?.addEventListener('change', publishMode);
    coarseQuery?.addEventListener('change', publishMode);
    document.addEventListener('visibilitychange', () => {
      pageVisible = !document.hidden;
      publishMode();
      if (pageVisible) commitScroll();
    }, { passive: true });
    commitScroll();
    document.body.dataset.ttV2MotionReady = 'true';
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();

  globalThis.TimeTrackerV2Motion = Object.freeze({
    version: '2.0.0-pass2',
    enhance,
    reduced: () => reducedQuery?.matches === true,
  });
})();
