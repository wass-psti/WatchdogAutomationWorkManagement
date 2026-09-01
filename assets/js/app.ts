import {
  modules, moduleRegistry, parseRoute, navigate,
  PLATFORM_VERSION, applyTheme, applyDensity, getPreferences, registerServiceWorker,
  auth, AUTH_EVENT, installCloudModuleDataBridge, createBoardsFeature,
  createWorkManagementClient, createModuleHost, createFeatureRegistry, createRouteController, installApplicationLifecycle, createAuthenticationFeature, createAccountFeature, createUserManagementFeature, createSettingsFeature, createHomeFeature, createCommandPaletteFeature, createRuntimeErrorBoundary, createPlatformServices, applicationManifest, validateApplicationManifest, icons, escapeHtml,
} from './runtime/index.ts';
import { authorizationFingerprint, reconcileAuthorizationContext } from './runtime/authorization-context.ts';
import type { ModuleId } from '../../src/types/identifiers.ts';
import type { WorkManagementModuleDefinition } from '../../src/types/modules.ts';
import type { InstallPrompt, ToastTone, TransitionUpdate } from '../../src/platform/contracts/ui.ts';
import type { WorkManagementMotionApi } from '../../src/platform/contracts/motion.ts';
import type { RuntimeBoundaryContext } from './runtime/error-boundary.ts';
import type { WorkManagementError } from './platform/errors/app-error.ts';
import { buttonClass, iconButtonClass, navigationItemClass, toolbarClass } from './platform/ui/primitives.ts';

type MotionMode = 'page' | 'module' | 'home' | string;
type RuntimeRecord = Readonly<Record<string, unknown>>;
type ModuleInvalidateReason = 'backup-restore' | 'host-refresh';
interface WorkManagementRuntimeGlobal {
  readonly version: string;
  readonly architectureVersion: number;
  readonly listen: ReturnType<typeof createWorkManagementClient>['listen'];
  readonly get: ReturnType<typeof createWorkManagementClient>['get'];
  readonly set: ReturnType<typeof createWorkManagementClient>['set'];
  readonly execute: ReturnType<typeof createWorkManagementClient>['execute'];
  readonly getContext: ReturnType<typeof createWorkManagementClient>['getContext'];
  readonly features: () => unknown;
  readonly diagnostics: () => unknown;
  readonly serverState: () => unknown;
}

const globalRuntime = globalThis as typeof globalThis & { WorkManagementRuntime?: WorkManagementRuntimeGlobal };
const motionRuntime = (): WorkManagementMotionApi | undefined => globalThis.WorkManagementMotion;
const recordOf = (value: unknown): RuntimeRecord => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as RuntimeRecord : Object.freeze({});
const stringField = (value: unknown, key: string): string => { const field = recordOf(value)[key]; return typeof field === 'string' ? field : ''; };
const app = (() => {
  const host = document.querySelector<HTMLElement>('#app');
  if (!host) throw new Error('Work Management application host is missing.');
  return host;
})();
const esc = escapeHtml;
const primaryButtonClass = buttonClass({ tone: 'primary' }, 'primary-btn');
const secondaryButtonClass = buttonClass({ tone: 'secondary' }, 'secondary-btn');
const topActionToolbarClass = toolbarClass('top-actions');
let prefs = getPreferences();
let moduleFrame: HTMLIFrameElement | null = null;
let activeModuleId: ModuleId | null = null;
let deferredInstall: InstallPrompt | null = null;
let swUpdate: ServiceWorkerRegistration | null = null;
let moduleLoadTimer: number | null = null;
const reducedMotionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
const finePointerQuery = window.matchMedia?.('(pointer: fine)');
let motionFrame = 0;
let motionCleanupTimer: number | null = null;
let pointerActivationTarget: HTMLElement | null = null;
let pressedFeedbackTarget: HTMLElement | null = null;
const entryAnimations = new WeakMap<HTMLElement, Animation>();

// v1.22 architecture gateway: shell features interact through a small SDK-style
// runtime contract inspired by the supplied monday-sdk-js listener/get/set/execute model.
// Existing feature implementations stay intact behind explicit boundaries while they
// are migrated incrementally, avoiding a risky all-at-once rewrite.
const runtimeClient = createWorkManagementClient({
  context: { applicationId: applicationManifest.id, version: PLATFORM_VERSION, architectureVersion: applicationManifest.architectureVersion },
});
const platformServices = createPlatformServices({ auth });
const { diagnostics, serverState } = platformServices;
diagnostics.info('RUNTIME_BOOT', 'Work Management runtime initialized.', {
  version: PLATFORM_VERSION,
  architectureVersion: applicationManifest.architectureVersion,
  runtime: applicationManifest.runtime,
});
runtimeClient.register('diagnostics', { snapshot: () => diagnostics.snapshot(), clear: () => diagnostics.clear() });
runtimeClient.register('server-state', {
  snapshot: () => serverState.snapshot(),
  invalidate: (params: unknown) => serverState.invalidateQueries(Array.isArray(recordOf(params).key) ? recordOf(params).key as readonly string[] : []),
  clear: () => serverState.clear(),
});
runtimeClient.register('router', {
  current: () => parseRoute(),
  navigate: (params: unknown) => navigate(stringField(params, 'path')),
});
runtimeClient.register('manifest', {
  get: () => applicationManifest,
  validate: () => validateApplicationManifest(applicationManifest),
});
runtimeClient.register('identity', {
  current: (params: unknown) => {
    const moduleId = stringField(params, 'moduleId');
    return moduleId ? auth.moduleIdentityContext(moduleId) : auth.snapshot?.() || null;
  },
});
const moduleHost = createModuleHost({ auth, origin: location.origin, onEvent: (event) => runtimeClient.emit(event.type, event) });
window.addEventListener('wm:module-store-invalidate', (event: Event) => {
  const detail: RuntimeRecord = event instanceof CustomEvent ? recordOf(event.detail) : Object.freeze({});
  const reason: ModuleInvalidateReason = detail.reason === 'backup-restore' ? 'backup-restore' : 'host-refresh';
  moduleHost.invalidate(reason);
});
const featureRegistry = createFeatureRegistry(applicationManifest);
runtimeClient.register('features', {
  list: () => featureRegistry.snapshot(),
  get: (params: unknown) => featureRegistry.get(stringField(params, 'id'))?.metadata || null,
  ownerForRoute: (params: unknown) => featureRegistry.ownerForRoute(stringField(params, 'route')),
  validate: () => featureRegistry.validate(),
});
const manifestValidation = validateApplicationManifest(applicationManifest);
if (!manifestValidation.valid) console.error('[Work Management] Application manifest is invalid', manifestValidation.errors);
globalRuntime.WorkManagementRuntime = Object.freeze({
  version: PLATFORM_VERSION,
  architectureVersion: applicationManifest.architectureVersion,
  listen: runtimeClient.listen,
  get: runtimeClient.get,
  set: runtimeClient.set,
  execute: runtimeClient.execute,
  getContext: runtimeClient.getContext,
  features: () => featureRegistry.snapshot(),
  diagnostics: () => diagnostics.snapshot(),
  serverState: () => serverState.snapshot(),
});

installCloudModuleDataBridge({ auth, getFrame: () => moduleFrame, getModuleId: () => activeModuleId });

const SHELL_ACTION_SELECTOR = [
  'button[data-nav]',
  'button[data-command]',
  'button[data-favorite]',
  'article[data-open-module]',
  '.recent-list button[data-open-module]',
  'button[data-toggle-favorites]',
  'button[data-clear-filter]',
  'button[data-install]',
  'button[data-theme]',
  'button[data-setting-action]',
  'button[data-reload-frame]',
  'button[data-command-index]',
  'button[data-apply-update]',
  'button[data-dismiss-update]',
  'a.module-action[href]',
  'button.back-btn',
  'button[data-account]',
  'button[data-auth-action]',
  'button[data-resend-confirmation]',
  'button[data-confirm-verification]',
  'button[data-account-action]',
  'button[data-user-directory-refresh]',
  'button[data-retry-route]'
].join(',');

const RIPPLE_ACTION_SELECTOR = [
  'button[data-nav]',
  'button[data-command]',
  'button[data-favorite]',
  'article[data-open-module]',
  '.recent-list button[data-open-module]',
  'button[data-toggle-favorites]',
  'button[data-clear-filter]',
  'button[data-install]',
  'button[data-theme]',
  'button[data-setting-action]',
  'button[data-reload-frame]',
  'button[data-command-index]',
  'button[data-apply-update]',
  'button[data-dismiss-update]',
  'a.module-action[href]',
  'button.back-btn',
  'button[data-account]',
  'button[data-auth-action]',
  'button[data-resend-confirmation]',
  'button[data-confirm-verification]',
  'button[data-account-action]',
  'button[data-user-directory-refresh]',
  'button[data-retry-route]'
].join(',');
const readUpdateDismissed = () => { try { return sessionStorage.getItem('wm.platform.update-dismissed.v1') === '1'; } catch { return false; } };
const writeUpdateDismissed = (value: boolean): void => { try { value ? sessionStorage.setItem('wm.platform.update-dismissed.v1', '1') : sessionStorage.removeItem('wm.platform.update-dismissed.v1'); } catch {} };
let updateDismissed = readUpdateDismissed();

applyTheme(prefs.theme);
applyDensity(prefs.compact);
registerServiceWorker((registration) => { swUpdate = registration; updateDismissed = false; writeUpdateDismissed(false); showUpdateBanner(); });



const moduleById = (id: string | null | undefined): WorkManagementModuleDefinition | null => id ? moduleRegistry.get(id) ?? null : null;
const motionEnabled = () => !reducedMotionQuery?.matches;

function queueEntranceMotion(mode: MotionMode = 'page'): void {
  window.cancelAnimationFrame(motionFrame);
  if (motionCleanupTimer !== null) window.clearTimeout(motionCleanupTimer);
  if (!motionEnabled()) return;

  // Persistent chrome never moves. Only the route-owned content region receives
  // a short opacity/blur settle; leaf components are staged by the shared motion
  // runtime. No scale or layout-affecting property is used here.
  const target = mode === 'module'
    ? app.querySelector<HTMLElement>('.frame-loading, .frame-error:not([hidden])')
    : app.querySelector<HTMLElement>('#main, .auth-panel');
  if (!target) return;

  target.dataset.motion = mode;
  target.classList.remove('content-motion-enter');
  entryAnimations.get(target)?.cancel();
  if (typeof target.animate === 'function') {
    const animation = target.animate([
      { opacity: .72, filter: 'blur(1.5px)' },
      { opacity: 1, filter: 'blur(0)' },
    ], { duration: mode === 'module' ? 220 : 260, easing: 'cubic-bezier(.16,1,.3,1)' });
    entryAnimations.set(target, animation);
  }
  motionFrame = window.requestAnimationFrame(() => {
    target.classList.add('content-motion-enter');
    motionCleanupTimer = window.setTimeout(() => {
      target.classList.remove('content-motion-enter');
      delete target.dataset.motion;
      entryAnimations.delete(target);
    }, mode === 'module' ? 280 : 320);
  });
}

const transitionUpdate: TransitionUpdate = (update, kind = 'route') => {
  // v1.30 keeps the shell, sidebar and topbar completely stable. Route changes
  // may briefly soften the replaceable content region before the next renderer
  // runs; state refreshes remain synchronous and never replay route choreography.
  const motion = motionRuntime();
  if (kind === 'route' && motionEnabled() && motion) {
    return motion.exitThen(update, { selector: '#main, .auth-panel', kind: 'route', duration: 105 });
  }
  update();
  return null;
};

function closestShellAction(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  const action = target.closest<HTMLElement>(SHELL_ACTION_SELECTOR);
  if (!action || action.matches(':disabled') || action.getAttribute('aria-disabled') === 'true') return null;
  return action;
}

function isNestedControlInsideModuleCard(target: EventTarget | null, card: HTMLElement | null): boolean {
  if (!(target instanceof Element) || !card) return false;
  const nested = target.closest('button,a,input,select,textarea,[role="button"],[role="link"]');
  return Boolean(nested && nested !== card && card.contains(nested));
}

function resolveAppAction(target: EventTarget | null): HTMLElement | null {
  const action = closestShellAction(target);
  if (!action || !app.contains(action)) return null;
  if (action.matches('article[data-open-module]') && isNestedControlInsideModuleCard(target, action)) return null;
  return action;
}

function rememberPointerActivation(event: PointerEvent): void {
  if (event.button !== 0) return;
  pointerActivationTarget = resolveAppAction(event.target) || closestShellAction(event.target);
  pressedFeedbackTarget?.classList.remove('is-pressing');
  pressedFeedbackTarget = pointerActivationTarget?.matches(RIPPLE_ACTION_SELECTOR) ? pointerActivationTarget : null;
  pressedFeedbackTarget?.classList.add('is-pressing');
}

function clearPointerActivation(): void {
  pressedFeedbackTarget?.classList.remove('is-pressing');
  pressedFeedbackTarget = null;
  // Keep pointerActivationTarget through the subsequent click; the next pointerdown replaces it.
}

function isValidActivation(event: MouseEvent, action: HTMLElement | null): boolean {
  if (!action) return false;
  // Keyboard and programmatic clicks have detail === 0 and do not require a pointerdown pair.
  if (event.detail === 0) return true;
  const valid = pointerActivationTarget === action;
  pointerActivationTarget = null;
  return valid;
}

function addInteractionRipple(event: PointerEvent): void {
  if (!motionEnabled() || event.button !== 0) return;
  const host = resolveAppAction(event.target) || closestShellAction(event.target);
  if (!host || !host.matches(RIPPLE_ACTION_SELECTOR)) return;
  const rect = host.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;
  const size = Math.max(rect.width, rect.height) * 1.7;
  const ripple = document.createElement('span');
  ripple.className = 'interaction-ripple';
  ripple.style.width = ripple.style.height = `${size}px`;
  ripple.style.left = `${event.clientX - rect.left - size / 2}px`;
  ripple.style.top = `${event.clientY - rect.top - size / 2}px`;
  host.classList.add('ripple-host');
  host.appendChild(ripple);
  ripple.addEventListener('animationend', () => ripple.remove(), { once: true });
}

function updatePointerMotion(event: PointerEvent): void {
  if (!motionEnabled() || !finePointerQuery?.matches) return;
  const eventTarget = event.target instanceof Element ? event.target : null;
  const card = eventTarget?.closest<HTMLElement>('.module-card') ?? null;
  const hero = eventTarget?.closest<HTMLElement>('.hero-panel') ?? null;
  const target = card ?? hero;
  if (!target) return;
  const rect = target.getBoundingClientRect();
  const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
  const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
  target.style.setProperty('--pointer-x', `${(x * 100).toFixed(1)}%`);
  target.style.setProperty('--pointer-y', `${(y * 100).toFixed(1)}%`);
  if (card) {
    card.style.setProperty('--tilt-x', `${((x - .5) * 3.2).toFixed(2)}deg`);
    card.style.setProperty('--tilt-y', `${((.5 - y) * 3.2).toFixed(2)}deg`);
  }
}

function resetPointerMotion(event: PointerEvent): void {
  const card = event.target instanceof Element ? event.target.closest<HTMLElement>('.module-card') : null;
  if (!card) return;
  card.style.removeProperty('--tilt-x');
  card.style.removeProperty('--tilt-y');
}

function userDisplayName(): string {
  const metadata = recordOf(auth.user?.user_metadata);
  const metadataName = typeof metadata.display_name === 'string' ? metadata.display_name : '';
  return auth.profile?.display_name || metadataName || auth.user?.email?.split('@')[0] || 'Account';
}


function userInitials(): string {
  const label = userDisplayName().trim();
  const parts = label.split(/\s+/).filter(Boolean);
  const first = parts[0] ?? '';
  const last = parts[parts.length - 1] ?? '';
  return (parts.length > 1 ? `${first.charAt(0)}${last.charAt(0)}` : label.slice(0, 2)).toUpperCase();
}

function cloudModeLabel(): string {
  if (!auth.isCloudEnabled) return 'Local workspace';
  if (!auth.isConfigured) return 'Cloud setup required';
  return auth.isAuthenticated ? 'Cloud connected' : 'Sign-in required';
}

function accountControl(): string {
  if (!auth.isCloudEnabled) return '<div class="avatar" title="Local workspace">WM</div>';
  if (!auth.isAuthenticated) return `<button class="${buttonClass({ tone: 'secondary', size: 'lg' }, 'account-pill')}" data-account aria-label="Sign in">${icons.user}<span>Sign in</span></button>`;
  return `<button class="${buttonClass({ tone: 'secondary', size: 'lg' }, 'account-pill')}" data-account aria-label="Open account"><span class="avatar mini">${esc(userInitials())}</span><span><b>${esc(userDisplayName())}</b><small>${esc(auth.platformRoleLabel)}</small></span></button>`;
}

function sidebarNavMarkup(active: string = 'home'): string {
  const navClass = (id: string): string => navigationItemClass({ active: active === id }, `nav-item ${active === id ? 'active' : ''}`);
  return `
    <button class="${navClass('home')}" data-nav="" ${active==='home'?'aria-current="page"':''}><span>${icons.grid}</span><b>Applications</b></button>
    <button class="${navClass('boards')}" data-nav="boards" ${active==='boards'?'aria-current="page"':''}><span>${icons.boards}</span><b>Boards</b></button>
    <button class="${navigationItemClass({}, 'nav-item')}" data-command><span>${icons.search}</span><b>Search</b><kbd>⌘K</kbd></button>
    ${auth.canManageUsers ? `<button class="${navClass('users')}" data-nav="users" ${active==='users'?'aria-current="page"':''}><span>${icons.users}</span><b>Users</b></button>` : ''}
    <button class="${navClass('settings')}" data-nav="settings" ${active==='settings'?'aria-current="page"':''}><span>${icons.settings}</span><b>Settings</b></button>
    ${auth.isCloudEnabled ? `<button class="${navClass('account')}" data-nav="account" ${active==='account'?'aria-current="page"':''}><span>${icons.user}</span><b>Account</b></button>` : ''}`;
}

function shell(content: string, active: string = 'home'): string {
  const online = navigator.onLine;
  return `<div class="shell" data-workspace-shell>
    <aside class="sidebar" aria-label="Primary navigation">
      <button class="brand" data-nav="" aria-label="Work Management home"><span class="brand-mark"><i></i><i></i><i></i><i></i></span><span class="brand-copy"><strong>Work</strong><small>Management</small></span></button>
      <nav data-shell-nav>${sidebarNavMarkup(active)}</nav>
      <div class="sidebar-foot"><span class="health-dot ${online?'':'offline'}"></span><div><strong>${online?'Platform ready':'Offline mode'}</strong><small>v${PLATFORM_VERSION} · ${esc(cloudModeLabel())}</small></div></div>
    </aside>
    <section class="workspace" data-workspace-root>${content}</section>
  </div><div id="overlayRoot"></div><div id="toastRoot" class="toast-root" aria-live="polite" aria-atomic="true"></div>`;
}

let workspaceRouteKey = '';

function syncElementAttributes(target: Element, source: Element): void {
  for (const attribute of [...target.attributes]) {
    if (!source.hasAttribute(attribute.name)) target.removeAttribute(attribute.name);
  }
  for (const attribute of [...source.attributes]) target.setAttribute(attribute.name, attribute.value);
}

function patchWorkspaceContent(workspace: HTMLElement, content: string): void {
  const template = document.createElement('template');
  template.innerHTML = String(content || '').trim();
  const nextTopbar = template.content.querySelector<HTMLElement>('.topbar');
  const nextMain = template.content.querySelector<HTMLElement>('#main');
  const currentTopbar = workspace.querySelector<HTMLElement>(':scope > .topbar');
  const currentMain = workspace.querySelector<HTMLElement>(':scope > #main');
  if (!nextTopbar || !nextMain || !currentTopbar || !currentMain) {
    workspace.innerHTML = content;
    return;
  }
  // Persistent chrome: preserve the topbar/main containers themselves while
  // replacing their route-owned contents. This prevents shell/header remount
  // flashes and keeps motion scoped below the chrome boundary.
  syncElementAttributes(currentTopbar, nextTopbar);
  currentTopbar.innerHTML = nextTopbar.innerHTML;
  syncElementAttributes(currentMain, nextMain);
  currentMain.innerHTML = nextMain.innerHTML;
}
function syncPersistentShell(active: string = 'home'): void {
  const nav = app.querySelector<HTMLElement>('[data-shell-nav]');
  if (!nav) return;
  const hasUsers = Boolean(nav.querySelector('[data-nav="users"]'));
  const shouldHaveUsers = Boolean(auth.canManageUsers);
  const hasAccount = Boolean(nav.querySelector('[data-nav="account"]'));
  const shouldHaveAccount = Boolean(auth.isCloudEnabled);
  if (hasUsers !== shouldHaveUsers || hasAccount !== shouldHaveAccount) {
    nav.innerHTML = sidebarNavMarkup(active);
  } else {
    nav.querySelectorAll<HTMLElement>('.nav-item[data-nav]').forEach((item) => {
      const route = item.dataset.nav || 'home';
      const selected = route === active;
      item.classList.toggle('active', selected);
      if (selected) item.setAttribute('aria-current','page');
      else item.removeAttribute('aria-current');
    });
  }
  const foot = app.querySelector<HTMLElement>('.sidebar-foot');
  motionRuntime()?.refreshIndicators(nav);
  if (foot) {
    const online = navigator.onLine;
    foot.querySelector('.health-dot')?.classList.toggle('offline', !online);
    const strong = foot.querySelector('strong');
    const small = foot.querySelector('small');
    if (strong) strong.textContent = online ? 'Platform ready' : 'Offline mode';
    if (small) small.textContent = `v${PLATFORM_VERSION} · ${cloudModeLabel()}`;
  }
}

function renderWorkspace(content: string, active: string = 'home', motionMode: MotionMode = 'page'): void {
  let workspace = app.querySelector<HTMLElement>('[data-workspace-root]');
  const routeKey = location.hash || '#/';
  const routeChanged = workspaceRouteKey !== routeKey;
  if (!workspace) {
    app.innerHTML = shell('', active);
    workspace = app.querySelector<HTMLElement>('[data-workspace-root]');
  } else {
    syncPersistentShell(active);
  }
  if (!workspace) throw new Error('Workspace host could not be created.');
  patchWorkspaceContent(workspace, content);
  workspaceRouteKey = routeKey;
  // Entrance motion is route-scoped. State refreshes inside the same route are
  // updated without replaying page animations.
  if (routeChanged && motionMode) queueEntranceMotion(motionMode);
}

function topbar(title: string, subtitle: string = '', actions: string = ''): string {
  return `<header class="topbar"><div><span class="top-eyebrow">WORK MANAGEMENT</span><h1>${esc(title)}</h1><p>${esc(subtitle)}</p></div><div class="${topActionToolbarClass}">${actions}<span class="connection-pill ${navigator.onLine?'':'offline'}"><i></i>${navigator.onLine?'Online':'Offline'}</span><button class="${iconButtonClass({ tone: 'secondary' }, 'icon-btn mobile-command')}" data-command aria-label="Search">${icons.search}</button>${accountControl()}</div></header>`;
}

const authFeature = createAuthenticationFeature({
  authService: auth,
  host: app,
  navigate,
  escapeHtml: esc,
  queueEntranceMotion,
});
const boardsFeature = createBoardsFeature({ auth, renderWorkspace, topbar, toast, navigate, icons, diagnostics, queryClient:serverState, service:platformServices.boards.service, commands:platformServices.boards.commands });
const accountFeature = createAccountFeature({
  auth, modules, moduleIcon, topbar, renderWorkspace, navigate, toast, escapeHtml: esc, authShell: authFeature.shell, queueEntranceMotion,
  setAuthFeedback: authFeature.setFeedback,
});
const userManagementFeature = createUserManagementFeature({
  auth, topbar, renderWorkspace, toast, icons, escapeHtml: esc, currentRoute: parseRoute,
});
const homeFeature = createHomeFeature({
  auth,
  renderWorkspace,
  topbar,
  icons,
  escapeHtml: esc,
  transitionUpdate,
  navigate,
  getInstallPrompt: () => deferredInstall,
  consumeInstallPrompt: () => { deferredInstall = null; },
});
const settingsFeature = createSettingsFeature({
  auth,
  modules,
  topbar,
  renderWorkspace,
  toast,
  icons,
  escapeHtml: esc,
  currentRoute: parseRoute,
  onPreferencesChanged: (next) => { prefs = next; homeFeature.syncPreferences(next); },
  resetLauncherFilters: () => homeFeature.resetFilters(),
});
const commandFeature = createCommandPaletteFeature({
  auth,
  navigate,
  icons,
  escapeHtml: esc,
  toast,
  motionEnabled,
  getUserLabel: () => userDisplayName(),
});

// Runtime feature ownership is registered once. This makes route transitions
// lifecycle-aware without forcing renderers to know about other features.
featureRegistry.register('shell', {}, { kind: 'shell' });
featureRegistry.register('home', homeFeature, { kind: 'native-feature' });
featureRegistry.register('commands', commandFeature, { kind: 'cross-cutting-feature' });
featureRegistry.register('auth', authFeature, { kind: 'native-feature' });
featureRegistry.register('account', accountFeature, { kind: 'native-feature' });
featureRegistry.register('boards', boardsFeature, { kind: 'native-feature' });
featureRegistry.register('modules', moduleRegistry, { kind: 'module-registry' });
featureRegistry.register('settings', settingsFeature, { kind: 'native-feature' });
featureRegistry.register('user-management', userManagementFeature, { kind: 'native-feature' });
featureRegistry.register('module-host', moduleHost, { kind: 'runtime-host' });
const featureValidation = featureRegistry.validate();
if (!featureValidation.valid) console.error('[Work Management] Runtime feature registry is incomplete', featureValidation.missing);

function moduleIcon(mod: WorkManagementModuleDefinition | null | undefined): string { if (mod?.icon === 'fuel') return icons.fuel; if (mod?.icon === 'trade') return icons.trade; return icons.clock; }

function renderModule(moduleId: string | null | undefined): void {
  workspaceRouteKey = '';
  const mod = moduleById(moduleId);
  if (!mod) return renderNotFound();
  if (mod.status !== 'active') return renderUnavailable(mod);
  if (!auth.canAccessModule(mod.id)) return renderAccessDenied(mod);
  homeFeature.recordRecent(mod.id);
  activeModuleId = mod.id;
  auth.publishIdentityContext();
  const actions = `<button class="module-action" data-command title="Search workspace">${icons.search}<span>Search</span></button><button class="module-action" data-reload-frame title="Reload module">${icons.reload}<span>Reload</span></button>`;
  const content = `<header class="module-topbar"><button class="back-btn" data-nav="">${icons.back}<span>Work Management</span></button><div class="module-identity"><div class="module-mini-icon ${esc(mod.accent)}">${moduleIcon(mod)}</div><div><strong>${esc(mod.name)}</strong><small>${esc(mod.eyebrow)} · v${esc(mod.version)}</small></div></div><div class="module-actions">${actions}</div></header>
  <main id="main" class="module-stage"><div class="frame-loading" id="frameLoading"><span></span><strong>Opening ${esc(mod.name)}</strong><small>Loading the isolated module runtime.</small></div><iframe id="moduleFrame" title="${esc(mod.name)}" src="${esc(mod.route)}" allow="geolocation; clipboard-read; clipboard-write" referrerpolicy="same-origin"></iframe><div class="frame-error" id="frameError" hidden><strong>Module is taking longer than expected.</strong><p>Retry the authenticated cloud runtime without leaving Work Management.</p><div><button class="secondary-btn" data-reload-frame>Retry</button></div></div></main>`;
  app.innerHTML = `<div class="module-shell">${content}</div><div id="overlayRoot"></div><div id="toastRoot" class="toast-root" aria-live="polite" aria-atomic="true"></div>`;
  moduleFrame = document.querySelector<HTMLIFrameElement>('#moduleFrame');
  if (!moduleFrame) throw new Error(`Embedded module frame for ${mod.id} was not created.`);
  moduleHost.attach(moduleFrame, mod);
  runtimeClient.setContext({ route: 'app', moduleId: mod.id, authenticated: auth.isAuthenticated });
  monitorModuleFrameLoad();
  queueEntranceMotion('module');
}

function monitorModuleFrameLoad(): void {
  if (!moduleFrame) return;
  const loading = document.querySelector<HTMLElement>('#frameLoading');
  const error = document.querySelector<HTMLElement>('#frameError');
  if (moduleLoadTimer !== null) window.clearTimeout(moduleLoadTimer);
  loading?.classList.remove('done');
  moduleFrame.classList.remove('module-frame-ready');
  if (loading) loading.hidden = false;
  if (error) error.hidden = true;
  let completed = false;
  const onLoad = () => {
    completed = true;
    if (moduleLoadTimer !== null) window.clearTimeout(moduleLoadTimer);
    if (error) error.hidden = true;
    moduleFrame?.classList.add('module-frame-ready');
    moduleHost.publishIdentity();
    runtimeClient.emit('module:loaded', { moduleId: activeModuleId });
    loading?.classList.add('done');
    window.setTimeout(() => { if (loading) loading.hidden = true; }, 280);
  };
  moduleFrame.addEventListener('load', onLoad, { once: true });
  moduleLoadTimer = window.setTimeout(() => {
    if (completed) return;
    loading?.classList.add('done');
    if (loading) loading.hidden = true;
    if (error) error.hidden = false;
  }, 10000);
}

function renderUnavailable(mod: WorkManagementModuleDefinition): void {
  renderWorkspace(`${topbar(mod.name,'This module is not currently available.')}<main id="main" class="page"><div class="empty"><strong>—</strong><h2>${esc(mod.name)} is ${esc(mod.status)}</h2><button class="${primaryButtonClass}" data-nav="">Return home</button></div></main>`, 'unavailable', 'page');
}

function renderNotFound(): void {
  renderWorkspace(`${topbar('Not found','The requested workspace route does not exist.')}<main id="main" class="page"><div class="empty"><strong>404</strong><h2>Workspace not found</h2><button class="${primaryButtonClass}" data-nav="">Return home</button></div></main>`, 'not-found', 'page');
}


function renderRouteFailure(error: WorkManagementError, context: RuntimeBoundaryContext = {}): void {
  const code = error?.code || 'WM_ROUTE_FAILURE';
  const message = error?.message || 'This workspace could not be opened.';
  renderWorkspace(`${topbar('Workspace unavailable','A recoverable application error interrupted this route.')}<main id="main" class="page"><div class="empty"><strong>!</strong><h2>We couldn’t open this workspace</h2><p>${esc(message)}</p><small class="error-reference">Reference: ${esc(code)}</small><div class="empty-actions"><button class="${primaryButtonClass}" data-retry-route>Try again</button><button class="${secondaryButtonClass}" data-nav="">Return home</button></div></div></main>`, 'route-error', 'page');
  diagnostics.error('ROUTE_RENDER_FAILURE', message, { code, route:context.route || parseRoute().name, owner:context.owner || null });
}

function renderAccessDenied(mod: WorkManagementModuleDefinition): void {
  renderWorkspace(`${topbar('Access restricted', 'Your account is not authorized for this application.')}<main id="main" class="page"><div class="empty"><strong>${icons.lock}</strong><h2>${esc(mod.name)} is restricted</h2><p>Your current cloud role is ${esc(auth.moduleRole(mod.id))}. Contact a platform administrator if access is required.</p><button class="${primaryButtonClass}" data-nav="">Return to applications</button></div></main>`, 'access-denied', 'page');
}

function toast(message: string, tone: ToastTone = 'success'): void {
  let root = document.querySelector<HTMLElement>('#globalToastRoot');
  if (!root) {
    root = document.createElement('div');
    root.id = 'globalToastRoot';
    root.className = 'toast-root';
    root.setAttribute('aria-live', 'polite');
    root.setAttribute('aria-atomic', 'true');
    document.body.appendChild(root);
  }
  const node = document.createElement('div');
  node.className = `toast ${tone}`;
  node.innerHTML = `<span>${tone === 'success' ? icons.check : '!'}</span><strong>${esc(message)}</strong>`;
  root.appendChild(node);
  requestAnimationFrame(() => node.classList.add('visible'));
  setTimeout(() => { node.classList.remove('visible'); setTimeout(() => node.remove(), 220); }, 3600);
}

function showUpdateBanner(): void {
  if (!swUpdate || updateDismissed || document.querySelector('.update-banner')) return;
  const banner = document.createElement('div');
  banner.className = 'update-banner';
  banner.innerHTML = `<span>A newer Work Management build is ready.</span><button data-apply-update>Update now</button><button data-dismiss-update aria-label="Dismiss update">×</button>`;
  document.body.appendChild(banner);
}

function deactivateModuleRoute(): void {
  moduleFrame = null;
  activeModuleId = null;
}

function rememberAuthReturnRoute(): void {
  try { sessionStorage.setItem('wm.platform.auth.return-to.v1', location.hash || '#/'); } catch {}
}

const routeErrorBoundary = createRuntimeErrorBoundary({ diagnostics, onError:renderRouteFailure });

const routeController = createRouteController({
  auth,
  parseRoute,
  navigate,
  runtimeClient,
  featureRegistry,
  moduleHost,
  deactivateModule: deactivateModuleRoute,
  rememberReturnRoute: rememberAuthReturnRoute,
  errorBoundary: routeErrorBoundary,
  routePolicy: platformServices.routing,
  renderers: {
    home: () => homeFeature.render(),
    settings: () => settingsFeature.render(),
    account: () => accountFeature.render(),
    users: () => userManagementFeature.render(),
    boards: () => boardsFeature.renderBoards(),
    board: (route) => route.boardId ? boardsFeature.renderBoard(route.boardId) : renderNotFound(),
    login: () => authFeature.renderLogin(),
    register: () => authFeature.renderRegister(),
    verify: () => authFeature.renderVerify(),
    app: (route) => route.moduleId ? renderModule(route.moduleId) : renderNotFound(),
    disabled: () => accountFeature.renderDisabled(),
    'not-found': () => renderNotFound(),
  },
});

function render(): void {
  routeController.render();
  if (swUpdate) showUpdateBanner();
}

app.addEventListener('click', async (event) => {
  // Backdrop closing is intentionally limited to the backdrop itself. Clicking dialog content is inert.
  if (await commandFeature.handleAction(null, event.target instanceof Element ? event.target : null)) return;

  const action = resolveAppAction(event.target);
  if (!action || !isValidActivation(event, action)) return;

  if (action.matches('button[data-retry-route]')) { render(); return; }
  if (action.matches('button[data-nav]')) { navigate(action.dataset.nav ?? ''); return; }
  if (action.matches('[data-open-module]')) { const moduleId = action.dataset.openModule; if (moduleId) navigate(`app/${moduleId}`); return; }
  if (await commandFeature.handleAction(action)) return;
  if (await homeFeature.handleAction(action)) return;
  if (action.matches('button[data-reload-frame]')) {
    if (moduleFrame) {
      monitorModuleFrameLoad();
      try { moduleFrame.contentWindow?.location?.reload?.(); }
      catch { moduleFrame.src = moduleFrame.src; }
    }
    return;
  }
  if (action.matches('button[data-account]')) { navigate(auth.isAuthenticated ? 'account' : 'login'); return; }
  if (await accountFeature.handleAction(action)) return;
  if (await authFeature.handleAction(action)) return;
  if (await settingsFeature.handleAction(action)) return;
  if (await userManagementFeature.handleAction(action)) return;
});


document.addEventListener('submit', async (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const userAccessForm = target?.closest<HTMLFormElement>('[data-user-access-form]') ?? null;
  if (userAccessForm) {
    event.preventDefault();
    await userManagementFeature.handleSubmit(userAccessForm);
    return;
  }
  const accountForm = target?.closest<HTMLFormElement>('[data-account-form]') ?? null;
  if (accountForm) {
    event.preventDefault();
    await accountFeature.handleSubmit(accountForm);
    return;
  }
  const authForm = target?.closest<HTMLFormElement>('[data-auth-form]') ?? null;
  if (authForm) {
    event.preventDefault();
    await authFeature.handleSubmit(authForm);
  }
});


app.addEventListener('keydown', (event) => {
  homeFeature.handleKeydown(event);
});

document.addEventListener('input', (event) => {
  if (commandFeature.handleInput(event.target)) return;
  if (homeFeature.handleInput(event.target)) return;
  if (userManagementFeature.handleInput(event.target)) return;
  if (authFeature.handleInput(event.target instanceof Element ? event.target : null)) return;
});


document.addEventListener('keydown', (event) => {
  commandFeature.handleKeydown(event);
});

function handleStorageChange(event: StorageEvent): void {
  const route = parseRoute();
  if (event.key === 'wm.platform.auth.session.v1') { auth.init({ forceStorage:true }).then(() => render()); return; }
  if (event.key === 'wm.platform.preferences.v1') {
    prefs = getPreferences(); applyTheme(prefs.theme); applyDensity(prefs.compact);
    if (route.name === 'home' || route.name === 'settings') render();
    return;
  }
  if (route.name === 'home' && event.key?.startsWith('timetracker.')) homeFeature.render();
}

function handleConnectivityChange(): void {
  const route = parseRoute();
  if (route.name === 'home' || route.name === 'settings') render();
  else toast(navigator.onLine ? 'Connection restored.' : 'You are offline. Cached applications remain available locally.', navigator.onLine ? 'success' : 'warning');
}

async function revalidateSessionOnResume(): Promise<void> {
  if (document.visibilityState === 'hidden' || !auth.hasSession) return;
  const token = await auth.ensureValidSession({ reason:'resume' });
  if (!token) { authFeature.setFeedback('Your session expired or was revoked. Sign in again.', 'warning'); navigate('login'); }
}
installApplicationLifecycle({
  hashchange: () => { commandFeature.close({ immediate: true }); transitionUpdate(render, 'route'); },
  storage: handleStorageChange,
  online: handleConnectivityChange,
  offline: handleConnectivityChange,
  beforeinstallprompt: (event) => { event.preventDefault(); deferredInstall = event; if (parseRoute().name === 'home') homeFeature.render(); },
  appinstalled: () => { deferredInstall = null; toast('Work Management installed.'); },
  focus: revalidateSessionOnResume,
  visibilitychange: () => { if (document.visibilityState === 'visible') revalidateSessionOnResume(); },
  error: (event) => { const error=event.error||new Error(event.message||'Unhandled error'); diagnostics.error('WINDOW_ERROR',error.message,{route:parseRoute().name,stack:error.stack?.split('\n').slice(0,4).join('\n')||null}); console.error('[Work Management] Unhandled error',error); },
  unhandledrejection: (event) => { const error=event.reason instanceof Error?event.reason:new Error(String(event.reason||'Unhandled rejection')); diagnostics.error('UNHANDLED_REJECTION',error.message,{route:parseRoute().name,stack:error.stack?.split('\n').slice(0,4).join('\n')||null}); console.error('[Work Management] Unhandled rejection',error); },
});

document.addEventListener('pointerdown', (event) => {
  rememberPointerActivation(event);
  addInteractionRipple(event);
}, { passive: true, capture: true });
document.addEventListener('pointerup', clearPointerActivation, { passive: true, capture: true });
document.addEventListener('pointercancel', clearPointerActivation, { passive: true, capture: true });
document.addEventListener('pointermove', updatePointerMotion, { passive: true });
document.addEventListener('pointerout', (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const related = event.relatedTarget instanceof Element ? event.relatedTarget : null;
  if (target && related && target.closest('.module-card') === related.closest('.module-card')) return;
  resetPointerMotion(event);
}, { passive: true });

document.addEventListener('click', (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;
  if (target.closest('[data-dismiss-update]')) { updateDismissed = true; writeUpdateDismissed(true); target.closest('.update-banner')?.remove(); }
  if (target.closest('[data-apply-update]') && swUpdate?.waiting) { swUpdate.waiting.postMessage({ type:'SKIP_WAITING' }); navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once:true }); }
});

async function bootstrap(): Promise<void> {
  if (auth.hasAuthCallback) {
    authFeature.renderCallbackProgress();
  } else {
    app.innerHTML = '<main class="boot-screen"><span></span><strong>Starting Work Management</strong><small>Initializing workspace and identity services.</small></main>';
  }
  await auth.init();
  if (auth.state?.notice) {
    authFeature.setFeedback(auth.state.notice, 'success');
  } else if (auth.state?.error && !auth.isAuthenticated) {
    authFeature.setFeedback(auth.state.error, 'warning');
  }
  render();
}

let lastAuthorizationFingerprint = authorizationFingerprint(auth);

function revalidateAuthorizationContext(): void {
  if (!auth.isAuthenticated || document.hidden) return;
  void auth.revalidateAccessContext().catch((error: unknown) => {
    const normalized = platformServices.errors.normalize(error, { operation: 'auth.revalidate-access' });
    diagnostics.warn('AUTH_REVALIDATION_FAILURE', normalized.message, { code: normalized.code, retryable: normalized.retryable });
  });
}

auth.addEventListener(AUTH_EVENT, () => {
  const reconciliation = reconcileAuthorizationContext({
    auth,
    previousFingerprint: lastAuthorizationFingerprint,
    serverState,
    moduleHost,
    activeModuleId,
    deactivateModule: deactivateModuleRoute,
    diagnostics,
  });
  lastAuthorizationFingerprint = reconciliation.fingerprint;

  const route = parseRoute();
  if (reconciliation.changed || ['home','settings','account','users','login','register','verify'].includes(route.name)) render();
});

window.addEventListener('focus', revalidateAuthorizationContext, { passive: true });
document.addEventListener('visibilitychange', () => { if (!document.hidden) revalidateAuthorizationContext(); }, { passive: true });

bootstrap();
