import type {
  CloudModuleDataBridge,
  CloudModuleDataBridgeOptions,
  ModuleActivityEventInput,
  ModuleActivityEventType,
  ModuleDataRequest,
  ModuleDataResponse,
  ModuleIdentityRequest,
  ModuleStateScope,
} from '../../../src/platform/contracts/module-data.ts';
import type { ModuleId } from '../../../src/types/identifiers.ts';
import { WorkManagementError, normalizeAppError } from '../platform/errors/app-error.ts';

type UnknownRecord = { readonly [key: string]: unknown };
type MessageLike = Pick<MessageEvent<unknown>, 'data' | 'origin' | 'source'>;

export type ModuleDataRequestParseResult =
  | Readonly<{ ok: true; value: ModuleDataRequest }>
  | Readonly<{ ok: false; reason: string }>;

export type ModuleDataMessageOutcome = 'ignored' | 'rejected' | 'handled';

export interface CloudModuleDataMessageContext extends CloudModuleDataBridgeOptions {
  readonly origin: string;
  readonly respond: (target: WindowProxy | null, response: ModuleDataResponse) => void;
}

const MODULE_IDS = new Set<ModuleId>(['time-tracker', 'fueltrack-plus', 'tradelink']);
const ACTIVITY_TYPES = new Set<ModuleActivityEventType>(['submit', 'review', 'issue', 'system']);
const rpcPath = (name: string): string => `/rest/v1/rpc/${name}`;

const recordOf = (value: unknown): UnknownRecord | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : null;

const hasOwn = (record: UnknownRecord, key: string): boolean => Object.prototype.hasOwnProperty.call(record, key);
const stringOrNull = (value: unknown): string | null => typeof value === 'string' ? value : null;
const nonEmptyString = (value: unknown): string | null => {
  const candidate = stringOrNull(value)?.trim() ?? '';
  return candidate || null;
};
const moduleIdOf = (value: unknown): ModuleId | null => typeof value === 'string' && MODULE_IDS.has(value as ModuleId) ? value as ModuleId : null;
const scopeOf = (value: unknown): ModuleStateScope | null => value === 'shared' || value === 'user' ? value : null;

const optionalRevision = (record: UnknownRecord, key: string): number | null | undefined => {
  if (!hasOwn(record, key) || record[key] === null || record[key] === undefined) return null;
  const value = record[key];
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
};

const optionalInteger = (record: UnknownRecord, key: string): number | null | undefined => {
  if (!hasOwn(record, key) || record[key] === null || record[key] === undefined) return null;
  const value = record[key];
  return typeof value === 'number' && Number.isSafeInteger(value) ? value : undefined;
};

const parseActivityEvent = (value: unknown): Readonly<{ ok: true; value: ModuleActivityEventInput }> | Readonly<{ ok: false; reason: string }> => {
  const event = recordOf(value);
  if (!event) return { ok: false, reason: 'Activity event payload must be an object.' };

  const id = nonEmptyString(event.id);
  if (!id || id.length < 8 || id.length > 160) return { ok: false, reason: 'Activity event id must contain 8 to 160 characters.' };

  const type = event.type === undefined ? 'system' : stringOrNull(event.type);
  if (!type || !ACTIVITY_TYPES.has(type as ModuleActivityEventType)) return { ok: false, reason: 'Activity event type is not supported.' };

  const title = stringOrNull(event.title)?.trim() ?? '';
  if (!title || title.length > 240) return { ok: false, reason: 'Activity title must contain 1 to 240 characters.' };

  const message = event.message === undefined ? '' : stringOrNull(event.message);
  if (message === null || message.length > 4000) return { ok: false, reason: 'Activity message must be a string no longer than 4000 characters.' };

  const requestId = event.requestId === undefined || event.requestId === null ? null : nonEmptyString(event.requestId);
  if (event.requestId !== undefined && event.requestId !== null && requestId === null) return { ok: false, reason: 'Activity request id must be a non-empty string when provided.' };

  const payload = event.payload === undefined ? {} : recordOf(event.payload);
  if (!payload) return { ok: false, reason: 'Activity payload must be an object.' };

  return {
    ok: true,
    value: Object.freeze({
      id,
      type: type as ModuleActivityEventType,
      title,
      message,
      requestId,
      payload,
    }),
  };
};

const invalid = (reason: string): ModuleDataRequestParseResult => Object.freeze({ ok: false, reason });

/**
 * Parses the same-origin module protocol from an untrusted browser message.
 * No caller may treat event.data as trusted until this parser succeeds.
 */
export function parseModuleDataRequest(value: unknown): ModuleDataRequestParseResult {
  const msg = recordOf(value);
  if (!msg) return invalid('Message envelope must be an object.');
  if (msg.type !== 'wm:data:request') return invalid('Message type is not a module data request.');

  const requestId = nonEmptyString(msg.requestId);
  if (!requestId) return invalid('Request id is required.');
  if (requestId.length > 240) return invalid('Request id exceeds the supported length.');

  const moduleId = moduleIdOf(msg.moduleId);
  if (!moduleId) return invalid('Module id is missing or unsupported.');

  const action = stringOrNull(msg.action);
  if (!action) return invalid('Module data action is required.');

  const base = { type: 'wm:data:request' as const, requestId, moduleId };

  switch (action) {
    case 'list':
      return { ok: true, value: Object.freeze({ ...base, action }) };
    case 'directory':
      return { ok: true, value: Object.freeze({ ...base, action }) };
    case 'put': {
      const key = nonEmptyString(msg.key);
      if (!key) return invalid('State key is required for put.');
      const valueString = stringOrNull(msg.value);
      if (valueString === null) return invalid('State value must be a string for put.');
      const scope = msg.scope === undefined ? 'shared' : scopeOf(msg.scope);
      if (!scope) return invalid('State scope must be shared or user.');
      const expectedRevision = optionalRevision(msg, 'expectedRevision');
      if (expectedRevision === undefined) return invalid('Expected revision must be a non-negative integer or null.');
      return { ok: true, value: Object.freeze({ ...base, action, key, value: valueString, scope, expectedRevision }) };
    }
    case 'delete': {
      const key = nonEmptyString(msg.key);
      if (!key) return invalid('State key is required for delete.');
      const scope = msg.scope === undefined ? 'shared' : scopeOf(msg.scope);
      if (!scope) return invalid('State scope must be shared or user.');
      const expectedRevision = optionalRevision(msg, 'expectedRevision');
      if (expectedRevision === undefined) return invalid('Expected revision must be a non-negative integer or null.');
      return { ok: true, value: Object.freeze({ ...base, action, key, scope, expectedRevision }) };
    }
    case 'lock:acquire': {
      const lockKey = nonEmptyString(msg.lockKey);
      if (!lockKey || lockKey.length < 3) return invalid('Operation lock key must contain at least 3 characters.');
      const requestedTtl = optionalInteger(msg, 'ttlSeconds');
      if (requestedTtl === undefined) return invalid('Lock TTL must be an integer when provided.');
      const ttlSeconds = requestedTtl === null ? 30 : Math.max(3, Math.min(requestedTtl, 120));
      return { ok: true, value: Object.freeze({ ...base, action, lockKey, ttlSeconds }) };
    }
    case 'lock:release': {
      const lockKey = nonEmptyString(msg.lockKey);
      const token = nonEmptyString(msg.token);
      if (!lockKey) return invalid('Operation lock key is required for release.');
      if (!token) return invalid('Operation lock token is required for release.');
      return { ok: true, value: Object.freeze({ ...base, action, lockKey, token }) };
    }
    case 'attendance:commit': {
      if (moduleId !== 'time-tracker') return invalid('Attendance commit is only available to TimeTracker.');
      if (msg.operation !== 'clock-in' && msg.operation !== 'clock-out') return invalid('Attendance operation must be clock-in or clock-out.');
      const recordId = msg.recordId === undefined || msg.recordId === null ? null : nonEmptyString(msg.recordId);
      if (msg.recordId !== undefined && msg.recordId !== null && recordId === null) return invalid('Attendance record id must be a non-empty string when provided.');
      const locationValue = msg.location === undefined ? '' : stringOrNull(msg.location);
      const department = msg.department === undefined ? '' : stringOrNull(msg.department);
      if (locationValue === null || department === null) return invalid('Attendance location and department must be strings.');
      const geo = msg.geo === undefined ? {} : recordOf(msg.geo);
      const attendancePolicy = msg.attendancePolicy === undefined ? {} : recordOf(msg.attendancePolicy);
      if (!geo || !attendancePolicy) return invalid('Attendance geo and policy payloads must be objects.');
      const workNote = msg.workNote === undefined || msg.workNote === null ? null : stringOrNull(msg.workNote);
      if (msg.workNote !== undefined && msg.workNote !== null && workNote === null) return invalid('Attendance work note must be a string when provided.');
      return {
        ok: true,
        value: Object.freeze({
          ...base,
          action,
          operation: msg.operation,
          recordId,
          location: locationValue,
          department,
          geo,
          workNote,
          attendancePolicy,
        }),
      };
    }
    case 'activity:list': {
      if (moduleId !== 'fueltrack-plus') return invalid('Activity stream is only available to FuelTrack+.');
      const beforeSequence = optionalRevision(msg, 'beforeSequence');
      if (beforeSequence === undefined) return invalid('Activity beforeSequence must be a non-negative integer or null.');
      const requestedLimit = optionalInteger(msg, 'limit');
      if (requestedLimit === undefined || (requestedLimit !== null && requestedLimit < 1)) return invalid('Activity limit must be a positive integer when provided.');
      const limit = requestedLimit === null ? 500 : Math.max(1, Math.min(requestedLimit, 2000));
      return { ok: true, value: Object.freeze({ ...base, action, beforeSequence, limit }) };
    }
    case 'activity:append': {
      if (moduleId !== 'fueltrack-plus') return invalid('Activity stream is only available to FuelTrack+.');
      const event = parseActivityEvent(msg.event);
      if (!event.ok) return invalid(event.reason);
      return { ok: true, value: Object.freeze({ ...base, action, event: event.value }) };
    }
    case 'commit:requests-activity': {
      if (moduleId !== 'fueltrack-plus') return invalid('Atomic request/activity commit is only available to FuelTrack+.');
      const valueString = stringOrNull(msg.value);
      if (valueString === null) return invalid('FuelTrack+ request state must be a string.');
      const expectedRevision = optionalRevision(msg, 'expectedRevision');
      if (expectedRevision === undefined) return invalid('Expected revision must be a non-negative integer.');
      const event = parseActivityEvent(msg.event);
      if (!event.ok) return invalid(event.reason);
      return { ok: true, value: Object.freeze({ ...base, action, value: valueString, expectedRevision: expectedRevision ?? 0, event: event.value }) };
    }
    default:
      return invalid('Unsupported module data operation.');
  }
}

export function parseModuleIdentityRequest(value: unknown): ModuleIdentityRequest | null {
  const msg = recordOf(value);
  if (!msg || msg.type !== 'wm:identity:request') return null;
  const moduleId = moduleIdOf(msg.moduleId);
  return moduleId ? Object.freeze({ type: 'wm:identity:request', moduleId }) : null;
}

function validationMessage(reason: string): string {
  return `Module data request is invalid: ${reason}`;
}

function operationDenied(message: string): WorkManagementError {
  return new WorkManagementError(message, {
    code: 'WM_MODULE_OPERATION_DENIED',
    category: 'authorization',
    operation: 'module-data.bridge',
  });
}

async function executeRequest(request: ModuleDataRequest, auth: CloudModuleDataBridgeOptions['auth']): Promise<unknown> {
  const token = await auth.ensureAccessToken();
  if (!token) {
    throw new WorkManagementError('Your authenticated session expired. Sign in again.', {
      code: 'WM_AUTH_REQUIRED',
      category: 'authentication',
      operation: 'module-data.bridge',
    });
  }

  const rpc = (name: string, body: UnknownRecord): Promise<unknown> => auth.request(rpcPath(name), {
    method: 'POST',
    headers: auth.headers(token),
    body: JSON.stringify(body),
  });

  switch (request.action) {
    case 'list':
      return rpc('list_module_state', { p_module_id: request.moduleId });
    case 'directory':
      return rpc('list_module_directory', { p_module_id: request.moduleId });
    case 'put':
      return rpc('put_module_state', {
        p_module_id: request.moduleId,
        p_state_key: request.key,
        p_value: request.value,
        p_scope: request.scope,
        p_expected_revision: request.expectedRevision,
      });
    case 'delete':
      return rpc('delete_module_state', {
        p_module_id: request.moduleId,
        p_state_key: request.key,
        p_scope: request.scope,
        p_expected_revision: request.expectedRevision,
      });
    case 'lock:acquire':
      return rpc('acquire_module_operation_lock', {
        p_module_id: request.moduleId,
        p_lock_key: request.lockKey,
        p_ttl_seconds: request.ttlSeconds,
      });
    case 'lock:release':
      return rpc('release_module_operation_lock', {
        p_module_id: request.moduleId,
        p_lock_key: request.lockKey,
        p_token: request.token,
      });
    case 'attendance:commit':
      if (request.moduleId !== 'time-tracker') throw operationDenied('Transactional attendance commit is only available to TimeTracker.');
      return rpc('commit_timetracker_attendance_action', {
        p_action: request.operation,
        p_record_id: request.recordId,
        p_location: request.location,
        p_department: request.department,
        p_geo: request.geo,
        p_work_note: request.workNote,
        p_attendance_policy: request.attendancePolicy,
      });
    case 'activity:list':
      if (request.moduleId !== 'fueltrack-plus') throw operationDenied('Activity stream is only available to FuelTrack+.');
      return rpc('list_module_activity', {
        p_module_id: request.moduleId,
        p_before_sequence: request.beforeSequence,
        p_limit: request.limit,
      });
    case 'activity:append':
      if (request.moduleId !== 'fueltrack-plus') throw operationDenied('Activity stream is only available to FuelTrack+.');
      return rpc('append_module_activity', {
        p_module_id: request.moduleId,
        p_event_id: request.event.id,
        p_event_type: request.event.type,
        p_title: request.event.title,
        p_message: request.event.message,
        p_request_id: request.event.requestId,
        p_payload: request.event.payload,
      });
    case 'commit:requests-activity':
      if (request.moduleId !== 'fueltrack-plus') throw operationDenied('Atomic request/activity commit is only available to FuelTrack+.');
      return rpc('commit_fueltrack_requests_with_activity', {
        p_value: request.value,
        p_expected_revision: request.expectedRevision,
        p_event_id: request.event.id,
        p_event_type: request.event.type,
        p_title: request.event.title,
        p_message: request.event.message,
        p_request_id: request.event.requestId,
        p_payload: request.event.payload,
      });
  }
}

/** Handles one untrusted module-data message after verifying origin, frame ownership, module identity and payload shape. */
export async function handleCloudModuleDataMessage(event: MessageLike, context: CloudModuleDataMessageContext): Promise<ModuleDataMessageOutcome> {
  if (event.origin !== context.origin) return 'ignored';
  const raw = recordOf(event.data);
  if (!raw || raw.type !== 'wm:data:request') return 'ignored';

  const requestId = nonEmptyString(raw.requestId);
  if (!requestId) return 'ignored';

  const frame = context.getFrame();
  const activeModuleId = context.getModuleId();
  const target = frame?.contentWindow ?? null;
  if (!target || event.source !== target || raw.moduleId !== activeModuleId) {
    context.respond(event.source === target ? target : null, {
      type: 'wm:data:response', requestId, ok: false, payload: null,
      error: 'Module data request was rejected by the workspace boundary.',
    });
    return 'rejected';
  }

  if (!context.auth.isAuthenticated || !context.auth.canAccessModule(activeModuleId)) {
    context.respond(target, {
      type: 'wm:data:response', requestId, ok: false, payload: null,
      error: 'Authenticated module access is required.',
    });
    return 'rejected';
  }

  const parsed = parseModuleDataRequest(raw);
  if (!parsed.ok) {
    context.respond(target, {
      type: 'wm:data:response', requestId, ok: false, payload: null,
      error: validationMessage(parsed.reason),
    });
    return 'rejected';
  }

  if (parsed.value.moduleId !== activeModuleId) {
    context.respond(target, {
      type: 'wm:data:response', requestId, ok: false, payload: null,
      error: 'Module data request was rejected by the workspace boundary.',
    });
    return 'rejected';
  }

  try {
    const payload = await executeRequest(parsed.value, context.auth);
    context.respond(target, { type: 'wm:data:response', requestId, ok: true, payload, error: null });
  } catch (error) {
    const normalized = normalizeAppError(error, {
      operation: 'module-data.bridge',
      fallbackMessage: 'Cloud persistence request failed.',
      metadata: { moduleId: parsed.value.moduleId, action: parsed.value.action, requestId },
    });
    context.respond(target, { type: 'wm:data:response', requestId, ok: false, payload: null, error: normalized.message });
  }
  return 'handled';
}

export function handleCloudModuleIdentityMessage(event: MessageLike, context: Omit<CloudModuleDataMessageContext, 'respond'>): ModuleDataMessageOutcome {
  if (event.origin !== context.origin) return 'ignored';
  const request = parseModuleIdentityRequest(event.data);
  if (!request) return 'ignored';
  const frame = context.getFrame();
  const activeModuleId = context.getModuleId();
  const target = frame?.contentWindow ?? null;
  if (!target || event.source !== target || request.moduleId !== activeModuleId) return 'rejected';
  if (!context.auth.isAuthenticated || !context.auth.canAccessModule(activeModuleId)) return 'rejected';
  const identity = context.auth.moduleIdentityContext(activeModuleId);
  if (!identity) return 'rejected';
  try {
    target.postMessage(identity, context.origin);
    return 'handled';
  } catch {
    return 'rejected';
  }
}

/** Typed, runtime-validated bridge between same-origin isolated modules and authenticated persistence. */
export function installCloudModuleDataBridge({ auth, getFrame, getModuleId }: CloudModuleDataBridgeOptions): CloudModuleDataBridge {
  const abort = new AbortController();
  const origin = location.origin;
  const respond = (target: WindowProxy | null, response: ModuleDataResponse): void => {
    try { target?.postMessage(response, origin); } catch { /* Detached frame. */ }
  };
  const context: CloudModuleDataMessageContext = { auth, getFrame, getModuleId, origin, respond };

  const onDataMessage = (event: MessageEvent<unknown>): void => {
    void handleCloudModuleDataMessage(event, context);
  };
  const onIdentityMessage = (event: MessageEvent<unknown>): void => {
    handleCloudModuleIdentityMessage(event, { auth, getFrame, getModuleId, origin });
  };

  window.addEventListener('message', onDataMessage, { signal: abort.signal });
  window.addEventListener('message', onIdentityMessage, { signal: abort.signal });

  return Object.freeze({ dispose: () => abort.abort() });
}
