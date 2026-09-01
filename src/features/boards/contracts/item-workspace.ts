import type { BoardDomainService } from './service.ts';
import type { ItemWorkspaceTab, MutableBoardViewState } from './view-state.ts';
import type { BoardItemId } from '../../../types/identifiers.ts';

export interface ItemWorkspaceRuntimeDependencies {
  readonly state: MutableBoardViewState;
  readonly service: BoardDomainService;
  readonly onChange?: (() => void) | null;
}

export interface ItemWorkspaceRuntime {
  readonly currentItemId: BoardItemId | null;
  open(itemId: BoardItemId | string): void;
  close(): void;
  reset(): void;
  cancelPending(): void;
  setTab(tab: unknown): tab is ItemWorkspaceTab;
  load(itemId?: BoardItemId | string | null, options?: Readonly<{ quiet?: boolean }>): Promise<boolean>;
  postUpdate(body: unknown): Promise<boolean>;
  uploadFiles(files: readonly File[]): Promise<number | null>;
  deleteUpdate(updateId: string | number): Promise<boolean>;
  openFile(fileId: string): Promise<boolean>;
  deleteFile(fileId: string): Promise<boolean>;
}
