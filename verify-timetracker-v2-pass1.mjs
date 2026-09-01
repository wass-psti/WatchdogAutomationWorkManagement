import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const [html, app, css, motion, modules, release] = await Promise.all([
  readFile('apps/time-tracker/index.html', 'utf8'),
  readFile('apps/time-tracker/app.js', 'utf8'),
  readFile('apps/time-tracker/v2.css', 'utf8'),
  readFile('apps/time-tracker/v2-motion.js', 'utf8'),
  readFile('config/modules.ts', 'utf8'),
  readFile('apps/time-tracker/verify-release.sh', 'utf8'),
]);

const checks = [
  ['TimeTracker module advertises v2.0.0', /'time-tracker':[\s\S]*?version:\s*'2\.0\.0'/.test(modules)],
  ['v2 stylesheet is loaded after shared presentation layers', /motion-design\.css[\s\S]*?\.\/v2\.css/.test(html)],
  ['v2 motion runtime is loaded without replacing the authenticated module bootstrap', /v2-motion\.js/.test(html) && /startEmbeddedModule/.test(html) && /entry:\s*'\.\/app\.js'/.test(html)],
  ['v2 body identity is explicit', /data-tt-version="2"/.test(html)],
  ['stable shell includes a compact navigation rail', /class="tt-v2-rail"/.test(app) && /class="nav-tabs wm-tabs"/.test(app)],
  ['shell content remains a direct main child for scoped route motion', /<main id="timeMain" data-time-main role="tabpanel"><\/main>/.test(app) && /selector:\s*'\.app-shell > main > :first-child'/.test(app)],
  ['Clock v2 exposes explicit spatial state without changing existing controls', /data-clock-state="\$\{clockState\}"/.test(app) && /id="clockIn"/.test(app) && /id="clockOut"/.test(app) && /id="gpsStatus"/.test(app)],
  ['Clock v2 retains attendance policy copy', /8:00 AM standard start/.test(app) && /12:00–1:00 PM unpaid break/.test(app) && /9 base credited hours required/.test(app)],
  ['Overview v2 prioritizes current attendance state', /class="tt-v2-overview-focus/.test(app) && /CURRENT ATTENDANCE STATE/.test(app) && /data-view="clock"/.test(app)],
  ['parallax runtime is event-driven and frame-bounded', /requestAnimationFrame\(commitPointer\)/.test(motion) && /requestAnimationFrame\(commitScroll\)/.test(motion) && /IntersectionObserver/.test(motion)],
  ['parallax runtime supports reduced motion and coarse pointers', /prefers-reduced-motion: reduce/.test(motion) && /pointer: coarse/.test(motion) && /dataset\.ttV2Motion/.test(motion)],
  ['v2 CSS contains a complete reduced-motion path', /@media \(prefers-reduced-motion: reduce\)/.test(css) && /transform:\s*none !important/.test(css)],
  ['v2 CSS collapses rail navigation for intermediate viewports', /@media \(max-width: 960px\)/.test(css) && /grid-template-areas:[\s\S]*?'header'[\s\S]*?'rail'[\s\S]*?'main'/.test(css)],
  ['v2 CSS avoids broad transition-all declarations', !/transition\s*:\s*all\b/.test(css)],
  ['release verifier protects v2 presentation assets', /v2\.css/.test(release) && /v2-motion\.js/.test(release)],
];

for (const [label, ok] of checks) {
  assert.equal(ok, true, label);
  console.log(`PASS ${label}`);
}

console.log('TimeTracker v2 parallax reconstruction pass-one verification: PASS');
