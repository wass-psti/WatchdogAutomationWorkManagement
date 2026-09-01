import fs from 'node:fs';
import assert from 'node:assert/strict';
const read=(p)=>fs.readFileSync(p,'utf8');
const runtimeFiles=[
  'apps/time-tracker/app.js','apps/time-tracker/index.html',
  'apps/fueltrack-plus/app.v3.17.0-wm6.js','apps/fueltrack-plus/runtime.html',
  'apps/tradelink/app.v1.42.0-wm1.js','apps/tradelink/runtime.html'
];
for(const file of runtimeFiles){
  const src=read(file);
  for(const forbidden of ['localStorage','sessionStorage','localhost','127.0.0.1','Local Workspace','local workspace','local-first']) assert.ok(!src.includes(forbidden),`${file} still contains local runtime marker: ${forbidden}`);
}
const store=read('assets/js/core/module-cloud-store.ts');
for(const marker of ['WMModuleStore','wm:data:request','list','put','delete','identityReady']) assert.ok(store.includes(marker),`cloud module store missing ${marker}`);
const parent=read('assets/js/core/cloud-module-data.ts');
for(const marker of ['list_module_state','put_module_state','delete_module_state','ensureAccessToken','canAccessModule']) assert.ok(parent.includes(marker),`parent cloud bridge missing ${marker}`);
const identity=read('assets/js/core/module-identity-bridge.ts');
assert.ok(!identity.includes('localStorage'), 'module identity bridge must not read browser-local identity state');
assert.ok(identity.includes('wm:identity:request'), 'module identity handshake missing');
const migration=read('supabase/migrations/v1.16.0-shared-data-architecture.sql');
const migration117=read('supabase/migrations/v1.17.0-state-contract-and-activity.sql');
for(const marker of ['module_state_entries','workspaces','workspace_members','has_module_access','list_module_state','list_module_directory','put_module_state','delete_module_state','WM_STATE_CONFLICT','on conflict on constraint module_state_entries_pkey','revoke all on public.module_state_entries']) assert.ok(migration.includes(marker),`migration missing ${marker}`);
const sw=read('service-worker.js');
assert.ok(sw.includes("work-management-v1.43.2"),'service worker version mismatch');
assert.ok(!sw.includes("'./apps/time-tracker/app.js'"),'module runtime must not be precached for offline fallback');
assert.ok(sw.includes("url.pathname.includes('/apps/')"),'active-environment module network policy missing');
const fuel=read('apps/fueltrack-plus/app.v3.17.0-wm6.js');
assert.ok(fuel.includes('AUTHENTICATED_ROLE'),'FuelTrack+ must derive authorization from cloud identity');
assert.ok(!fuel.includes('migrateLegacyMockData'),'FuelTrack+ legacy mock migration must be removed');
const trade=read('apps/tradelink/app.v1.42.0-wm1.js');
assert.ok(trade.includes('work-management-cloud'),'TradeLink cloud identity mapping missing');
const time=read('apps/time-tracker/app.js');
assert.ok(time.includes('cloudPrincipal()'),'TimeTracker cloud principal mapping missing');
for(const marker of ['module_state_key_policies','module_activity_events','list_module_activity','commit_fueltrack_requests_with_activity']) assert.ok(migration117.includes(marker),`v1.17 migration missing ${marker}`);
assert.ok(parent.includes('commit_fueltrack_requests_with_activity'),'atomic request/activity bridge missing');
console.log('cloud runtime verification: PASS');
