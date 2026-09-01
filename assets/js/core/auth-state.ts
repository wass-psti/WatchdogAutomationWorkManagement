export type AuthStatus =
  | 'initializing'
  | 'restoring'
  | 'anonymous'
  | 'authenticated'
  | 'disabled'
  | 'expired'
  | 'invalid'
  | 'terminated'
  | 'setup-required';

export type AuthLifecycleState =
  | Readonly<{ kind: 'initializing'; generation: number }>
  | Readonly<{ kind: 'restoring'; generation: number }>
  | Readonly<{ kind: 'unauthenticated'; generation: number; reason: 'startup' | 'logout' }>
  | Readonly<{ kind: 'authenticated'; generation: number; userId: string; expiresAt: number }>
  | Readonly<{ kind: 'disabled'; generation: number; userId: string | null }>
  | Readonly<{ kind: 'expired'; generation: number }>
  | Readonly<{ kind: 'invalid'; generation: number }>
  | Readonly<{ kind: 'terminated'; generation: number }>
  | Readonly<{ kind: 'setup-required'; generation: number }>;


export interface NormalizedAuthFailure {
  readonly message: string;
  readonly code: string;
  readonly status: number | null;
}

/** Normalize provider/backend failures without trusting arbitrary thrown payloads. */
export function normalizeAuthFailure(error: unknown, fallback = 'Authentication request failed.'): NormalizedAuthFailure {
  if (error instanceof Error) {
    const tagged = error as Error & { readonly code?: unknown; readonly status?: unknown };
    const status = Number(tagged.status);
    return Object.freeze({
      message: error.message || fallback,
      code: typeof tagged.code === 'string' ? tagged.code : tagged.code == null ? '' : String(tagged.code),
      status: Number.isFinite(status) && status > 0 ? status : null,
    });
  }
  if (error !== null && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    const status = Number(record.status);
    return Object.freeze({
      message: typeof record.message === 'string' && record.message.trim() ? record.message : fallback,
      code: typeof record.code === 'string' ? record.code : record.code == null ? '' : String(record.code),
      status: Number.isFinite(status) && status > 0 ? status : null,
    });
  }
  return Object.freeze({
    message: typeof error === 'string' && error.trim() ? error : fallback,
    code: '',
    status: null,
  });
}

export interface AuthLifecycleSource {
  readonly status: AuthStatus;
  readonly userId: string | null;
  readonly expiresAt: number | null;
  readonly generation: number;
}

/**
 * Produces the one authoritative lifecycle state consumed by routing/runtime code.
 * Compatibility booleans can still exist at older call sites, but they are derived
 * from this mutually-exclusive state instead of being an independent authority.
 */
export function deriveAuthLifecycle(source: AuthLifecycleSource): AuthLifecycleState {
  const generation = Math.max(0, Math.trunc(source.generation));
  switch (source.status) {
    case 'initializing': return Object.freeze({ kind: 'initializing', generation });
    case 'restoring': return Object.freeze({ kind: 'restoring', generation });
    case 'anonymous': return Object.freeze({ kind: 'unauthenticated', generation, reason: 'startup' });
    case 'authenticated':
      if (!source.userId || !source.expiresAt) return Object.freeze({ kind: 'invalid', generation });
      return Object.freeze({ kind: 'authenticated', generation, userId: source.userId, expiresAt: source.expiresAt });
    case 'disabled': return Object.freeze({ kind: 'disabled', generation, userId: source.userId });
    case 'expired': return Object.freeze({ kind: 'expired', generation });
    case 'invalid': return Object.freeze({ kind: 'invalid', generation });
    case 'terminated': return Object.freeze({ kind: 'terminated', generation });
    case 'setup-required': return Object.freeze({ kind: 'setup-required', generation });
  }
}
