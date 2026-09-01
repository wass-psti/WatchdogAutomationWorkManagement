import fs from 'node:fs';
const js = fs.readFileSync('assets/js/app.ts', 'utf8');
const css = fs.readFileSync('assets/css/app.css', 'utf8');
const requiredJs = [
  'function queueEntranceMotion',
  'const transitionUpdate: TransitionUpdate',
  'function addInteractionRipple',
  'function updatePointerMotion',
  "hashchange: () => { commandFeature.close({ immediate: true }); transitionUpdate(render, 'route'); },",
  "document.addEventListener('pointerdown', (event) => {",
  "moduleFrame?.classList.add('module-frame-ready')",
];
for (const marker of requiredJs) if (!js.includes(marker)) throw new Error(`Missing motion JS marker: ${marker}`);
if (js.includes('document.startViewTransition(update)')) throw new Error('Root document View Transition must remain disabled.');
const requiredCss = [
  '--motion-fast:',
  '.content-motion-enter',
  '@keyframes wm-leaf-rise',
  '.interaction-ripple',
  '.module-frame-ready',
  '.command-backdrop.closing',
  '@media(prefers-reduced-motion:reduce)',
];
for (const marker of requiredCss) if (!css.includes(marker)) throw new Error(`Missing motion CSS marker: ${marker}`);
let braces=0; for(const char of css){if(char==='{')braces++;else if(char==='}')braces--;if(braces<0)throw new Error('CSS contains an unmatched closing brace.');} if(braces!==0)throw new Error(`CSS brace balance is ${braces}, expected 0.`);
console.log('motion-system-verification: PASS');
