import type { AppErrorContract } from '../../types/errors.ts';

export interface RepositoryMutationOptions {
  readonly invalidate?: boolean;
}

export type RepositoryResult<T> = Promise<T>;
export type RepositoryError = AppErrorContract;

export interface DisposableRepository {
  dispose?(): void;
}
