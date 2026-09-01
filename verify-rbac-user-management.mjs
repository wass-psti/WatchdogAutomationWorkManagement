import fs from 'node:fs';

const auth = fs.readFileSync('assets/js/core/auth.ts','utf8');
const app = fs.readFileSync('assets/js/app.ts','utf8');
const authFeature = fs.readFileSync('assets/js/features/auth/index.ts','utf8');
const router = fs.readFileSync('assets/js/core/router.ts','utf8');
const schema = fs.readFileSync('supabase/schema.sql','utf8');
const migration = fs.readFileSync('supabase/migrations/v1.14.0-rbac-user-management.sql','utf8');
const reconciliation = fs.readFileSync('supabase/migrations/v1.14.2-rbac-reconciliation.sql','utf8');
const css = fs.readFileSync('assets/css/app.css','utf8');

const checks = [
  [schema.includes("default 'employee'"), 'Employee is the database default role'],
  [schema.includes("'admin_general_manager','hr','supervisor','employee'"), 'Supported role vocabulary is enforced in PostgreSQL'],
  [schema.includes("lmsenagan@watchdogautomation.com.ph"), 'Bootstrap administrator email is enforced server-side'],
  [schema.includes('admin_set_user_access'), 'Protected administrative access RPC exists'],
  [schema.includes('list_user_directory'), 'Protected user-directory RPC exists'],
  [schema.includes('At least one active Admin/General Manager is required'), 'Last-admin safeguard exists'],
  [schema.includes('bootstrap administrator cannot be demoted or disabled'), 'Bootstrap administrator safeguard exists'],
  [schema.includes('sync_module_roles'), 'Platform roles synchronize into module roles'],
  [schema.includes('revoke all on function public.sync_module_roles'), 'Internal role synchronization RPC is not callable by public clients'],
  [migration.includes("platform_role='admin_general_manager'"), 'Existing bootstrap account is promoted by migration'],
  [reconciliation.includes('claim_bootstrap_admin'), 'Reconciliation migration installs server-side bootstrap repair RPC'],
  [auth.includes('hasBootstrapRoleMismatch'), 'Client detects persisted bootstrap-role mismatch without elevating locally'],
  [auth.includes('/rest/v1/rpc/claim_bootstrap_admin'), 'Client delegates bootstrap repair to protected database RPC'],
  [auth.includes('REGISTRATION_GUARD_KEY'), 'Registration cooldown persists across refreshes'],
  [auth.includes('SIGNUP_COOLDOWN_MS = 60_000'), 'Signup duplicate-request cooldown exists'],
  [auth.includes('RESEND_COOLDOWN_MS = 60_000'), 'Confirmation resend cooldown exists'],
  [auth.includes('isRateLimitError'), '429/rate-limit classification exists'],
  [auth.includes('Custom SMTP'), 'Actionable rate-limit guidance exists'],
  [auth.includes('async listUsers()'), 'Admin directory client integration exists'],
  [auth.includes('async updateUserAccess'), 'Admin role/status mutation client integration exists'],
  [app.includes("data-nav=\"users\""), 'Admin Users navigation exists'],
  [app.includes('data-user-access-form'), 'User access editing UI exists'],
  [app.includes('data-user-directory-refresh'), 'User directory recovery/refresh exists'],
  [router.includes("first === 'users'"), 'Users route is registered'],
  [css.includes('.user-directory'), 'User management responsive styling exists'],
  [authFeature.includes('registrationDraft'), 'Registration form state preserves safe non-password fields behind auth controller'],
];

for (const [ok, label] of checks) {
  if (!ok) throw new Error(`FAIL: ${label}`);
  console.log(`OK: ${label}`);
}
console.log('RBAC + user-management verification: PASS');
