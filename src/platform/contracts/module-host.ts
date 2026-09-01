import type { ModuleId } from '../../types/identifiers.ts';
import type {
  EmbeddedLifecycleState,
  EmbeddedModuleIdentityContext,
} from './embedded-module.ts';

export interface ModuleHostDefinition { readonly id: ModuleId; }
export interface ModuleHostAuthPort { moduleIdentityContext(moduleId: ModuleId): EmbeddedModuleIdentityContext | null; }

export type ModuleHostEvent =
  | Readonly<{ type: 'module:attached'; moduleId: ModuleId; detail: null }>
  | Readonly<{ type: 'module:identity-published'; moduleId: ModuleId; detail: null }>
  | Readonly<{ type: 'module:ready'; moduleId: ModuleId; detail: Readonly<{ name: string; moduleId: ModuleId }> }>
  | Readonly<{ type: 'module:error'; moduleId: ModuleId; detail: Readonly<{ name: string; moduleId: ModuleId; message: string }> }>
  | Readonly<{ type: 'module:disposed'; moduleId: ModuleId | null; detail: null }>;
export type ModuleHostEventHandler = (event: ModuleHostEvent) => void;

export interface ModuleHostOptions {
  readonly auth: ModuleHostAuthPort;
  readonly origin?: string;
  readonly onEvent?: ModuleHostEventHandler | null;
}

export interface ModuleHost {
  readonly moduleId: ModuleId | null;
  readonly state: EmbeddedLifecycleState;
  attach(frame: HTMLIFrameElement | null, module: ModuleHostDefinition | null): () => void;
  detach(): void;
  publishIdentity(): boolean;
  invalidate(reason?: 'backup-restore' | 'host-refresh'): boolean;
}
