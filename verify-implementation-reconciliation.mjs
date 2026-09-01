import fs from 'node:fs';

const platform = fs.readFileSync('assets/js/core/platform.ts','utf8');
const sw = fs.readFileSync('service-worker.js','utf8');
const auth = fs.readFileSync('assets/js/core/auth.ts','utf8');
const app = fs.readFileSync('assets/js/app.ts','utf8');
const accountFeature = fs.readFileSync('assets/js/features/account/index.ts','utf8');
const schema = fs.readFileSync('supabase/schema.sql','utf8');
const migration = fs.readFileSync('supabase/migrations/v1.14.2-rbac-reconciliation.sql','utf8');
const readme = fs.readFileSync('README.md','utf8');

const checks = [
  [platform.includes("PLATFORM_VERSION = '1.43.2'"), 'Executable shell version matches release'],
  [sw.includes("work-management-v1.43.2"), 'Service-worker cache version matches release'],
  [schema.includes('claim_bootstrap_admin'), 'Fresh schema contains bootstrap reconciliation RPC'],
  [migration.includes('claim_bootstrap_admin'), 'Upgrade migration contains bootstrap reconciliation RPC'],
  [migration.indexOf('drop constraint if exists profiles_platform_role_check') < migration.indexOf("when 'user' then 'employee'"), 'Upgrade migration removes old CHECK before role translation'],
  [migration.includes("where lower(email)='lmsenagan@watchdogautomation.com.ph'"), 'Upgrade migration promotes known bootstrap administrator'],
  [migration.includes("perform public.sync_module_roles(caller,'admin_general_manager',caller)"), 'Bootstrap reconciliation synchronizes module roles'],
  [migration.includes('grant execute on function public.claim_bootstrap_admin() to authenticated'), 'Authenticated bootstrap caller can invoke protected repair RPC'],
  [auth.includes('BOOTSTRAP_ADMIN_EMAIL'), 'Client has canonical bootstrap identity constant'],
  [auth.includes('hasBootstrapRoleMismatch'), 'Client detects server-state mismatch'],
  [auth.includes("/rest/v1/rpc/claim_bootstrap_admin"), 'Client requests server-enforced reconciliation'],
  [accountFeature.includes('Bootstrap administrator role is not applied'), 'Account UI exposes actionable migration mismatch'],
  [readme.includes('v1.14.2-rbac-reconciliation.sql'), 'README names the migration that actually exists'],
  [!readme.includes('v1.14.1-rbac-user-management.sql'), 'README no longer references nonexistent migration'],
];
for (const [ok,label] of checks) {
  if (!ok) throw new Error(`FAIL: ${label}`);
  console.log(`OK: ${label}`);
}
console.log('Implementation reconciliation verification: PASS');
