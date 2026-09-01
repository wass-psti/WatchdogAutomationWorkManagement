export interface PublicBackendRuntimeConfig {
  readonly provider: 'supabase';
  readonly accountBased: boolean;
  readonly enabled: boolean;
  readonly supabaseUrl: string;
  readonly publishableKey: string;
  readonly requireAuthentication: boolean;
  readonly allowRegistration: boolean;
}

export interface VitePublicRuntimeEnv {
  readonly VITE_SUPABASE_URL?: unknown;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: unknown;
}

type UnknownRecord = Readonly<Record<string, unknown>>;


declare global {
  var WM_BACKEND_CONFIG: unknown;
}

const clean = (value: unknown): string => typeof value === 'string' ? value.trim() : '';
const asRecord = (value: unknown): UnknownRecord =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : Object.freeze({});

/**
 * Resolve public Vite client configuration against the existing runtime fallback.
 * VITE_* values always win when explicitly provided; checked-in/public runtime
 * configuration remains the fallback for controlled deployments and source tests.
 */
export function resolveViteRuntimeConfig(
  env: VitePublicRuntimeEnv = {},
  currentConfig: unknown = {},
): PublicBackendRuntimeConfig {
  const current = asRecord(currentConfig);
  const envUrl = clean(env.VITE_SUPABASE_URL);
  const envKey = clean(env.VITE_SUPABASE_PUBLISHABLE_KEY);

  return Object.freeze({
    provider: 'supabase',
    accountBased: current.accountBased !== false,
    enabled: current.enabled !== false,
    supabaseUrl: envUrl || clean(current.supabaseUrl),
    publishableKey: envKey || clean(current.publishableKey),
    requireAuthentication: current.requireAuthentication !== false,
    allowRegistration: current.allowRegistration !== false,
  });
}

/**
 * Apply Vite public-client environment values without exposing privileged secrets.
 * Existing WM_BACKEND_CONFIG values remain the fallback so local/source verifiers
 * and controlled deployments keep the same backend contract.
 */
export function applyViteRuntimeConfig(env: VitePublicRuntimeEnv = {}): PublicBackendRuntimeConfig {
  const current = globalThis.WM_BACKEND_CONFIG;
  const resolved = resolveViteRuntimeConfig(env, current);
  globalThis.WM_BACKEND_CONFIG = resolved;
  return resolved;
}
