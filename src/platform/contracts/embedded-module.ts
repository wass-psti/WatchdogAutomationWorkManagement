import type { PlatformRole } from '../../types/auth.ts';
import type { ModuleId } from '../../types/identifiers.ts';
import type { ModuleActivityEventInput } from './module-data.ts';

export interface EmbeddedIdentityUser {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
}

export interface EmbeddedModuleIdentityContext {
  readonly type: 'wm:identity-context';
  readonly version: 1;
  readonly moduleId: ModuleId;
  readonly user: EmbeddedIdentityUser;
  readonly platformRole: PlatformRole;
  readonly accountStatus: string;
  readonly module: Readonly<{ readonly role: string | null; readonly enabled: boolean }>;
  readonly updatedAt: string;
  readonly allowed?: boolean;
}

export interface EmbeddedModuleAccess {
  readonly allowed: boolean;
  readonly moduleId: ModuleId;
  readonly role: string | null;
}

export type EmbeddedLifecycleKind = 'uninitialized' | 'initializing' | 'ready' | 'suspended' | 'failed' | 'disposed';
export type EmbeddedLifecycleState =
  | Readonly<{ kind: 'uninitialized'; generation: number; moduleId: ModuleId | null }>
  | Readonly<{ kind: 'initializing'; generation: number; moduleId: ModuleId }>
  | Readonly<{ kind: 'ready'; generation: number; moduleId: ModuleId }>
  | Readonly<{ kind: 'suspended'; generation: number; moduleId: ModuleId; reason: 'hidden' | 'host' }>
  | Readonly<{ kind: 'failed'; generation: number; moduleId: ModuleId; message: string }>
  | Readonly<{ kind: 'disposed'; generation: number; moduleId: ModuleId | null }>;

export type EmbeddedLifecycleEvent =
  | Readonly<{ type: 'initialize'; moduleId: ModuleId }>
  | Readonly<{ type: 'ready' }>
  | Readonly<{ type: 'suspend'; reason: 'hidden' | 'host' }>
  | Readonly<{ type: 'resume' }>
  | Readonly<{ type: 'fail'; message: string }>
  | Readonly<{ type: 'dispose' }>;

export interface EmbeddedReadyMessage {
  readonly type: 'wm:host:ready';
  readonly detail: Readonly<{ readonly name: string; readonly moduleId: ModuleId }>;
}

export interface EmbeddedErrorMessage {
  readonly type: 'wm:host:error';
  readonly detail: Readonly<{ readonly name: string; readonly moduleId: ModuleId; readonly message: string }>;
}

export type EmbeddedModuleToHostMessage = EmbeddedReadyMessage | EmbeddedErrorMessage;

export interface EmbeddedHostInvalidateMessage {
  readonly type: 'wm:host:invalidate';
  readonly moduleId: ModuleId;
  readonly reason: 'backup-restore' | 'host-refresh';
}

export type EmbeddedHostToModuleMessage = EmbeddedModuleIdentityContext | EmbeddedHostInvalidateMessage;

export interface EmbeddedModuleBootstrapPalette {
  readonly background?: string;
  readonly foreground?: string;
  readonly border?: string;
  readonly muted?: string;
}

export interface EmbeddedModuleBootstrapConfig {
  readonly moduleId: ModuleId;
  readonly name: string;
  readonly entry: string;
  readonly watchSource?: string;
  readonly targetSelector?: string;
  readonly timeoutMs?: number;
  readonly optionalActivityReady?: boolean;
  readonly afterScripts?: readonly string[];
  readonly afterLoad?: (identity: EmbeddedModuleIdentityContext & { readonly allowed: true }) => void | Promise<void>;
  readonly authMessage?: string;
  readonly failureTitle?: string;
  readonly failureMessage?: string;
  readonly failureHint?: string;
  readonly palette?: EmbeddedModuleBootstrapPalette;
}

export interface EmbeddedModuleBootstrapHandle {
  readonly moduleId: ModuleId;
  readonly state: EmbeddedLifecycleState;
  readonly ready: Promise<(EmbeddedModuleIdentityContext & { readonly allowed: true }) | null>;
  suspend(reason?: 'hidden' | 'host'): void;
  resume(): void;
  dispose(): void;
}

export interface ModuleStateRow {
  readonly state_key: string;
  readonly value: string;
  readonly scope: 'shared' | 'user';
  readonly revision: number;
}

export interface ModuleDirectoryEntry extends Readonly<Record<string, unknown>> {
  readonly id?: string;
  readonly email?: string;
  readonly role?: string;
}

export interface ModuleActivityItem extends Readonly<Record<string, unknown>> {
  readonly id: string;
  readonly sequence: number;
  readonly type: string;
  readonly title: string;
  readonly message: string;
  readonly requestId: string;
  readonly actorUserId: string | null;
  readonly actorEmail: string;
  readonly actor: string;
  readonly actorRole: string;
  readonly at: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface EmbeddedModuleStore extends Storage {
  readonly directory: readonly ModuleDirectoryEntry[];
  readonly lastError: Error | null;
  readonly mode: 'shared-cloud';
  ready(): Promise<boolean>;
  refresh(): Promise<void>;
  flush(): Promise<boolean>;
  setItemAsync(key: string, value: string): Promise<boolean>;
  commitWithActivity(key: string, value: string, event: ModuleActivityEventInput): Promise<unknown>;
}

export interface EmbeddedModuleAttendance {
  commit(
    operation: 'clock-in' | 'clock-out',
    payload: Readonly<{
      recordId?: string | null;
      location: string;
      department: string;
      geo: Readonly<Record<string, unknown>>;
      workNote?: string | null;
      attendancePolicy: Readonly<Record<string, unknown>>;
    }>,
  ): Promise<unknown>;
}

export interface EmbeddedModuleLocks {
  acquire(lockKey: string, ttlMs?: number): Promise<Readonly<{ key: string; token: string }> | null>;
  release(lock: Readonly<{ key: string; token: string }> | null): Promise<boolean>;
}

export interface EmbeddedModuleActivity {
  readonly items: readonly ModuleActivityItem[];
  readonly hasMore: boolean;
  readonly error: Error | null;
  ready(): Promise<boolean>;
  refresh(): Promise<readonly ModuleActivityItem[]>;
  loadOlder(): Promise<readonly ModuleActivityItem[]>;
  append(event: ModuleActivityEventInput): Promise<ModuleActivityItem>;
}
