export type IdleState = Readonly<{ status: 'idle' }>;
export type LoadingState = Readonly<{ status: 'loading' }>;
export type SuccessState<T> = Readonly<{ status: 'success'; data: T }>;
export type FailureState<E = Error> = Readonly<{ status: 'error'; error: E }>;
export type AsyncState<T, E = Error> = IdleState | LoadingState | SuccessState<T> | FailureState<E>;

export type MutationResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; error: Error }>;
