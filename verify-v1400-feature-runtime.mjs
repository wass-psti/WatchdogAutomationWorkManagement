import assert from 'node:assert/strict';
import { assertBoardEnvelope, mapBoardPreferences } from './assets/js/features/boards/data/board-contracts.ts';
import { createBoardViewState } from './assets/js/features/boards/board-state.ts';
import { createBoardDataController } from './assets/js/features/boards/controllers/board-data-controller.ts';
import { createBoardCommandService } from './assets/js/features/boards/services/board-command-service.ts';
import { createBoardPreferencePatchService } from './assets/js/features/boards/services/board-preferences-service.ts';
import { createBoardSelectors } from './assets/js/features/boards/selectors/board-selectors.ts';
import { createBoardSelectionService } from './assets/js/features/boards/services/board-selection-service.ts';
import { createItemWorkspaceRuntime } from './assets/js/features/boards/services/item-workspace-runtime.ts';
import { createStatusLabelEditor } from './assets/js/features/boards/services/status-label-editor.ts';
import { createBoardActivityRuntime } from './assets/js/features/boards/services/board-activity-runtime.ts';
import { STATUS_REFERENCE_POLICY, serializeStatusConfig } from './assets/js/features/boards/status-labels.ts';
import { createCommandRegistry } from './assets/js/features/commands/command-registry.ts';
import { createModuleHost } from './assets/js/runtime/module-host.ts';
import { createWorkManagementClient } from './assets/js/runtime/work-management-client.ts';
import { createBoardRepository } from './assets/js/features/boards/data/board-repository.ts';
import { createBoardDomainService } from './assets/js/features/boards/services/board-domain-service.ts';
import { normalizePreferences } from './assets/js/core/platform.ts';
import { moduleRegistry } from './assets/js/features/modules/index.ts';
import { applicationManifest } from './config/application-manifest.ts';
import { WorkManagementError } from './assets/js/platform/errors/app-error.ts';

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

const legacyStatusOptions = ['Not started', 'In progress', 'Blocked', 'Done'];
const rawBoardEnvelope = () => ({
  board: { id: 'board-1', name: 'Operations', description: '', status: 'active', view_mode: 'table', member_role: 'owner' },
  groups: [
    { id: 'group-1', board_id: 'board-1', title: 'Backlog', position: 0, accent_color: '#5b7cfa' },
    { id: 'group-2', board_id: 'board-1', title: 'Doing', position: 1, accent_color: '#23b784' },
  ],
  items: [
    { id: 'item-1', board_id: 'board-1', group_id: 'group-1', title: 'Alpha', position: 0, status: 'not_started', notes: '' },
    { id: 'item-2', board_id: 'board-1', group_id: 'group-1', title: 'Beta', position: 1, status: 'in_progress', notes: '' },
    { id: 'item-3', board_id: 'board-1', group_id: 'group-2', title: 'Gamma', position: 0, status: 'done', notes: '' },
  ],
  columns: [
    { id: 'column-status', board_id: 'board-1', name: 'Status', data_type: 'status', config: { options: legacyStatusOptions }, position: 0, visible: true, system_key: 'status' },
    { id: 'column-text', board_id: 'board-1', name: 'Text', data_type: 'text', config: {}, position: 1, visible: true },
  ],
  values: [
    { id: 'value-1', item_id: 'item-1', column_id: 'column-text', value: 'Need approval' },
  ],
  members: [{ user_id: 'user-1', role: 'owner', email: 'owner@example.test', display_name: 'Owner' }],
});

const boardEnvelope = () => assertBoardEnvelope(rawBoardEnvelope(), 'v1.40.fixture');

// Board DTO/domain mapping, legacy status normalization, empty collections and malformed data rejection.
{
  const mapped = boardEnvelope();
  assert.equal(mapped.board.id, 'board-1');
  assert.equal(mapped.columns[0].data_type, 'status');
  assert.deepEqual(mapped.columns[0].config.labels.map((label) => label.id), ['not_started', 'in_progress', 'blocked', 'done']);
  assert.equal(assertBoardEnvelope(null), null);
  assert.throws(() => assertBoardEnvelope({ ...rawBoardEnvelope(), groups: {} }), /Invalid groups collection/);
  assert.throws(() => assertBoardEnvelope({ ...rawBoardEnvelope(), columns: [{ id: 'bad', board_id: 'board-1', data_type: 'mystery' }] }), /Unsupported Board column type/);
  console.log('PASS Board DTO mapping normalizes legacy data and rejects malformed envelopes');
}

// Board loading controller: list, empty list, preference normalization path, failure and stale request isolation.
{
  const state = createBoardViewState();
  const events = [];
  const service = {
    list: async () => [],
    get: async () => boardEnvelope(),
    getPreferences: async () => ({ column_widths: { 'column-text': 210 } }),
  };
  const controller = createBoardDataController({ state, service, onListChange: () => events.push('list'), onBoardChange: () => events.push('board') });
  assert.equal(await controller.loadBoards('active'), true);
  assert.deepEqual(state.boards, []);
  assert.equal(state.loading, false);
  assert.equal(await controller.loadBoard('board-1'), true);
  assert.equal(state.board.board.id, 'board-1');
  assert.equal(state.boardPrefs.column_widths['column-text'], 210);

  const failState = createBoardViewState();
  const failController = createBoardDataController({
    state: failState,
    service: { list: async () => { throw new Error('network unavailable'); } },
    onListChange() {}, onBoardChange() {},
  });
  assert.equal(await failController.loadBoards(), false);
  assert.match(failState.error, /network unavailable/i);

  const first = deferred();
  const second = deferred();
  let count = 0;
  const staleState = createBoardViewState();
  const staleController = createBoardDataController({
    state: staleState,
    service: {
      get: async () => (++count === 1 ? first.promise : second.promise),
      getPreferences: async () => ({}),
    },
    onListChange() {}, onBoardChange() {},
  });
  const p1 = staleController.loadBoard('board-1');
  const p2 = staleController.loadBoard('board-2');
  second.resolve({ ...boardEnvelope(), board: { ...boardEnvelope().board, id: 'board-2' } });
  assert.equal(await p2, true);
  first.resolve(boardEnvelope());
  assert.equal(await p1, false);
  assert.equal(staleState.board.board.id, 'board-2');
  console.log('PASS Board loading preserves empty/failure behavior and ignores stale responses');
}

// Repository invalidation/persistence coordination uses narrow authoritative query targets.
{
  const invalidations = [];
  const mutationInvalidations = [];
  const setData = [];
  const queryClient = {
    fetchQuery: async ({ queryFn }) => queryFn(),
    mutate: async ({ input, mutationFn, invalidate = [] }) => {
      mutationInvalidations.push(...invalidate);
      return mutationFn(input);
    },
    getQueryData: () => undefined,
    setQueryData: (key, data) => { setData.push({ key, data }); return data; },
    invalidateQueries: (key) => { invalidations.push(key); return 1; },
    removeQueries: () => 0,
    clear() {}, subscribe: () => () => {}, snapshot: () => [],
  };
  const rpcCalls = [];
  const backend = {
    rpc: async (name, body) => {
      rpcCalls.push({ name, body });
      if (name === 'wm_add_board_item') return 'item-new';
      if (name === 'wm_set_board_preferences') return [{ sort_column_id: null, sort_direction: null, column_filters: {}, wrap_columns: [], column_widths: {}, collapsed_groups: [] }];
      return null;
    },
    storageDelete: async () => true,
    storageUpload: async () => true,
    storageSign: async () => ({ signedURL: 'https://signed.example/file' }),
  };
  const auth = {
    isAuthenticated: true,
    user: { id: 'user-1' },
    backend: { supabaseUrl: 'https://backend.example', publishableKey: 'public' },
    ensureAccessToken: async () => 'token', headers: () => ({}), request: async () => null,
  };
  const repo = createBoardRepository(auth, { queryClient, backendClient: backend });
  assert.equal(await repo.addItem('board-1', 'group-1', 'New item'), 'item-new');
  assert.equal(mutationInvalidations.length, 4);
  assert.equal(JSON.stringify(mutationInvalidations).includes('item-workspace'), true);
  await repo.setPreferences('board-1', { item_name_width: 333 });
  assert.equal(setData.length, 1);
  assert.equal(setData[0].data.item_name_width, undefined); // backend response is authoritative, not local optimistic leakage
  repo.invalidate();
  assert.equal(invalidations.length, 4);
  assert.equal(rpcCalls.some((call) => call.name === 'wm_add_board_item'), true);
  console.log('PASS Board repository mutations preserve targeted invalidation and authoritative preference caching');
}

// Board command validation, orchestration and normalized authorization errors.
{
  const calls = [];
  const service = new Proxy({
    create: async (...args) => { calls.push(['create', ...args]); return 'board-created'; },
    addItem: async (...args) => { calls.push(['addItem', ...args]); return 'item-created'; },
    updateItem: async (...args) => { calls.push(['updateItem', ...args]); },
    setGroupAccent: async (...args) => { calls.push(['setGroupAccent', ...args]); },
    addColumn: async (...args) => { calls.push(['addColumn', ...args]); return 'column-created'; },
    deleteColumn: async (...args) => { calls.push(['deleteColumn', ...args]); },
    setStatusLabels: async (...args) => { calls.push(['setStatusLabels', ...args]); },
  }, {
    get(target, property) {
      if (property in target) return target[property];
      return async (...args) => { calls.push([String(property), ...args]); };
    },
  });
  const commands = createBoardCommandService({ service });
  assert.equal(await commands.createBoard({ name: '  New board  ', description: '  desc  ' }), 'board-created');
  assert.equal(calls[0][1], 'New board');
  assert.equal(await commands.createItem({ boardId: 'board-1', groupId: 'group-1', title: ' Task ', notes: 'n' }), 'item-created');
  assert.equal(calls.some((entry) => entry[0] === 'updateItem' && entry[1].id === 'item-created'), true);
  await commands.setGroupAccent({ groupId: 'group-1', accentColor: '#ABCDEF' });
  assert.equal(calls.find((entry) => entry[0] === 'setGroupAccent')[2], '#abcdef');
  assert.throws(() => commands.setGroupAccent({ groupId: 'group-1', accentColor: 'blue' }), (error) => error instanceof WorkManagementError && error.category === 'validation');
  await assert.rejects(() => commands.createBoard({ name: '   ' }), (error) => error instanceof WorkManagementError && error.category === 'validation');

  const deniedCommands = createBoardCommandService({ service: new Proxy({}, { get: () => async () => { throw { status: 403, message: 'permission denied' }; } }) });
  await assert.rejects(() => deniedCommands.updateBoard({ boardId: 'board-1', name: 'Blocked' }), (error) => error instanceof WorkManagementError && error.category === 'authorization');
  console.log('PASS Board commands validate inputs, orchestrate services and normalize permission failures');
}

// Preferences: external normalization, defaults, patching, malformed persisted values and scoped cleanup.
{
  const empty = mapBoardPreferences(null);
  assert.deepEqual(empty, {});
  const normalized = mapBoardPreferences([{ sort_column_id: 'column-text', sort_direction: 'asc', column_filters: { 'column-text': 'Need' }, wrap_columns: ['column-text'], column_widths: { 'column-text': 190 }, item_name_width: 320, collapsed_groups: ['group-1'] }]);
  assert.equal(normalized.column_widths['column-text'], 190);
  assert.throws(() => mapBoardPreferences([{ column_filters: [] }]), /preference filters/i);
  const patches = createBoardPreferencePatchService();
  let prefs = patches.withColumnWidth(normalized, 'column-text', 9999);
  assert.equal(prefs.column_widths['column-text'], 720);
  prefs = patches.withColumnFilter(prefs, 'column-text', '  alpha  ');
  assert.equal(prefs.column_filters['column-text'], 'alpha');
  prefs = patches.withoutColumnReferences(prefs, 'column-text');
  assert.equal(prefs.column_filters['column-text'], undefined);
  assert.equal(prefs.column_widths['column-text'], undefined);
  assert.equal(prefs.sort_column_id, null);
  console.log('PASS Board preferences normalize external values and remove stale column references deterministically');
}

// Selectors: deterministic, side-effect free derivation over representative state.
{
  const state = createBoardViewState();
  state.board = boardEnvelope();
  state.boardPrefs = { ...state.boardPrefs, column_widths: { 'column-text': 230 }, collapsed_groups: ['group-2'], sort_column_id: 'column-text', sort_direction: 'asc' };
  const selectors = createBoardSelectors(state);
  assert.equal(selectors.visibleColumns().length, 2);
  assert.equal(selectors.columnWidth('column-text'), 230);
  assert.equal(selectors.isGroupCollapsed('group-2'), true);
  assert.equal(selectors.getCellValue(state.board.items[0], state.board.columns[1]), 'Need approval');
  assert.equal(selectors.statusLabelForValue(state.board.columns[0], 'Not started').id, 'not_started');
  state.itemSearch = 'approval';
  const before = JSON.stringify(state);
  assert.equal(selectors.itemMatches(state.board.items[0]), true);
  assert.equal(selectors.itemMatches(state.board.items[1]), false);
  selectors.compareItems(state.board.items[0], state.board.items[1]);
  assert.equal(JSON.stringify(state), before);
  console.log('PASS Board selectors derive deterministic values without mutating feature state');
}

// Selection/bulk state: individual, range, group-scoped select-all, mixed groups, mutations, rejection and cleanup.
{
  const state = createBoardViewState();
  state.board = boardEnvelope();
  const calls = [];
  const commands = {
    duplicateItem: async (id) => { calls.push(['duplicate', id]); },
    archiveItem: async (id, archived) => { calls.push(['archive', id, archived]); },
    deleteItem: async (id) => { calls.push(['delete', id]); },
    moveItem: async (command) => { calls.push(['move', command]); },
  };
  const selection = createBoardSelectionService({ state, commands, getVisibleItems: () => state.board.items });
  selection.toggle('item-1');
  selection.toggle('item-2', { range: true });
  assert.deepEqual(new Set(state.selectedItems), new Set(['item-1', 'item-2']));
  selection.selectVisible(true, 'group-2');
  assert.equal(selection.isSelected('item-3'), true);
  selection.selectVisible(false, 'group-1');
  assert.deepEqual(state.selectedItems, ['item-3']);
  selection.toggle('item-1');
  assert.equal(await selection.moveSelected('group-2'), 2);
  assert.equal(calls.filter((entry) => entry[0] === 'move').length, 2);
  assert.deepEqual(state.selectedItems, []);

  const deniedState = createBoardViewState();
  deniedState.board = boardEnvelope();
  deniedState.selectedItems = ['item-1'];
  const denied = createBoardSelectionService({ state: deniedState, commands: { duplicateItem: async () => { throw { status: 403, message: 'forbidden' }; } }, getVisibleItems: () => deniedState.board.items });
  await assert.rejects(() => denied.duplicateSelected(), (error) => error instanceof WorkManagementError && error.category === 'authorization');
  assert.deepEqual(deniedState.selectedItems, ['item-1']);
  console.log('PASS Board selection and bulk operations preserve scope, mutation order and failure recovery');
}

// Item Workspace race protection: late success/failure/cancellation cannot overwrite active item.
{
  const state = createBoardViewState();
  state.board = boardEnvelope();
  const a = deferred();
  const b = deferred();
  const c = deferred();
  const queues = new Map([['item-1', [a]], ['item-2', [b]], ['item-3', [c]]]);
  const service = {
    getItemWorkspace: async (itemId) => queues.get(String(itemId)).shift().promise,
  };
  const runtime = createItemWorkspaceRuntime({ state, service });
  runtime.open('item-1');
  const loadA = runtime.load('item-1');
  runtime.open('item-2');
  const loadB = runtime.load('item-2');
  b.resolve({ updates: [{ id: 'u2', item_id: 'item-2', body: 'new' }], files: [], activity: [] });
  assert.equal(await loadB, true);
  a.resolve({ updates: [{ id: 'u1', item_id: 'item-1', body: 'stale' }], files: [], activity: [] });
  assert.equal(await loadA, false);
  assert.equal(state.itemPanel.itemId, 'item-2');
  assert.equal(state.itemPanel.data.updates[0].body, 'new');

  runtime.open('item-3');
  const loadC = runtime.load('item-3');
  runtime.open('item-2');
  c.reject(new Error('stale failure'));
  assert.equal(await loadC, false);
  assert.equal(state.itemPanel.itemId, 'item-2');

  const d = deferred();
  queues.set('item-2', [d]);
  const cancelled = runtime.load('item-2');
  runtime.cancelPending();
  d.resolve({ updates: [{ id: 'late', item_id: 'item-2', body: 'cancelled' }], files: [], activity: [] });
  assert.equal(await cancelled, false);
  assert.notEqual(state.itemPanel.data.updates[0]?.body, 'cancelled');
  console.log('PASS Item Workspace stale responses, stale failures and cancelled loads cannot overwrite active state');
}

// Configurable Status editing: stable ids, rename/recolor/order/deactivate/delete/default and invalid config rejection.
{
  const column = boardEnvelope().columns[0];
  const editor = createStatusLabelEditor(column);
  const first = editor.snapshot().labels[0];
  editor.rename(first.id, 'Queued');
  editor.recolor(first.id, '#ABCDEF');
  assert.equal(editor.label(first.id).id, first.id);
  assert.equal(editor.label(first.id).name, 'Queued');
  assert.equal(editor.label(first.id).color, '#abcdef');
  editor.move(first.id, 'down');
  editor.setDefault(first.id);
  editor.toggleActive(first.id);
  assert.notEqual(editor.snapshot().defaultId, first.id);
  const added = editor.add('Ready');
  assert.equal(editor.label(added).active, true);
  const removed = editor.remove(added);
  assert.equal(removed.id, added);
  assert.equal(STATUS_REFERENCE_POLICY, 'clear-on-label-delete');
  const serialized = editor.serialize();
  assert.equal(serialized.labels.some((label) => label.id === first.id), true);
  assert.throws(() => serializeStatusConfig([
    { id: 'dup', name: 'One', color: '#000000', active: true, description: '', position: 0 },
    { id: 'dup', name: 'Two', color: '#111111', active: true, description: '', position: 1 },
  ], 'dup'), /unique/i);
  console.log('PASS configurable Status editing preserves stable identifiers and explicit deletion/default semantics');
}

// Activity runtime: ordering passthrough, empty result, errors, refresh and stale request cancellation.
{
  const state = createBoardViewState();
  state.board = boardEnvelope();
  const calls = [];
  const service = { events: async (_boardId, limit) => { calls.push(limit); return [{ id: '2', event_type: 'update', message: 'Second' }, { id: '1', event_type: 'create', message: 'First' }]; } };
  const activity = createBoardActivityRuntime({ state, service });
  const loaded = await activity.loadRecent(9999);
  assert.equal(loaded.status, 'applied');
  assert.equal(calls[0], 500);
  assert.equal(loaded.events[0].id, '2');

  const empty = createBoardActivityRuntime({ state, service: { events: async () => [] } });
  assert.deepEqual((await empty.loadRecent()).events, []);

  const failed = createBoardActivityRuntime({ state, service: { events: async () => { throw new Error('activity offline'); } } });
  await assert.rejects(() => failed.loadRecent(), /activity offline/);

  const late = deferred();
  const staleRuntime = createBoardActivityRuntime({ state, service: { events: async () => late.promise } });
  const pending = staleRuntime.loadRecent();
  staleRuntime.cancelPending();
  late.resolve([{ id: 'late', event_type: 'x', message: 'late' }]);
  assert.equal((await pending).status, 'stale');
  console.log('PASS Board activity loading handles limits, empty/error paths, refresh results and stale cancellation');
}

// Command registry contracts: uniqueness, capability predicate, unsupported commands and execution.
{
  const registry = createCommandRegistry();
  let runs = 0;
  registry.register({ id: 'users.manage', title: 'Manage users', when: (context) => context.canManageUsers, run: () => { runs += 1; return 'ok'; } });
  assert.throws(() => registry.register({ id: 'users.manage', run() {} }), /already registered/);
  assert.equal(registry.list({ authenticated: true, canManageUsers: false, user: 'u' }).length, 0);
  assert.equal(registry.execute('missing'), false);
  assert.equal(registry.execute('users.manage', { authenticated: true, canManageUsers: false, user: 'u' }), false);
  assert.equal(registry.execute('users.manage', { authenticated: true, canManageUsers: true, user: 'u' }), 'ok');
  assert.equal(runs, 1);
  assert.equal(registry.snapshot()[0].id, 'users.manage');
  console.log('PASS command registry enforces uniqueness, capability predicates and execution contracts');
}

// Module registry/host: manifest alignment, identity publication, module isolation and disposal.
{
  assert.equal(moduleRegistry.all.length, applicationManifest.modules.length);
  assert.deepEqual(moduleRegistry.all.map((module) => module.id), applicationManifest.modules.map((module) => module.id));
  const posted = [];
  const frame = { contentWindow: { postMessage: (payload, origin) => posted.push({ payload, origin }) } };
  const hostEvents = [];
  const previousWindow = globalThis.window;
  globalThis.window = new EventTarget();
  const host = createModuleHost({
    auth: { moduleIdentityContext: (moduleId) => ({ type: 'wm:identity-context', version:1, moduleId, user:{ id:'u1', email:'user@example.test', displayName:'User' }, platformRole:'employee', accountStatus:'active', module:{ role:'Employee', enabled:true }, updatedAt:new Date(0).toISOString() }) },
    origin: 'https://workspace.example',
    onEvent: (evt) => hostEvents.push(evt),
  });
  const detach = host.attach(frame, { id: 'time-tracker' });
  assert.equal(host.moduleId, 'time-tracker');
  assert.equal(host.publishIdentity(), true);
  assert.equal(posted.at(-1).payload.moduleId, 'time-tracker');
  assert.equal(host.invalidate('host-refresh'), true);
  assert.equal(posted.at(-1).payload.type, 'wm:host:invalidate');
  detach();
  assert.equal(host.moduleId, null);
  assert.equal(host.invalidate('host-refresh'), false);
  assert.equal(hostEvents.some((evt) => evt.type === 'module:attached'), true);
  if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;
  console.log('PASS module registry/host preserve manifest integration, isolated identity publication and disposal');
}

// Cross-feature runtime client and typed domain service preserve explicit service boundaries.
{
  const client = createWorkManagementClient({
    services: {
      account: { read: async (params, context) => ({ params, account: context.accountId ?? null }) },
    },
    context: { accountId: 'account-1' },
  });
  const events = [];
  const unlisten = client.listen('runtime:response', (event) => events.push(event));
  const result = await client.get('account.read', { id: 'user-1' });
  assert.equal(result.account, 'account-1');
  assert.equal(events.at(-1).payload.ok, true);
  unlisten();
  assert.equal(client.hasService('account'), true);
  client.destroy();

  const repository = { list: async () => ['typed-domain'] };
  const domain = createBoardDomainService({ repository });
  assert.equal((await domain.list())[0], 'typed-domain');
  console.log('PASS cross-feature runtime client and Board domain service retain explicit typed dependency boundaries');
}

// Shared preference normalization remains deterministic at the cross-feature shell boundary.
{
  const normalized = normalizePreferences({ theme: 'dark', compact: true, favorites: ['time-tracker', 'time-tracker', ''], recent: [{ id: 'fueltrack-plus', openedAt: '2026-08-30T00:00:00Z' }, { id: '', openedAt: 'bad' }] });
  assert.equal(normalized.theme, 'dark');
  assert.equal(normalized.compact, true);
  assert.deepEqual(normalized.favorites, ['time-tracker']);
  assert.equal(normalized.recent.length, 1);
  assert.equal(normalizePreferences({ theme: 'purple' }).theme, 'system');
  console.log('PASS cross-feature shell preference normalization rejects malformed persisted values');
}

console.log('v1.43.2 feature-runtime regression verification: PASS');
