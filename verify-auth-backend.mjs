import fs from 'node:fs';
const read = (f) => fs.readFileSync(f,'utf8');
const app = read('assets/js/app.ts');
const auth = read('assets/js/core/auth.ts');
const authFeature = read('assets/js/features/auth/index.ts');
const backup = read('assets/js/core/backup.ts');
const config = read('config/backend-config.js');
const schema = read('supabase/schema.sql');
const sw = read('service-worker.js');
const cacheManifest = read('config/runtime-assets.js');
const checks = [
  [app.includes("from './runtime/index.ts'") && read('assets/js/runtime/index.ts').includes("features/auth/index.ts"),'app imports cloud auth through runtime feature gateway'],
  [authFeature.includes('data-auth-form="login"') && authFeature.includes('data-auth-form="register"'),'login and registration forms exist behind auth feature'],
  [app.includes('auth.canAccessModule(mod.id)'),'module authorization gate exists'],
  [auth.includes('/auth/v1/token?grant_type=password'),'password sign-in endpoint integrated'],
  [auth.includes('/auth/v1/signup'),'registration endpoint integrated'],
  [auth.includes('/auth/v1/token?grant_type=refresh_token'),'session refresh integrated'],
  [auth.includes('/rest/v1/profiles') && auth.includes('/rest/v1/module_role_assignments'),'cloud profile and role mapping integrated'],
  [backup.includes("!key.startsWith('wm.platform.auth.')") && backup.includes("!key.startsWith('wm.platform.identity.')"),'auth sessions and derived identity excluded from workspace backup'],
  [config.includes("accountBased: true") && config.includes("enabled: true") && config.includes("publishableKey: ''") && !config.includes('sb_secret_'),'repo requires account mode without shipping live credentials'],
  [schema.includes('enable row level security') && schema.includes('is_platform_admin'),'RLS and platform admin authorization are defined'],
  [schema.includes("'time-tracker','fueltrack-plus','tradelink'"),'existing modules are mapped in cloud roles'],
  [cacheManifest.includes('./assets/js/core/auth.ts') && cacheManifest.includes('./config/backend-config.js'),'auth runtime remains part of the protected shell'],
];
for (const [ok,label] of checks) { if (!ok) throw new Error(`FAIL: ${label}`); console.log(`PASS: ${label}`); }
console.log('Cloud auth/backend foundation verification: PASS');
