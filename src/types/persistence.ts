export type PersistenceOperation = 'create' | 'read' | 'update' | 'delete' | 'list';

export interface PageRequest {
  readonly cursor?: string | null;
  readonly limit?: number;
}

export interface PageResult<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
}

export interface PersistenceEnvelope<T> {
  readonly data: T;
  readonly receivedAt: number;
}
