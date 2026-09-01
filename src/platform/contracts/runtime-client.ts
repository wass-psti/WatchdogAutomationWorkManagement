export type RuntimeContextValue = string | number | boolean | null | undefined | readonly RuntimeContextValue[] | { readonly [key: string]: RuntimeContextValue };
export interface RuntimeContext { readonly [key: string]: RuntimeContextValue; }

export type RuntimeOperationKind = 'get' | 'set' | 'execute';
export type RuntimeServiceMethod = (params: unknown, context: RuntimeContext) => unknown | Promise<unknown>;
export interface RuntimeService { readonly [methodName: string]: unknown; }

export interface RuntimeEvent<TPayload = unknown> {
  readonly type: string;
  readonly payload: TPayload;
  readonly context: RuntimeContext;
  readonly timestamp: number;
}

export type RuntimeListener = (event: RuntimeEvent) => void;

export interface WorkManagementClientOptions {
  readonly services?: Readonly<{ readonly [serviceName: string]: RuntimeService }>;
  readonly context?: RuntimeContext;
}

export interface WorkManagementClient {
  listen(typeOrTypes: string | readonly string[], callback: RuntimeListener): () => void;
  emit<TPayload = unknown>(type: string, payload: TPayload): RuntimeEvent<TPayload>;
  register(name: string, service: RuntimeService): () => boolean;
  get(operation: string, params?: unknown): Promise<unknown>;
  set(operation: string, params?: unknown): Promise<unknown>;
  execute(operation: string, params?: unknown): Promise<unknown>;
  setContext(next: RuntimeContext): RuntimeContext;
  getContext(): RuntimeContext;
  hasService(name: string): boolean;
  services(): readonly string[];
  destroy(): void;
}
