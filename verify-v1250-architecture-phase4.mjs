import fs from 'node:fs';
import assert from 'node:assert/strict';
import { renderBoardTableView } from './assets/js/features/boards/views/table-view.ts';
import { renderBoardKanbanView } from './assets/js/features/boards/views/kanban-view.ts';

const read = (path) => fs.readFileSync(path, 'utf8');
const app = read('assets/js/app.ts');
const runtime = read('assets/js/runtime/index.ts');
const manifest = read('config/application-manifest.ts');
const assets = read('config/runtime-assets.js');
const platform = read('assets/js/core/platform.ts');
const sw = read('service-worker.js');
const authFeature = read('assets/js/features/auth/index.ts');
const settingsFeature = read('assets/js/features/settings/index.ts');
const boardsUi = read('assets/js/boards-ui.ts');
const boardState = read('assets/js/features/boards/board-state.ts');
const boardFeature = read('assets/js/features/boards/index.ts');
const tableView = read('assets/js/features/boards/views/table-view.ts');
const kanbanView = read('assets/js/features/boards/views/kanban-view.ts');
const dialogs = read('assets/js/features/boards/controllers/dialog-controller.ts');
const workflows = read('assets/js/features/boards/controllers/column-workflows.ts');
const itemWorkspaceController = read('assets/js/features/boards/services/item-workspace-runtime.ts');
const docs = read('docs/architecture/PHASE-4.md');

assert.ok(platform.includes("PLATFORM_VERSION = '1.43.2'"), 'platform version is not v1.27.0');
assert.ok(sw.includes("work-management-v1.43.2"), 'service-worker cache is not v1.27.0');
assert.ok(manifest.includes("version: '1.43.2'") && manifest.includes('architectureVersion: 15'), 'manifest architecture/version mismatch');

assert.ok(runtime.includes('createAuthenticationFeature') && runtime.includes('createSettingsFeature'), 'runtime gateway does not expose v1.25 feature controllers');
assert.ok(app.includes('const authFeature = createAuthenticationFeature('), 'shell does not create Authentication feature');
assert.ok(app.includes("featureRegistry.register('auth', authFeature"), 'Authentication feature is not registered natively');
assert.ok(app.includes('authFeature.renderLogin()') && app.includes('authFeature.renderRegister()') && app.includes('authFeature.renderVerify()'), 'auth route rendering is not delegated');
assert.ok(app.includes('authFeature.handleAction(action)') && app.includes('authFeature.handleSubmit(authForm)') && app.includes('authFeature.handleInput(event.target instanceof Element ? event.target : null)'), 'auth events are not delegated');
for (const legacy of ['let authBusy', 'let authMessage', 'let authTone', 'let registrationDraft', 'function renderLogin()', 'function renderRegister()', 'function renderVerify()']) {
  assert.ok(!app.includes(legacy), `shell still owns legacy authentication state/rendering: ${legacy}`);
}
for (const token of ['data-auth-form="login"', 'data-auth-form="register"', 'confirmPendingCallback', 'resendSignupConfirmation', 'registrationDraft', 'scheduleCooldownRender', 'consumeReturnRoute', 'function deactivate()']) {
  assert.ok(authFeature.includes(token), `Authentication feature missing ${token}`);
}

assert.ok(app.includes('const settingsFeature = createSettingsFeature('), 'shell does not create Settings feature');
assert.ok(app.includes("featureRegistry.register('settings', settingsFeature"), 'Settings feature is not registered natively');
assert.ok(app.includes('settings: () => settingsFeature.render()') && app.includes('settingsFeature.handleAction(action)'), 'Settings route/actions are not delegated');
for (const legacy of ['let settingsBusy', 'let diagnostics', 'let compatibility', 'function renderSettings()', 'function ensureBackupFileInput()']) {
  assert.ok(!app.includes(legacy), `shell still owns legacy Settings implementation: ${legacy}`);
}
for (const token of ['getStorageHealth', 'requestPersistentStorage', 'runPlatformDiagnostics', 'verifyModuleCompatibility', 'downloadWorkspaceBackup', 'restoreWorkspaceBackup', "kind === 'density'", "kind === 'reset-platform'", 'function deactivate()']) {
  assert.ok(settingsFeature.includes(token), `Settings feature missing ${token}`);
}
assert.ok(settingsFeature.includes('if (!isCurrent(ticket)) return value;'), 'Settings stale storage-health result guard missing');

assert.ok(boardsUi.includes("import { renderBoardTableView } from './features/boards/views/table-view.ts';"), 'Board Table view is not extracted');
assert.ok(boardsUi.includes("import { renderBoardKanbanView } from './features/boards/views/kanban-view.ts';"), 'Board Kanban view is not extracted');
assert.ok(tableView.includes('export function renderBoardTableView') && tableView.includes('No custom columns yet.') && tableView.includes('data-inline-add-item'), 'Table presentation boundary incomplete');
assert.ok(kanbanView.includes('export function renderBoardKanbanView') && kanbanView.includes('data-drop-status'), 'Kanban presentation boundary incomplete');

const escaped = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const emptyTable = renderBoardTableView({
  state: { boardPrefs: {}, itemSearch: '', itemStatus: 'all' }, groups: [], items: [],
  visibleColumns: () => [], allColumns: () => [], canEdit: () => true,
  itemMatches: () => true, compareItems: () => 0, renderColumnHeader: () => '', renderItemRow: () => '', escapeHtml: escaped,
});
assert.ok(emptyTable.includes('No custom columns yet.') && emptyTable.includes('data-add-column'), 'extracted Table view does not preserve operable empty-schema state');
const kanbanSmoke = renderBoardKanbanView({
  state: { itemPanel: { itemId: null } },
  items: [{ id: 'i1', group_id: 'g1', status: 'not_started', title: 'Example', assignee_id: null, due_date: null }],
  groups: [{ id: 'g1', title: 'Main' }], itemMatches: () => true, canEdit: () => true,
  memberMap: () => new Map(), statusLabels: { not_started: 'Not started' }, escapeHtml: escaped, formatDay: () => '—',
});
assert.ok(kanbanSmoke.includes('data-drop-status="not_started"') && kanbanSmoke.includes('data-open-item="i1"'), 'extracted Kanban view does not preserve lane/card interactions');

assert.ok(boardsUi.includes("import { createBoardDialogController } from './features/boards/controllers/dialog-controller.ts';"), 'Board dialog controller is not wired');
assert.ok(dialogs.includes('data-modal-error') && dialogs.includes("event.key === 'Escape'") && dialogs.includes('closeAll'), 'Board dialog lifecycle/error handling incomplete');
assert.ok(boardsUi.includes("import { createColumnWorkflows } from './features/boards/controllers/column-workflows.ts';"), 'Column workflow controller is not wired');
for (const token of ['openFilter', 'openDuplicate', 'openPicker', 'openEditor', 'openChangeType', 'openManager', 'openDelete', 'openCell']) {
  assert.ok(workflows.includes(token), `Column workflow controller missing ${token}`);
}
assert.ok(!boardState.includes('addColumnPosition') && !boardState.includes('changeTypeColumn'), 'transient picker context still leaks into board view state');
assert.ok(boardFeature.includes("architecture: 'stable-workspace-controller-state-service-views-workflow-and-interaction-controllers'"), 'Boards feature architecture metadata is stale');

assert.ok(itemWorkspaceController.includes('let epoch = 0;') && itemWorkspaceController.includes('ticket === epoch') && itemWorkspaceController.includes('state.itemPanel.itemId === itemId'), 'Item Workspace stale-response protection missing from extracted controller');
assert.ok(boardsUi.includes('let boardResizeCleanup: (() => void) | null = null;') && boardsUi.includes('boardResizeCleanup?.();'), 'Board resize-listener disposal boundary missing');
assert.ok(boardsUi.includes('dialogs.closeAll()') && boardsUi.includes('columnWorkflows.reset()'), 'Boards teardown does not clean workflow overlays');

for (const path of [
  './assets/js/features/settings/index.ts',
  './assets/js/features/boards/views/table-view.ts',
  './assets/js/features/boards/views/kanban-view.ts',
  './assets/js/features/boards/controllers/dialog-controller.ts',
  './assets/js/features/boards/controllers/column-workflows.ts',
]) assert.ok(assets.includes(path), `runtime cache manifest missing ${path}`);

assert.ok(docs.includes('Architecture Phase Four') && docs.includes('Remaining safe targets'), 'Phase Four architecture documentation missing');
assert.ok(!fs.existsSync('supabase/migrations/v1.27.0-architecture.sql'), 'architecture-only release must not introduce a v1.25 database migration');

console.log('v1.27.0 architecture phase-four verification: PASS');
