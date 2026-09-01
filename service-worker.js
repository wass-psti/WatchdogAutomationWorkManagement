importScripts('./config/runtime-assets.js');

const CACHE = 'work-management-v1.43.2';
const CORE = Array.isArray(self.WM_RUNTIME_ASSETS) ? self.WM_RUNTIME_ASSETS : [];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(CORE)));
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('work-management-') && key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

const isEmbeddedModuleRequest = (url) => url.pathname.includes('/apps/');
const isBundledShellAsset = (url) => url.pathname.includes('/build/');
const isMutableSharedRuntime = (url) => [
  '/assets/js/runtime/motion-orchestrator.js',
  '/assets/js/runtime/motion-design.js',
  '/assets/js/runtime/module-bootstrap.js',
  '/assets/css/motion-design.css',
].some((suffix) => url.pathname.endsWith(suffix));

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  const request = event.request;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE);
          cache.put(request, response.clone()).catch(() => {});
        }
        return response;
      } catch {
        if (isEmbeddedModuleRequest(url)) return new Response('Active cloud connection required.', { status:503, headers:{'Content-Type':'text/plain'} });
        const exact = await caches.match(request);
        if (exact) return exact;
        return (await caches.match('./index.html')) || Response.error();
      }
    })());
    return;
  }

  // Embedded business applications deliberately remain network-authoritative in
  // this phase; their shared bootstrap/motion support files are handled below.
  if (isEmbeddedModuleRequest(url)) {
    event.respondWith(fetch(request, { cache: 'no-store' }).catch(() => new Response('Active cloud connection required.', { status:503, headers:{'Content-Type':'text/plain'} })));
    return;
  }

  // Hashed Vite output is immutable by filename, so cache-first is safe and avoids
  // repeated requests. Shared un-hashed compatibility runtimes remain network-first.
  if (isBundledShellAsset(url)) {
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response.ok) caches.open(CACHE).then((cache) => cache.put(request, response.clone())).catch(() => {});
      return response;
    })));
    return;
  }

  if (isMutableSharedRuntime(url)) {
    event.respondWith((async () => {
      try {
        const response = await fetch(request, { cache: 'no-store' });
        if (response.ok) {
          const cache = await caches.open(CACHE);
          cache.put(request, response.clone()).catch(() => {});
        }
        return response;
      } catch {
        return (await caches.match(request)) || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response.ok && ['script', 'style', 'image', 'font', 'manifest'].includes(request.destination)) {
        const cache = await caches.open(CACHE);
        cache.put(request, response.clone()).catch(() => {});
      }
      return response;
    } catch {
      return Response.error();
    }
  })());
});
