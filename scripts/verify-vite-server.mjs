import { spawn } from 'node:child_process';
import net from 'node:net';
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { delimiter, resolve } from 'node:path';



async function findBrowserBinary() {
  const explicit = [process.env.BROWSER_BIN, process.env.CHROME_BIN, process.env.CHROMIUM_BIN]
    .map((value) => String(value || '').trim())
    .filter(Boolean);

  const platformCandidates = process.platform === 'darwin'
    ? [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
        '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
        '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
        `${process.env.HOME || ''}/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`,
        `${process.env.HOME || ''}/Applications/Chromium.app/Contents/MacOS/Chromium`,
      ]
    : process.platform === 'win32'
      ? [
          `${process.env.PROGRAMFILES || ''}\\Google\\Chrome\\Application\\chrome.exe`,
          `${process.env['PROGRAMFILES(X86)'] || ''}\\Google\\Chrome\\Application\\chrome.exe`,
          `${process.env.LOCALAPPDATA || ''}\\Google\\Chrome\\Application\\chrome.exe`,
          `${process.env.PROGRAMFILES || ''}\\Microsoft\\Edge\\Application\\msedge.exe`,
          `${process.env['PROGRAMFILES(X86)'] || ''}\\Microsoft\\Edge\\Application\\msedge.exe`,
        ]
      : [
          '/usr/bin/chromium',
          '/usr/bin/chromium-browser',
          '/usr/bin/google-chrome',
          '/usr/bin/google-chrome-stable',
          '/usr/bin/microsoft-edge',
          '/usr/bin/microsoft-edge-stable',
        ];

  const pathNames = process.platform === 'win32'
    ? ['chrome.exe', 'chromium.exe', 'msedge.exe']
    : ['chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable', 'microsoft-edge', 'microsoft-edge-stable'];

  const pathDirectories = String(process.env.PATH || '').split(delimiter).filter(Boolean);
  const pathCandidates = pathDirectories.flatMap((directory) => pathNames.map((name) => resolve(directory, name)));
  const candidates = [...new Set([...explicit, ...platformCandidates, ...pathCandidates].filter(Boolean))];

  for (const candidate of candidates) {
    try {
      await access(candidate, process.platform === 'win32' ? constants.F_OK : constants.X_OK);
      return candidate;
    } catch {}
  }

  throw new Error([
    'No supported Chromium-based browser executable was found for the Vite smoke test.',
    'Install Google Chrome/Chromium/Microsoft Edge or set BROWSER_BIN to the executable path.',
    process.platform === 'darwin'
      ? 'Example: BROWSER_BIN="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" npm run release:check'
      : 'Example: BROWSER_BIN=/path/to/chromium npm run release:check',
  ].join('\n'));
}

function runBrowser(binary, args) {
  return new Promise((resolveRun, rejectRun) => {
    const browser = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    browser.stdout.on('data', (chunk) => { stdout += chunk; });
    browser.stderr.on('data', (chunk) => { stderr += chunk; });
    browser.once('error', (error) => rejectRun(new Error(`Unable to launch browser at ${binary}: ${error.message}`)));
    browser.once('close', (code, signal) => resolveRun({ code, signal, stdout, stderr }));
  });
}

const mode = process.argv[2] === 'dev' ? 'dev' : 'preview';
const viteBin = resolve(process.cwd(), 'node_modules/vite/bin/vite.js');
await access(viteBin).catch(() => { throw new Error('Vite is not installed. Run npm install first.'); });
if (mode === 'preview') await access(resolve(process.cwd(), 'dist/index.html')).catch(() => { throw new Error('dist/ is missing. Run npm run build first.'); });

const port = await new Promise((resolvePort, reject) => {
  const server = net.createServer();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const value = server.address().port;
    server.close(() => resolvePort(value));
  });
});
const args = [viteBin];
if (mode === 'preview') args.push('preview');
args.push('--host', '127.0.0.1', '--port', String(port), '--strictPort');
const child = spawn(process.execPath, args, { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] });
let output = '';
child.stdout.on('data', (chunk) => { output += chunk; });
child.stderr.on('data', (chunk) => { output += chunk; });
const stop = () => { if (!child.killed) child.kill('SIGTERM'); };
process.on('exit', stop);
process.on('SIGINT', () => { stop(); process.exit(130); });

const base = `http://127.0.0.1:${port}`;
try {
  let ready = false;
  for (let i = 0; i < 120; i++) {
    try {
      const response = await fetch(`${base}/`, { redirect: 'manual' });
      if (response.ok) { ready = true; break; }
    } catch {}
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  if (!ready) throw new Error(`Vite ${mode} server did not become ready.\n${output}`);

  const bootstrapPath = mode === 'dev' ? '/assets/js/runtime/module-bootstrap.ts' : '/assets/js/runtime/module-bootstrap.js';
  for (const path of [
    '/', '/manifest.webmanifest', '/assets/icon.svg',
    '/apps/time-tracker/index.html', '/apps/fueltrack-plus/runtime.html', '/apps/tradelink/runtime.html',
    bootstrapPath,
  ]) {
    const response = await fetch(`${base}${path}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`${mode} request failed for ${path}: HTTP ${response.status}`);
    if (path === bootstrapPath) {
      const contentType = response.headers.get('content-type') || '';
      if (!/javascript|typescript/i.test(contentType)) throw new Error(`${mode} runtime entry returned an unexpected content type: ${contentType || '<missing>'}`);
      const body = await response.text();
      if (!body.trim() || /<html[\s>]/i.test(body)) throw new Error(`${mode} runtime entry resolved to HTML instead of executable code`);
    }
  }
  if (mode === 'dev') {
    const entry = await fetch(`${base}/src/main.ts`, { cache:'no-store' });
    if (!entry.ok) throw new Error(`development entry failed: HTTP ${entry.status}`);
  } else {
    const sw = await fetch(`${base}/service-worker.js`, { cache:'no-store' });
    if (!sw.ok || !(await sw.text()).includes('work-management-v1.43.2')) throw new Error('production service worker is unavailable or stale');
  }

  const browserBinary = await findBrowserBinary();

  // In preview, open every copied embedded page without a parent host. The shared
  // bootstrap must still execute successfully and settle into an explicit auth/startup
  // failure state. A blank page here indicates the production bootstrap import itself
  // failed before module initialization (the regression v1.43.2 protects against).
  if (mode === 'preview') {
    for (const path of ['/apps/time-tracker/index.html', '/apps/fueltrack-plus/runtime.html', '/apps/tradelink/runtime.html']) {
      const embedded = await runBrowser(browserBinary, [
        '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--disable-background-networking',
        '--virtual-time-budget=5000', '--dump-dom', `${base}${path}`,
      ]);
      if (embedded.code !== 0) throw new Error(`Embedded preview smoke failed for ${path}.\n${embedded.stderr}`);
      if (!/could not start|Authenticated .* access is required|Open .* through Work Management/.test(embedded.stdout)) {
        throw new Error(`Embedded preview did not reach an explicit startup state for ${path}; production bootstrap may be non-executable.`);
      }
    }
  }
  const browserResult = await runBrowser(browserBinary, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--disable-background-networking',
    '--virtual-time-budget=3000', '--dump-dom', `${base}/#/login`,
  ]);
  if (browserResult.code !== 0) {
    throw new Error(`Browser smoke test failed (${browserResult.code ?? browserResult.signal ?? 'unknown'}).\n${browserResult.stderr}`);
  }
  const dom = browserResult.stdout;
  if (/id="app"\s*>\s*<\/div>/.test(dom)) throw new Error('application shell remained empty after browser startup');
  if (!/Sign in|Work Management|Account backend is not configured/.test(dom)) throw new Error('application shell did not reach an expected startup state');

  console.log(`Vite ${mode} server/browser smoke verification: PASS (${base})`);
} finally {
  stop();
  await new Promise((resolveWait) => setTimeout(resolveWait, 100));
}
