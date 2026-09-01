import fs from 'node:fs';
import assert from 'node:assert/strict';
import { applicationManifest } from './config/application-manifest.ts';
import { createFeatureRegistry } from './assets/js/runtime/feature-registry.ts';
import { createRouteController } from './assets/js/runtime/route-controller.ts';
import { createRoutePolicyService } from './assets/js/runtime/services/route-policy.ts';
import { defaultColumnName, startingColumns } from './assets/js/features/boards/board-schema.ts';

const read = (path) => fs.readFileSync(path, 'utf8');
const app = read('assets/js/app.ts');
const runtime = read('assets/js/runtime/index.ts');
const lifecycle = read('assets/js/runtime/application-lifecycle.ts');
const routeSource = read('assets/js/runtime/route-controller.ts');
const routePolicySource = read('assets/js/runtime/services/route-policy.ts');
const registrySource = read('assets/js/runtime/feature-registry.ts');
const boardFacade = read('assets/js/features/boards/index.ts');
const boardController = read('assets/js/features/boards/boards-controller.ts');
const boardState = read('assets/js/features/boards/board-state.ts');
const boardUi = read('assets/js/boards-ui.ts');
const cache = read('config/runtime-assets.js');
const platform = read('assets/js/core/platform.ts');
const sw = read('service-worker.js');

assert.ok(platform.includes("PLATFORM_VERSION = '1.43.2'"), 'platform version mismatch');
assert.ok(sw.includes('work-management-v1.43.2'), 'service-worker cache version mismatch');
assert.ok(applicationManifest.architectureVersion >= 3, 'architecture version must retain phase-two contracts');

for (const token of ['createFeatureRegistry', 'createRouteController', 'installApplicationLifecycle']) {
  assert.ok(runtime.includes(token), `runtime gateway missing ${token}`);
  assert.ok(app.includes(token), `shell missing ${token}`);
}
assert.ok(routeSource.includes('transitionOwnership(route)') && routeSource.includes('navigate(decision.target)') && routePolicySource.includes("target:'login'"), 'central route policy incomplete');
assert.ok(registrySource.includes('ownerForRoute') && registrySource.includes('Feature id is required'), 'feature registry safeguards incomplete');
assert.ok(lifecycle.includes('removeEventListener') && lifecycle.includes('dispose()'), 'application lifecycle is not disposable');
assert.ok(app.includes("runtimeClient.register('features'"), 'feature registry is not exposed through runtime service contract');

for (const asset of [
  'assets/js/runtime/feature-registry.ts',
  'assets/js/runtime/route-controller.ts',
  'assets/js/runtime/application-lifecycle.ts',
  'assets/js/features/boards/boards-controller.ts',
  'assets/js/features/boards/board-schema.ts',
  'assets/js/features/boards/board-state.ts',
]) assert.ok(cache.includes(asset), `cache manifest missing ${asset}`);

assert.ok(boardFacade.includes('createBoardsController') && boardController.includes('createService(auth)'), 'Boards controller/service boundary missing');
assert.ok(boardUi.includes('service = null') && boardUi.includes('Board domain service is required'), 'Boards view must require an injected domain service');
assert.ok(boardState.includes('createBoardViewState') && boardState.includes('resetItemPanel'), 'Boards state boundary incomplete');
assert.ok(
  boardUi.includes('function deactivate()')
    && boardUi.includes('dataController.cancelPending()')
    && boardUi.includes('preferencePersistence.cancel()')
    && boardUi.includes('dragDrop.dispose()')
    && boardUi.includes('itemWorkspace.reset()')
    && boardUi.includes('columnWorkflows.reset()')
    && boardUi.includes('dialogs.closeAll()'),
  'Boards lifecycle cleanup incomplete'
);

assert.equal(defaultColumnName('text', []), 'New Text');
assert.equal(defaultColumnName('text', ['New Text']), 'New Text 2');
assert.deepEqual(startingColumns(['text', 'text']).map((column) => column.name), ['New Text', 'New Text 2']);

// Route controller behavior: ownership transitions call lifecycle hooks once and auth gating stays centralized.
const manifest = {
  routes: [
    { id: 'home', owner: 'shell' },
    { id: 'boards', owner: 'boards' },
    { id: 'login', owner: 'auth' },
    { id: 'not-found', owner: 'shell' },
  ],
  features: [
    { id: 'shell', state: 'active', boundary: 'shell' },
    { id: 'boards', state: 'active', boundary: 'boards' },
    { id: 'auth', state: 'active', boundary: 'auth' },
  ],
};
const registry = createFeatureRegistry(manifest);
let boardActivations = 0;
let boardDeactivations = 0;
registry.register('shell', {});
registry.register('auth', {});
registry.register('boards', { activate(){ boardActivations += 1; }, deactivate(){ boardDeactivations += 1; } });
assert.equal(registry.validate().valid, true);

let route = { name: 'boards' };
let navigated = null;
let remembered = false;
let rendered = '';
const auth = { state: { initialized: true, status: 'active' }, isAuthenticated: true };
const controller = createRouteController({
  auth,
  parseRoute: () => route,
  navigate: (path) => { navigated = path; },
  runtimeClient: { setContext(){} },
  featureRegistry: registry,
  moduleHost: { detach(){} },
  deactivateModule() {},
  rememberReturnRoute() { remembered = true; },
  routePolicy: createRoutePolicyService(),
  renderers: {
    boards: () => { rendered = 'boards'; },
    home: () => { rendered = 'home'; },
    login: () => { rendered = 'login'; },
    disabled: () => { rendered = 'disabled'; },
    'not-found': () => { rendered = 'not-found'; },
  },
});
controller.render();
assert.equal(rendered, 'boards');
assert.equal(boardActivations, 1);
route = { name: 'home' };
controller.render();
assert.equal(rendered, 'home');
assert.equal(boardDeactivations, 1);
auth.isAuthenticated = false;
route = { name: 'boards' };
controller.render();
assert.equal(navigated, 'login');
assert.equal(remembered, true);

assert.ok(fs.existsSync('docs/architecture/PHASE-2.md'), 'phase-two architecture documentation missing');
assert.equal(fs.existsSync('supabase/migrations/v1.23.0-architecture.sql'), false, 'architecture-only release must not invent a database migration');

console.log('v1.23.0 architecture phase-two verification: PASS');
