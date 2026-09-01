import fs from 'node:fs';
import vm from 'node:vm';

const domainCode = fs.readFileSync('apps/time-tracker/domain-config.js', 'utf8');
const code = fs.readFileSync('apps/time-tracker/app.js', 'utf8');
const userId = 'cloud:runtime-test-user';
const now = Date.now();
const tenHoursAgo = new Date(now - 10 * 60 * 60 * 1000).toISOString();
const store = new Map([
  ['timetracker.attendance.v1', JSON.stringify({
    version: 1,
    records: [{
      id: 'runtime-overdue-record',
      ownerId: userId,
      ownerName: 'Runtime Test',
      clockIn: {
        timestamp: tenHoursAgo,
        location: 'Office-Base Duty',
        department: 'Information Technology',
        geo: { status: 'captured', latitude: 0, longitude: 0, accuracy: 10 },
      },
      clockOut: null,
      note: '',
    }],
    selection: { location: 'Office-Base Duty', department: 'Information Technology' },
  })],
]);

const noop = () => {};
const classList = { add: noop, remove: noop, toggle: noop, contains: () => false };
const appMount = {
  childElementCount: 0,
  _innerHTML: '',
  classList,
  style: { removeProperty: noop },
  addEventListener: noop,
  querySelectorAll: () => [],
  querySelector: () => null,
  set innerHTML(value) { this._innerHTML = value; this.childElementCount = value ? 1 : 0; },
  get innerHTML() { return this._innerHTML; },
};
const generic = {
  classList,
  style: { removeProperty: noop, setProperty: noop },
  dataset: {},
  addEventListener: noop,
  removeEventListener: noop,
  querySelectorAll: () => [],
  querySelector: () => null,
  setAttribute: noop,
  getAttribute: () => null,
  append: noop,
  appendChild: noop,
  remove: noop,
  focus: noop,
  closest: () => null,
  getBoundingClientRect: () => ({ left: 0, top: 0, right: 100, bottom: 40, width: 100, height: 40 }),
  textContent: '',
  value: '',
  innerHTML: '',
};
// Model the persistent TimeTracker shell sufficiently for the runtime verifier to
// exercise successful UI mounting as well as attendance enforcement. The previous
// stub returned null for `.app-shell`, allowing a startup exception to be logged
// while the test still passed on persistence side effects.
const shellHeader = { ...generic, style: { ...generic.style }, dataset: {} };
const shellMain = { ...generic, style: { ...generic.style }, dataset: {} };
const shellRoot = {
  ...generic,
  style: { ...generic.style },
  dataset: {},
  querySelector: (selector) => selector === '.topbar' ? shellHeader : selector === '[data-time-main]' ? shellMain : null,
};
appMount.querySelector = (selector) => selector === '.app-shell' && appMount.childElementCount ? shellRoot : null;
const modalHost = { ...generic, style: { ...generic.style }, dataset: {} };
const document = {
  hidden: false,
  body: generic,
  documentElement: { ...generic, dataset: {}, clientWidth: 1440, clientHeight: 900 },
  getElementById: (id) => id === 'app' ? appMount : id === 'modalHost' ? modalHost : null,
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: () => ({ ...generic, style: { removeProperty: noop }, dataset: {}, classList: { ...classList } }),
  addEventListener: noop,
  removeEventListener: noop,
};
const localStorage = {
  getItem: (key) => store.has(key) ? store.get(key) : null,
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
  key: (index) => [...store.keys()][index] ?? null,
  get length() { return store.size; },
};
const WMModuleStore = {
  getItem: (key) => store.has(key) ? store.get(key) : null,
  setItem: (key, value) => { store.set(key, String(value)); return true; },
  setItemAsync: async (key, value) => { store.set(key, String(value)); return true; },
  removeItem: (key) => store.delete(key),
  key: (index) => [...store.keys()][index] ?? null,
  get length() { return store.size; },
  flush: async () => true,
  refresh: async () => true,
};
const WMModuleLocks = {
  acquire: async (key) => ({ key, token:`test-lock:${key}` }),
  release: async () => true,
};
const WM_IDENTITY_CONTEXT = { allowed:true, user:{ id:'runtime-test-user', displayName:'Runtime Test', email:'runtime@example.com' }, module:{ role:'System Admin' } };
const WMModuleDirectory = [{ id:'runtime-test-user', email:'runtime@example.com', display_name:'Runtime Test', module_role:'System Admin', status:'active' }];
const navigator = {
  language: 'en-US',
  platform: 'test',
  onLine: true,
  permissions: { query: async () => ({ state: 'denied' }) },
};
const windowObject = {
  document,
  navigator,
  localStorage,
  innerWidth: 1440,
  innerHeight: 900,
  matchMedia: () => ({ matches: true, addEventListener: noop, removeEventListener: noop }),
  addEventListener: noop,
  removeEventListener: noop,
  confirm: () => true,
  setTimeout: () => 0,
  clearTimeout: noop,
  location: { href: 'http://localhost/apps/time-tracker/' },
};
const context = {
  console,
  window: windowObject,
  document,
  navigator,
  localStorage,
  WMModuleStore,
  WMModuleLocks,
  WM_IDENTITY_CONTEXT,
  WMModuleDirectory,
  location: windowObject.location,
  crypto: globalThis.crypto,
  Blob: globalThis.Blob,
  URL: globalThis.URL,
  Intl,
  Date,
  Math,
  JSON,
  Object,
  Array,
  Set,
  Map,
  WeakMap,
  Promise,
  Number,
  String,
  Boolean,
  RegExp,
  Error,
  TypeError,
  parseInt,
  parseFloat,
  isNaN,
  setTimeout: () => 0,
  clearTimeout: noop,
  requestAnimationFrame: () => 0,
  cancelAnimationFrame: noop,
  FormData: class { get() { return ''; } },
  Event: class { constructor(type, init = {}) { this.type = type; this.bubbles = init.bubbles; } },
  HTMLSelectElement: class {},
};
context.globalThis = context;
Object.assign(windowObject, { window: windowObject, Event: context.Event, HTMLSelectElement: context.HTMLSelectElement });

vm.runInNewContext(domainCode, context, { filename: 'apps/time-tracker/domain-config.js', timeout: 5000 });
vm.runInNewContext(code, context, { filename: 'apps/time-tracker/app.js', timeout: 5000 });
for (let i=0;i<6;i+=1) { await Promise.resolve(); await new Promise((resolve)=>setImmediate(resolve)); }

if (!appMount.childElementCount) throw new Error('TimeTracker did not mount during overdue-session runtime test.');
const state = JSON.parse(store.get('timetracker.attendance.v1'));
const record = state.records.find((item) => item.id === 'runtime-overdue-record');
if (!record?.clockOut?.automatic) throw new Error('Overdue attendance record was not automatically clocked out.');
if (record.autoClockOut?.requiredWorkingMs !== 9 * 60 * 60 * 1000) {
  throw new Error(`Unexpected requiredWorkingMs: ${record.autoClockOut?.requiredWorkingMs}`);
}
console.log('timetracker-overdue-runtime-verification: PASS');
