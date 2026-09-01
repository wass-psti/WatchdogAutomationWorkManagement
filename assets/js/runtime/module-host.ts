import type { ModuleId } from '../../../src/types/identifiers.ts';
import type {
  EmbeddedErrorMessage,
  EmbeddedHostInvalidateMessage,
  EmbeddedLifecycleState,
  EmbeddedModuleIdentityContext,
  EmbeddedReadyMessage,
} from '../../../src/platform/contracts/embedded-module.ts';
import type {
  ModuleHost,
  ModuleHostDefinition,
  ModuleHostEvent,
  ModuleHostOptions,
} from '../../../src/platform/contracts/module-host.ts';
import { parseModuleIdentityRequest } from '../core/cloud-module-data.ts';
import { transitionEmbeddedLifecycle } from './module-lifecycle.ts';

type UnknownRecord = Record<string, unknown>;
const recordOf = (value: unknown): UnknownRecord | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : null;
const stringOf = (value: unknown): string => typeof value === 'string' ? value : '';

function parseReadyMessage(value: unknown, moduleId: ModuleId): EmbeddedReadyMessage | null {
  const root = recordOf(value); const detail = recordOf(root?.detail);
  if (!root || root.type !== 'wm:host:ready' || !detail || detail.moduleId !== moduleId) return null;
  const name = stringOf(detail.name).trim();
  return name ? Object.freeze({ type: 'wm:host:ready', detail: Object.freeze({ name, moduleId }) }) : null;
}

function parseErrorMessage(value: unknown, moduleId: ModuleId): EmbeddedErrorMessage | null {
  const root = recordOf(value); const detail = recordOf(root?.detail);
  if (!root || root.type !== 'wm:host:error' || !detail || detail.moduleId !== moduleId) return null;
  const name = stringOf(detail.name).trim(); const message = stringOf(detail.message).trim();
  return name && message ? Object.freeze({ type: 'wm:host:error', detail: Object.freeze({ name, moduleId, message }) }) : null;
}

/** Same-origin, runtime-validated host boundary for isolated application iframes. */
export function createModuleHost({ auth, origin = globalThis.location?.origin ?? '', onEvent = null }: ModuleHostOptions): ModuleHost {
  let frame: HTMLIFrameElement | null = null;
  let module: ModuleHostDefinition | null = null;
  let abort: AbortController | null = null;
  let state: EmbeddedLifecycleState = Object.freeze({ kind: 'uninitialized', generation: 0, moduleId: null });

  const emit = (event: ModuleHostEvent): void => {
    try { onEvent?.(event); } catch { /* Host observers cannot break module lifecycle. */ }
  };
  const targetOrigin = (): string => origin === 'null' ? '*' : origin;
  const post = (message: EmbeddedModuleIdentityContext | EmbeddedHostInvalidateMessage): boolean => {
    if (!frame?.contentWindow || !origin) return false;
    try { frame.contentWindow.postMessage(message, targetOrigin()); return true; }
    catch (error) { console.warn('[Work Management] Module host postMessage failed', error); return false; }
  };

  const publishIdentity = (): boolean => {
    if (!module) return false;
    const identity = auth.moduleIdentityContext(module.id);
    if (!identity || !post(identity)) return false;
    emit(Object.freeze({ type: 'module:identity-published', moduleId: module.id, detail: null }));
    return true;
  };

  const invalidate = (reason: 'backup-restore' | 'host-refresh' = 'host-refresh'): boolean => {
    if (!module) return false;
    return post(Object.freeze({ type: 'wm:host:invalidate', moduleId: module.id, reason }));
  };

  const cleanup = (emitDisposed: boolean): void => {
    abort?.abort(); abort = null;
    const previousModuleId = module?.id ?? state.moduleId;
    if (module || state.kind !== 'uninitialized') state = transitionEmbeddedLifecycle(state, { type: 'dispose' });
    frame = null; module = null;
    if (emitDisposed) emit(Object.freeze({ type: 'module:disposed', moduleId: previousModuleId, detail: null }));
  };

  const detach = (): void => cleanup(Boolean(module));

  const attach: ModuleHost['attach'] = (nextFrame, nextModule) => {
    cleanup(Boolean(module));
    frame = nextFrame; module = nextModule;
    if (!frame || !module) return detach;
    state = transitionEmbeddedLifecycle(state, { type: 'initialize', moduleId: module.id });
    const generation = state.generation;
    abort = new AbortController();

    window.addEventListener('message', (event: MessageEvent<unknown>) => {
      if (!frame?.contentWindow || !module || state.generation !== generation) return;
      if (event.origin !== origin || event.source !== frame.contentWindow) return;
      const identityRequest = parseModuleIdentityRequest(event.data);
      if (identityRequest) {
        if (identityRequest.moduleId === module.id) publishIdentity();
        return;
      }
      const ready = parseReadyMessage(event.data, module.id);
      if (ready) {
        if (state.kind === 'initializing' || state.kind === 'suspended') state = transitionEmbeddedLifecycle(state, { type: 'ready' });
        emit(Object.freeze({ type: 'module:ready', moduleId: module.id, detail: ready.detail }));
        return;
      }
      const failure = parseErrorMessage(event.data, module.id);
      if (failure) {
        if (state.kind !== 'failed' && state.kind !== 'disposed') state = transitionEmbeddedLifecycle(state, { type: 'fail', message: failure.detail.message });
        emit(Object.freeze({ type: 'module:error', moduleId: module.id, detail: failure.detail }));
      }
    }, { signal: abort.signal });
    emit(Object.freeze({ type: 'module:attached', moduleId: module.id, detail: null }));
    return detach;
  };

  return Object.freeze({
    attach,
    detach,
    publishIdentity,
    invalidate,
    get moduleId() { return module?.id ?? null; },
    get state() { return state; },
  });
}
