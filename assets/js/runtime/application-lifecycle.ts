export interface ApplicationLifecycleHandlers {
  readonly hashchange?: (event: HashChangeEvent) => void;
  readonly storage?: (event: StorageEvent) => void;
  readonly online?: (event: Event) => void;
  readonly offline?: (event: Event) => void;
  readonly beforeinstallprompt?: (event: Event) => void;
  readonly appinstalled?: (event: Event) => void;
  readonly focus?: (event: FocusEvent) => void;
  readonly error?: (event: ErrorEvent) => void;
  readonly unhandledrejection?: (event: PromiseRejectionEvent) => void;
  readonly visibilitychange?: (event: Event) => void;
}

export interface ApplicationLifecycleHandle { dispose(): void; }

/** One install/dispose boundary for long-lived application listeners. */
export function installApplicationLifecycle(handlers: ApplicationLifecycleHandlers = {}): ApplicationLifecycleHandle {
  const disposers: Array<() => void> = [];

  const onWindow = <K extends keyof WindowEventMap>(type: K, handler: ((event: WindowEventMap[K]) => void) | undefined): void => {
    if (!handler) return;
    window.addEventListener(type, handler);
    disposers.push(() => window.removeEventListener(type, handler));
  };
  const onDocument = <K extends keyof DocumentEventMap>(type: K, handler: ((event: DocumentEventMap[K]) => void) | undefined): void => {
    if (!handler) return;
    document.addEventListener(type, handler);
    disposers.push(() => document.removeEventListener(type, handler));
  };
  const onLooseWindow = (type: 'beforeinstallprompt' | 'appinstalled', handler: ((event: Event) => void) | undefined): void => {
    if (!handler) return;
    window.addEventListener(type, handler);
    disposers.push(() => window.removeEventListener(type, handler));
  };

  onWindow('hashchange', handlers.hashchange);
  onWindow('storage', handlers.storage);
  onWindow('online', handlers.online);
  onWindow('offline', handlers.offline);
  onLooseWindow('beforeinstallprompt', handlers.beforeinstallprompt);
  onLooseWindow('appinstalled', handlers.appinstalled);
  onWindow('focus', handlers.focus);
  onWindow('error', handlers.error);
  onWindow('unhandledrejection', handlers.unhandledrejection);
  onDocument('visibilitychange', handlers.visibilitychange);

  return Object.freeze({
    dispose(): void {
      while (disposers.length) {
        try { disposers.pop()?.(); } catch { /* lifecycle cleanup is best-effort */ }
      }
    },
  });
}
