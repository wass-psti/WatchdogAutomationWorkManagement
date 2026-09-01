import type {
  AppErrorCategory,
  AppErrorContract,
  AppErrorMetadata,
  ErrorNormalizationContext,
} from '../../../../src/types/errors.ts';

export interface WorkManagementErrorOptions {
  readonly code?: string;
  readonly category?: AppErrorCategory;
  readonly status?: number | null;
  readonly retryable?: boolean;
  readonly cause?: unknown;
  readonly operation?: string | null;
  readonly detail?: string | null;
  readonly metadata?: AppErrorMetadata | null;
}

type UnknownRecord = Record<string, unknown>;

const recordOf = (value: unknown): UnknownRecord | null =>
  value !== null && typeof value === 'object' ? value as UnknownRecord : null;

const nestedRecord = (value: unknown, key: string): UnknownRecord | null => {
  const record = recordOf(value);
  return record ? recordOf(record[key]) : null;
};

const stringValue = (value: unknown): string => typeof value === 'string' ? value : '';

const numericStatus = (value: unknown): number | null => {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
};

const statusOf = (error: unknown): number | null => {
  const record = recordOf(error);
  if (!record) return null;
  return numericStatus(record.status)
    ?? numericStatus(record.statusCode)
    ?? numericStatus(nestedRecord(record.response, 'status')?.status)
    ?? numericStatus(recordOf(record.response)?.status);
};

const codeOf = (error: unknown): string => stringValue(recordOf(error)?.code).trim();
const nameOf = (error: unknown): string => stringValue(recordOf(error)?.name).trim();
const messageOf = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  const candidate = stringValue(recordOf(error)?.message).trim();
  if (candidate) return candidate;
  if (typeof error === 'string' && error.trim()) return error.trim();
  return fallback;
};

const detailOf = (error: unknown): string | null => {
  const record = recordOf(error);
  if (!record) return null;
  const detail = stringValue(record.details ?? record.detail ?? record.hint).trim();
  return detail || null;
};

const lower = (value: string): string => value.toLowerCase();

export class WorkManagementError extends Error implements AppErrorContract {
  override readonly name = 'WorkManagementError' as const;
  readonly code: string;
  readonly category: AppErrorCategory;
  readonly status: number | null;
  readonly retryable: boolean;
  readonly operation: string | null;
  readonly detail: string | null;
  readonly metadata: AppErrorMetadata | null;

  constructor(message: string, options: WorkManagementErrorOptions = {}) {
    const causeOptions = options.cause === undefined ? undefined : { cause: options.cause };
    super(String(message || 'The operation could not be completed.'), causeOptions);
    this.code = String(options.code || 'WM_UNEXPECTED');
    this.category = options.category ?? 'unexpected';
    this.status = numericStatus(options.status);
    this.retryable = Boolean(options.retryable);
    this.operation = options.operation ? String(options.operation) : null;
    this.detail = options.detail == null ? null : String(options.detail);
    this.metadata = options.metadata ?? null;
  }
}

interface Classification {
  readonly code: string;
  readonly category: AppErrorCategory;
  readonly retryable: boolean;
}

function classifyError(error: unknown, status: number | null, code: string, haystack: string, context: ErrorNormalizationContext): Classification {
  if (context.categoryHint) {
    return { code: code || `WM_${context.categoryHint.toUpperCase().replaceAll('-', '_')}`, category: context.categoryHint, retryable: ['network', 'timeout', 'rate-limit', 'transport', 'backend', 'storage'].includes(context.categoryHint) };
  }

  const operation = lower(String(context.operation || ''));
  const errorName = nameOf(error);
  const isStorageOperation = operation.startsWith('storage.');

  if (status === 401 || haystack.includes('jwt expired') || haystack.includes('session expired') || haystack.includes('not authenticated')) {
    return { code: code || 'WM_AUTH_REQUIRED', category: 'authentication', retryable: false };
  }
  if (status === 403 || haystack.includes('permission denied') || haystack.includes('not authorized') || haystack.includes('forbidden')) {
    return { code: code || 'WM_FORBIDDEN', category: 'authorization', retryable: false };
  }
  if (status === 404 || haystack.includes('not found') || haystack.includes('does not exist')) {
    return { code: code || 'WM_NOT_FOUND', category: 'not-found', retryable: false };
  }
  if (status === 409 || haystack.includes('duplicate key') || haystack.includes('already exists') || haystack.includes('serialization') || code.toUpperCase() === '40001') {
    return { code: code || 'WM_CONFLICT', category: 'conflict', retryable: false };
  }
  if (status === 400 || status === 422 || haystack.includes('validation') || haystack.includes('invalid input') || haystack.includes('invalid value')) {
    return { code: code || 'WM_VALIDATION', category: 'validation', retryable: false };
  }
  if (status === 429 || haystack.includes('rate limit') || haystack.includes('too many requests')) {
    return { code: code || 'WM_RATE_LIMIT', category: 'rate-limit', retryable: true };
  }
  if (errorName === 'TimeoutError' || haystack.includes('timed out') || haystack.includes('timeout') || haystack.includes('did not respond in time')) {
    return { code: code || 'WM_TIMEOUT', category: 'timeout', retryable: true };
  }
  if (errorName === 'AbortError') {
    return { code: code || 'WM_TRANSPORT_ABORTED', category: 'transport', retryable: false };
  }
  if (isStorageOperation) {
    return { code: code || 'WM_STORAGE', category: 'storage', retryable: status === null || status >= 500 };
  }
  if (haystack.includes('failed to fetch') || haystack.includes('networkerror') || haystack.includes('network request') || haystack.includes('offline')) {
    return { code: code || 'WM_NETWORK', category: 'network', retryable: true };
  }
  if (status !== null && status >= 500) {
    return { code: code || 'WM_BACKEND', category: 'backend', retryable: true };
  }
  if (status !== null) {
    return { code: code || 'WM_TRANSPORT', category: 'transport', retryable: status >= 500 };
  }
  if (error instanceof TypeError && (haystack.includes('response') || haystack.includes('payload') || haystack.includes('schema'))) {
    return { code: code || 'WM_INTERNAL_DATA', category: 'internal', retryable: false };
  }
  return { code: code || 'WM_UNEXPECTED', category: 'unexpected', retryable: false };
}

export function normalizeAppError(error: unknown, context: ErrorNormalizationContext = {}): WorkManagementError {
  if (error instanceof WorkManagementError) {
    const operation = error.operation ?? context.operation ?? null;
    const metadata = context.metadata
      ? Object.freeze({ ...(error.metadata ?? {}), ...context.metadata })
      : error.metadata;
    if (operation === error.operation && metadata === error.metadata) return error;
    return new WorkManagementError(error.message, {
      code: error.code,
      category: error.category,
      status: error.status,
      retryable: error.retryable,
      cause: error.cause,
      operation,
      detail: error.detail,
      metadata,
    });
  }

  const fallbackMessage = context.fallbackMessage || 'The operation could not be completed. Try again.';
  const status = statusOf(error);
  const code = codeOf(error);
  const message = messageOf(error, fallbackMessage);
  const detail = detailOf(error);
  const haystack = lower(`${code} ${message} ${detail || ''}`);
  const classification = classifyError(error, status, code, haystack, context);

  return new WorkManagementError(message, {
    code: classification.code,
    category: classification.category,
    status,
    retryable: classification.retryable,
    cause: error,
    operation: context.operation ?? null,
    detail,
    metadata: context.metadata ?? null,
  });
}

export function isWorkManagementError(error: unknown): error is WorkManagementError {
  return error instanceof WorkManagementError;
}
