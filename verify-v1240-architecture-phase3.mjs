import fs from 'node:fs';
import assert from 'node:assert/strict';
import { applicationManifest, validateApplicationManifest } from './config/application-manifest.ts';
import { createFeatureRegistry } from './assets/js/runtime/feature-registry.ts';
import { renderBoardListState } from './assets/js/features/boards/views/board-list-view.ts';
import { renderItemWorkspace } from './assets/js/features/boards/views/item-workspace-view.ts';

const read = (path) => fs.readFileSync(path, 'utf8');
const app = read('assets/js/app.ts');
const runtime = read('assets/js/runtime/index.ts');
const account = read('assets/js/features/account/index.ts');
const users = read('assets/js/features/user-management/index.ts');
const authFacade = read('assets/js/features/auth/index.ts');
const boardUi = read('assets/js/boards-ui.ts');
const boardList = read('assets/js/features/boards/views/board-list-view.ts');
const itemWorkspace = read('assets/js/features/boards/views/item-workspace-view.ts');
const cache = read('config/runtime-assets.js');
const platform = read('assets/js/core/platform.ts');
const sw = read('service-worker.js');
const checklist = read('docs/architecture/RESTRUCTURE-CHECKLIST.md');

assert.ok(platform.includes("PLATFORM_VERSION = '1.43.2'"), 'platform version mismatch');
assert.ok(sw.includes('work-management-v1.43.2'), 'service-worker cache mismatch');
assert.ok(applicationManifest.architectureVersion >= 4, 'architecture version must preserve the phase-three boundary');
assert.equal(validateApplicationManifest(applicationManifest).valid, true, 'application manifest must validate');
assert.equal(applicationManifest.routes.find((route) => route.id === 'account')?.owner, 'account', 'Account route must have its own feature owner');
assert.equal(applicationManifest.routes.find((route) => route.id === 'users')?.owner, 'user-management', 'Users route ownership mismatch');
assert.ok(applicationManifest.features.some((feature) => feature.id === 'account' && feature.boundary.includes('/account/')), 'Account feature declaration missing');
assert.ok(applicationManifest.features.some((feature) => feature.id === 'user-management' && feature.boundary.includes('/user-management/')), 'User Management feature declaration missing');

for (const token of ['createAccountFeature', 'createUserManagementFeature']) {
  assert.ok(runtime.includes(token), `runtime gateway missing ${token}`);
  assert.ok(app.includes(token), `shell missing ${token}`);
}
assert.ok(app.includes("featureRegistry.register('account', accountFeature"), 'Account runtime registration missing');
assert.ok(app.includes("featureRegistry.register('user-management', userManagementFeature"), 'User Management runtime registration missing');
assert.ok(app.includes('await accountFeature.handleAction(action)'), 'Account action delegation missing');
assert.ok(app.includes('await accountFeature.handleSubmit(accountForm)'), 'Account form delegation missing');
assert.ok(app.includes('await userManagementFeature.handleSubmit(userAccessForm)'), 'User mutation delegation missing');
assert.ok(app.includes('userManagementFeature.handleInput(event.target)'), 'User search delegation missing');
for (const removed of ['let accountBusy', 'let userDirectory =', 'function renderAccount()', 'function renderUsers()', 'async function loadUserDirectory']) {
  assert.equal(app.includes(removed), false, `shell still owns extracted state/logic: ${removed}`);
}

assert.ok(account.includes('function activate()') && account.includes('function deactivate()') && account.includes('epoch += 1'), 'Account lifecycle boundary incomplete');
assert.ok(account.includes('auth.updateProfile') && account.includes('auth.updatePassword'), 'Account mutations missing');
assert.ok(account.includes("scope: kind === 'signout-all' ? 'global' : 'local'"), 'Account session termination behavior missing');
assert.ok(account.includes('auth.reloadAccessContext'), 'Account access refresh missing');
assert.ok(users.includes('auth.listUsers()') && users.includes('auth.updateUserAccess'), 'User directory service integration missing');
assert.ok(users.includes('ticket !== epoch') && users.includes('function deactivate()'), 'User directory stale-response protection missing');
assert.ok(users.includes("input.id !== 'userDirectorySearch'") && users.includes('input instanceof HTMLInputElement'), 'User directory search controller missing');
assert.ok(authFacade.includes("owns: Object.freeze(['login', 'register', 'verify'])"), 'Auth facade still claims Account/User Management routes');

assert.ok(boardUi.includes("from './features/boards/views/board-list-view.ts'"), 'Board List view extraction not wired');
assert.ok(boardUi.includes("from './features/boards/views/item-workspace-view.ts'"), 'Item Workspace view extraction not wired');
assert.ok(boardUi.includes('renderBoardListState({ state'), 'Board List view delegation missing');
assert.ok(boardUi.includes('renderItemWorkspace({ state'), 'Item Workspace delegation missing');
assert.ok(boardList.includes('renderBoardCard') && boardList.includes('renderBoardToolbar'), 'Board List view surface incomplete');
assert.ok(itemWorkspace.includes("tabButton('updates'") && itemWorkspace.includes("tabButton('files'") && itemWorkspace.includes("tabButton('activity'") && itemWorkspace.includes('data-item-file-input'), 'Item Workspace view surface incomplete');

for (const asset of [
  'assets/js/features/account/index.ts',
  'assets/js/features/user-management/index.ts',
  'assets/js/features/boards/views/board-list-view.ts',
  'assets/js/features/boards/views/item-workspace-view.ts',
]) assert.ok(cache.includes(asset), `cache manifest missing ${asset}`);

// Pure Board List rendering remains independently testable without a DOM.
const listMarkup = renderBoardListState({
  state: { loading: false, error: '', search: '', status: 'active', boards: [{ id: 'b1', name: 'Delivery', description: 'Ops', member_role: 'owner', item_count: 2, status: 'active', updated_at: '2026-08-27T00:00:00Z' }] },
  escapeHtml: (value) => String(value),
  formatDate: () => 'today',
});
assert.ok(listMarkup.includes('data-board-id="b1"') && listMarkup.includes('data-status="archived"'), 'Board List pure renderer lost card/action behavior');

const workspaceMarkup = renderItemWorkspace({
  state: {
    board: { columns: [], groups: [{ id: 'g1', title: 'Main' }], items: [{ id: 'i1', group_id: 'g1', title: 'Task', status: 'working', due_date: '2026-08-28', archived_at: null }] },
    itemPanel: { itemId: 'i1', tab: 'updates', loading: false, error: '', uploading: false, data: { updates: [], files: [], activity: [] } },
  },
  canEdit: () => true,
  escapeHtml: (value) => String(value ?? ''),
  formatDate: () => 'now',
  formatDay: () => 'Aug 28, 2026',
});
assert.ok(workspaceMarkup.includes('data-item-update-form') && workspaceMarkup.includes('data-item-panel-tab="files"'), 'Item Workspace pure renderer lost collaboration tabs');

// Manifest validator must catch route/feature ownership drift.
const invalid = {
  ...applicationManifest,
  routes: [...applicationManifest.routes, { id: 'broken-route', pattern: '#/broken', owner: 'missing-feature' }],
};
assert.equal(validateApplicationManifest(invalid).valid, false, 'manifest validator must reject undeclared route owners');

const registry = createFeatureRegistry(applicationManifest);
for (const feature of applicationManifest.features) registry.register(feature.id, {});
assert.equal(registry.validate().valid, true, 'runtime feature inventory must remain complete');
assert.equal(registry.ownerForRoute('account'), 'account');
assert.equal(registry.ownerForRoute('users'), 'user-management');

assert.ok(checklist.includes('[x] Extract account/user-management controllers from the shell.'), 'restructure checklist not updated');
assert.ok(fs.existsSync('docs/architecture/PHASE-3.md'), 'phase-three architecture documentation missing');
assert.equal(fs.existsSync('supabase/migrations/v1.27.0-architecture.sql'), false, 'architecture-only release must not invent a database migration');

console.log('v1.27.0 architecture phase-three verification: PASS');
