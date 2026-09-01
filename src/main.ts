import '../assets/css/foundation/tokens.css';
import '../assets/css/foundation/themes.css';
import '../assets/css/foundation/primitives.css';
import '../assets/css/app.css';
import '../assets/css/foundation/components.css';
import '../assets/css/foundation/application-migration.css';
import '../assets/css/motion-design.css';

// Keep the existing checked-in public-client configuration as the compatibility
// baseline, then allow Vite mode/environment values to override it at build/dev time.
import '../config/backend-config.js';
import { applyViteRuntimeConfig } from '../config/vite-runtime-config.ts';
import type { VitePublicRuntimeEnv } from '../config/vite-runtime-config.ts';

// These runtimes intentionally remain side-effect modules because the embedded
// applications share the same global motion contracts.
import '../assets/js/runtime/motion-orchestrator.ts';
import '../assets/js/runtime/motion-design.ts';

type ViteRuntimeEnv = VitePublicRuntimeEnv & Readonly<{ PROD?: boolean; DEV?: boolean; MODE?: string; BASE_URL?: string }>;
const viteEnv = (import.meta as ImportMeta & { readonly env: ViteRuntimeEnv }).env;
applyViteRuntimeConfig(viteEnv);

// A deployment can invalidate an older hashed async chunk while a long-lived tab
// still has the previous HTML in memory. Vite emits `vite:preloadError` for this
// condition. Recover once by reloading the document, then clear the guard after a
// successful shell import so a genuine application error can never form a loop.
const preloadRecoveryKey = 'wm:vite-preload-recovery:1.43.2';
if (viteEnv.PROD) {
  addEventListener('vite:preloadError', (event) => {
    event.preventDefault();
    try {
      if (sessionStorage.getItem(preloadRecoveryKey) === '1') return;
      sessionStorage.setItem(preloadRecoveryKey, '1');
    } catch {}
    location.reload();
  });
}

// The application shell is a separate async entry. This gives Vite a stable
// bootstrap boundary today and a route-level lazy-loading seam for the future
// TypeScript/module migration without changing current application behavior.
await import('../assets/js/app.ts');
try { sessionStorage.removeItem(preloadRecoveryKey); } catch {}
