import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const pass = (message) => console.log(`PASS ${message}`);

const migrated = [
  'assets/js/runtime/platform-services.ts',
  'assets/js/runtime/route-controller.ts',
  'assets/js/runtime/services/route-policy.ts',
  'assets/js/platform/observability/diagnostics.ts',
  'assets/js/features/boards/boards-controller.ts',
  'assets/js/features/boards/controllers/history-controller.ts',
  'assets/js/features/boards/services/board-domain-service.ts',
  'assets/js/core/boards.ts',
];
for (const path of migrated) assert.equal(existsSync(new URL(path, import.meta.url)), true, `${path} must exist`);
assert.equal(existsSync(new URL('assets/js/runtime/platform-services.d.ts', import.meta.url)), false, 'platform-services.d.ts must be removed');
pass('platform-services declaration shim is removed and orchestration runtimes are TypeScript-owned');

for (const path of migrated) {
  const source = read(path);
  assert.equal(/@ts-ignore|@ts-nocheck|\bas\s+unknown\s+as\b|:\s*any\b|<any>/.test(source), false, `${path} contains unsafe migration escape`);
}
pass('migrated orchestration layers avoid broad unsafe TypeScript escapes');

const { createPlatformServices } = await import('./assets/js/runtime/platform-services.ts');
const fakeAuth = {
  isAuthenticated: true,
  user: { id: 'user-1' },
  backend: { supabaseUrl: 'https://example.supabase.co', publishableKey: 'public-key' },
  async ensureAccessToken() { return 'token'; },
  headers(token, extra = {}) { return { apikey: this.backend.publishableKey, Authorization: `Bearer ${token}`, ...extra }; },
  async request() { return []; },
};
const platform = createPlatformServices({ auth: fakeAuth, queryStaleTime: 1234, diagnosticLimit: 32 });
assert.equal(platform.auth, fakeAuth);
assert.equal(platform.boards.repository.queryClient, platform.serverState);
assert.equal(platform.boards.service.queryClient, platform.serverState);
assert.equal(platform.manifest.value.version, '1.43.2');
assert.equal(platform.manifest.validate().valid, true);
assert.equal(typeof platform.authorization.hasPlatformCapability, 'function');
assert.equal(typeof platform.errors.normalize, 'function');
pass('composition root constructs one typed query singleton and wires transport → repository → Board domain service');

const { createRoutePolicyService } = await import('./assets/js/runtime/services/route-policy.ts');
const routePolicy = createRoutePolicyService();
assert.deepEqual(routePolicy.decide({ route: { name: 'boards' }, initialized: false, status: 'initializing', authenticated: false }), { kind: 'wait' });
assert.deepEqual(routePolicy.decide({ route: { name: 'boards' }, initialized: true, status: 'anonymous', authenticated: false }), { kind: 'redirect', target: 'login', rememberReturnRoute: true });
assert.deepEqual(routePolicy.decide({ route: { name: 'login' }, initialized: true, status: 'authenticated', authenticated: true }), { kind: 'redirect', target: '', rememberReturnRoute: false });
assert.deepEqual(routePolicy.decide({ route: { name: 'account' }, initialized: true, status: 'disabled', authenticated: true }), { kind: 'render-disabled' });
pass('route policy models initialization, authentication redirects and disabled accounts without renderer coupling');

const { createRouteController } = await import('./assets/js/runtime/route-controller.ts');
let currentRoute = { name: 'boards' };
const redirects = [];
const lifecycle = [];
const rendered = [];
const featureRegistry = {
  ownerForRoute(name) { return name === 'boards' || name === 'board' ? 'boards' : 'shell'; },
  get(id) { return { implementation: { activate: ({ to }) => lifecycle.push(`activate:${id}:${to.name}`), deactivate: ({ from }) => lifecycle.push(`deactivate:${id}:${from?.name ?? 'none'}`) } }; },
};
const routeController = createRouteController({
  auth: { isAuthenticated: true, state: { initialized: true, status: 'authenticated' } },
  parseRoute: () => currentRoute,
  navigate: (path) => { redirects.push(path); },
  runtimeClient: { setContext() {} },
  featureRegistry,
  moduleHost: { detach() {} },
  routePolicy,
  renderers: { boards: (route) => rendered.push(route.name), home: (route) => rendered.push(route.name), 'not-found': (route) => rendered.push(route.name) },
});
assert.equal(routeController.render(), true);
assert.deepEqual(rendered, ['boards']);
currentRoute = { name: 'home' };
assert.equal(routeController.render(), true);
assert.deepEqual(rendered, ['boards', 'home']);
assert.deepEqual(lifecycle, ['activate:boards:boards', 'deactivate:boards:boards', 'activate:shell:home']);
assert.deepEqual(redirects, []);
routeController.dispose();
pass('route controller preserves route ownership transitions behind the typed policy boundary');

const { createBoardsController } = await import('./assets/js/features/boards/boards-controller.ts');
const injectedService = platform.boards.service;
let viewService = null;
const boardsController = createBoardsController({
  auth: fakeAuth,
  createService: () => injectedService,
  createCommands: () => platform.boards.commands,
  viewOptions: {
    auth: fakeAuth,
    renderWorkspace() {},
    topbar() { return ''; },
    toast() {},
    navigate() {},
    icons: {},
  },
  createView(options) {
    viewService = options.service;
    return { renderBoards() {}, renderBoard() {} };
  },
});
assert.equal(boardsController.service, injectedService);
assert.equal(viewService, injectedService);
assert.equal(boardsController.commands, platform.boards.commands);
pass('Boards controller consumes an injected domain service instead of constructing repository/transport dependencies');

const { createBoardHistoryController } = await import('./assets/js/features/boards/controllers/history-controller.ts');
const messages = [];
const history = createBoardHistoryController({ toast: (message, tone) => messages.push([message, tone]) });
let value = 1;
history.push({ label: 'value change', undo: () => { value = 0; }, redo: () => { value = 1; } });
assert.equal(await history.undo(), true);
assert.equal(value, 0);
assert.equal(await history.redo(), true);
assert.equal(value, 1);
history.push({ label: 'failure', undo: () => { throw new Error('persistence failed'); }, redo: () => undefined });
assert.equal(await history.undo(), false);
assert.equal(messages.at(-1)?.[1], 'warning');
assert.match(messages.at(-1)?.[0] ?? '', /persistence failed/);
pass('typed Board history controller preserves undo/redo behavior and uses normalized error handling');

const featureIndex = read('assets/js/features/boards/index.ts');
const appSource = read('assets/js/app.ts');
assert.match(appSource, /createPlatformServices\(\{ auth \}\)/);
assert.match(appSource, /service:platformServices\.boards\.service/);
assert.match(appSource, /routePolicy: platformServices\.routing/);
assert.match(featureIndex, /injectedService = options\.service/);
pass('application runtime consumes the authoritative composition root without duplicate Board service construction');

const renderCoupledControllers = [
  'activity-workflows.ts','board-menu-controller.ts','column-resize-controller.ts','column-workflows.ts','dialog-controller.ts','drag-drop-controller.ts','group-workflows.ts','inline-edit-controller.ts','item-panel-renderer.ts','item-workflows.ts','item-workspace-controller.ts','member-workflows.ts','overlay-coordinator.ts','selection-controller.ts','structure-drag-controller.ts',
];
for (const file of renderCoupledControllers) assert.equal(existsSync(new URL(`assets/js/features/boards/controllers/${file}`, import.meta.url)), true);
pass('rendering/DOM-coupled Board controllers are TypeScript-authoritative after the controlled UI migration');


const boardsControllerSource = read('assets/js/features/boards/boards-controller.ts');
const boardServiceSource = read('assets/js/features/boards/services/board-domain-service.ts');
const boardRepositorySource = read('assets/js/features/boards/data/board-repository.ts');
const rawBoardViewSource = read('assets/js/boards-ui.ts');
assert.doesNotMatch(boardsControllerSource, /board-repository|backend-client|createBackendClient/);
assert.doesNotMatch(boardServiceSource, /controllers\/|boards-ui|document\.|HTMLElement|window\./);
assert.doesNotMatch(boardRepositorySource, /controllers\/|boards-controller|boards-ui/);
assert.doesNotMatch(rawBoardViewSource, /import \{ createBoardService \}/);
assert.match(rawBoardViewSource, /Board domain service is required/);
pass('dependency direction remains UI → controllers → domain service → repository → transport');

const declarationFiles = [];
const scanDeclarations = (relative) => {
  for (const entry of readdirSync(new URL(relative, import.meta.url), { withFileTypes: true })) {
    const child = `${relative}/${entry.name}`;
    if (entry.isDirectory()) scanDeclarations(child);
    else if (entry.name.endsWith('.d.ts')) declarationFiles.push(child);
  }
};
for (const root of ['src', 'assets/js', 'config']) scanDeclarations(root);
assert.deepEqual(declarationFiles, []);
pass('no temporary project declaration shims remain after composition-root migration');

console.log('v1.43.2 TypeScript composition/controller/domain-service verification: PASS');
