import type { FeatureId } from '../../types/manifest.ts';
export type RouteName = 'home'|'settings'|'account'|'users'|'boards'|'board'|'login'|'register'|'verify'|'app'|'disabled'|'not-found';
export interface ApplicationRoute { readonly name: RouteName; readonly moduleId?: string; readonly boardId?: string; }
export type AuthRuntimeStatus = 'initializing'|'restoring'|'setup-required'|'anonymous'|'authenticated'|'disabled'|'expired'|'invalid'|'terminated';
export interface RouteAccessContext { readonly route: ApplicationRoute; readonly initialized: boolean; readonly status: AuthRuntimeStatus; readonly authenticated: boolean; }
export type RouteAccessDecision = Readonly<{kind:'wait'}>|Readonly<{kind:'render-disabled'}>|Readonly<{kind:'redirect';target:'login'|'';rememberReturnRoute:boolean}>|Readonly<{kind:'allow'}>;
export interface RoutePolicyService { decide(context: RouteAccessContext): RouteAccessDecision; }
export interface FeatureLifecycleImplementation { activate?(context: Readonly<{from:ApplicationRoute|null;to:ApplicationRoute}>): void; deactivate?(context: Readonly<{from:ApplicationRoute|null;to:ApplicationRoute|null}>): void; }
export interface FeatureRegistryPort { ownerForRoute(routeName: string): FeatureId|null; get(featureId: FeatureId|string): Readonly<{implementation?: FeatureLifecycleImplementation}>|null; }
export interface RuntimeClientPort { setContext(context: Readonly<Record<string, unknown>>): unknown; }
export interface ModuleHostPort { detach(): unknown; }
export interface RouteErrorBoundaryPort { run(context: Readonly<Record<string, unknown>>, callback: () => unknown): unknown; }
