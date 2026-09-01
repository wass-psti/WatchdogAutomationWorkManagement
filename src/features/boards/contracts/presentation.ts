import type { BoardCommandService } from './commands.ts';
import type { BoardDomainService } from './service.ts';
import type { MutableBoardViewState } from './view-state.ts';
import type { BoardHistoryController } from '../../../../assets/js/features/boards/controllers/history-controller.ts';
import type { BoardPreferencePatchService } from './preference-patches.ts';
import type { DateFormatter, EscapeHtml, ToastRenderer } from '../../../platform/contracts/ui.ts';

export interface BoardDialogHandle {
  readonly wrap: HTMLElement;
  readonly close: () => void;
}

export interface BoardDialogOptions {
  readonly title: string;
  readonly body: string;
  readonly submitLabel?: string;
  readonly danger?: boolean;
  readonly onSubmit: (data: FormData) => void | Promise<void>;
}

export type BoardDialog = (options: BoardDialogOptions) => BoardDialogHandle;
export type ReloadBoard = () => void | Promise<unknown>;
export type ConfirmAction = (message: string) => boolean;

export interface BoardWorkflowBaseDependencies {
  readonly commands: BoardCommandService;
  readonly state: MutableBoardViewState;
  readonly dialog: BoardDialog;
  readonly toast: ToastRenderer;
  readonly escapeHtml: EscapeHtml;
  readonly reloadBoard: ReloadBoard;
  readonly confirmAction?: ConfirmAction;
}

export interface BoardActivityWorkflowDependencies {
  readonly api: BoardDomainService;
  readonly state: MutableBoardViewState;
  readonly dialog: BoardDialog;
  readonly toast: ToastRenderer;
  readonly escapeHtml: EscapeHtml;
  readonly formatDate: DateFormatter;
}

export interface ColumnResizeDependencies {
  readonly state: MutableBoardViewState;
  readonly preferencePatches: BoardPreferencePatchService;
  readonly persistPreferences: () => void | Promise<unknown>;
  readonly history?: BoardHistoryController | null;
  readonly renderBoardData: () => void;
}
