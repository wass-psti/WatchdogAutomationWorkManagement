import { access, readFile, readdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(process.cwd(), 'dist');
const fail = (message) => { throw new Error(`[dist] ${message}`); };
const mustExist = async (path) => { try { await access(resolve(root, path)); } catch { fail(`missing ${path}`); } };

for (const path of [
  'index.html', 'service-worker.js', 'config/runtime-assets.js', 'manifest.webmanifest', 'assets/icon.svg',
  'apps/time-tracker/index.html', 'apps/time-tracker/app.js', 'apps/time-tracker/styles.css',
  'apps/fueltrack-plus/runtime.html', 'apps/fueltrack-plus/app.v3.17.0-wm6.js', 'apps/fueltrack-plus/styles.v3.17.0-wm6.css',
  'apps/tradelink/runtime.html', 'apps/tradelink/app.v1.42.0-wm1.js', 'apps/tradelink/styles.v1.42.0-wm1.css',
  'assets/js/runtime/module-bootstrap.js',
  'assets/js/runtime/motion-orchestrator.js',
  'assets/js/runtime/motion-design.js',
]) await mustExist(path);

const obsoletePresentationAssets = [
  'apps/fueltrack-plus/styles.css',
  'apps/fueltrack-plus/styles.v3.17.0-wm2.css',
  'apps/fueltrack-plus/styles.v3.17.0-wm3.css',
  'apps/fueltrack-plus/styles.v3.17.0-wm4.css',
  'apps/fueltrack-plus/styles.v3.17.0-wm5.css',
  'apps/tradelink/styles.css',
];
for (const path of obsoletePresentationAssets) {
  try { await access(resolve(root, path)); fail(`obsolete presentation asset emitted: ${path}`); } catch (error) {
    if (String(error?.message || '').startsWith('[dist]')) throw error;
  }
}

const index = await readFile(resolve(root, 'index.html'), 'utf8');
if (index.includes('/src/main.ts') || index.includes('assets/js/app.ts') || index.includes('assets/css/app.css')) fail('index.html still references unbundled shell sources');
if (!/build\/.+\.js/.test(index) || !/build\/.+\.css/.test(index)) fail('index.html does not reference Vite-generated JS/CSS');
if (index.includes('%BASE_URL%')) fail('Vite BASE_URL placeholder was not resolved');

const runtimeAssets = await readFile(resolve(root, 'config/runtime-assets.js'), 'utf8');
const listed = [...runtimeAssets.matchAll(/"(\.\/[^"\n]+)"/g)].map((match) => match[1]);
if (!listed.some((path) => /^\.\/build\/.+\.js$/.test(path))) fail('generated service-worker manifest contains no bundled JS');
if (!listed.some((path) => /^\.\/build\/.+\.css$/.test(path))) fail('generated service-worker manifest contains no bundled CSS');
for (const path of listed.filter((path) => path !== './')) {
  await mustExist(path.replace(/^\.\//, ''));
}

const sw = await readFile(resolve(root, 'service-worker.js'), 'utf8');
if (!sw.includes("work-management-v1.43.2")) fail('service-worker cache version mismatch');
if (!sw.includes("importScripts('./config/runtime-assets.js')")) fail('service-worker does not load generated asset manifest');

const manifest = JSON.parse(await readFile(resolve(root, 'manifest.webmanifest'), 'utf8'));
if (manifest.name !== 'Work Management' || !Array.isArray(manifest.icons) || !manifest.icons.length) fail('web manifest is invalid');

const viteManifest = JSON.parse(await readFile(resolve(root, '.vite/manifest.json'), 'utf8'));
const manifestEntries = Object.entries(viteManifest);

// This build intentionally has four Vite entries:
//   1. index.html — the shell entry that MUST be referenced by the generated HTML;
//   2–4. TypeScript embedded-runtime sources that MUST emit stable JavaScript paths.
// The manifest records source identities (`.ts`) separately from emitted files (`.js`).
// Never select an arbitrary `isEntry` record here: manifest ordering is not a contract and
// may place module-bootstrap before index.html.
const shellEntry = manifestEntries.find(([key, value]) => key === 'index.html' || value?.src === 'index.html')
  || manifestEntries.find(([, value]) => value?.isEntry === true && value?.src === 'src/main.ts');
if (!shellEntry) fail('Vite manifest does not contain the shell application entry');
const [shellEntryKey, shellEntryMeta] = shellEntry;
if (!shellEntryMeta?.file || !String(shellEntryMeta.file).endsWith('.js')) {
  fail(`Vite shell entry ${shellEntryKey} does not emit a JavaScript bundle`);
}
await mustExist(shellEntryMeta.file);
const normalizedShellEntryFile = String(shellEntryMeta.file).replace(/^\/?/, '');
if (!index.includes(normalizedShellEntryFile)
  && !index.includes(`./${normalizedShellEntryFile}`)
  && !index.includes(`/${normalizedShellEntryFile}`)) {
  fail(`index.html does not reference the Vite shell entry ${shellEntryMeta.file}`);
}

const bootstrapEntry = manifestEntries.find(([key, value]) =>
  key === 'assets/js/runtime/module-bootstrap.ts'
  || value?.src === 'assets/js/runtime/module-bootstrap.ts'
);
if (!bootstrapEntry) fail('Vite manifest does not contain the embedded module-bootstrap entry');
const [bootstrapEntryKey, bootstrapEntryMeta] = bootstrapEntry;
if (bootstrapEntryMeta?.isEntry !== true) fail(`embedded runtime ${bootstrapEntryKey} is not marked as a Vite entry`);
if (bootstrapEntryMeta?.file !== 'assets/js/runtime/module-bootstrap.js') {
  fail(`embedded runtime entry emitted an unexpected path: ${bootstrapEntryMeta?.file || '<missing>'}`);
}
await mustExist(bootstrapEntryMeta.file);

// The copied embedded HTML imports a named API from this stable production entry.
// This verifier runs in Node, while the emitted browser entry can transitively execute
// DOM-dependent chunks during module evaluation. Do not execute-import the browser
// bundle here. Instead, verify the emitted ESM facade retains the named export
// statically; scripts/verify-vite-server.mjs then executes all three embedded pages in
// headless Chromium, which validates the contract in the correct browser environment.
const bootstrapSource = await readFile(resolve(root, bootstrapEntryMeta.file), 'utf8');
if (!/\bexport\s*\{[^}]*\bstartEmbeddedModule\b[^}]*\}/s.test(bootstrapSource)) {
  fail('production module-bootstrap entry does not retain the startEmbeddedModule named export');
}

for (const [source, output] of [
  ['assets/js/runtime/motion-orchestrator.ts', 'assets/js/runtime/motion-orchestrator.js'],
  ['assets/js/runtime/motion-design.ts', 'assets/js/runtime/motion-design.js'],
]) {
  const entry = manifestEntries.find(([key, value]) => key === source || value?.src === source);
  if (!entry) fail(`Vite manifest does not contain ${source}`);
  const [entryKey, entryMeta] = entry;
  if (entryMeta?.isEntry !== true) fail(`${entryKey} is not marked as a Vite entry`);
  if (entryMeta?.file !== output) fail(`${entryKey} emitted an unexpected path: ${entryMeta?.file || '<missing>'}`);
  await mustExist(output);
}

for (const embeddedHtml of [
  'apps/time-tracker/index.html',
  'apps/fueltrack-plus/runtime.html',
  'apps/tradelink/runtime.html',
]) {
  const html = await readFile(resolve(root, embeddedHtml), 'utf8');
  if (html.includes('assets/js/runtime/module-bootstrap.ts')
    || html.includes('assets/js/runtime/motion-orchestrator.ts')
    || html.includes('assets/js/runtime/motion-design.ts')) {
    fail(`${embeddedHtml} still references TypeScript runtime sources`);
  }
}


const buildDir = resolve(root, 'build');
const buildFiles = await readdir(buildDir);
const js = buildFiles.filter((name) => name.endsWith('.js'));
const css = buildFiles.filter((name) => name.endsWith('.css'));
const maps = buildFiles.filter((name) => name.endsWith('.map'));
if (js.length < 2) fail('expected an entry plus at least one split JavaScript chunk');
if (css.length < 1) fail('expected bundled CSS output');
const sourceMapMode = String(process.env.VITE_BUILD_SOURCEMAP || 'false').trim().toLowerCase();
const expectsExternalMaps = ['true', '1', 'on', 'hidden'].includes(sourceMapMode);
if (expectsExternalMaps && maps.length < 1) fail('diagnostic build requested external source maps but none were generated');
if (!expectsExternalMaps && maps.length > 0) fail('public release unexpectedly contains source maps');

const oversized = [];
for (const name of js) {
  const info = await stat(resolve(buildDir, name));
  if (info.size > 1_500_000) oversized.push(`${name} (${Math.round(info.size / 1024)} KiB)`);
}
if (oversized.length) fail(`unexpectedly large shell chunks: ${oversized.join(', ')}`);

console.log(`Vite dist verification: PASS (${js.length} JS chunks, ${css.length} CSS assets, ${maps.length} source maps; policy=${sourceMapMode})`);
