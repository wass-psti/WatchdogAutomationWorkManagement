import type { ApplicationManifest, ManifestValidationResult } from '../../types/manifest.ts';
import type { Capability, PlatformRole } from '../../types/auth.ts';
import type { ErrorNormalizationContext } from '../../types/errors.ts';
import type { AuthTransportPort, BackendClient } from './transport.ts';
import type { DiagnosticsService } from './diagnostics.ts';
import type { QueryClient } from './query.ts';
import type { BoardRepository } from '../../features/boards/contracts/repository.ts';
import type { BoardDomainService } from '../../features/boards/contracts/service.ts';
import type { BoardCommandService } from '../../features/boards/contracts/commands.ts';
import type { RoutePolicyService } from './routing.ts';
import type { WorkManagementError } from '../../../assets/js/platform/errors/app-error.ts';
export interface PlatformServices {
  readonly auth: AuthTransportPort;
  readonly diagnostics: DiagnosticsService;
  readonly serverState: QueryClient;
  readonly backend: BackendClient;
  readonly boards: Readonly<{ readonly repository: BoardRepository; readonly service: BoardDomainService; readonly commands: BoardCommandService }>;
  readonly routing: RoutePolicyService;
  readonly manifest: Readonly<{ readonly value: ApplicationManifest; validate(): ManifestValidationResult }>;
  readonly authorization: Readonly<{ hasPlatformCapability(role: PlatformRole|string|null|undefined, capability: Capability): boolean }>;
  readonly errors: Readonly<{ normalize(error: unknown, context?: ErrorNormalizationContext): WorkManagementError }>;
}
export interface PlatformServiceOptions { readonly auth: AuthTransportPort; readonly diagnosticLimit?: number; readonly queryStaleTime?: number; }
