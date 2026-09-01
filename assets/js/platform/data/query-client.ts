import type {
  QueryClient,
  QueryClientOptions,
  QueryEvent,
  QueryFetchOptions,
  QueryKey,
  QueryKeyPart,
  QueryMutationOptions,
  QuerySnapshotEntry,
} from '../../../../src/platform/contracts/query.ts';

interface QueryCacheEntry {
  readonly data?: unknown;
  readonly updatedAt: number;
  readonly promise: Promise<unknown> | null;
  readonly error: unknown | null;
}

type QueryListener = (event: QueryEvent) => void;

function stableEncode(value: QueryKeyPart): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `[${value.map((entry) => stableEncode(entry)).join(',')}]`;
  const entries = Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableEncode(entry)}`);
  return `{${entries.join(',')}}`;
}

const topLevelParts = (value: QueryKey): readonly QueryKeyPart[] =>
  Array.isArray(value) ? value : [value as QueryKeyPart];

export const queryKey = (...parts: QueryKeyPart[]): string => parts.map(stableEncode).join('::');

function errorMessage(error: unknown): string | null {
  return error instanceof Error ? error.message : typeof error === 'string' ? error : null;
}

export function createQueryClient(options: QueryClientOptions = {}): QueryClient {
  const diagnostics = options.diagnostics ?? null;
  const defaultStaleTime = Math.max(0, Number(options.defaultStaleTime ?? 10_000) || 0);
  const cache = new Map<string, QueryCacheEntry>();
  const listeners = new Set<QueryListener>();

  const notify = (event: QueryEvent): void => {
    for (const listener of [...listeners]) {
      try { listener(event); } catch { /* subscriber failures must not corrupt server state */ }
    }
  };

  const keyId = (key: QueryKey): string => queryKey(...topLevelParts(key));
  const getEntry = (key: QueryKey): QueryCacheEntry | null => cache.get(keyId(key)) ?? null;

  const getQueryData = <T = unknown>(key: QueryKey): T | undefined => getEntry(key)?.data as T | undefined;

  const setQueryData = <T>(key: QueryKey, data: T, setOptions: Readonly<{ updatedAt?: number }> = {}): T => {
    const id = keyId(key);
    const previous = cache.get(id);
    cache.set(id, {
      data,
      updatedAt: setOptions.updatedAt ?? Date.now(),
      promise: null,
      error: null,
      ...(previous?.data === undefined ? {} : {}),
    });
    notify({ type: 'query:set', key: id, data });
    return data;
  };

  const fetchQuery = async <T>(fetchOptions: QueryFetchOptions<T>): Promise<T> => {
    if (typeof fetchOptions.queryFn !== 'function') throw new TypeError('queryFn must be a function.');
    const id = keyId(fetchOptions.key);
    const staleTime = Math.max(0, Number(fetchOptions.staleTime ?? defaultStaleTime) || 0);
    const current = cache.get(id);
    const now = Date.now();

    if (!fetchOptions.force && current?.data !== undefined && now - current.updatedAt <= staleTime) {
      return current.data as T;
    }
    if (current?.promise) return current.promise as Promise<T>;

    diagnostics?.debug('QUERY_FETCH', 'Fetching server state.', { key: id });
    const promise = Promise.resolve()
      .then(fetchOptions.queryFn)
      .then((data) => {
        cache.set(id, { data, updatedAt: Date.now(), promise: null, error: null });
        diagnostics?.debug('QUERY_SUCCESS', 'Server state refreshed.', { key: id });
        notify({ type: 'query:success', key: id, data });
        return data;
      })
      .catch((error: unknown) => {
        const previous = cache.get(id);
        cache.set(id, {
          ...(previous?.data === undefined ? {} : { data: previous.data }),
          updatedAt: previous?.updatedAt ?? 0,
          promise: null,
          error,
        });
        diagnostics?.warn('QUERY_FAILURE', errorMessage(error) || 'Server-state request failed.', {
          key: id,
          code: typeof error === 'object' && error !== null && 'code' in error ? String(error.code ?? '') || null : null,
        });
        notify({ type: 'query:error', key: id, error });
        throw error;
      });

    cache.set(id, {
      ...(current?.data === undefined ? {} : { data: current.data }),
      updatedAt: current?.updatedAt ?? 0,
      promise,
      error: current?.error ?? null,
    });
    return promise;
  };

  const invalidateQueries = (prefix: QueryKey): number => {
    const target = keyId(prefix);
    let count = 0;
    for (const [id, entry] of cache.entries()) {
      if (id === target || id.startsWith(`${target}::`)) {
        cache.set(id, { ...entry, updatedAt: 0 });
        count += 1;
      }
    }
    if (count > 0) notify({ type: 'query:invalidate', key: target, count });
    return count;
  };

  const removeQueries = (prefix: QueryKey): number => {
    const target = keyId(prefix);
    let count = 0;
    for (const id of [...cache.keys()]) {
      if (id === target || id.startsWith(`${target}::`)) {
        cache.delete(id);
        count += 1;
      }
    }
    if (count > 0) notify({ type: 'query:remove', key: target, count });
    return count;
  };

  const mutate = async <TInput, TResult>(mutation: QueryMutationOptions<TInput, TResult>): Promise<TResult> => {
    if (typeof mutation.mutationFn !== 'function') throw new TypeError('mutationFn must be a function.');
    const id = keyId(mutation.key);
    notify({ type: 'mutation:start', key: id });
    diagnostics?.debug('MUTATION_START', 'Persisting server-state mutation.', { key: id });
    try {
      const result = await mutation.mutationFn(mutation.input);
      for (const target of mutation.invalidate ?? []) invalidateQueries(target);
      diagnostics?.debug('MUTATION_SUCCESS', 'Server-state mutation persisted.', { key: id });
      notify({ type: 'mutation:success', key: id, data: result });
      return result;
    } catch (error: unknown) {
      diagnostics?.warn('MUTATION_FAILURE', errorMessage(error) || 'Server-state mutation failed.', { key: id });
      notify({ type: 'mutation:error', key: id, error });
      throw error;
    }
  };

  const client: QueryClient = {
    fetchQuery,
    mutate,
    getQueryData,
    setQueryData,
    invalidateQueries,
    removeQueries,
    clear(): void {
      cache.clear();
      notify({ type: 'query:clear' });
    },
    subscribe(listener: QueryListener): () => void {
      if (typeof listener !== 'function') return () => undefined;
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    snapshot(): readonly QuerySnapshotEntry[] {
      return Object.freeze([...cache.entries()].map(([key, entry]) => Object.freeze({
        key,
        updatedAt: entry.updatedAt,
        pending: Boolean(entry.promise),
        hasData: entry.data !== undefined,
        error: errorMessage(entry.error),
      })));
    },
  };

  return Object.freeze(client);
}
