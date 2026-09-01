import fs from 'node:fs';

function assert(condition, message) { if (!condition) throw new Error(message); }
for (const file of ['supabase/schema.sql','supabase/migrations/v1.14.0-rbac-user-management.sql']) {
  const sql=fs.readFileSync(file,'utf8');
  const drop=sql.indexOf('drop constraint if exists profiles_platform_role_check');
  const normalize=sql.indexOf("update public.profiles set platform_role = case platform_role");
  const add=sql.indexOf('add constraint profiles_platform_role_check');
  assert(drop >= 0 && normalize >= 0 && add >= 0, `${file}: required RBAC migration statements missing`);
  assert(drop < normalize, `${file}: legacy role CHECK must be dropped before role normalization`);
  assert(normalize < add, `${file}: new role CHECK must be added only after role normalization`);
}
console.log('RBAC migration constraint-order verification passed.');
