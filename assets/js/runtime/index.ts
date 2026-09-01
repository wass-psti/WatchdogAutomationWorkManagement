/* Public dependency gateway for the Work Management shell. */
export { modules, moduleRegistry } from '../features/modules/index.ts';
export { auth, AUTH_EVENT, createAuthenticationFeature } from '../features/auth/index.ts';
export { createAccountFeature } from '../features/account/index.ts';
export { createUserManagementFeature } from '../features/user-management/index.ts';
export { createSettingsFeature } from '../features/settings/index.ts';
export { createHomeFeature } from '../features/home/index.ts';
export { createCommandPaletteFeature, createCommandRegistry } from '../features/commands/index.ts';
export { createBoardsFeature } from '../features/boards/index.ts';
export { parseRoute, navigate } from '../core/router.ts';
export {
  PLATFORM_VERSION,
  DEFAULT_PREFERENCES,
  applyTheme,
  applyDensity,
  getPreferences,
  savePreferences,
  safeModuleStatus,
  readTimeTrackerSnapshot,
  readFuelTrackSnapshot,
  readTradeLinkSnapshot,
  markRecent,
  toggleFavorite,
  getStorageHealth,
  requestPersistentStorage,
  runPlatformDiagnostics,
  verifyModuleCompatibility,
  registerServiceWorker,
} from '../core/platform.ts';
export { downloadWorkspaceBackup, parseBackupFile, restoreWorkspaceBackup } from '../core/backup.ts';
export { installCloudModuleDataBridge } from '../core/cloud-module-data.ts';
export { createWorkManagementClient } from './work-management-client.ts';
export { createModuleHost } from './module-host.ts';
export { createFeatureRegistry } from './feature-registry.ts';
export { createRouteController } from './route-controller.ts';
export { createRoutePolicyService } from './services/route-policy.ts';
export { installApplicationLifecycle } from './application-lifecycle.ts';
export { applicationManifest, validateApplicationManifest } from '../../../config/application-manifest.ts';
export { icons } from '../ui/icons.ts';
export { escapeHtml, formatBytes } from '../ui/format.ts';

export { createDiagnostics } from '../platform/observability/diagnostics.ts';
export { createRuntimeErrorBoundary } from './error-boundary.ts';
export { createQueryClient, queryKey } from '../platform/data/query-client.ts';
export { createBackendClient } from '../platform/data/backend-client.ts';
export { createOverlayManager } from '../platform/ui/overlay-manager.ts';
export { CAPABILITIES, hasPlatformCapability, hasBoardCapability, canAccessModuleByPolicy } from '../platform/auth/permissions.ts';
export { createPlatformServices } from './platform-services.ts';
