import assert from 'node:assert/strict';

const memory = new Map();
globalThis.localStorage = {
  setItem(k,v){ memory.set(String(k),String(v)); },
  getItem(k){ return memory.has(String(k)) ? memory.get(String(k)) : null; },
  removeItem(k){ memory.delete(String(k)); },
  key(i){ return [...memory.keys()][i] ?? null; },
  get length(){ return memory.size; }
};
globalThis.document = { documentElement: { dataset: {} } };
globalThis.window = { caches: undefined };
globalThis.location = { origin:'http://test.local' };
Object.defineProperty(globalThis, 'navigator', { configurable:true, value: {
  onLine: true,
  storage: {
    async estimate(){ return { usage:1024, quota:1048576 }; },
    async persisted(){ return false; },
    async persist(){ return true; }
  }
}});
globalThis.fetch = async () => ({ ok:true, status:200 });

globalThis.addEventListener = () => {};

const platform = await import('./assets/js/core/platform.ts');
const { modules } = await import('./config/modules.ts');

assert.equal(platform.savePreferences({theme:'dark',compact:true,favorites:['time-tracker'],recent:[]}), true);
assert.equal(platform.getPreferences().theme, 'dark');
assert.equal(platform.getPreferences().compact, true);
platform.applyDensity(true);
assert.equal(document.documentElement.dataset.density, 'compact');
platform.applyDensity(false);
assert.equal(document.documentElement.dataset.density, 'comfortable');

const persistence = await platform.requestPersistentStorage();
assert.deepEqual({supported:persistence.supported, granted:persistence.granted}, {supported:true, granted:true});

const health = await platform.getStorageHealth();
assert.equal(health.available, true);
assert.equal(health.quota, 1048576);
assert.equal(health.usage, 1024);

const compatibility = await platform.verifyModuleCompatibility(modules[0]);
assert.equal(compatibility.passed, true);
assert.equal(compatibility.checks.length >= 4, true);
const fuelCompatibility = await platform.verifyModuleCompatibility(modules.find((m)=>m.id === 'fueltrack-plus'));
assert.equal(fuelCompatibility.passed, true);
assert.equal(fuelCompatibility.checks.length >= 4, true);

const diagnostics = await platform.runPlatformDiagnostics(modules);
assert.equal(diagnostics.passed, true);
assert.equal(diagnostics.checks.some((c)=>c.id === 'preferences'), true);

console.log('settings-core-verification: PASS');

// Settings UI integration contracts: direct-bound controls and persistent restore input.
const fs = await import('node:fs');
const appSource = fs.readFileSync(new URL('./assets/js/app.ts', import.meta.url), 'utf8');
const settingsSource = fs.readFileSync(new URL('./assets/js/features/settings/index.ts', import.meta.url), 'utf8');
assert.match(appSource, /createSettingsFeature/);
assert.match(appSource, /settingsFeature\.handleAction/);
assert.doesNotMatch(appSource, /function bindSettingsInteractions\(\)/);
assert.match(settingsSource, /function ensureBackupInput\(\)/);
assert.match(settingsSource, /document\.body\.appendChild\(backupInput\)/);
assert.match(settingsSource, /backupInput\.addEventListener\('change', handleBackupSelection\)/);
assert.doesNotMatch(settingsSource, /event\.target\.id !== 'backupFile'/);
assert.match(settingsSource, /const result = await requestPersistentStorage\(\)/);
assert.match(settingsSource, /const count = await downloadWorkspaceBackup\(modules\)/);
console.log('settings-ui-wiring-verification: PASS');

const backup = await import('./assets/js/core/backup.ts');
const legacyPayload = {
  format: 'work-management-backup',
  backupVersion: 1,
  createdAt: new Date().toISOString(),
  data: {
    'wm.platform.preferences.v1': JSON.stringify({ theme: 'dark', compact: true, favorites: [], recent: [] }),
    'timetracker.attendance.v1': JSON.stringify({ version: 1, records: [], selection: { location: '', department: '' } }),
    'fueltrackplus.requests.v3': JSON.stringify([{ id: 'FT-TEST', status: 'Submitted' }])
  }
};
const legacyFile = new File([JSON.stringify(legacyPayload)], 'legacy-v1.json', { type:'application/json' });
const parsed = await backup.parseBackupFile(legacyFile, modules);
assert.equal(parsed.backupVersion, 4);
assert.deepEqual(parsed.migration, { fromVersion:1, toVersion:4 });
assert.equal(parsed.data['wm.platform.preferences.v1'], legacyPayload.data['wm.platform.preferences.v1']);
assert.equal(parsed.moduleData['time-tracker'][0].state_key, 'timetracker.attendance.v1');
assert.equal(parsed.moduleData['fueltrack-plus'][0].state_key, 'fueltrackplus.requests.v3');
assert.equal(parsed.entryCount, 3);
const legacyActivityPayload = {
  ...legacyPayload,
  data: {
    ...legacyPayload.data,
    'fueltrackplus.activity.v3': JSON.stringify([{ id:'evt-1', type:'submit', title:'Created request', message:'Test event', at:new Date().toISOString() }])
  }
};
const legacyActivityFile = new File([JSON.stringify(legacyActivityPayload)], 'legacy-activity-v1.json', { type:'application/json' });
const parsedActivity = await backup.parseBackupFile(legacyActivityFile, modules);
assert.equal(parsedActivity.activityData['fueltrack-plus'].length, 1);
assert.equal(parsedActivity.moduleData['fueltrack-plus'].some((row)=>row.state_key === 'fueltrackplus.activity.v3'), false);
const backupSource = fs.readFileSync(new URL('./assets/js/core/backup.ts', import.meta.url), 'utf8');
assert.match(backupSource, /BACKUP_VERSION = 4/);
assert.match(backupSource, /list_module_state/);
assert.match(backupSource, /wm_restore_workspace_backup_v4/);
assert.match(backupSource, /list_module_activity/);
assert.match(backupSource, /validateBoardSnapshot/);
assert.match(backupSource, /SUPPORTED_BACKUP_VERSIONS/);
assert.match(backupSource, /!auth\.isAuthenticated/);
assert.doesNotMatch(backupSource, /timetracker\.attendance\.v1[^\n]*localStorage\.getItem/);
console.log('settings-backup-cloud-migration-verification: PASS');


process.exit(0);
