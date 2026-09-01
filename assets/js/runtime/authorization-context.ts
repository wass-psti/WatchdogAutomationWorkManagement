import type { ModuleId } from '../../../src/types/identifiers.ts';
import type { DiagnosticsPort } from '../../../src/platform/contracts/diagnostics.ts';

export interface AuthorizationAssignmentSnapshot {
  readonly module_id: string;
  readonly role?: string | null;
  readonly enabled: boolean;
}

export interface AuthorizationContextPort {
  readonly user?: Readonly<{ id?: string | null }> | null;
  readonly state?: Readonly<{ status?: string | null }> | null;
  readonly isAccountActive: boolean;
  readonly platformRole: string;
  readonly assignments: readonly AuthorizationAssignmentSnapshot[];
  canAccessModule(moduleId: ModuleId): boolean;
}

export interface AuthorizationServerStatePort { clear(): void; }
export interface AuthorizationModuleHostPort { detach(): void; publishIdentity(): boolean; }

export interface AuthorizationReconcileOptions {
  readonly auth: AuthorizationContextPort;
  readonly previousFingerprint: string;
  readonly serverState: AuthorizationServerStatePort;
  readonly moduleHost: AuthorizationModuleHostPort;
  readonly activeModuleId: ModuleId | null;
  readonly deactivateModule: () => void;
  readonly diagnostics?: DiagnosticsPort | null;
}

export interface AuthorizationReconcileResult {
  readonly fingerprint: string;
  readonly changed: boolean;
  readonly moduleAccessRevoked: boolean;
}

/** Stable cache/authorization identity for state that can change across sessions. */
export function authorizationFingerprint(auth: AuthorizationContextPort): string {
  return JSON.stringify({
    userId: auth.user?.id ?? null,
    status: auth.state?.status ?? 'anonymous',
    accountActive: auth.isAccountActive,
    platformRole: auth.platformRole,
    assignments: auth.assignments
      .map((entry) => [entry.module_id, entry.role ?? null, entry.enabled] as const)
      .sort(([left], [right]) => String(left).localeCompare(String(right))),
  });
}

/**
 * Reconcile authorization-sensitive runtime state after an auth context event.
 * Backend policy remains authoritative; this coordinator prevents stale cached/UI
 * authority from surviving a role, status, account, or module-assignment change.
 */
export function reconcileAuthorizationContext(options: AuthorizationReconcileOptions): AuthorizationReconcileResult {
  const nextFingerprint = authorizationFingerprint(options.auth);
  const changed = nextFingerprint !== options.previousFingerprint;
  if (changed) {
    options.serverState.clear();
    options.diagnostics?.info?.('AUTHORIZATION_CONTEXT_CHANGED', 'Authorization context changed; server-state cache was cleared.', {
      userId: options.auth.user?.id ?? null,
      status: options.auth.state?.status ?? null,
      platformRole: options.auth.platformRole,
    });
  }

  let moduleAccessRevoked = false;
  if (options.activeModuleId) {
    if (!options.auth.canAccessModule(options.activeModuleId)) {
      moduleAccessRevoked = true;
      options.moduleHost.detach();
      options.deactivateModule();
    } else {
      options.moduleHost.publishIdentity();
    }
  }

  return Object.freeze({ fingerprint: nextFingerprint, changed, moduleAccessRevoked });
}
