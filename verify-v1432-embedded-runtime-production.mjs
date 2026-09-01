import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (path) => fs.readFileSync(path, 'utf8');

const vite = read('vite.config.js');
assert.match(vite, /preserveEntrySignatures:\s*['"]strict['"]/, 'production build must preserve stable embedded-runtime entry exports');

for (const [htmlPath, moduleId, entry] of [
  ['apps/time-tracker/index.html', 'time-tracker', './app.js'],
  ['apps/fueltrack-plus/runtime.html', 'fueltrack-plus', './app.v3.17.0-wm6.js'],
  ['apps/tradelink/runtime.html', 'tradelink', './app.v1.42.0-wm1.js'],
]) {
  const html = read(htmlPath);
  assert.ok(html.includes("import { startEmbeddedModule } from '../../assets/js/runtime/module-bootstrap.ts'"), `${moduleId} must import the shared bootstrap API in development source`);
  assert.ok(html.includes(`moduleId: '${moduleId}'`), `${moduleId} bootstrap identity is missing`);
  assert.ok(html.includes(`entry: '${entry}'`), `${moduleId} runtime entry is missing`);
  assert.ok(html.includes('failureHint:'), `${moduleId} must retain a recoverable startup failure state`);
}

const bootstrap = read('assets/js/runtime/module-bootstrap.ts');
assert.match(bootstrap, /export function startEmbeddedModule\(/, 'embedded bootstrap must expose the named API imported by copied production HTML');
assert.match(bootstrap, /renderFailure\(config, message\)/, 'embedded startup failures must render an actionable fallback instead of a blank module');
assert.match(bootstrap, /postHostError\(config, message\)/, 'embedded startup failures must be surfaced to the parent host');

const distVerifier = read('scripts/verify-dist.mjs');
assert.match(distVerifier, /startEmbeddedModule/, 'dist verification must validate the emitted bootstrap named export');
assert.match(distVerifier, /bootstrapSource/, 'dist verification must statically validate the emitted bootstrap facade');
assert.match(distVerifier, /startEmbeddedModule\\b/, 'dist verification must require the emitted named bootstrap export');
assert.doesNotMatch(distVerifier, /await\s+import\(bootstrapUrl\)/, 'Node dist verification must not execute-import browser-only runtime chunks');

const previewVerifier = read('scripts/verify-vite-server.mjs');
for (const path of ['/apps/time-tracker/index.html', '/apps/fueltrack-plus/runtime.html', '/apps/tradelink/runtime.html']) {
  assert.ok(previewVerifier.includes(path), `preview smoke must exercise ${path}`);
}
assert.match(previewVerifier, /could not start|Authenticated .* access is required|Open .* through Work Management/, 'preview embedded-runtime smoke must require an explicit startup/failure state');

console.log('v1.43.2 production embedded-runtime compatibility verification: PASS');
