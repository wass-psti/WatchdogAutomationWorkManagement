import type { ModuleId } from '../../../src/types/identifiers.ts';
import type {
  EmbeddedErrorMessage,
  EmbeddedLifecycleState,
  EmbeddedModuleBootstrapConfig,
  EmbeddedModuleBootstrapHandle,
  EmbeddedModuleIdentityContext,
  EmbeddedReadyMessage,
} from '../../../src/platform/contracts/embedded-module.ts';
import { installModuleIdentityBridge } from '../core/module-identity-bridge.ts';
import { installModuleCloudStore } from '../core/module-cloud-store.ts';
import { transitionEmbeddedLifecycle } from './module-lifecycle.ts';

const MODULE_IDS = new Set<ModuleId>(['time-tracker', 'fueltrack-plus', 'tradelink']);
let activeHandle: EmbeddedModuleBootstrapHandle | null = null;

const sanitize = (value: unknown): string => String(value ?? '').replace(/[<>&]/g, '');
const resolveUrl = (value: string): string => new URL(value, document.baseURI).href;
const errorMessage = (error: unknown, fallback = 'The authenticated cloud runtime is unavailable.'): string => error instanceof Error ? error.message : typeof error === 'string' ? error : fallback;

function validateConfig(config: EmbeddedModuleBootstrapConfig): void {
  if (!MODULE_IDS.has(config.moduleId)) throw new TypeError('A supported embedded module id is required.');
  if (!String(config.name || '').trim()) throw new TypeError('An embedded module name is required.');
  if (!String(config.entry || '').trim()) throw new TypeError(`No entry module is configured for ${config.name || config.moduleId}.`);
}

function renderFailure(config: EmbeddedModuleBootstrapConfig, message: string): void {
  const target = config.targetSelector ? document.querySelector<HTMLElement>(config.targetSelector) : document.getElementById('app');
  const host = target || document.body;
  const palette = config.palette ?? {};
  const background = palette.background || '#fffaf2';
  const foreground = palette.foreground || '#201f1b';
  const border = palette.border || '#ddd4c8';
  const muted = palette.muted || '#6f685f';
  const title = sanitize(config.failureTitle || `${config.name} could not start`);
  const detail = sanitize(message || config.failureMessage || 'The authenticated cloud runtime is unavailable.');
  const hint = sanitize(config.failureHint || 'Verify your Work Management session and network connection, then retry.');
  host.innerHTML = `<main style="max-width:760px;margin:64px auto;padding:28px;border:1px solid ${border};border-radius:18px;background:${background};color:${foreground};font:15px/1.5 system-ui,sans-serif"><strong style="display:block;font-size:20px;margin-bottom:8px">${title}</strong><span>${detail}</span><p style="margin:12px 0 0;color:${muted}">${hint}</p></main>`;
}

export function loadEmbeddedScript(path: string): Promise<HTMLScriptElement> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = resolveUrl(path);
    script.onload = () => resolve(script);
    script.onerror = () => reject(new Error(`Unable to load ${path}`));
    document.body.appendChild(script);
  });
}

function postHostReady(config: EmbeddedModuleBootstrapConfig): void {
  const message: EmbeddedReadyMessage = Object.freeze({ type: 'wm:host:ready', detail: Object.freeze({ name: config.name, moduleId: config.moduleId }) });
  try { if (window.parent !== window) window.parent.postMessage(message, location.origin); } catch { /* Host may already be detached. */ }
  window.dispatchEvent(new CustomEvent('wm:module:ready', { detail: message.detail }));
}

function postHostError(config: EmbeddedModuleBootstrapConfig, messageText: string): void {
  const message: EmbeddedErrorMessage = Object.freeze({ type: 'wm:host:error', detail: Object.freeze({ name: config.name, moduleId: config.moduleId, message: messageText }) });
  try { if (window.parent !== window) window.parent.postMessage(message, location.origin); } catch { /* Host may already be detached. */ }
  window.dispatchEvent(new CustomEvent('wm:module:error', { detail: message.detail }));
}

function isAllowedIdentity(value: EmbeddedModuleIdentityContext | null): value is EmbeddedModuleIdentityContext & { readonly allowed: true } {
  return value?.allowed === true;
}

/**
 * Starts one embedded runtime generation. A previous generation is disposed first,
 * preventing listeners, timers, outstanding cloud requests, or late startup callbacks
 * from leaking across module reinitialization.
 */
export function startEmbeddedModule(config: EmbeddedModuleBootstrapConfig): EmbeddedModuleBootstrapHandle {
  validateConfig(config);
  activeHandle?.dispose();

  let state: EmbeddedLifecycleState = Object.freeze({ kind: 'uninitialized', generation: 0, moduleId: null });
  state = transitionEmbeddedLifecycle(state, { type: 'initialize', moduleId: config.moduleId });
  const generation = state.generation;
  let disposed = false;
  let startupTimer: number | null = null;
  const abort = new AbortController();
  const identity = installModuleIdentityBridge(config.moduleId);
  const cloud = installModuleCloudStore({ moduleId: config.moduleId, identityReady: identity.ready });
  let observedError = '';

  const captureError = (event: ErrorEvent): void => {
    if (disposed || state.generation !== generation) return;
    const source = String(event.filename || '');
    if (config.watchSource && source && !source.includes(config.watchSource)) return;
    observedError = event.error instanceof Error ? event.error.message : event.message || observedError;
  };
  const captureRejection = (event: PromiseRejectionEvent): void => {
    if (disposed || state.generation !== generation) return;
    observedError = errorMessage(event.reason, observedError || 'Unhandled startup rejection.');
  };
  window.addEventListener('error', captureError, { signal: abort.signal });
  window.addEventListener('unhandledrejection', captureRejection, { signal: abort.signal });

  const timeoutMs = Number.isFinite(config.timeoutMs) ? Math.max(1000, Number(config.timeoutMs)) : 8000;
  startupTimer = window.setTimeout(() => {
    if (disposed || state.kind !== 'initializing') return;
    const target = config.targetSelector ? document.querySelector<HTMLElement>(config.targetSelector) : document.getElementById('app');
    if (target && !target.childElementCount) renderFailure(config, observedError ? `Startup error: ${observedError}` : `${config.name} did not complete initialization.`);
  }, timeoutMs);

  const ready = (async (): Promise<(EmbeddedModuleIdentityContext & { readonly allowed: true }) | null> => {
    try {
      const context = await identity.ready;
      if (!isAllowedIdentity(context)) throw new Error(config.authMessage || `Authenticated ${config.name} access is required.`);
      if (disposed || state.generation !== generation) return null;
      await cloud.store.ready();
      if (disposed || state.generation !== generation) return null;

      if (config.optionalActivityReady) {
        try { await globalThis.WMModuleActivity?.ready(); }
        catch (activityError) {
          globalThis.WMModuleActivityBootError = activityError;
          console.warn(`[${config.name}] Activity stream will retry after startup:`, activityError);
        }
      }

      await import(resolveUrl(config.entry));
      for (const scriptPath of config.afterScripts ?? []) await loadEmbeddedScript(scriptPath);
      if (config.afterLoad) await config.afterLoad(context);
      if (disposed || state.generation !== generation) return null;
      state = transitionEmbeddedLifecycle(state, { type: 'ready' });
      postHostReady(config);
      return context;
    } catch (error) {
      if (disposed || state.generation !== generation) return null;
      const message = errorMessage(error, observedError || config.failureMessage);
      console.error(`[${config.name}] Startup failed`, error);
      state = transitionEmbeddedLifecycle(state, { type: 'fail', message });
      renderFailure(config, message);
      postHostError(config, message);
      return null;
    } finally {
      if (startupTimer !== null) window.clearTimeout(startupTimer);
      startupTimer = null;
    }
  })();

  const handle: EmbeddedModuleBootstrapHandle = Object.freeze({
    moduleId: config.moduleId,
    get state() { return state; },
    ready,
    suspend(reason: 'hidden' | 'host' = 'host') {
      if (disposed || state.kind !== 'ready') return;
      state = transitionEmbeddedLifecycle(state, { type: 'suspend', reason });
    },
    resume() {
      if (disposed || state.kind !== 'suspended') return;
      state = transitionEmbeddedLifecycle(state, { type: 'resume' });
      void cloud.store.refresh();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (startupTimer !== null) window.clearTimeout(startupTimer);
      startupTimer = null;
      abort.abort();
      identity.dispose();
      cloud.dispose();
      state = transitionEmbeddedLifecycle(state, { type: 'dispose' });
      if (activeHandle === handle) activeHandle = null;
    },
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) handle.suspend('hidden'); else handle.resume();
  }, { signal: abort.signal });
  window.addEventListener('pagehide', () => handle.dispose(), { signal: abort.signal, once: true });
  activeHandle = handle;
  return handle;
}
