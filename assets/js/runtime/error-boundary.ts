import type { DiagnosticsPort } from '../../../src/platform/contracts/diagnostics.ts';
import { normalizeAppError, type WorkManagementError } from '../platform/errors/app-error.ts';

export interface RuntimeBoundaryContext {
  readonly operation?: string;
  readonly scope?: string;
  readonly [key: string]: unknown;
}

export interface RuntimeErrorBoundaryOptions {
  readonly diagnostics?: DiagnosticsPort | null;
  readonly onError?: ((error: WorkManagementError, context: RuntimeBoundaryContext) => void) | null;
}

export interface RuntimeErrorBoundary {
  report(error: unknown, context?: RuntimeBoundaryContext): WorkManagementError;
  run<TResult>(context: RuntimeBoundaryContext, callback: () => TResult): TResult | null;
}

/** Vanilla-ESM feature boundary equivalent to a UI error boundary. */
export function createRuntimeErrorBoundary({ diagnostics = null, onError = null }: RuntimeErrorBoundaryOptions = {}): RuntimeErrorBoundary {
  const report = (error: unknown, context: RuntimeBoundaryContext = {}): WorkManagementError => {
    const normalized = normalizeAppError(error, { operation: context.operation || context.scope || 'runtime' });
    diagnostics?.error?.('RUNTIME_BOUNDARY', normalized.message, {
      ...context,
      code: normalized.code,
      category: normalized.category,
      retryable: normalized.retryable,
    });
    try { onError?.(normalized, context); }
    catch (boundaryError) { console.error('[Work Management] Error boundary renderer failed', boundaryError); }
    return normalized;
  };

  const run = <TResult>(context: RuntimeBoundaryContext, callback: () => TResult): TResult | null => {
    try {
      const result = callback();
      if (result && typeof (result as { then?: unknown }).then === 'function') {
        void Promise.resolve(result).catch((error: unknown) => report(error, context));
      }
      return result;
    } catch (error) {
      report(error, context);
      return null;
    }
  };

  return Object.freeze({ run, report });
}
