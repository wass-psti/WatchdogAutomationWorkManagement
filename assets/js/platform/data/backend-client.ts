import type {
  AuthTransportPort,
  BackendClient,
  BackendClientOptions,
  RpcOptions,
  StorageDeleteOptions,
  StorageUploadOptions,
  TransportValidator,
} from '../../../../src/platform/contracts/transport.ts';
import { normalizeAppError, WorkManagementError } from '../errors/app-error.ts';
import { createRequestSignal, timeoutError } from './request-signal.ts';

type UnknownRecord = Record<string, unknown>;

const STORAGE_REQUEST_TIMEOUT_MS = 20_000;
const STORAGE_UPLOAD_TIMEOUT_MS = 60_000;
let requestSequence = 0;
const nextRequestId = (): string => `wm-${Date.now().toString(36)}-${(++requestSequence).toString(36)}`;

const recordOf = (value: unknown): UnknownRecord | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : null;

const storageMessage = (payload: unknown, status: number): string => {
  const record = recordOf(payload);
  const message = typeof record?.message === 'string' ? record.message : typeof record?.error === 'string' ? record.error : '';
  return message || `Storage request failed with HTTP ${status}`;
};

async function responsePayload(response: Response): Promise<unknown> {
  try { return await response.json(); } catch { return null; }
}

function validatePayload<T>(value: unknown, validator: TransportValidator<T> | undefined, operation: string): T | unknown {
  if (!validator) return value;
  try {
    return validator(value);
  } catch (cause: unknown) {
    throw new WorkManagementError('The server returned data in an unexpected format.', {
      code: 'WM_TRANSPORT_PAYLOAD_INVALID',
      category: 'internal',
      retryable: false,
      operation,
      cause,
    });
  }
}

/** Supabase transport adapter. Feature/domain code should depend on repositories, not this client. */
export function createBackendClient(auth: AuthTransportPort, options: BackendClientOptions = {}): BackendClient {
  const diagnostics = options.diagnostics ?? null;

  async function accessToken(): Promise<string> {
    if (!auth.isAuthenticated) {
      throw new WorkManagementError('Sign in to continue.', {
        code: 'WM_AUTH_REQUIRED',
        category: 'authentication',
        operation: 'auth.access-token',
      });
    }
    const token = await auth.ensureAccessToken();
    if (!token) {
      throw new WorkManagementError('Your session expired. Sign in again.', {
        code: 'WM_AUTH_EXPIRED',
        category: 'authentication',
        operation: 'auth.access-token',
      });
    }
    return token;
  }

  async function rpc<T = unknown>(
    name: string,
    body: Readonly<Record<string, unknown>> = {},
    rpcOptions: RpcOptions<T> = {},
  ): Promise<T | unknown> {
    const operation = `rpc.${name}`;
    const prefer = rpcOptions.prefer ?? 'return=representation';
    const requestId = nextRequestId();
    try {
      const token = await accessToken();
      diagnostics?.debug('API_RPC', 'Calling backend RPC.', { operation, requestId });
      const payload = await auth.request(`/rest/v1/rpc/${name}`, {
        method: 'POST',
        headers: auth.headers(token, prefer ? { Prefer: prefer } : {}),
        body: JSON.stringify(body),
        ...(rpcOptions.signal ? { signal: rpcOptions.signal } : {}),
      });
      const validated = validatePayload(payload, rpcOptions.validate, operation);
      diagnostics?.debug('API_RPC_SUCCESS', 'Backend RPC completed.', { operation, requestId });
      return validated;
    } catch (error: unknown) {
      const normalized = normalizeAppError(error, { operation, metadata: { requestId } });
      diagnostics?.warn('API_RPC_FAILURE', normalized.message, {
        operation,
        requestId,
        code: normalized.code,
        status: normalized.status,
        retryable: normalized.retryable,
      });
      throw normalized;
    }
  }

  const storageUrl = (bucket: string, path: string): string => {
    const normalizedPath = String(path || '').split('/').map(encodeURIComponent).join('/');
    return `${auth.backend.supabaseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${normalizedPath}`;
  };

  async function storageDelete(bucket: string, path: string, deleteOptions: StorageDeleteOptions = {}): Promise<boolean> {
    const operation = `storage.delete.${bucket}`;
    const ignoreMissing = deleteOptions.ignoreMissing ?? true;
    const requestId = nextRequestId();
    const requestSignal = createRequestSignal(deleteOptions.signal, STORAGE_REQUEST_TIMEOUT_MS);
    try {
      const token = await accessToken();
      diagnostics?.debug('STORAGE_DELETE', 'Deleting private storage object.', { operation, requestId, bucket });
      const response = await fetch(storageUrl(bucket, path), {
        method: 'DELETE',
        headers: { apikey: auth.backend.publishableKey, Authorization: `Bearer ${token}` },
        signal: requestSignal.signal,
      });
      if (response.ok || (ignoreMissing && response.status === 404)) return true;
      const payload = await responsePayload(response);
      throw new WorkManagementError(storageMessage(payload, response.status), {
        code: 'WM_STORAGE_DELETE',
        category: 'storage',
        status: response.status,
        retryable: response.status >= 500,
        operation,
        metadata: { bucket, requestId },
        cause: payload,
      });
    } catch (error: unknown) {
      const cause = requestSignal.timedOut() ? timeoutError('The storage service did not respond in time.') : error;
      throw normalizeAppError(cause, {
        operation,
        fallbackMessage: 'The file could not be removed. Try again.',
        categoryHint: cause instanceof WorkManagementError ? null : requestSignal.timedOut() ? 'timeout' : 'storage',
        metadata: { bucket, requestId },
      });
    } finally {
      requestSignal.dispose();
    }
  }

  async function storageUpload(bucket: string, path: string, file: Blob, uploadOptions: StorageUploadOptions = {}): Promise<boolean> {
    const operation = `storage.upload.${bucket}`;
    const requestId = nextRequestId();
    const requestSignal = createRequestSignal(uploadOptions.signal, STORAGE_UPLOAD_TIMEOUT_MS);
    try {
      const token = await accessToken();
      diagnostics?.debug('STORAGE_UPLOAD', 'Uploading private storage object.', { operation, requestId, bucket, size: file.size });
      const response = await fetch(storageUrl(bucket, path), {
        method: 'POST',
        headers: {
          apikey: auth.backend.publishableKey,
          Authorization: `Bearer ${token}`,
          'Content-Type': uploadOptions.contentType || file.type || 'application/octet-stream',
          'x-upsert': uploadOptions.upsert ? 'true' : 'false',
        },
        body: file,
        signal: requestSignal.signal,
      });
      if (response.ok) return true;
      const payload = await responsePayload(response);
      throw new WorkManagementError(storageMessage(payload, response.status), {
        code: 'WM_STORAGE_UPLOAD',
        category: 'storage',
        status: response.status,
        retryable: response.status >= 500,
        operation,
        metadata: { bucket, size: file.size, requestId },
        cause: payload,
      });
    } catch (error: unknown) {
      const cause = requestSignal.timedOut() ? timeoutError('The storage upload did not respond in time.') : error;
      throw normalizeAppError(cause, {
        operation,
        fallbackMessage: 'The file could not be uploaded. Try again.',
        categoryHint: cause instanceof WorkManagementError ? null : requestSignal.timedOut() ? 'timeout' : 'storage',
        metadata: { bucket, size: file.size, requestId },
      });
    } finally {
      requestSignal.dispose();
    }
  }

  async function storageSign(bucket: string, path: string, expiresIn = 120): Promise<unknown> {
    const operation = `storage.sign.${bucket}`;
    try {
      const token = await accessToken();
      return await auth.request(`/storage/v1/object/sign/${encodeURIComponent(bucket)}/${String(path || '').split('/').map(encodeURIComponent).join('/')}`, {
        method: 'POST',
        headers: auth.headers(token),
        body: JSON.stringify({ expiresIn }),
      });
    } catch (error: unknown) {
      throw normalizeAppError(error, {
        operation,
        fallbackMessage: 'The file could not be opened securely. Try again.',
        categoryHint: error instanceof WorkManagementError ? null : 'storage',
        metadata: { bucket },
      });
    }
  }

  return Object.freeze({ rpc, storageDelete, storageUpload, storageSign } satisfies BackendClient);
}
