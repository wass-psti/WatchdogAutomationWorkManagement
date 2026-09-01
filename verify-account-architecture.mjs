import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = (f) => fs.readFileSync(new URL(f, import.meta.url), 'utf8');
const app = read('./assets/js/app.ts');
const auth = read('./assets/js/core/auth.ts');
const routeController = read('./assets/js/runtime/route-controller.ts');
const routePolicy = read('./assets/js/runtime/services/route-policy.ts');
const accountFeature = read('./assets/js/features/account/index.ts');
const bridge = read('./assets/js/core/module-identity-bridge.ts');
const host = read('./assets/js/runtime/module-host.ts');
const bootstrap = read('./assets/js/runtime/module-bootstrap.ts');
const backup = read('./assets/js/core/backup.ts');
const schema = read('./supabase/schema.sql');
const config = read('./config/backend-config.js');
const sw = read('./service-worker.js');
const cacheManifest = read('./config/runtime-assets.js');
assert.ok(config.includes('accountBased: true') && config.includes('enabled: true'), 'account mode must be mandatory by default');
assert.ok(routePolicy.includes("target:'login'") && routeController.includes('navigate(decision.target)') && routeController.includes('rememberReturnRoute') && app.includes("wm.platform.auth.return-to.v1"), 'protected routes must redirect through typed route policy/controller and preserve intended route');
assert.ok(auth.includes('scheduleRefresh()') && auth.includes('ensureValidSession'), 'session restoration and proactive refresh must exist');
assert.ok(auth.includes("BroadcastChannel") && auth.includes("signed-out"), 'cross-tab auth synchronization must exist');
assert.ok(auth.includes("scope === 'global'") && accountFeature.includes('signout-all'), 'global secure session termination must exist');
assert.ok(auth.includes('updateProfile') && auth.includes('updatePassword'), 'account profile and password management must exist');
assert.ok(schema.includes('update_own_profile') && schema.includes('enable row level security'), 'self-service profile RPC and RLS must exist');
assert.ok(bridge.includes('wm:identity:request') && !bridge.includes('localStorage'), 'identity bridge must obtain sanitized identity from the authenticated parent without local persistence');
assert.ok(read('./assets/js/core/module-cloud-store.ts').includes('WMModuleStore'), 'modules must use the authenticated cloud state adapter');
assert.ok(
  app.includes('moduleHost.publishIdentity()')
    && host.includes('frame.contentWindow.postMessage(message, targetOrigin())')
    && host.includes("event.origin !== origin || event.source !== frame.contentWindow"),
  'module host must refresh module identity context on iframe load while preserving strict inbound origin/source validation'
);
assert.ok(backup.includes("!key.startsWith('wm.platform.identity.')"), 'derived identity context must be excluded from backups');
assert.ok(cacheManifest.includes('module-identity-bridge.ts'), 'identity bridge must be cached with the shell');
for (const file of ['./apps/time-tracker/index.html','./apps/fueltrack-plus/runtime.html','./apps/tradelink/runtime.html']) {
  const html = read(file);
  assert.ok(html.includes('module-bootstrap.ts') && html.includes('startEmbeddedModule'), `${file} must enforce authenticated cloud module boot`);
}
console.log('Authenticated account architecture verification: PASS');
