import type { DiagnosticsPort } from './diagnostics.ts';

export type QueryPrimitive = string | number | boolean | null;
export type QueryKeyObject = Readonly<{ [key: string]: QueryKeyPart }>;
export type QueryKeyPart = QueryPrimitive | QueryKeyObject | readonly QueryKeyPart[];
export type QueryKey = QueryKeyPart | readonly QueryKeyPart[];

export interface QueryFetchOptions<T> {
  readonly key: QueryKey;
  readonly queryFn: () => Promise<T> | T;
  readonly staleTime?: number;
  readonly force?: boolean;
}

export interface QueryMutationOptions<TInput, TResult> {
  readonly key: QueryKey;
  readonly input: TInput;
  readonly mutationFn: (input: TInput) => Promise<TResult> | TResult;
  readonly invalidate?: readonly QueryKey[];
}

export interface QuerySnapshotEntry {
  readonly key: string;
  readonly updatedAt: number;
  readonly pending: boolean;
  readonly hasData: boolean;
  readonly error: string | null;
}

export type QueryEvent<T = unknown> =
  | Readonly<{ type: 'query:set'; key: string; data: T }>
  | Readonly<{ type: 'query:success'; key: string; data: T }>
  | Readonly<{ type: 'query:error'; key: string; error: unknown }>
  | Readonly<{ type: 'query:invalidate'; key: string; count: number }>
  | Readonly<{ type: 'query:remove'; key: string; count: number }>
  | Readonly<{ type: 'query:clear' }>
  | Readonly<{ type: 'mutation:start'; key: string }>
  | Readonly<{ type: 'mutation:success'; key: string; data: T }>
  | Readonly<{ type: 'mutation:error'; key: string; error: unknown }>;

export interface QueryClient {
  fetchQuery<T>(options: QueryFetchOptions<T>): Promise<T>;
  mutate<TInput, TResult>(options: QueryMutationOptions<TInput, TResult>): Promise<TResult>;
  getQueryData<T = unknown>(key: QueryKey): T | undefined;
  setQueryData<T>(key: QueryKey, data: T, options?: Readonly<{ updatedAt?: number }>): T;
  invalidateQueries(prefix: QueryKey): number;
  removeQueries(prefix: QueryKey): number;
  clear(): void;
  subscribe(listener: (event: QueryEvent) => void): () => void;
  snapshot(): readonly QuerySnapshotEntry[];
}

export interface QueryClientOptions {
  readonly diagnostics?: DiagnosticsPort | null;
  readonly defaultStaleTime?: number;
}
