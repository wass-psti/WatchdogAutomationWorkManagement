import fs from 'node:fs';
import assert from 'node:assert/strict';
const read=(p)=>fs.readFileSync(p,'utf8');
const sql=read('supabase/migrations/v1.16.0-shared-data-architecture.sql');
for(const marker of [
  'workspace_id','workspace_members','current_workspace_id','list_module_directory',
  'module_state_write_allowed','p_expected_revision','WM_STATE_CONFLICT',
  'on conflict on constraint module_state_entries_pkey','module_state_visible_value','module_state_payload_allowed','module_state_merge_authorized_payload','module_state_delete_allowed','profiles_default_workspace_membership'
]) assert.ok(sql.includes(marker),`shared-data migration missing ${marker}`);
assert.ok(sql.includes("drop function if exists public.put_module_state(text,text,text,text)"),'legacy ambiguous put RPC must be dropped');
assert.ok(sql.includes("drop function if exists public.delete_module_state(text,text,text)"),'legacy delete RPC must be dropped');
const store=read('assets/js/core/module-cloud-store.ts');
for(const marker of ['revisions = new Map','persistWithConflictRecovery','mergeValues','window.setInterval(() => { void refresh(); }, 5000)','WMModuleDirectory','wm:module-directory-change','expectedRevision']) assert.ok(store.includes(marker),`cloud store missing ${marker}`);
const bridge=read('assets/js/core/cloud-module-data.ts');
for(const marker of ['list_module_directory','p_expected_revision']) assert.ok(bridge.includes(marker),`cloud broker missing ${marker}`);
const tt=read('apps/time-tracker/app.js');
assert.ok(tt.includes('work-management-cloud-directory'),'TimeTracker must derive directory from Work Management cloud identity');
assert.ok(tt.includes('Roles and account status are managed centrally in Work Management'),'TimeTracker role UI must not own a second RBAC directory');
assert.ok(tt.includes("selection: { location: '', department: '' }"),'TimeTracker clock selection isolation missing');
const fuel=read('apps/fueltrack-plus/app.v3.17.0-wm6.js');
assert.ok(fuel.includes('cloudRoleDirectory'),'FuelTrack+ must use cloud role directory');
assert.ok(fuel.includes('createdByUserId'),'FuelTrack+ requests must carry stable cloud ownership IDs');
assert.ok(fuel.includes('Module-local role state cannot override it'),'FuelTrack+ local role override safeguard missing');
const modules=read('config/modules.ts');
assert.ok(!modules.includes("'timetracker.rbac.v1', 'timetracker.rbac.v1.backup'"),'obsolete TimeTracker local RBAC keys still registered');
assert.ok(!modules.includes("'fueltrackplus.userroles.v3'\n"),'obsolete FuelTrack+ role directory still registered');
console.log('shared data architecture verification: PASS');
