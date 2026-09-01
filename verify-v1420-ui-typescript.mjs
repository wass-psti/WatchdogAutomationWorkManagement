import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const read = (filePath) => fs.readFileSync(filePath, 'utf8');
const exists = (filePath) => fs.existsSync(filePath);
const normalize = (filePath) => filePath.split(path.sep).join('/');

function walk(root, predicate = () => true) {
  if (!exists(root)) return [];
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...walk(target, predicate));
    else if (predicate(target)) files.push(normalize(target));
  }
  return files.sort();
}

const authorities = [
  'src/main.ts',
  'assets/js/app.ts',
  'assets/js/boards-ui.ts',
  'assets/js/features/boards/index.ts',
  'assets/js/runtime/motion-orchestrator.ts',
  'assets/js/runtime/motion-design.ts',
  'assets/js/features/home/index.ts',
  'assets/js/features/commands/index.ts',
  'assets/js/features/settings/index.ts',
  'assets/js/features/user-management/index.ts',
];
for (const filePath of authorities) {
  assert.ok(exists(filePath), `authoritative UI TypeScript source missing: ${filePath}`);
}

const prohibitedAuthorities = [
  'src/main.js',
  'assets/js/app.js',
  'assets/js/boards-ui.js',
  'assets/js/features/boards/index.js',
  'assets/js/runtime/motion-orchestrator.js',
  'assets/js/runtime/motion-design.js',
];
for (const filePath of prohibitedAuthorities) {
  assert.equal(exists(filePath), false, `obsolete UI JavaScript authority remains: ${filePath}`);
}

// The migrated Work Management source roots must no longer contain parallel JS/JSX
// implementations or project-owned declaration migration shims.
const obsoleteWorkManagementFiles = [
  ...walk('src', (filePath) => /\.(?:js|jsx|d\.ts)$/.test(filePath)),
  ...walk('assets/js', (filePath) => /\.(?:js|jsx|d\.ts)$/.test(filePath)),
];
assert.deepEqual(obsoleteWorkManagementFiles, [], `obsolete Work Management JS/declaration boundaries remain:\n${obsoleteWorkManagementFiles.join('\n')}`);

const tsFiles = [
  ...walk('src', (filePath) => /\.tsx?$/.test(filePath) && !filePath.endsWith('.d.ts')),
  ...walk('assets/js', (filePath) => /\.tsx?$/.test(filePath) && !filePath.endsWith('.d.ts')),
  ...walk('config', (filePath) => /\.tsx?$/.test(filePath) && !filePath.endsWith('.d.ts')),
];
assert.ok(tsFiles.length > 0, 'TypeScript source inventory is unexpectedly empty');

// Migration strictness: reject the broad escape hatches that this phase explicitly
// disallows. Narrow assertions following runtime guards remain permitted.
const unsafePatterns = [
  [/\bas\s+any\b/, 'as any'],
  [/\bas\s+unknown\s+as\b/, 'double assertion'],
  [/:\s*any\b/, 'explicit any annotation'],
  [/<\s*any\s*>/, 'any generic argument'],
  [/Record<[^>]*\bany\b/, 'Record with any value'],
  [/@ts-ignore\b/, '@ts-ignore'],
  [/@ts-nocheck\b/, '@ts-nocheck'],
  [/@ts-expect-error\b/, '@ts-expect-error'],
];
for (const filePath of tsFiles) {
  const source = read(filePath);
  for (const [pattern, description] of unsafePatterns) {
    assert.equal(pattern.test(source), false, `${description} remains in migrated TypeScript: ${filePath}`);
  }
}

const tsconfig = JSON.parse(read('tsconfig.json'));
const compiler = tsconfig.compilerOptions ?? {};
for (const [flag, expected] of [
  ['allowJs', false],
  ['strict', true],
  ['noImplicitAny', true],
  ['strictNullChecks', true],
  ['noUncheckedIndexedAccess', true],
  ['exactOptionalPropertyTypes', true],
  ['useUnknownInCatchVariables', true],
  ['noImplicitReturns', true],
  ['noFallthroughCasesInSwitch', true],
  ['noUnusedLocals', true],
  ['noUnusedParameters', true],
  ['verbatimModuleSyntax', true],
  ['isolatedModules', true],
]) {
  assert.equal(compiler[flag], expected, `TypeScript compiler flag ${flag} must be ${String(expected)}`);
}

const packageJson = JSON.parse(read('package.json'));
const packageLock = JSON.parse(read('package-lock.json'));
assert.equal(packageJson.version, '1.43.2', 'package version must be v1.43.2');
assert.equal(packageLock.version, packageJson.version, 'package-lock top-level version must match package.json');
assert.equal(packageLock.packages?.['']?.version, packageJson.version, 'package-lock root package version must match package.json');
assert.deepEqual(packageLock.packages?.['']?.devDependencies, packageJson.devDependencies, 'locked root devDependency declarations must match package.json');

// Resolve the relative and configured alias imports between TypeScript files and
// require an acyclic graph. This catches migration-created barrel/import cycles
// without depending on Vite or a locally installed compiler package.
const sourceSet = new Set(tsFiles.map((filePath) => normalize(path.resolve(filePath))));
const aliases = [
  ['@types/', 'src/types/'],
  ['@platform/', 'src/platform/'],
  ['@boards/', 'src/features/boards/'],
  ['@/', 'src/'],
];
function resolveTsImport(fromFile, specifier) {
  let base;
  if (specifier.startsWith('.')) {
    base = path.resolve(path.dirname(fromFile), specifier);
  } else {
    const alias = aliases.find(([prefix]) => specifier.startsWith(prefix));
    if (!alias) return null;
    base = path.resolve(alias[1], specifier.slice(alias[0].length));
  }
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
  ];
  if (/\.jsx?$/.test(base)) {
    candidates.push(base.replace(/\.jsx?$/, '.ts'), base.replace(/\.jsx?$/, '.tsx'));
  }
  for (const candidate of candidates) {
    const resolved = normalize(path.resolve(candidate));
    if (sourceSet.has(resolved)) return resolved;
  }
  return null;
}

const graph = new Map();
const importPattern = /(?:import|export)\s+(?:type\s+)?(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;
for (const relativeFile of tsFiles) {
  const absoluteFile = normalize(path.resolve(relativeFile));
  const edges = new Set();
  const source = read(relativeFile);
  for (const match of source.matchAll(importPattern)) {
    const specifier = match[1] ?? match[2];
    if (!specifier) continue;
    const resolved = resolveTsImport(absoluteFile, specifier);
    if (resolved) edges.add(resolved);
  }
  graph.set(absoluteFile, [...edges]);
}

const visiting = new Set();
const visited = new Set();
const stack = [];
function visit(node) {
  if (visiting.has(node)) {
    const start = stack.indexOf(node);
    const cycle = [...stack.slice(start), node].map((filePath) => normalize(path.relative(process.cwd(), filePath)));
    assert.fail(`TypeScript dependency cycle detected: ${cycle.join(' -> ')}`);
  }
  if (visited.has(node)) return;
  visiting.add(node);
  stack.push(node);
  for (const next of graph.get(node) ?? []) visit(next);
  stack.pop();
  visiting.delete(node);
  visited.add(node);
}
for (const node of graph.keys()) visit(node);

const boardsUi = read('assets/js/boards-ui.ts');
assert.ok(boardsUi.includes('assertNever('), 'Board rendering must retain an exhaustive never boundary');
const columnWorkflows = read('assets/js/features/boards/controllers/column-workflows.ts');
assert.ok(columnWorkflows.includes('assertNever('), 'Board column workflows must retain exhaustive column-type handling');

assert.ok(read('index.html').includes('type="module" src="/src/main.ts"'), 'root HTML must consume the TypeScript Vite entry');
const vite = read('vite.config.js');
for (const token of [
  "'motion-orchestrator': resolve(rootDir, 'assets/js/runtime/motion-orchestrator.ts')",
  "'motion-design': resolve(rootDir, 'assets/js/runtime/motion-design.ts')",
  "return 'assets/js/runtime/motion-orchestrator.js'",
  "return 'assets/js/runtime/motion-design.js'",
]) {
  assert.ok(vite.includes(token), `Vite motion runtime build contract missing: ${token}`);
}
const manifest = read('config/application-manifest.ts');
assert.ok(
  manifest.includes("version: '1.43.2'") &&
  manifest.includes('architectureVersion: 15') &&
  manifest.includes("uiRuntime: 'typescript-authoritative'"),
  'v1.42 TypeScript UI architecture declaration is incomplete',
);
for (const filePath of ['apps/time-tracker/index.html', 'apps/fueltrack-plus/runtime.html', 'apps/tradelink/runtime.html']) {
  const html = read(filePath);
  assert.ok(html.includes('type="module" src="../../assets/js/runtime/motion-orchestrator.ts"'), `${filePath} does not consume typed motion orchestration in development`);
  assert.ok(html.includes('type="module" src="../../assets/js/runtime/motion-design.ts"'), `${filePath} does not consume typed motion enhancement in development`);
}

for (const documentation of [
  'docs/architecture/TYPESCRIPT-UI-RUNTIME-v1.42.md',
  'docs/architecture/TYPESCRIPT-UI-RUNTIME-VERIFICATION-v1.42.md',
]) {
  assert.ok(exists(documentation), `v1.42 architecture documentation missing: ${documentation}`);
}

console.log(`v1.43.2 controlled UI/rendering TypeScript verification: PASS (${tsFiles.length} TS files, 0 TS dependency cycles)`);
