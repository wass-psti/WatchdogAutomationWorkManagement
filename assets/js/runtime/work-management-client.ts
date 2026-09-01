import type {
  RuntimeContext,
  RuntimeEvent,
  RuntimeListener,
  RuntimeOperationKind,
  RuntimeService,
  RuntimeServiceMethod,
  WorkManagementClient,
  WorkManagementClientOptions,
} from '../../../src/platform/contracts/runtime-client.ts';

const asList = (value: string | readonly string[]): readonly string[] => Array.isArray(value) ? value : [value as string];

/** Typed dynamic service client used by the Work Management shell integration boundary. */
export function createWorkManagementClient({ services = {}, context = {} }: WorkManagementClientOptions = {}): WorkManagementClient {
  const listeners = new Map<string, Set<RuntimeListener>>();
  const serviceMap = new Map<string, RuntimeService>(Object.entries(services));
  let runtimeContext: RuntimeContext = Object.freeze({ ...context });
  let destroyed = false;

  const assertActive = (): void => {
    if (destroyed) throw new Error('Work Management runtime client has been destroyed.');
  };

  const addListener = (type: string, callback: RuntimeListener): (() => void) => {
    assertActive();
    if (typeof callback !== 'function') throw new TypeError('Runtime listener must be a function.');
    const key = String(type ?? '').trim();
    if (!key) throw new TypeError('Runtime listener type is required.');
    let bucket = listeners.get(key);
    if (!bucket) {
      bucket = new Set<RuntimeListener>();
      listeners.set(key, bucket);
    }
    bucket.add(callback);
    return () => {
      const current = listeners.get(key);
      current?.delete(callback);
      if (current?.size === 0) listeners.delete(key);
    };
  };

  const listen: WorkManagementClient['listen'] = (typeOrTypes, callback) => {
    const removers = asList(typeOrTypes).map((type) => addListener(type, callback));
    return () => removers.forEach((remove) => { remove(); });
  };

  const emit: WorkManagementClient['emit'] = <TPayload>(type: string, payload: TPayload): RuntimeEvent<TPayload> => {
    assertActive();
    const event = Object.freeze({ type: String(type), payload, context: runtimeContext, timestamp: Date.now() });
    for (const listener of [...(listeners.get(event.type) ?? [])]) {
      try { listener(event as RuntimeEvent); }
      catch (error) { console.error('[Work Management] Runtime listener failed', event.type, error); }
    }
    for (const listener of [...(listeners.get('*') ?? [])]) {
      try { listener(event as RuntimeEvent); }
      catch (error) { console.error('[Work Management] Runtime wildcard listener failed', event.type, error); }
    }
    return event;
  };

  const register = (name: string, service: RuntimeService): (() => boolean) => {
    assertActive();
    const key = String(name ?? '').trim();
    if (!key) throw new TypeError('Service name is required.');
    if (!service || typeof service !== 'object') throw new TypeError(`Service ${key} must be an object.`);
    serviceMap.set(key, service);
    emit('runtime:service-registered', { name: key });
    return () => serviceMap.delete(key);
  };

  const resolve = (operation: string): Readonly<{ service: RuntimeService; method: RuntimeServiceMethod }> => {
    const [serviceName, methodName] = String(operation ?? '').split('.', 2);
    if (!serviceName || !methodName) throw new Error(`Invalid runtime operation: ${operation}`);
    const service = serviceMap.get(serviceName);
    if (!service) throw new Error(`Runtime service is not registered: ${serviceName}`);
    const candidate = service[methodName];
    if (typeof candidate !== 'function') throw new Error(`Runtime operation is unavailable: ${operation}`);
    return Object.freeze({ service, method: candidate as RuntimeServiceMethod });
  };

  const invoke = async (kind: RuntimeOperationKind, operation: string, params: unknown): Promise<unknown> => {
    assertActive();
    const { service, method } = resolve(operation);
    emit('runtime:request', { kind, operation });
    try {
      const result = await method.call(service, params, runtimeContext);
      emit('runtime:response', { kind, operation, ok: true });
      return result;
    } catch (error) {
      emit('runtime:response', { kind, operation, ok: false, error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  };

  return Object.freeze({
    listen,
    emit,
    register,
    get(operation: string, params?: unknown) { return invoke('get', operation, params); },
    set(operation: string, params?: unknown) { return invoke('set', operation, params); },
    execute(operation: string, params?: unknown) { return invoke('execute', operation, params); },
    setContext(next: RuntimeContext) {
      assertActive();
      runtimeContext = Object.freeze({ ...runtimeContext, ...next });
      emit('runtime:context-changed', runtimeContext);
      return runtimeContext;
    },
    getContext() { return runtimeContext; },
    hasService(name: string) { return serviceMap.has(String(name)); },
    services() { return Object.freeze([...serviceMap.keys()]); },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      listeners.clear();
      serviceMap.clear();
    },
  });
}
