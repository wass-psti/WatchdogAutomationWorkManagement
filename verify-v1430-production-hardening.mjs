import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequestSignal } from './assets/js/platform/data/request-signal.ts';
import { normalizeAppError, WorkManagementError } from './assets/js/platform/errors/app-error.ts';
import { assertBoardEnvelope, mapBoardColumn, mapBoardMember, mapBoardRecord } from './assets/js/features/boards/data/board-contracts.ts';

const read = (path) => fs.readFileSync(path, 'utf8');
const pass = (message) => console.log(`PASS ${message}`);

const waitForAbort = (signal, timeoutMs = 500) => new Promise((resolve, reject) => {
  if (signal.aborted) return resolve();
  const timer = setTimeout(() => reject(new Error('Abort signal did not fire in time.')), timeoutMs);
  signal.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true });
});

// Request cancellation must not disable application timeouts, and caller cancellation
// must remain distinguishable from a timeout for correct error classification.
{
  const parent = new AbortController();
  const lease = createRequestSignal(parent.signal, 250);
  parent.abort(new DOMException('Cancelled by caller.', 'AbortError'));
  await waitForAbort(lease.signal);
  assert.equal(lease.signal.aborted, true);
  assert.equal(lease.timedOut(), false);
  lease.dispose();
  pass('caller cancellation remains distinct from request timeout');
}
{
  const lease = createRequestSignal(null, 15);
  await waitForAbort(lease.signal);
  assert.equal(lease.signal.aborted, true);
  assert.equal(lease.timedOut(), true);
  lease.dispose();
  pass('application timeout remains active without a caller signal');
}

// Correlation metadata must survive normalization even when the original error was
// already normalized at a lower layer.
{
  const original = new WorkManagementError('Backend failed.', {
    code: 'WM_TEST_FAILURE', category: 'network', operation: 'rpc.test', metadata: { phase: 'transport' },
  });
  const normalized = normalizeAppError(original, { metadata: { requestId: 'wm-test-1' } });
  assert.equal(normalized.operation, 'rpc.test');
  assert.deepEqual(normalized.metadata, { phase: 'transport', requestId: 'wm-test-1' });
  pass('normalized errors preserve request-correlation metadata');
}

const baseBoard = Object.freeze({ id: 'board-1', name: 'Hardening Board', status: 'active', view_mode: 'table' });
const baseGroup = Object.freeze({ id: 'group-1', board_id: 'board-1', title: 'Group', position: 0 });
const baseStatusColumn = Object.freeze({
  id: 'column-status', board_id: 'board-1', name: 'Status', data_type: 'status', position: 0, system_key: 'status',
  config: {
    labels: [
      { id: 'not_started', name: 'Not started', color: '#7f8a9a', active: true, description: '', position: 0 },
      { id: 'done', name: 'Done', color: '#23b784', active: true, description: '', position: 1 },
    ],
    default_label_id: 'not_started',
  },
});
const baseItem = Object.freeze({
  id: 'item-1', board_id: 'board-1', group_id: 'group-1', title: 'Item', position: 0, status: 'not_started',
});
const validEnvelope = () => ({
  board: { ...baseBoard }, groups: [{ ...baseGroup }], items: [{ ...baseItem }], columns: [{ ...baseStatusColumn }],
  values: [], members: [{ user_id: 'user-1', role: 'owner' }],
});

{
  const mapped = assertBoardEnvelope(validEnvelope(), 'hardening.valid');
  assert.equal(mapped?.board?.id, 'board-1');
  assert.equal(mapped?.items[0]?.status, 'not_started');
  pass('valid typed Board envelopes pass cross-entity runtime validation');
}
assert.throws(() => mapBoardRecord({ ...baseBoard, status: 'mystery' }), /Unsupported Board lifecycle/);
pass('unknown Board lifecycle values are rejected instead of coerced');
assert.throws(() => mapBoardMember({ user_id: 'user-1', role: 'administrator' }), /Unsupported Board member role/);
pass('unknown Board member roles are rejected instead of coerced');
assert.throws(() => mapBoardColumn({ ...baseStatusColumn, config: {
  labels: [
    { id: 'dup', name: 'One', color: '#123456', active: true, description: '', position: 0 },
    { id: 'dup', name: 'Two', color: '#654321', active: true, description: '', position: 1 },
  ], default_label_id: 'dup',
} }), /identifiers must be unique/);
pass('new-format Status labels cannot silently repair duplicate stable IDs');
assert.throws(() => mapBoardColumn({ ...baseStatusColumn, config: {
  labels: [{ id: 'bad', name: 'Bad', color: 'blue', active: true, description: '', position: 0 }], default_label_id: 'bad',
} }), /invalid label/);
pass('new-format Status labels reject malformed schema fields');
{
  const legacy = mapBoardColumn({ ...baseStatusColumn, config: { options: ['Not started', 'Done'] } });
  assert.equal(legacy.data_type, 'status');
  assert.deepEqual(legacy.config.labels.map((label) => label.id), ['not_started', 'status_done']);
  pass('historical Status options migrate compatibly to stable typed identifiers');
}
{
  const orphan = validEnvelope();
  orphan.items[0] = { ...orphan.items[0], group_id: 'missing-group' };
  assert.throws(() => assertBoardEnvelope(orphan, 'hardening.orphan-group'), /unknown group/);
  pass('Board envelopes reject orphaned item-to-group references');
}
{
  const invalidStatus = validEnvelope();
  invalidStatus.items[0] = { ...invalidStatus.items[0], status: 'missing-status' };
  assert.throws(() => assertBoardEnvelope(invalidStatus, 'hardening.status-reference'), /unknown Status label/);
  pass('Board envelopes reject unknown persisted Status-label references');
}
{
  const duplicateCell = validEnvelope();
  duplicateCell.columns.push({ id: 'column-text', board_id: 'board-1', name: 'Text', data_type: 'text', position: 1, config: {} });
  duplicateCell.values.push({ item_id: 'item-1', column_id: 'column-text', value: 'a' });
  duplicateCell.values.push({ item_id: 'item-1', column_id: 'column-text', value: 'b' });
  assert.throws(() => assertBoardEnvelope(duplicateCell, 'hardening.duplicate-cell'), /Duplicate Board cell/);
  pass('Board envelopes reject duplicate item/column cell coordinates');
}

// Authorization is required at the server boundary, not only in UI visibility.
for (const path of ['supabase/migrations/v1.43.0-production-hardening.sql', 'supabase/schema.sql']) {
  const sql = read(path);
  assert.match(sql, /create or replace function public\.current_workspace_id/i, `${path} must define current_workspace_id`);
  assert.match(sql, /join\s+public\.profiles\s+p\s+on\s+p\.id\s*=\s*wm\.user_id/i, `${path} must bind workspace membership to profile state`);
  assert.match(sql, /p\.status\s*=\s*'active'/i, `${path} must reject disabled profiles at workspace access boundary`);
  assert.match(sql, /create or replace function public\.work_board_access/i, `${path} must define work_board_access`);
  assert.match(sql, /from public\.profiles[\s\S]{0,500}status\s*=\s*'active'/i, `${path} must reject disabled profiles at Board access boundary`);
}
pass('disabled accounts are denied by authoritative workspace and Board SQL access helpers');

const appSource = read('assets/js/app.ts');
const authorizationSource = read('assets/js/runtime/authorization-context.ts');
assert.match(appSource, /reconcileAuthorizationContext/);
assert.match(appSource, /revalidateAuthorizationContext/);
assert.match(appSource, /addEventListener\('focus',\s*revalidateAuthorizationContext/);
assert.match(appSource, /visibilitychange/);
assert.match(authorizationSource, /serverState\.clear\(\)/);
assert.match(authorizationSource, /moduleHost\.detach\(\)/);
assert.match(authorizationSource, /moduleHost\.publishIdentity\(\)/);
pass('shell revalidates authorization context and invalidates stale server state across sessions');

const authSource = read('assets/js/core/auth.ts');
assert.match(authSource, /parseAuthUser\(/);
assert.match(authSource, /parseProfile\(/);
assert.match(authSource, /parseModuleAssignments\(/);
assert.match(authSource, /revalidateAccessContext/);
assert.match(authSource, /createRequestSignal\(options\.signal, REQUEST_TIMEOUT_MS\)/);
pass('auth runtime validates external identity payloads and composes cancellation with timeouts');

const backendSource = read('assets/js/platform/data/backend-client.ts');
assert.match(backendSource, /nextRequestId/);
assert.match(backendSource, /requestId/);
assert.match(backendSource, /STORAGE_REQUEST_TIMEOUT_MS/);
assert.match(backendSource, /STORAGE_UPLOAD_TIMEOUT_MS/);
pass('transport diagnostics expose request correlation and bounded storage operations');

const viteSource = read('vite.config.js');
const distVerifierSource = read('scripts/verify-dist.mjs');
const previewVerifierSource = read('scripts/verify-vite-server.mjs');
const envExample = read('.env.example');
assert.match(viteSource, /String\(value \|\| 'false'\)/);
assert.ok(viteSource.includes('core[\\\\/]boards\\\\.ts$'));
assert.ok(viteSource.includes('core[\\\\/]auth\\\\.ts$'));
assert.match(envExample, /VITE_BUILD_SOURCEMAP=false/);
assert.match(distVerifierSource, /public release unexpectedly contains source maps/);
assert.match(previewVerifierSource, /module-bootstrap\.js/);
assert.match(previewVerifierSource, /resolved to HTML instead of executable code/);
pass('production deployment defaults suppress public source maps and verify emitted runtime assets');

const runtimeAssets = read('config/runtime-assets.js');
assert.match(runtimeAssets, /assets\/js\/runtime\/authorization-context\.ts/);
assert.match(runtimeAssets, /assets\/js\/platform\/data\/request-signal\.ts/);
const supabaseReadme = read('supabase/README.md');
const hardeningDoc = read('docs/architecture/PRODUCTION-HARDENING-v1.43.md');
assert.match(supabaseReadme, /v1\.43\.0-production-hardening\.sql/);
assert.match(hardeningDoc, /disabled user retained a still-valid JWT|disabled account with an otherwise unexpired/i);
pass('runtime asset manifest and deployment documentation include the v1.43 hardening boundaries');

assert.match(appSource, /RUNTIME_BOOT/);
assert.match(backendSource, /API_RPC_SUCCESS/);
assert.match(backendSource, /API_RPC_FAILURE/);
pass('operational diagnostics expose build identity and request-correlated backend outcomes');

const tableViewSource = read('assets/js/features/boards/views/table-view.ts');
const kanbanViewSource = read('assets/js/features/boards/views/kanban-view.ts');
assert.match(tableViewSource, /itemsByGroup = new Map/);
assert.doesNotMatch(tableViewSource, /items\.filter\(\(item\) => item\.group_id === group\.id/);
assert.match(kanbanViewSource, /itemsByStatus = new Map/);
assert.match(kanbanViewSource, /groupsById = new Map/);
assert.doesNotMatch(kanbanViewSource, /visibleItems\.filter\(\(item\) => status/);
pass('Board Table and Kanban rendering use one-pass indexes instead of repeated full-collection scans');

console.log('v1.43.2 production hardening verification: PASS');
