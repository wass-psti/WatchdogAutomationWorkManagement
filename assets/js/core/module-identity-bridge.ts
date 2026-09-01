import type { PlatformRole } from '../../../src/types/auth.ts';
import type { ModuleId } from '../../../src/types/identifiers.ts';
import type {
  EmbeddedModuleAccess,
  EmbeddedModuleIdentityContext,
} from '../../../src/platform/contracts/embedded-module.ts';

interface IdentityBridgeHandle {
  readonly ready: Promise<EmbeddedModuleIdentityContext | null>;
  readonly current: EmbeddedModuleIdentityContext | null;
  dispose(): void;
}

type UnknownRecord = Record<string, unknown>;
const PLATFORM_ROLES = new Set<PlatformRole>(['admin_general_manager', 'hr', 'supervisor', 'employee']);
const recordOf = (value: unknown): UnknownRecord | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : null;
const stringOf = (value: unknown): string => typeof value === 'string' ? value : '';

function parseIdentityContext(value: unknown, expectedModuleId: ModuleId): EmbeddedModuleIdentityContext | null {
  const root = recordOf(value);
  if (!root || root.type !== 'wm:identity-context' || root.version !== 1 || root.moduleId !== expectedModuleId) return null;
  const user = recordOf(root.user);
  const module = recordOf(root.module);
  const platformRole = stringOf(root.platformRole);
  if (!user || !module || !PLATFORM_ROLES.has(platformRole as PlatformRole)) return null;
  const userId = stringOf(user.id).trim();
  const email = stringOf(user.email).trim();
  const displayName = stringOf(user.displayName).trim();
  const role = module.role === null ? null : stringOf(module.role).trim() || null;
  if (!userId || !email) return null;
  return Object.freeze({
    type: 'wm:identity-context',
    version: 1,
    moduleId: expectedModuleId,
    user: Object.freeze({ id: userId, email, displayName: displayName || email }),
    platformRole: platformRole as PlatformRole,
    accountStatus: stringOf(root.accountStatus),
    module: Object.freeze({ role, enabled: module.enabled === true }),
    updatedAt: stringOf(root.updatedAt),
    allowed: Boolean(userId && root.accountStatus === 'active' && module.enabled === true && role),
  });
}

function publishGlobals(moduleId: ModuleId, context: EmbeddedModuleIdentityContext | null): void {
  const allowed = context?.allowed === true;
  const access: EmbeddedModuleAccess = Object.freeze({ allowed, moduleId, role: context?.module.role ?? null });
  globalThis.WM_IDENTITY_CONTEXT = context;
  globalThis.WM_MODULE_ACCESS = access;
  if (context) window.dispatchEvent(new CustomEvent('wm:identity-context', { detail: context }));
}

export function installModuleIdentityBridge(moduleId: ModuleId, timeoutMs = 3000): IdentityBridgeHandle {
  const abort = new AbortController();
  let current: EmbeddedModuleIdentityContext | null = null;
  let settled = false;
  let resolveReady!: (value: EmbeddedModuleIdentityContext | null) => void;
  const ready = new Promise<EmbeddedModuleIdentityContext | null>((resolve) => { resolveReady = resolve; });
  globalThis.WMIdentityReady = ready;
  publishGlobals(moduleId, null);

  const settle = (context: EmbeddedModuleIdentityContext | null): void => {
    current = context;
    publishGlobals(moduleId, context);
    if (!settled) {
      settled = true;
      resolveReady(context);
    }
  };

  window.addEventListener('message', (event: MessageEvent<unknown>) => {
    if (event.origin !== location.origin || event.source !== window.parent) return;
    const parsed = parseIdentityContext(event.data, moduleId);
    if (parsed) settle(parsed);
  }, { signal: abort.signal });

  try { window.parent?.postMessage({ type: 'wm:identity:request', moduleId }, location.origin); } catch { /* Same-origin host may not be available yet. */ }
  const timer = window.setTimeout(() => { if (!settled) settle(null); }, Math.max(500, timeoutMs));

  return Object.freeze({
    ready,
    get current() { return current; },
    dispose() {
      window.clearTimeout(timer);
      abort.abort();
      if (!settled) settle(null);
    },
  });
}

declare global {
  var WMIdentityReady: Promise<EmbeddedModuleIdentityContext | null> | undefined;
  var WM_IDENTITY_CONTEXT: EmbeddedModuleIdentityContext | null | undefined;
  var WM_MODULE_ACCESS: EmbeddedModuleAccess | undefined;
}
