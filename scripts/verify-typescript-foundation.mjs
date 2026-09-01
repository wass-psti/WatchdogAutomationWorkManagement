import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (path) => fs.readFileSync(path, 'utf8');
const pkg = JSON.parse(read('package.json'));
const tsconfig = JSON.parse(read('tsconfig.json'));
const manifest = read('config/application-manifest.ts');
const vite = read('vite.config.js');

assert.equal(pkg.version, '1.43.2');
assert.equal(pkg.devDependencies?.typescript, '5.8.3');
assert.ok(String(pkg.scripts?.typecheck || '').includes('tsc --noEmit'));
assert.ok(String(pkg.scripts?.['verify:types'] || '').includes('verify-typescript-foundation'));
assert.equal(tsconfig.compilerOptions.strict, true);
assert.equal(tsconfig.compilerOptions.allowJs, false, 'v1.42 must not rely on transitional JavaScript compilation');
assert.equal(tsconfig.compilerOptions.noUnusedLocals, true);
assert.equal(tsconfig.compilerOptions.noUnusedParameters, true);
assert.equal(tsconfig.compilerOptions.moduleResolution, 'Bundler');
assert.equal(tsconfig.compilerOptions.noUncheckedIndexedAccess, true);
assert.equal(tsconfig.compilerOptions.exactOptionalPropertyTypes, true);
assert.equal(tsconfig.compilerOptions.useUnknownInCatchVariables, true);
assert.ok(tsconfig.compilerOptions.paths['@platform/*']);
assert.ok(vite.includes("alias:"), 'Vite aliases must mirror TypeScript path aliases.');
assert.ok(manifest.includes('architectureVersion: 15'));
assert.ok(manifest.includes("typeSystem: 'typescript-incremental'"));
assert.ok(manifest.includes("typecheck: 'strict-boundaries'"));

for (const file of [
  'src/types/identifiers.ts',
  'src/types/auth.ts',
  'src/types/manifest.ts',
  'src/platform/contracts/transport.ts',
  'src/platform/contracts/query.ts',
  'src/features/boards/contracts/domain.ts',
  'src/features/boards/contracts/status-schema.ts',
  'src/features/boards/contracts/repository.ts',
  'assets/js/platform/data/backend-client.ts',
  'assets/js/platform/data/query-client.ts',
  'assets/js/platform/auth/permissions.ts',
  'assets/js/features/boards/data/board-repository.ts',
]) assert.ok(fs.existsSync(file), `Missing TypeScript boundary: ${file}`);

for (const staleShim of [
  'assets/js/platform/data/backend-client.d.ts',
  'assets/js/platform/data/query-client.d.ts',
  'assets/js/platform/auth/permissions.d.ts',
  'assets/js/features/boards/data/board-repository.d.ts',
]) assert.equal(fs.existsSync(staleShim), false, `Obsolete declaration shim remains: ${staleShim}`);

const boardDomain = read('src/features/boards/contracts/domain.ts');
assert.ok(boardDomain.includes("data_type: TType"));
assert.ok(boardDomain.includes('StatusLabelId'));
assert.ok(boardDomain.includes('StatusColumnConfig'));
const status = read('src/features/boards/contracts/status-schema.ts');
assert.ok(status.includes('parseStatusColumnConfig'));
assert.ok(status.includes('Unknown status label identifier'));
assert.ok(!read('src/types/index.ts').includes('any'));

console.log('v1.43.2 TypeScript foundation architecture verification: PASS');
