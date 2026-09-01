export type AppErrorCategory =
  | 'authentication'
  | 'authorization'
  | 'validation'
  | 'conflict'
  | 'not-found'
  | 'rate-limit'
  | 'timeout'
  | 'network'
  | 'storage'
  | 'transport'
  | 'backend'
  | 'internal'
  | 'unexpected';

export interface AppErrorMetadata {
  readonly [key: string]: unknown;
}

export interface AppErrorContract {
  readonly name: 'WorkManagementError';
  readonly message: string;
  readonly code: string;
  readonly category: AppErrorCategory;
  readonly status: number | null;
  readonly retryable: boolean;
  readonly operation: string | null;
  readonly detail: string | null;
  readonly metadata: AppErrorMetadata | null;
  readonly cause?: unknown;
}

export interface ErrorNormalizationContext {
  readonly operation?: string | null;
  readonly fallbackMessage?: string;
  readonly categoryHint?: AppErrorCategory | null;
  readonly metadata?: AppErrorMetadata | null;
}
