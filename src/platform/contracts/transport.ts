import type { DiagnosticsPort } from './diagnostics.ts';

export interface BackendIdentity {
  readonly supabaseUrl: string;
  readonly publishableKey: string;
}

export interface AuthTransportPort {
  readonly isAuthenticated: boolean;
  readonly user?: Readonly<{ id?: string | null }> | null;
  readonly backend: BackendIdentity;
  ensureAccessToken(): Promise<string | null>;
  headers(token: string, extra?: Readonly<Record<string, string>>): Record<string, string>;
  request(path: string, init?: RequestInit): Promise<unknown>;
}

export type TransportValidator<T> = (value: unknown) => T;

export interface RpcOptions<T = never> {
  readonly prefer?: string;
  readonly signal?: AbortSignal | null;
  readonly validate?: TransportValidator<T>;
}

export interface StorageDeleteOptions {
  readonly ignoreMissing?: boolean;
  readonly signal?: AbortSignal | null;
}

export interface StorageUploadOptions {
  readonly contentType?: string | null;
  readonly upsert?: boolean;
  readonly signal?: AbortSignal | null;
}

export type PaginationCursor = string;

export interface PageMetadata {
  readonly nextCursor: PaginationCursor | null;
  readonly hasMore: boolean;
}

export interface Page<T> {
  readonly items: readonly T[];
  readonly page: PageMetadata;
}

export interface BackendClient {
  rpc(name: string, body?: Readonly<Record<string, unknown>>, options?: RpcOptions): Promise<unknown>;
  rpc<T>(name: string, body: Readonly<Record<string, unknown>> | undefined, options: RpcOptions<T> & Readonly<{ validate: TransportValidator<T> }>): Promise<T>;
  storageDelete(bucket: string, path: string, options?: StorageDeleteOptions): Promise<boolean>;
  storageUpload(bucket: string, path: string, file: Blob, options?: StorageUploadOptions): Promise<boolean>;
  storageSign(bucket: string, path: string, expiresIn?: number): Promise<unknown>;
}

export interface BackendClientOptions {
  readonly diagnostics?: DiagnosticsPort | null;
}
