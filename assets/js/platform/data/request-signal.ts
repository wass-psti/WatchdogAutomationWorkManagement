export interface RequestSignalLease {
  readonly signal: AbortSignal;
  timedOut(): boolean;
  dispose(): void;
}

/**
 * Compose caller cancellation with an application timeout without letting one
 * disable the other. Caller cancellation remains distinguishable from timeout.
 */
export function createRequestSignal(parent: AbortSignal | null | undefined, timeoutMs: number): RequestSignalLease {
  const controller = new AbortController();
  let timedOut = false;
  let disposed = false;
  const timeout = Math.max(1, Math.trunc(timeoutMs));

  const onParentAbort = (): void => {
    if (controller.signal.aborted) return;
    try { controller.abort(parent?.reason); }
    catch { controller.abort(); }
  };

  if (parent?.aborted) onParentAbort();
  else parent?.addEventListener('abort', onParentAbort, { once: true });

  const timer = globalThis.setTimeout(() => {
    if (controller.signal.aborted) return;
    timedOut = true;
    try { controller.abort(new DOMException('Request timed out.', 'TimeoutError')); }
    catch { controller.abort(); }
  }, timeout);

  return Object.freeze({
    signal: controller.signal,
    timedOut: () => timedOut,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      globalThis.clearTimeout(timer);
      parent?.removeEventListener('abort', onParentAbort);
    },
  });
}

export function timeoutError(message = 'The service did not respond in time.'): Error {
  const error = new Error(message);
  error.name = 'TimeoutError';
  return error;
}
