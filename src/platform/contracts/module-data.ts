import type { ModuleId } from '../../types/identifiers.ts';

export type ModuleStateScope = 'shared' | 'user';
export type ModuleDataAction =
  | 'list'
  | 'directory'
  | 'put'
  | 'delete'
  | 'lock:acquire'
  | 'lock:release'
  | 'attendance:commit'
  | 'activity:list'
  | 'activity:append'
  | 'commit:requests-activity';

export type ModuleActivityEventType = 'submit' | 'review' | 'issue' | 'system';

export interface ModuleActivityEventInput {
  readonly id: string;
  readonly type: ModuleActivityEventType;
  readonly title: string;
  readonly message: string;
  readonly requestId: string | null;
  readonly payload: Readonly<Record<string, unknown>>;
}

interface ModuleDataRequestBase<TAction extends ModuleDataAction> {
  readonly type: 'wm:data:request';
  readonly requestId: string;
  readonly moduleId: ModuleId;
  readonly action: TAction;
}

export type ModuleDataRequest =
  | ModuleDataRequestBase<'list'>
  | ModuleDataRequestBase<'directory'>
  | (ModuleDataRequestBase<'put'> & {
      readonly key: string;
      readonly value: string;
      readonly scope: ModuleStateScope;
      readonly expectedRevision: number | null;
    })
  | (ModuleDataRequestBase<'delete'> & {
      readonly key: string;
      readonly scope: ModuleStateScope;
      readonly expectedRevision: number | null;
    })
  | (ModuleDataRequestBase<'lock:acquire'> & {
      readonly lockKey: string;
      readonly ttlSeconds: number;
    })
  | (ModuleDataRequestBase<'lock:release'> & {
      readonly lockKey: string;
      readonly token: string;
    })
  | (ModuleDataRequestBase<'attendance:commit'> & {
      readonly operation: 'clock-in' | 'clock-out';
      readonly recordId: string | null;
      readonly location: string;
      readonly department: string;
      readonly geo: Readonly<Record<string, unknown>>;
      readonly workNote: string | null;
      readonly attendancePolicy: Readonly<Record<string, unknown>>;
    })
  | (ModuleDataRequestBase<'activity:list'> & {
      readonly beforeSequence: number | null;
      readonly limit: number;
    })
  | (ModuleDataRequestBase<'activity:append'> & {
      readonly event: ModuleActivityEventInput;
    })
  | (ModuleDataRequestBase<'commit:requests-activity'> & {
      readonly value: string;
      readonly expectedRevision: number;
      readonly event: ModuleActivityEventInput;
    });

export interface ModuleIdentityRequest {
  readonly type: 'wm:identity:request';
  readonly moduleId: ModuleId;
}

export interface ModuleDataResponse {
  readonly type: 'wm:data:response';
  readonly requestId: string;
  readonly ok: boolean;
  readonly payload: unknown;
  readonly error: string | null;
}

export interface ModuleDataBridgeAuthPort {
  readonly isAuthenticated: boolean;
  canAccessModule(moduleId: string | null): boolean;
  ensureAccessToken(): Promise<string | null>;
  headers(token: string): Readonly<Record<string, string>>;
  request(path: string, init?: RequestInit): Promise<unknown>;
  moduleIdentityContext(moduleId: string | null): unknown;
}

export interface CloudModuleDataBridgeOptions {
  readonly auth: ModuleDataBridgeAuthPort;
  readonly getFrame: () => HTMLIFrameElement | null;
  readonly getModuleId: () => string | null;
}

export interface CloudModuleDataBridge {
  dispose(): void;
}
