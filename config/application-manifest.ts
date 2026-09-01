import type {
  ApplicationManifest,
  FeatureDefinition,
  FeatureId,
  ManifestValidationResult,
  RouteDefinition,
} from '../src/types/manifest.ts';
import { modules } from './modules.ts';

const freezeList = <T extends object>(items: readonly T[]): readonly Readonly<T>[] =>
  Object.freeze(items.map((item) => Object.freeze({ ...item })));

const routes = freezeList<RouteDefinition>([
  { id: 'home', pattern: '#/', owner: 'home' },
  { id: 'boards', pattern: '#/boards', owner: 'boards' },
  { id: 'board', pattern: '#/boards/:boardId', owner: 'boards' },
  { id: 'settings', pattern: '#/settings', owner: 'settings' },
  { id: 'login', pattern: '#/login', owner: 'auth' },
  { id: 'register', pattern: '#/register', owner: 'auth' },
  { id: 'verify', pattern: '#/verify', owner: 'auth' },
  { id: 'account', pattern: '#/account', owner: 'account' },
  { id: 'users', pattern: '#/users', owner: 'user-management' },
  { id: 'app', pattern: '#/app/:moduleId', owner: 'module-host' },
]);

const features = freezeList<FeatureDefinition>([
  { id: 'shell', state: 'active', boundary: 'assets/js/app.ts', dependencies: ['runtime', 'platform-services', 'query-client', 'diagnostics', 'route-controller', 'route-policy', 'error-boundary', 'application-lifecycle', 'auth', 'platform', 'modules'] },
  { id: 'home', state: 'active', boundary: 'assets/js/features/home/index.ts', dependencies: ['platform', 'modules', 'auth'] },
  { id: 'commands', state: 'active', boundary: 'assets/js/features/commands/index.ts', dependencies: ['command-registry', 'modules', 'auth', 'backup'] },
  { id: 'auth', state: 'active', boundary: 'assets/js/features/auth/index.ts', dependencies: ['core/auth', 'route-controller'] },
  { id: 'account', state: 'active', boundary: 'assets/js/features/account/index.ts', dependencies: ['core/auth', 'modules'] },
  { id: 'boards', state: 'active', boundary: 'assets/js/features/boards/index.ts', dependencies: ['boards-controller', 'board-domain-service', 'board-schema', 'board-state', 'board-repository', 'board-contracts', 'column-type-registry', 'board-list-view', 'table-view', 'kanban-view', 'board-workspace-view', 'dialog-controller', 'column-workflows', 'group-workflows', 'item-workflows', 'member-workflows', 'activity-workflows', 'item-workspace-controller', 'item-panel-renderer', 'drag-drop-controller', 'history-controller', 'selection-controller', 'inline-edit-controller', 'column-resize-controller', 'structure-drag-controller', 'board-menu-controller', 'overlay-manager', 'permissions', 'item-workspace-view', 'core/boards', 'boards-ui'] },
  { id: 'modules', state: 'active', boundary: 'assets/js/features/modules/index.ts', dependencies: ['module-bootstrap', 'identity-bridge', 'module-cloud-store'] },
  { id: 'settings', state: 'active', boundary: 'assets/js/features/settings/index.ts', dependencies: ['platform', 'backup', 'auth', 'modules'] },
  { id: 'user-management', state: 'active', boundary: 'assets/js/features/user-management/index.ts', dependencies: ['auth', 'supabase'] },
  { id: 'module-host', state: 'active', boundary: 'assets/js/runtime/module-host.ts', dependencies: ['auth', 'modules'] },
]);

export const applicationManifest = Object.freeze({
  id: 'work-management',
  name: 'Work Management',
  version: '1.43.2',
  architectureVersion: 15,
  runtime: 'vite-esm',
  architecture: Object.freeze({
    style: 'modular-platform',
    compositionRoot: 'assets/js/runtime/platform-services.ts',
    serverState: 'assets/js/platform/data/query-client.ts',
    backendTransport: 'assets/js/platform/data/backend-client.ts',
    authorizationPolicy: 'assets/js/platform/auth/permissions.ts',
    overlayLifecycle: 'assets/js/platform/ui/overlay-manager.ts',
    errorBoundary: 'assets/js/runtime/error-boundary.ts',
    moduleIsolation: 'same-origin-iframe',
    buildPipeline: 'vite-8',
    sourceMaps: 'production-disabled-by-default',
    hardening: 'production-defense-in-depth',
    runtimeValidation: 'external-boundaries',
    packageManager: 'npm',
    typeSystem: 'typescript-incremental',
    typecheck: 'strict-boundaries',
    runtimeInfrastructure: 'typescript-authoritative',
    orchestration: 'typescript-composition-controllers-services',
    featureRuntime: 'typescript-nonvisual-core',
    uiRuntime: 'typescript-authoritative',
  }),
  persistence: Object.freeze({
    identity: 'supabase-auth',
    operationalData: 'supabase-postgres',
    moduleState: 'supabase-rpc',
    shellPreferences: 'browser-local-preferences',
    files: 'supabase-storage-private',
  }),
  routes,
  features,
  modules: Object.freeze(modules),
} as const satisfies ApplicationManifest);

function unique(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

export function validateApplicationManifest(manifest: ApplicationManifest = applicationManifest): ManifestValidationResult {
  const errors: string[] = [];
  if (manifest.id !== 'work-management') errors.push('Application id is invalid.');
  if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) errors.push('Application version must be semantic.');
  if (manifest.runtime !== 'vite-esm') errors.push('The application runtime must use Vite ESM.');
  if (manifest.architectureVersion >= 12 && manifest.architecture.runtimeInfrastructure !== 'typescript-authoritative') {
    errors.push('Architecture v12+ requires authoritative TypeScript runtime infrastructure.');
  }
  if (manifest.architectureVersion >= 13 && manifest.architecture.orchestration !== 'typescript-composition-controllers-services') {
    errors.push('Architecture v13+ requires typed composition/controller/domain-service orchestration.');
  }
  if (manifest.architectureVersion >= 14 && manifest.architecture.featureRuntime !== 'typescript-nonvisual-core') {
    errors.push('Architecture v14+ requires the authoritative non-visual TypeScript feature runtime.');
  }
  if (manifest.architectureVersion >= 15 && manifest.architecture.uiRuntime !== 'typescript-authoritative') {
    errors.push('Architecture v15 requires the authoritative TypeScript UI/rendering runtime.');
  }

  if (!unique(manifest.routes.map((route) => route.id))) errors.push('Route identifiers must be unique.');
  if (!unique(manifest.features.map((feature) => feature.id))) errors.push('Feature identifiers must be unique.');
  if (!unique(manifest.modules.map((module) => module.id))) errors.push('Module identifiers must be unique.');

  const featureIds = new Set<FeatureId>(manifest.features.map((feature) => feature.id));
  for (const route of manifest.routes) {
    if (!route.id || !route.pattern || !route.owner) errors.push('A route entry is incomplete.');
    if (!featureIds.has(route.owner)) errors.push(`Route owner is not a declared feature: ${route.owner}`);
  }
  for (const feature of manifest.features) {
    if (!feature.id || !feature.boundary) errors.push('A feature entry is incomplete.');
  }
  for (const module of manifest.modules) {
    if (!module.id || !module.name || !module.route) errors.push('A module entry is incomplete.');
  }

  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}
