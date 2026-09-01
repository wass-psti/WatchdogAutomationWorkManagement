import fs from 'node:fs';
import assert from 'node:assert/strict';
import { applicationManifest, validateApplicationManifest } from './config/application-manifest.ts';
import { applyViteRuntimeConfig, resolveViteRuntimeConfig } from './config/vite-runtime-config.ts';

const read = (path) => fs.readFileSync(path, 'utf8');
const exists = (path) => fs.existsSync(path);

for (const path of [
  'package.json', 'vite.config.js', '.env.example', '.gitignore', 'src/main.ts',
  'scripts/clean.mjs', 'scripts/verify-dist.mjs', 'scripts/verify-vite-server.mjs',
  'public/manifest.webmanifest', 'public/assets/icon.svg', 'config/vite-runtime-config.ts', 'config/vite-runtime-config.ts',
  'docs/architecture/VITE-MIGRATION-v1.36.md', 'docs/architecture/VITE-VERIFICATION-STATUS-v1.36.md',
]) assert.ok(exists(path), `Vite migration file missing: ${path}`);

const pkg = JSON.parse(read('package.json'));
assert.equal(pkg.version, '1.43.2');
assert.equal(pkg.type, 'module');
assert.equal(pkg.private, true);
assert.equal(pkg.devDependencies?.vite, '8.2.2', 'Vite must be pinned for reproducible migration verification');
for (const script of ['dev','start','build','preview','clean','verify','verify:vite','verify:dev','verify:dist','verify:preview','release:check']) {
  assert.ok(pkg.scripts?.[script], `package script missing: ${script}`);
}
assert.match(pkg.engines?.node || '', /20\.19/);
assert.match(pkg.engines?.node || '', /22\.12/, 'Node engine must satisfy Vite 8 requirements');

const vite = read('vite.config.js');
for (const token of [
  "from 'vite'", 'loadEnv(', "outDir: 'dist'", "assetsDir: 'build'", "target: 'baseline-widely-available'",
  'sourcemap:', 'manifest: true', 'cssCodeSplit: true', 'rolldownOptions', 'codeSplitting',
  "name: 'boards'", "name: 'identity'", "name: 'platform'", 'workManagementRuntimePlugin',
  "copyFileFromRoot('service-worker.js'", "resolve(rootDir, 'apps')", "config/runtime-assets.js",
]) assert.ok(vite.includes(token), `Vite config missing ${token}`);
assert.equal(vite.includes('manualChunks'), false, 'Vite 8 migration must not use legacy manualChunks configuration');
assert.equal(vite.includes('build.rollupOptions'), false, 'Vite 8 migration must use rolldownOptions rather than deprecated rollupOptions');

const index = read('index.html');
assert.ok(index.includes('type="module" src="/src/main.ts"'), 'index.html must use the Vite entry module');
for (const legacy of ['assets/js/app.ts','assets/css/app.css','config/backend-config.js','motion-orchestrator.js','motion-design.js']) {
  assert.equal(index.includes(legacy), false, `index.html still owns legacy direct loading: ${legacy}`);
}
assert.ok(index.includes('%BASE_URL%manifest.webmanifest') && index.includes('%BASE_URL%assets/icon.svg'), 'public assets must honor Vite base paths');

const main = read('src/main.ts');
for (const token of [
  "import '../assets/css/foundation/tokens.css'", "import '../assets/css/app.css'", "import '../assets/css/motion-design.css'",
  "import '../config/backend-config.js'", 'const viteEnv =', 'applyViteRuntimeConfig(viteEnv)', "addEventListener('vite:preloadError'", "await import('../assets/js/app.ts')",
]) assert.ok(main.includes(token), `Vite entry missing ${token}`);

const envExample = read('.env.example');
for (const key of ['VITE_SUPABASE_URL','VITE_SUPABASE_PUBLISHABLE_KEY','VITE_BASE_PATH','VITE_BUILD_SOURCEMAP']) {
  assert.ok(envExample.includes(key), `environment convention missing ${key}`);
}
const configSource = read('config/vite-runtime-config.ts');
assert.ok(configSource.includes('VITE_SUPABASE_URL') && configSource.includes('VITE_SUPABASE_PUBLISHABLE_KEY'), 'Vite runtime config does not map public Supabase values');
// Validate configuration precedence without assuming the checked-in project uses
// placeholder backend values. Real deployments may already contain a Supabase URL/key.
const fallbackConfig = Object.freeze({
  enabled: true,
  accountBased: true,
  supabaseUrl: 'https://configured-project.supabase.co',
  publishableKey: 'sb_publishable_configured',
  allowRegistration: true,
});
const overrideEnv = Object.freeze({
  VITE_SUPABASE_URL: 'https://vite-override.supabase.co',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_vite_override',
});
const resolvedOverride = resolveViteRuntimeConfig(overrideEnv, fallbackConfig);
assert.equal(resolvedOverride.supabaseUrl, overrideEnv.VITE_SUPABASE_URL, 'VITE_SUPABASE_URL must override an existing runtime URL');
assert.equal(resolvedOverride.publishableKey, overrideEnv.VITE_SUPABASE_PUBLISHABLE_KEY, 'VITE_SUPABASE_PUBLISHABLE_KEY must override an existing runtime key');
const resolvedFallback = resolveViteRuntimeConfig({}, fallbackConfig);
assert.equal(resolvedFallback.supabaseUrl, fallbackConfig.supabaseUrl, 'existing runtime URL must remain the fallback when VITE_SUPABASE_URL is absent');
assert.equal(resolvedFallback.publishableKey, fallbackConfig.publishableKey, 'existing runtime key must remain the fallback when VITE_SUPABASE_PUBLISHABLE_KEY is absent');

const previous = globalThis.WM_BACKEND_CONFIG;
globalThis.WM_BACKEND_CONFIG = fallbackConfig;
const applied = applyViteRuntimeConfig(overrideEnv);
assert.equal(applied.supabaseUrl, overrideEnv.VITE_SUPABASE_URL);
assert.equal(applied.publishableKey, overrideEnv.VITE_SUPABASE_PUBLISHABLE_KEY);
if (previous === undefined) delete globalThis.WM_BACKEND_CONFIG; else globalThis.WM_BACKEND_CONFIG = previous;

assert.equal(applicationManifest.version, '1.43.2');
assert.equal(applicationManifest.architectureVersion, 15);
assert.equal(applicationManifest.runtime, 'vite-esm');
assert.equal(applicationManifest.architecture?.buildPipeline, 'vite-8');
assert.equal(applicationManifest.architecture?.packageManager, 'npm');
assert.equal(validateApplicationManifest(applicationManifest).valid, true, 'Architecture v10 application manifest must validate');

const platform = read('assets/js/core/platform.ts');
assert.ok(platform.includes("PLATFORM_VERSION = '1.43.2'"));
assert.ok(platform.includes('isDevelopmentBuild()') && platform.includes("if (isDevelopmentBuild()"), 'service worker registration must be disabled during Vite development');
const sw = read('service-worker.js');
assert.ok(sw.includes("work-management-v1.43.2"));
assert.ok(sw.includes("importScripts('./config/runtime-assets.js')"));
assert.ok(sw.includes("url.pathname.includes('/build/')"), 'service worker must understand hashed Vite bundle assets');
const runtimeAssets = read('config/runtime-assets.js');
assert.ok(runtimeAssets.includes("'./src/main.ts'") && runtimeAssets.includes("'./config/vite-runtime-config.ts'"), 'source cache manifest must track the Vite entry/config compatibility surface');

const distVerifier = read('scripts/verify-dist.mjs');
for (const token of ['.vite/manifest.json','source maps','apps/time-tracker/index.html','apps/fueltrack-plus/runtime.html','apps/tradelink/runtime.html']) {
  assert.ok(distVerifier.includes(token), `dist verifier missing ${token}`);
}
const serverVerifier = read('scripts/verify-vite-server.mjs');
assert.ok(
  serverVerifier.includes('findBrowserBinary')
    && serverVerifier.includes('runBrowser')
    && serverVerifier.includes('BROWSER_BIN')
    && serverVerifier.includes('/src/main.ts')
    && serverVerifier.includes('/service-worker.js'),
  'dev/preview verifier must discover and launch a browser and exercise development/production deployment assets',
);

console.log('v1.43.2 Vite migration architecture verification: PASS');
