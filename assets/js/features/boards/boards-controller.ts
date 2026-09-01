import type { DiagnosticsPort } from '../../../../src/platform/contracts/diagnostics.ts';
import type { IconSet, UiAuthPort } from '../../../../src/platform/contracts/ui.ts';
import type { QueryClient } from '../../../../src/platform/contracts/query.ts';
import type { AuthTransportPort } from '../../../../src/platform/contracts/transport.ts';
import type { BoardCommandService } from '../../../../src/features/boards/contracts/commands.ts';
import type { BoardDomainService } from '../../../../src/features/boards/contracts/service.ts';

export type BoardFeatureAuthPort = AuthTransportPort & UiAuthPort;

export interface BoardFeatureViewOptions {
  readonly auth: BoardFeatureAuthPort;
  readonly renderWorkspace: (content: string, routeKey?: string, motionMode?: string) => unknown;
  readonly topbar: (title: string, subtitle?: string) => string;
  readonly toast: (message: string, tone?: string) => unknown;
  readonly navigate: (path: string) => unknown;
  readonly icons: IconSet;
  readonly diagnostics?: DiagnosticsPort | null;
  readonly queryClient?: QueryClient | null;
  readonly service?: BoardDomainService | null;
  readonly commands?: BoardCommandService | null;
}

export interface BoardFeatureView {
  renderBoards(): unknown;
  renderBoard(boardId: string): unknown;
  activate?(context: unknown): void;
  deactivate?(context: unknown): void;
}

export interface BoardController extends BoardFeatureView {
  readonly service: BoardDomainService;
  readonly commands: BoardCommandService;
}

export interface BoardControllerDependencies {
  readonly auth: BoardFeatureAuthPort;
  readonly createView: (options: BoardFeatureViewOptions & Readonly<{ service: BoardDomainService; commands: BoardCommandService }>) => BoardFeatureView;
  readonly viewOptions: BoardFeatureViewOptions;
  readonly createService: (auth: BoardFeatureAuthPort) => BoardDomainService;
  readonly createCommands: (service: BoardDomainService) => BoardCommandService;
}

export function createBoardsController({
  auth,
  createView,
  viewOptions,
  createService,
  createCommands,
}: BoardControllerDependencies): BoardController {
  const service = createService(auth);
  const commands = createCommands(service);
  const view = createView({ ...viewOptions, service, commands });
  return Object.freeze({
    ...view,
    service,
    commands,
    activate(context: unknown) { view.activate?.(context); },
    deactivate(context: unknown) { view.deactivate?.(context); },
  } satisfies BoardController);
}
