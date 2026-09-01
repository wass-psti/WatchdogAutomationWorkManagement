import assert from 'node:assert/strict';
import fs from 'node:fs';

import { normalizeAppError, WorkManagementError } from './assets/js/platform/errors/app-error.ts';
import { createQueryClient, queryKey } from './assets/js/platform/data/query-client.ts';
import { createBackendClient } from './assets/js/platform/data/backend-client.ts';
import { createBoardRepository } from './assets/js/features/boards/data/board-repository.ts';
import {
  DEFAULT_STATUS_LABELS,
  STATUS_REFERENCE_POLICY,
  addStatusLabel,
  recolorStatusLabel,
  removeStatusLabel,
  renameStatusLabel,
  reorderStatusLabels,
  serializeStatusConfig,
  setStatusLabelActive,
  statusConfig,
} from './assets/js/features/boards/status-labels.ts';
import {
  boardColumnTypes,
  defaultBoardCellValue,
  normalizeBoardCellValue,
} from './assets/js/features/boards/grid/column-type-registry.ts';
import {
  CAPABILITIES,
  capabilityPolicy,
  canAccessModuleByPolicy,
  hasBoardCapability,
  hasPlatformCapability,
} from './assets/js/platform/auth/permissions.ts';
import { applicationManifest, validateApplicationManifest } from './config/application-manifest.ts';
import { moduleDefinitionsById } from './config/modules.ts';

const root = new URL('.', import.meta.url);
const read = (path) => fs.readFileSync(new URL(path, root), 'utf8');
const exists = (path) => fs.existsSync(new URL(path, root));
const pass = (message) => console.log(`PASS ${message}`);

// Stage 1 — normalized errors.
{
  const cases = [
    [{ status: 401, message: 'Session expired' }, 'authentication'],
    [{ status: 403, message: 'Forbidden' }, 'authorization'],
    [{ status: 404, message: 'Not found' }, 'not-found'],
    [{ status: 409, message: 'Already exists' }, 'conflict'],
    [{ status: 422, message: 'Invalid input' }, 'validation'],
    [{ status: 429, message: 'Too many requests' }, 'rate-limit'],
    [{ status: 503, message: 'Unavailable' }, 'backend'],
  ];
  for (const [input, category] of cases) assert.equal(normalizeAppError(input).category, category);
  const timeout = new Error('Request timed out'); timeout.name = 'TimeoutError';
  assert.equal(normalizeAppError(timeout).category, 'timeout');
  assert.equal(normalizeAppError(new TypeError('Response payload schema mismatch')).category, 'internal');
  const original = { message: 'Storage failed', status: 500 };
  const storage = normalizeAppError(original, { operation: 'storage.upload.work-board-files' });
  assert.equal(storage.category, 'storage');
  assert.equal(storage.cause, original);
  assert.equal(normalizeAppError('plain failure').category, 'unexpected');
  assert.ok(normalizeAppError('plain failure') instanceof WorkManagementError);
  pass('normalized errors use explicit categories and preserve unknown causes');
}

// Stage 2 — deterministic query keys, de-duplication, invalidation and mutation boundaries.
{
  assert.equal(queryKey('boards', { b: 2, a: 1 }), queryKey('boards', { a: 1, b: 2 }));
  assert.notEqual(queryKey('boards', ['a', 'b']), queryKey('boards', 'a', 'b'), 'nested key structure must not collide with flat keys');
  const client = createQueryClient({ defaultStaleTime: 10_000 });
  let fetches = 0;
  let resolveFetch;
  const pending = new Promise((resolve) => { resolveFetch = resolve; });
  const request = () => client.fetchQuery({
    key: ['boards', 'list', 'active'],
    queryFn: async () => { fetches += 1; return pending; },
  });
  const first = request();
  const second = request();
  assert.equal(fetches, 0, 'queryFn is scheduled in the promise microtask');
  await Promise.resolve();
  assert.equal(fetches, 1);
  resolveFetch(['b1']);
  assert.deepEqual(await first, ['b1']);
  assert.deepEqual(await second, ['b1']);
  assert.equal(fetches, 1, 'concurrent request was deduplicated');
  assert.deepEqual(await request(), ['b1']);
  assert.equal(fetches, 1, 'fresh cache was reused');
  assert.equal(client.invalidateQueries(['boards', 'list']), 1);
  let mutationCalls = 0;
  const result = await client.mutate({
    key: ['boards', 'mutation', 'rename'],
    input: { name: 'Renamed' },
    mutationFn: async (input) => { mutationCalls += 1; return input.name; },
    invalidate: [['boards', 'list']],
  });
  assert.equal(result, 'Renamed');
  assert.equal(mutationCalls, 1);
  assert.equal(client.snapshot().find((entry) => entry.key.includes('active'))?.updatedAt, 0);
  pass('query runtime deterministically keys, deduplicates and narrowly invalidates server state');
}

// Stage 3 — authenticated transport and runtime payload validation.
{
  const requests = [];
  const auth = {
    isAuthenticated: true,
    user: { id: 'user-1' },
    backend: { supabaseUrl: 'https://example.supabase.co', publishableKey: 'public-key' },
    async ensureAccessToken() { return 'token-1'; },
    headers(token, extra = {}) { return { Authorization: `Bearer ${token}`, apikey: 'public-key', ...extra }; },
    async request(path, init = {}) { requests.push({ path, init }); return { id: 'board-1' }; },
  };
  const backend = createBackendClient(auth);
  const value = await backend.rpc('wm_test', { p_id: 'board-1' }, {
    validate(payload) {
      if (!payload || typeof payload !== 'object' || !('id' in payload) || typeof payload.id !== 'string') throw new TypeError('bad dto');
      return payload.id;
    },
  });
  assert.equal(value, 'board-1');
  assert.equal(requests[0].path, '/rest/v1/rpc/wm_test');
  assert.match(String(requests[0].init.body), /board-1/);
  await assert.rejects(
    backend.rpc('wm_bad', {}, { validate() { throw new TypeError('malformed response payload'); } }),
    (error) => error instanceof WorkManagementError && error.category === 'internal' && error.code === 'WM_TRANSPORT_PAYLOAD_INVALID',
  );
  const unauthenticated = createBackendClient({ ...auth, isAuthenticated: false });
  await assert.rejects(unauthenticated.rpc('wm_test'), (error) => error instanceof WorkManagementError && error.category === 'authentication');
  const offline = createBackendClient({ ...auth, async request() { throw new TypeError('Failed to fetch'); } });
  await assert.rejects(offline.rpc('wm_test'), (error) => error instanceof WorkManagementError && error.category === 'network' && error.retryable === true);
  pass('backend transport enforces authentication and runtime DTO validation');
}

// Stage 4 — repository DTO/domain normalization and true scalar RPC results.
{
  const calls = [];
  const backend = {
    async rpc(name, body = {}) {
      calls.push({ name, body });
      if (name === 'wm_list_boards') return [{ id: 'board-1', name: 'Roadmap', status: 'active', view_mode: 'table' }];
      if (name === 'wm_get_board') return {
        board: { id: 'board-1', name: 'Roadmap', status: 'active', view_mode: 'table' },
        groups: [{ id: 'group-1', board_id: 'board-1', title: 'Group', position: 0 }],
        items: [{ id: 'item-1', board_id: 'board-1', group_id: 'group-1', title: 'Task', position: 0, status: 'not_started' }],
        members: [],
        values: [],
        columns: [{
          id: 'column-status', board_id: 'board-1', name: 'Status', data_type: 'status', position: 0,
          system_key: 'status', config: { options: ['Not started', 'In progress', 'Blocked', 'Done'] },
        }],
      };
      if (name === 'wm_create_board_configured') return 'board-created';
      if (name === 'wm_set_board_status_labels') return body;
      return null;
    },
    async storageDelete() { return true; },
    async storageUpload() { return true; },
    async storageSign() { return { signedURL: '/signed/path' }; },
  };
  const auth = {
    isAuthenticated: true,
    user: { id: 'user-1' },
    backend: { supabaseUrl: 'https://example.supabase.co', publishableKey: 'key' },
    async ensureAccessToken() { return 'token'; },
    headers() { return {}; },
    async request() { return null; },
  };
  const repo = createBoardRepository(auth, { backendClient: backend });
  const list = await repo.list();
  assert.equal(list[0]?.id, 'board-1');
  const board = await repo.get('board-1', { force: true });
  assert.equal(board?.columns[0]?.data_type, 'status');
  assert.equal(board?.columns[0]?.config.labels[0]?.id, 'not_started');
  assert.equal(await repo.create('Typed Board', '', []), 'board-created');
  const statusLabels = DEFAULT_STATUS_LABELS.map((label) => ({ ...label }));
  await repo.setStatusLabels('column-status', statusLabels, 'not_started');
  const statusCall = calls.findLast((entry) => entry.name === 'wm_set_board_status_labels');
  assert.equal(statusCall.body.p_default_label_id, 'not_started');
  assert.equal(statusCall.body.p_labels[0].id, 'not_started');
  const malformedRepo = createBoardRepository(auth, {
    backendClient: { ...backend, async rpc(name) { return name === 'wm_list_boards' ? { not: 'an-array' } : null; } },
  });
  await assert.rejects(malformedRepo.list(), (error) => error instanceof WorkManagementError && error.category === 'internal' && error.code === 'WM_BOARD_PAYLOAD_INVALID');
  pass('Board repository maps legacy DTOs to typed domain values and preserves stable identifiers');
}

// Stage 5 — exhaustive capabilities and typed manifest runtime.
{
  assert.equal(hasPlatformCapability('admin_general_manager', CAPABILITIES.ROLE_MANAGE), true);
  assert.equal(hasPlatformCapability('employee', CAPABILITIES.ROLE_MANAGE), false);
  assert.equal(hasBoardCapability('owner', CAPABILITIES.BOARD_MANAGE), true);
  assert.equal(hasBoardCapability('viewer', CAPABILITIES.BOARD_EDIT), false);
  assert.equal(canAccessModuleByPolicy({ authenticated: true, accountActive: true, platformRole: 'employee', moduleId: 'time-tracker', assignments: [{ module_id: 'time-tracker', enabled: true }] }), true);
  assert.deepEqual(Object.keys(moduleDefinitionsById).sort(), ['fueltrack-plus', 'time-tracker', 'tradelink']);
  assert.equal(Object.keys(capabilityPolicy.platform).length, 4);
  assert.equal(Object.keys(capabilityPolicy.board).length, 3);
  const result = validateApplicationManifest();
  assert.equal(result.valid, true, result.errors.join('; '));
  assert.equal(applicationManifest.version, '1.43.2');
  assert.equal(applicationManifest.architectureVersion, 15);
  assert.equal(applicationManifest.architecture.runtimeInfrastructure, 'typescript-authoritative');
  pass('RBAC capability matrices and application manifest are authoritative TypeScript runtime definitions');
}

// Stage 6 — Status semantics and exhaustive column registry.
{
  let config = serializeStatusConfig(DEFAULT_STATUS_LABELS, 'not_started');
  config = renameStatusLabel(config, 'blocked', 'Waiting');
  assert.equal(config.labels.find((label) => label.id === 'blocked')?.name, 'Waiting');
  config = recolorStatusLabel(config, 'blocked', '#123456');
  assert.equal(config.labels.find((label) => label.id === 'blocked')?.color, '#123456');
  config = setStatusLabelActive(config, 'not_started', false);
  assert.equal(config.default_label_id, 'in_progress', 'default falls back when its label is deactivated');
  config = addStatusLabel(config, { name: 'Review', description: 'Awaiting review' });
  const review = config.labels.find((label) => label.name === 'Review');
  assert.ok(review?.id && review.id !== 'Review');
  config = reorderStatusLabels(config, [review.id, ...config.labels.filter((label) => label.id !== review.id).map((label) => label.id)]);
  assert.equal(config.labels[0]?.id, review.id);
  config = removeStatusLabel(config, review.id);
  assert.equal(config.labels.some((label) => label.id === review.id), false);
  assert.equal(STATUS_REFERENCE_POLICY, 'clear-on-label-delete');
  assert.equal(statusConfig({ config }).labels.length, config.labels.length);

  const types = boardColumnTypes().map((entry) => entry.id).sort();
  assert.deepEqual(types, ['checkbox', 'date', 'dropdown', 'email', 'long_text', 'number', 'people', 'status', 'text', 'timeline', 'url']);
  assert.equal(defaultBoardCellValue('status'), null);
  assert.equal(normalizeBoardCellValue('number', '42.5'), 42.5);
  assert.equal(normalizeBoardCellValue('checkbox', 'false'), false);
  assert.equal(normalizeBoardCellValue('email', 'USER@EXAMPLE.COM'), 'user@example.com');
  assert.deepEqual(normalizeBoardCellValue('timeline', { start: '2026-08-01', end: '2026-08-31' }), { start: '2026-08-01', end: '2026-08-31' });
  assert.throws(() => normalizeBoardCellValue('timeline', { start: '2026-09-01', end: '2026-08-01' }), /cannot be before/);
  assert.throws(() => normalizeBoardCellValue('date', '2026-02-31'), /valid date/);
  pass('Status and Board column runtime enforce stable IDs, deletion semantics and exhaustive typed normalization');
}

// Migration-debt gate: real TS runtimes own these layers; stale declarations are gone.
{
  const migrated = [
    'assets/js/platform/errors/app-error',
    'assets/js/platform/data/query-client',
    'assets/js/platform/data/backend-client',
    'assets/js/platform/auth/permissions',
    'assets/js/features/boards/data/board-contracts',
    'assets/js/features/boards/data/board-repository',
    'assets/js/features/boards/status-labels',
    'assets/js/features/boards/grid/column-type-registry',
    'config/modules',
    'config/application-manifest',
  ];
  for (const base of migrated) {
    assert.equal(exists(`${base}.ts`), true, `${base}.ts must exist`);
    assert.equal(exists(`${base}.d.ts`), false, `${base}.d.ts must be removed`);
    const source = read(`${base}.ts`);
    assert.doesNotMatch(source, /@ts-(?:ignore|nocheck)/);
    assert.doesNotMatch(source, /\bas any\b|:\s*any\b|<any>/);
    if (exists(`${base}.js`)) assert.match(read(`${base}.js`), /authoritative|Compatibility entry/);
  }
  assert.equal(exists('assets/js/runtime/platform-services.d.ts'), false, 'composition-root declaration shim must be removed after v1.39 migration');
  pass('migrated runtime layers removed obsolete declaration shims without broad unsafe TypeScript escapes');
}

console.log('v1.43.2 authoritative TypeScript runtime verification: PASS');
