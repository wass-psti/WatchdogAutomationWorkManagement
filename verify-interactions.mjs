import fs from 'node:fs';

const app = fs.readFileSync('assets/js/app.ts', 'utf8');
const home = fs.readFileSync('assets/js/features/home/index.ts', 'utf8');
const css = fs.readFileSync('assets/css/app.css', 'utf8');

const checks = [
  ['explicit shell action selector', app.includes('SHELL_ACTION_SELECTOR') && app.includes("'button[data-nav]'"), true],
  ['pointer/click pairing', app.includes('pointerActivationTarget') && app.includes('isValidActivation(event, action)'), true],
  ['module nested-control guard', app.includes('isNestedControlInsideModuleCard'), true],
  ['strict app action resolution', app.includes('resolveAppAction(event.target)'), true],
  ['no broad ripple target selector', !app.includes("closest?.('button, .module-card, .recent-list button, .module-action, .back-btn')"), true],
  ['decorative card arrow is not a button', home.includes('class="card-arrow"') && !home.includes('aria-hidden="true">${icons.arrow}</button>'), true],
  ['view transition snapshots inert', css.includes('::view-transition{pointer-events:none}'), true],
  ['workspace/sidebar isolated', css.includes('.workspace{position:relative;z-index:0;isolation:isolate}') && css.includes('.sidebar{z-index:20}'), true],
  ['explicit pressed state', css.includes('.module-card.is-pressing'), true],
];

let failed = 0;
for (const [label, actual, expected] of checks) {
  const ok = actual === expected;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failed += 1;
}
if (failed) process.exit(1);
console.log('Interaction-boundary verification passed.');
