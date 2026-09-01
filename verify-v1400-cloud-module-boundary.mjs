import assert from 'node:assert/strict';
import {
  handleCloudModuleDataMessage,
  handleCloudModuleIdentityMessage,
  installCloudModuleDataBridge,
  parseModuleDataRequest,
} from './assets/js/core/cloud-module-data.ts';

const ORIGIN = 'https://workspace.example';
const target = { posted: [], postMessage(payload, origin) { this.posted.push({ payload, origin }); } };
const wrongTarget = { posted: [], postMessage(payload, origin) { this.posted.push({ payload, origin }); } };

function createAuth(overrides = {}) {
  const calls = [];
  const auth = {
    isAuthenticated: true,
    canAccessModule: () => true,
    ensureAccessToken: async () => 'token-1',
    headers: (token) => ({ Authorization: `Bearer ${token}` }),
    request: async (path, init = {}) => {
      calls.push({ path, init, body: init.body ? JSON.parse(String(init.body)) : null });
      return { ok: true, path };
    },
    moduleIdentityContext: (moduleId) => ({ type: 'wm:identity-context', moduleId, user: { id: 'user-1' } }),
    ...overrides,
  };
  return { auth, calls };
}

function createContext({ moduleId = 'fueltrack-plus', authOverrides = {} } = {}) {
  const responses = [];
  const { auth, calls } = createAuth(authOverrides);
  return {
    context: {
      auth,
      getFrame: () => ({ contentWindow: target }),
      getModuleId: () => moduleId,
      origin: ORIGIN,
      respond: (responseTarget, response) => responses.push({ target: responseTarget, response }),
    },
    auth,
    calls,
    responses,
  };
}

const request = (action, detail = {}, moduleId = 'fueltrack-plus', requestId = 'req-1') => ({
  type: 'wm:data:request', requestId, moduleId, action, ...detail,
});
const event = (data, { origin = ORIGIN, source = target } = {}) => ({ data, origin, source });
const activityEvent = (overrides = {}) => ({
  id: 'activity-1234', type: 'system', title: 'Changed request', message: '', requestId: 'fuel-1', payload: {}, ...overrides,
});

// Parser: valid revisions/defaults and malformed revision rejection.
{
  const parsed = parseModuleDataRequest(request('put', { key: 'fueltrackplus.requests.v3', value: '[]', scope: 'shared', expectedRevision: 0 }));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.ok && parsed.value.action === 'put' ? parsed.value.expectedRevision : null, 0);
  assert.equal(parseModuleDataRequest(request('put', { key: 'k', value: 'v', expectedRevision: -1 })).ok, false);
  assert.equal(parseModuleDataRequest(request('put', { key: 'k', value: 'v', expectedRevision: 1.5 })).ok, false);
  assert.equal(parseModuleDataRequest(request('put', { value: 'v' })).ok, false);
  assert.equal(parseModuleDataRequest(request('unknown-op')).ok, false);
  assert.equal(parseModuleDataRequest({ type: 'wm:data:request', moduleId: 'fueltrack-plus', action: 'list' }).ok, false);
  console.log('PASS module-data parser validates identifiers, operations and revision shapes');
}

// Allowed/rejected origin and frame/source relationship.
{
  const { context, calls, responses } = createContext();
  assert.equal(await handleCloudModuleDataMessage(event(request('list'), { origin: 'https://evil.example' }), context), 'ignored');
  assert.equal(calls.length, 0);
  assert.equal(responses.length, 0);
  assert.equal(await handleCloudModuleDataMessage(event(request('list'), { source: wrongTarget }), context), 'rejected');
  assert.equal(calls.length, 0);
  assert.match(responses.at(-1).response.error, /workspace boundary/i);
  assert.equal(responses.at(-1).target, null);
  console.log('PASS module-data boundary rejects foreign origins and incorrect frame sources');
}

// Correct frame but wrong module and unauthorized access.
{
  const wrongModule = createContext({ moduleId: 'time-tracker' });
  assert.equal(await handleCloudModuleDataMessage(event(request('list')), wrongModule.context), 'rejected');
  assert.match(wrongModule.responses.at(-1).response.error, /workspace boundary/i);

  const unauthorized = createContext({ authOverrides: { canAccessModule: () => false } });
  assert.equal(await handleCloudModuleDataMessage(event(request('list')), unauthorized.context), 'rejected');
  assert.match(unauthorized.responses.at(-1).response.error, /authenticated module access/i);
  assert.equal(unauthorized.calls.length, 0);
  console.log('PASS module identity and authorization are enforced before dispatch');
}

// Malformed envelopes/payloads and module-specific operation rules.
{
  const cases = [
    request('put', { key: '', value: 'x' }),
    request('delete', { key: 'x', expectedRevision: '1' }),
    request('lock:release', { lockKey: 'abc' }),
    request('activity:append', { event: { id: 'short', title: 'x' } }),
    request('activity:append', { event: activityEvent({ type: 'invalid' }) }),
    request('activity:append', { event: activityEvent({ payload: [] }) }),
    request('activity:list', { limit: 0 }),
  ];
  for (const data of cases) {
    const fixture = createContext();
    assert.equal(await handleCloudModuleDataMessage(event(data), fixture.context), 'rejected');
    assert.match(fixture.responses.at(-1).response.error, /request is invalid/i);
    assert.equal(fixture.calls.length, 0);
  }

  const wrongAttendance = createContext({ moduleId: 'fueltrack-plus' });
  const attendance = request('attendance:commit', { operation: 'clock-in' }, 'fueltrack-plus');
  assert.equal(await handleCloudModuleDataMessage(event(attendance), wrongAttendance.context), 'rejected');
  assert.match(wrongAttendance.responses.at(-1).response.error, /only available to TimeTracker/i);
  console.log('PASS malformed payloads and wrong-module operations are rejected before backend execution');
}

// Successful request/result propagation and correlation id preservation.
{
  const fixture = createContext();
  const data = request('put', { key: 'fueltrackplus.requests.v3', value: '[]', scope: 'shared', expectedRevision: 4 }, 'fueltrack-plus', 'correlation-77');
  assert.equal(await handleCloudModuleDataMessage(event(data), fixture.context), 'handled');
  assert.equal(fixture.calls.length, 1);
  assert.equal(fixture.calls[0].path, '/rest/v1/rpc/put_module_state');
  assert.deepEqual(fixture.calls[0].body, {
    p_module_id: 'fueltrack-plus', p_state_key: 'fueltrackplus.requests.v3', p_value: '[]', p_scope: 'shared', p_expected_revision: 4,
  });
  assert.equal(fixture.responses[0].response.requestId, 'correlation-77');
  assert.equal(fixture.responses[0].response.ok, true);
  assert.deepEqual(fixture.responses[0].response.payload, { ok: true, path: '/rest/v1/rpc/put_module_state' });
  console.log('PASS successful module-data requests preserve validated payloads and request correlation');
}

// Revision advancement, stale/out-of-order conflict propagation, and duplicate/idempotent backend result passthrough.
{
  const success = createContext({ authOverrides: {
    request: async (path, init) => ({ revision: JSON.parse(String(init.body)).p_expected_revision + 1, path }),
  } });
  await handleCloudModuleDataMessage(event(request('put', { key: 'fueltrackplus.requests.v3', value: '[]', expectedRevision: 7 })), success.context);
  assert.equal(success.responses[0].response.payload.revision, 8);

  const stale = createContext({ authOverrides: {
    request: async () => { throw { code: '40001', message: 'WM_STATE_CONFLICT expected 3, current 5' }; },
  } });
  await handleCloudModuleDataMessage(event(request('put', { key: 'fueltrackplus.requests.v3', value: '[]', expectedRevision: 3 })), stale.context);
  assert.equal(stale.responses[0].response.ok, false);
  assert.match(stale.responses[0].response.error, /WM_STATE_CONFLICT/i);

  const duplicate = createContext({ authOverrides: {
    request: async () => ({ revision: 9, idempotent: true, activity: { id: 'activity-1234' } }),
  } });
  await handleCloudModuleDataMessage(event(request('commit:requests-activity', {
    value: '[]', expectedRevision: 9, event: activityEvent(),
  })), duplicate.context);
  assert.equal(duplicate.responses[0].response.ok, true);
  assert.equal(duplicate.responses[0].response.payload.idempotent, true);
  console.log('PASS revision success, stale conflict, out-of-order failure and idempotent duplicate results remain observable');
}

// Activity/module-specific RPC mapping.
{
  const append = createContext();
  await handleCloudModuleDataMessage(event(request('activity:append', { event: activityEvent() })), append.context);
  assert.equal(append.calls[0].path, '/rest/v1/rpc/append_module_activity');
  assert.equal(append.calls[0].body.p_event_id, 'activity-1234');

  const attendance = createContext({ moduleId: 'time-tracker' });
  await handleCloudModuleDataMessage(event(request('attendance:commit', {
    operation: 'clock-out', recordId: 'record-1', location: 'Office', department: 'IT', geo: {}, attendancePolicy: {}, workNote: null,
  }, 'time-tracker')), attendance.context);
  assert.equal(attendance.calls[0].path, '/rest/v1/rpc/commit_timetracker_attendance_action');
  assert.equal(attendance.calls[0].body.p_action, 'clock-out');
  console.log('PASS module-specific operations map only to their authorized RPC contracts');
}

// Authentication/session and unexpected backend failure normalization.
{
  const expired = createContext({ authOverrides: { ensureAccessToken: async () => null } });
  await handleCloudModuleDataMessage(event(request('list')), expired.context);
  assert.equal(expired.responses[0].response.ok, false);
  assert.match(expired.responses[0].response.error, /session expired/i);

  const unexpected = createContext({ authOverrides: { request: async () => { throw 'socket vanished'; } } });
  await handleCloudModuleDataMessage(event(request('list')), unexpected.context);
  assert.equal(unexpected.responses[0].response.ok, false);
  assert.equal(unexpected.responses[0].response.error, 'socket vanished');
  console.log('PASS authentication and unexpected execution failures propagate through normalized responses');
}

// Identity request source/module/auth checks.
{
  const fixture = createContext();
  target.posted.length = 0;
  assert.equal(handleCloudModuleIdentityMessage(event({ type: 'wm:identity:request', moduleId: 'fueltrack-plus' }), {
    auth: fixture.auth, getFrame: fixture.context.getFrame, getModuleId: fixture.context.getModuleId, origin: ORIGIN,
  }), 'handled');
  assert.equal(target.posted.length, 1);
  assert.equal(target.posted[0].origin, ORIGIN);
  assert.equal(target.posted[0].payload.moduleId, 'fueltrack-plus');
  assert.equal(handleCloudModuleIdentityMessage(event({ type: 'wm:identity:request', moduleId: 'tradelink' }), {
    auth: fixture.auth, getFrame: fixture.context.getFrame, getModuleId: fixture.context.getModuleId, origin: ORIGIN,
  }), 'rejected');
  console.log('PASS identity requests preserve frame/module isolation');
}

// Listener cleanup is observable through AbortSignal without needing a browser DOM.
{
  const priorWindow = globalThis.window;
  const priorLocation = globalThis.location;
  const listeners = [];
  globalThis.window = {
    addEventListener(type, callback, options) { listeners.push({ type, callback, signal: options?.signal }); },
  };
  globalThis.location = { origin: ORIGIN };
  try {
    const fixture = createContext();
    const bridge = installCloudModuleDataBridge({ auth: fixture.auth, getFrame: fixture.context.getFrame, getModuleId: fixture.context.getModuleId });
    assert.equal(listeners.length, 2);
    assert.equal(listeners.every((entry) => entry.type === 'message' && entry.signal?.aborted === false), true);
    bridge.dispose();
    assert.equal(listeners.every((entry) => entry.signal?.aborted === true), true);
  } finally {
    if (priorWindow === undefined) delete globalThis.window; else globalThis.window = priorWindow;
    if (priorLocation === undefined) delete globalThis.location; else globalThis.location = priorLocation;
  }
  console.log('PASS module-data bridge dispose aborts installed message listeners');
}

console.log('v1.43.2 cloud module message-boundary verification: PASS');
