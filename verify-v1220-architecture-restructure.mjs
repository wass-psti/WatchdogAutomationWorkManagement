import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (path) => fs.readFileSync(path, 'utf8');
const app = read('assets/js/app.ts');
const runtime = read('assets/js/runtime/index.ts');
const clientSource = read('assets/js/runtime/work-management-client.ts');
const host = read('assets/js/runtime/module-host.ts');
const bootstrap = read('assets/js/runtime/module-bootstrap.ts');
const manifestSource = read('config/application-manifest.ts');
const cacheManifest = read('config/runtime-assets.js');
const sw = read('service-worker.js');
const index = read('index.html');
const viteEntry = read('src/main.ts');
const tokens = read('assets/css/foundation/tokens.css');
const themes = read('assets/css/foundation/themes.css');
const primitives = read('assets/css/foundation/primitives.css');
const css = read('assets/css/app.css');

assert.ok(app.includes("from './runtime/index.ts'"), 'Shell must use the runtime dependency gateway');
assert.ok(!/from '\.\/core\/(?:auth|platform)\.(?:js|ts)'/.test(app), 'Shell must not bypass the runtime gateway for core imports');
assert.ok(runtime.includes("features/auth/index.ts") && runtime.includes("features/boards/index.ts") && runtime.includes("features/modules/index.ts"), 'Runtime gateway must expose feature boundaries');
assert.ok(clientSource.includes("const listen: WorkManagementClient['listen']") && clientSource.includes("get(operation") && clientSource.includes("set(operation") && clientSource.includes("execute(operation"), 'SDK-style runtime contract is incomplete');
assert.ok(!clientSource.includes('reportTime(') && !clientSource.includes('track(') && !clientSource.includes('setInterval('), 'Runtime client must not introduce telemetry/background tracking');
assert.ok(host.includes("event.origin !== origin") && host.includes("event.source !== frame.contentWindow"), 'Module-host message boundary must verify origin and source');
assert.ok(bootstrap.includes('installModuleIdentityBridge') && bootstrap.includes('cloud.store.ready()') && bootstrap.includes('import(resolveUrl(config.entry))'), 'Shared module bootstrap must enforce identity/cloud readiness before loading entry modules');
for (const file of ['apps/time-tracker/index.html','apps/fueltrack-plus/runtime.html','apps/tradelink/runtime.html']) {
  const html = read(file);
  assert.ok(html.includes('assets/js/runtime/module-bootstrap.ts') && html.includes('startEmbeddedModule'), `${file} is not on the shared module bootstrap`);
}
const tokenIndex=viteEntry.indexOf('foundation/tokens.css'), themeIndex=viteEntry.indexOf('foundation/themes.css'), primitiveIndex=viteEntry.indexOf('foundation/primitives.css'), appCssIndex=viteEntry.indexOf("../assets/css/app.css");
assert.ok(index.includes('/src/main.ts') && tokenIndex>=0 && tokenIndex<themeIndex && themeIndex<primitiveIndex && primitiveIndex<appCssIndex, 'Vite entry must load foundation stylesheets in semantic order');
assert.ok(tokens.includes('--wm-motion-normal:') && tokens.includes('--wm-space-200:') && tokens.includes('--wm-radius-300:'), 'Core design tokens missing');
assert.ok(themes.includes('--wm-color-canvas:') && themes.includes(':root[data-theme="dark"]'), 'Semantic theme layer missing');
assert.ok(primitives.includes('.wm-stack') && primitives.includes('.wm-surface'), 'Foundation primitives missing');
assert.ok(css.includes('v1.22.0 — semantic design-token bridge') && css.includes('--bg: var(--wm-color-canvas)'), 'Legacy style compatibility bridge missing');
assert.ok(manifestSource.includes("version: '1.43.2'") && manifestSource.includes('architectureVersion: 15') && manifestSource.includes("id: 'boards'"), 'Application manifest incomplete');
assert.ok(sw.startsWith("importScripts('./config/runtime-assets.js');") && sw.includes("work-management-v1.43.2"), 'Service worker must consume the centralized cache manifest');
for (const asset of ['assets/js/runtime/index.ts','assets/js/runtime/module-bootstrap.ts','assets/css/foundation/tokens.css','config/application-manifest.ts']) assert.ok(cacheManifest.includes(asset), `Central cache manifest missing ${asset}`);
for (const doc of ['docs/architecture/ARCHITECTURE.md','docs/architecture/FEATURE-INVENTORY.md','docs/architecture/DATA-CONTRACTS.md','docs/architecture/RESTRUCTURE-CHECKLIST.md','THIRD_PARTY_NOTICES.md']) assert.ok(fs.existsSync(doc), `Missing architecture documentation: ${doc}`);

const { createWorkManagementClient } = await import('./assets/js/runtime/work-management-client.ts');
const sdk = createWorkManagementClient({ context: { test: true } });
let eventSeen = false;
const unsubscribe = sdk.listen('runtime:response', () => { eventSeen = true; });
sdk.register('math', { add: ({ a, b }) => a + b });
assert.equal(await sdk.execute('math.add', { a: 2, b: 3 }), 5, 'Runtime service invocation failed');
assert.equal(eventSeen, true, 'Runtime event delivery failed');
unsubscribe();
assert.equal(sdk.hasService('math'), true, 'Runtime service registry failed');

const { applicationManifest, validateApplicationManifest } = await import('./config/application-manifest.ts');
const validation = validateApplicationManifest(applicationManifest);
assert.equal(validation.valid, true, validation.errors.join('; '));
assert.equal(applicationManifest.modules.length, 3, 'Registered module inventory changed unexpectedly');

console.log('v1.22.0 architecture restructuring verification: PASS');
