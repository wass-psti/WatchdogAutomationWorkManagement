import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (path) => fs.readFileSync(path, 'utf8');
const pkg = JSON.parse(read('package.json'));
const tsconfig = JSON.parse(read('tsconfig.json'));
const manifest = read('config/application-manifest.ts');

assert.equal(pkg.version, '1.43.2');
assert.equal(pkg.devDependencies?.typescript, '5.8.3');
assert.ok(pkg.scripts?.typecheck?.includes('tsc --noEmit'));
assert.equal(tsconfig.compilerOptions.strict, true);
assert.equal(tsconfig.compilerOptions.noUncheckedIndexedAccess, true);
assert.equal(tsconfig.compilerOptions.exactOptionalPropertyTypes, true);
assert.ok(tsconfig.include.includes('assets/js/**/*.ts'));
assert.ok(manifest.includes('architectureVersion: 15'));
assert.ok(manifest.includes("typeSystem: 'typescript-incremental'"));

const required = [
  'src/types/identifiers.ts',
  'src/types/auth.ts',
  'src/types/manifest.ts',
  'src/platform/contracts/transport.ts',
  'src/platform/contracts/query.ts',
  'src/platform/contracts/rbac.ts',
  'src/features/boards/contracts/domain.ts',
  'src/features/boards/contracts/status-schema.ts',
  'src/features/boards/contracts/repository.ts',
  'src/platform/contracts/composition.ts',
  'assets/js/runtime/platform-services.ts',
  'assets/js/platform/data/backend-client.ts',
  'assets/js/platform/data/query-client.ts',
  'assets/js/platform/auth/permissions.ts',
  'assets/js/features/boards/data/board-repository.ts',
];
for (const file of required) assert.ok(fs.existsSync(file), `missing TypeScript migration boundary: ${file}`);

for (const staleShim of [
  'assets/js/platform/data/backend-client.d.ts',
  'assets/js/platform/data/query-client.d.ts',
  'assets/js/platform/auth/permissions.d.ts',
  'assets/js/features/boards/data/board-repository.d.ts',
]) assert.equal(fs.existsSync(staleShim), false, `obsolete TypeScript declaration shim remains: ${staleShim}`);

assert.equal(fs.existsSync('assets/js/runtime/platform-services.d.ts'), false, 'composition-root declaration shim must be removed');
const platformServiceTypes = read('src/platform/contracts/composition.ts');
assert.ok(platformServiceTypes.includes('PlatformServices') && platformServiceTypes.includes('PlatformServiceOptions'), 'platform composition root needs authoritative TypeScript contracts');

for (const path of fs.readdirSync('src', { recursive: true }).filter((entry) => String(entry).endsWith('.ts'))) {
  const source = read(`src/${path}`);
  assert.equal(/@ts-ignore|@ts-nocheck|\bas any\b/.test(source), false, `unsafe TypeScript escape hatch found: ${path}`);
}

console.log('v1.43.2 incremental TypeScript foundation verification: PASS');
