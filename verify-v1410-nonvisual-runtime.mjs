import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { deriveAuthLifecycle, normalizeAuthFailure } from './assets/js/core/auth-state.ts';
import { BACKUP_FORMAT, BACKUP_VERSION, BackupValidationError, parseBackupObject, validateBoardSnapshot } from './assets/js/core/backup.ts';
import { auth } from './assets/js/core/auth.ts';
import { transitionEmbeddedLifecycle, EmbeddedLifecycleTransitionError } from './assets/js/runtime/module-lifecycle.ts';
import { modules } from './config/modules.ts';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const missing = async (path) => access(new URL(path, import.meta.url)).then(() => false, () => true);
const uuid = {
  board: '11111111-1111-4111-8111-111111111111',
  group: '22222222-2222-4222-8222-222222222222',
  user: '33333333-3333-4333-8333-333333333333',
  status: '44444444-4444-4444-8444-444444444444',
  item: '55555555-5555-4555-8555-555555555555',
};

try {
  // Authentication lifecycle and provider-error normalization are pure, exhaustive boundaries.
  assert.deepEqual(deriveAuthLifecycle({ status:'initializing', userId:null, expiresAt:null, generation:2 }), { kind:'initializing', generation:2 });
  assert.deepEqual(deriveAuthLifecycle({ status:'authenticated', userId:'user-1', expiresAt:12345, generation:3 }), { kind:'authenticated', generation:3, userId:'user-1', expiresAt:12345 });
  assert.equal(deriveAuthLifecycle({ status:'authenticated', userId:null, expiresAt:12345, generation:3 }).kind, 'invalid');
  assert.equal(deriveAuthLifecycle({ status:'expired', userId:null, expiresAt:null, generation:4 }).kind, 'expired');
  assert.equal(deriveAuthLifecycle({ status:'terminated', userId:null, expiresAt:null, generation:5 }).kind, 'terminated');
  assert.deepEqual(normalizeAuthFailure({ message:'expired token', code:'token_expired', status:'401' }), { message:'expired token', code:'token_expired', status:401 });
  assert.deepEqual(normalizeAuthFailure('provider unavailable', 'fallback'), { message:'provider unavailable', code:'', status:null });

  const board = {
    board: { id:uuid.board, name:'Restored board', status:'active' },
    groups: [{ id:uuid.group, board_id:uuid.board, title:'Group A' }],
    members: [{ user_id:uuid.user, email:'user@example.test', role:'owner' }],
    columns: [{ id:uuid.status, board_id:uuid.board, column_key:'status', name:'Status', data_type:'status', system_key:'status', config:{ labels:[{ id:'not_started', name:'Not started' }], default_label_id:'not_started' } }],
    items: [{ id:uuid.item, board_id:uuid.board, group_id:uuid.group, title:'Item', status:'not_started', assignee_id:uuid.user }],
    values: [], preferences: {},
  };
  assert.equal(validateBoardSnapshot(board).items.length, 1);
  assert.throws(() => validateBoardSnapshot({ ...board, items:[{ ...board.items[0], status:'missing' }] }), (error) => error instanceof BackupValidationError && error.code === 'WM_BACKUP_STATUS_ORPHAN');
  assert.throws(() => validateBoardSnapshot({ ...board, members:[...board.members, { ...board.members[0], user_id:'66666666-6666-4666-8666-666666666666' }] }), (error) => error instanceof BackupValidationError && error.code === 'WM_BACKUP_MEMBER_INTEGRITY');

  const legacy = parseBackupObject({ format:BACKUP_FORMAT, backupVersion:3, platformVersion:'1.41.0', createdAt:new Date(0).toISOString(), origin:'https://example.test', modules:[], data:{ 'wm.platform.preferences.v1':'{}' }, moduleData:{}, activityData:{} }, modules);
  assert.equal(legacy.backupVersion, BACKUP_VERSION);
  assert.deepEqual(legacy.migration, { fromVersion:3, toVersion:4 });
  assert.throws(() => parseBackupObject({ format:BACKUP_FORMAT, backupVersion:99, data:{} }, modules), (error) => error instanceof BackupValidationError && error.code === 'WM_BACKUP_VERSION_UNSUPPORTED');
  assert.throws(() => parseBackupObject({ format:BACKUP_FORMAT, backupVersion:4, data:{}, moduleData:{ 'time-tracker':[
    { state_key:'timetracker.ui.v1', value:'{}', scope:'user' },
    { state_key:'timetracker.ui.v1', value:'{}', scope:'user' },
  ]}, activityData:{}, boardData:[] }, modules), (error) => error instanceof BackupValidationError && error.code === 'WM_BACKUP_MODULE_STATE_CONFLICT');

  let lifecycle = transitionEmbeddedLifecycle({ kind:'uninitialized', generation:0, moduleId:null }, { type:'initialize', moduleId:'time-tracker' });
  assert.equal(lifecycle.kind, 'initializing');
  lifecycle = transitionEmbeddedLifecycle(lifecycle, { type:'ready' });
  lifecycle = transitionEmbeddedLifecycle(lifecycle, { type:'suspend', reason:'hidden' });
  lifecycle = transitionEmbeddedLifecycle(lifecycle, { type:'resume' });
  lifecycle = transitionEmbeddedLifecycle(lifecycle, { type:'dispose' });
  assert.equal(lifecycle.kind, 'disposed');
  assert.throws(() => transitionEmbeddedLifecycle(lifecycle, { type:'ready' }), EmbeddedLifecycleTransitionError);

  for (const path of [
    './assets/js/core/auth.js', './assets/js/core/backup.js', './assets/js/features/auth/index.js', './assets/js/features/account/index.js',
    './assets/js/runtime/module-bootstrap.js', './assets/js/core/module-identity-bridge.js', './assets/js/core/module-cloud-store.js', './assets/js/runtime/module-host.js', './assets/js/core/cloud-module-data.js',
  ]) assert.equal(await missing(path), true, `obsolete runtime shim still exists: ${path}`);

  const [bootstrap, host, store, bridge, backup, app, migration] = await Promise.all([
    read('./assets/js/runtime/module-bootstrap.ts'), read('./assets/js/runtime/module-host.ts'), read('./assets/js/core/module-cloud-store.ts'),
    read('./assets/js/core/module-identity-bridge.ts'), read('./assets/js/core/backup.ts'), read('./assets/js/app.ts'),
    read('./supabase/migrations/v1.41.0-transactional-backup-restore.sql'),
  ]);
  assert.match(bootstrap, /startEmbeddedModule/);
  assert.match(host, /parseModuleIdentityRequest/);
  assert.match(store, /AbortController/);
  assert.match(bridge, /installModuleIdentityBridge/);
  assert.match(app, /wm:module-store-invalidate[\s\S]+moduleHost\.invalidate/);
  assert.match(backup, /wm_restore_workspace_backup_v4/);
  assert.match(migration, /'verified',true/);
  assert.match(migration, /Board cell references an item outside the restored board/);

  console.log('v1.41.0 non-visual runtime migration verification: PASS');
} finally {
  auth.channel?.close();
}
