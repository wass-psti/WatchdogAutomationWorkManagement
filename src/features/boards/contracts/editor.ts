import type { BoardColumnType, BoardValueByColumnType } from './domain.ts';
import type { StatusLabelId, UserId } from '../../../types/identifiers.ts';

export interface TimelineEditorDraft {
  readonly start: string;
  readonly end: string;
}

export interface BoardEditorDraftByColumnType {
  readonly text: string;
  readonly long_text: string;
  readonly number: string;
  readonly status: StatusLabelId | null;
  readonly dropdown: string | null;
  readonly date: string;
  readonly people: UserId | null;
  readonly checkbox: boolean | null;
  readonly timeline: TimelineEditorDraft;
  readonly email: string;
  readonly url: string;
}

export type BoardEditorDraft<TType extends BoardColumnType> = BoardEditorDraftByColumnType[TType];
export type BoardEditorSurface = 'inline-input' | 'popover' | 'toggle';
export type BoardEditorFocusTarget = 'input' | 'first-option' | 'none';

export interface BoardEditorInteractionPolicy {
  readonly surface: BoardEditorSurface;
  readonly explicitSave: boolean;
  readonly explicitCancel: boolean;
  readonly saveOnEnter: boolean;
  readonly cancelOnEscape: true;
  readonly commitOnBlur: false;
  readonly focusTarget: BoardEditorFocusTarget;
  readonly clearable: boolean;
}

/**
 * Typed presentation contract for one Board column editor.
 * Runtime values and editable drafts remain distinct so draft text never leaks
 * into authoritative Board state before validation and persistence succeed.
 */
export interface BoardCellEditorContract<TType extends BoardColumnType> {
  readonly type: TType;
  readonly policy: BoardEditorInteractionPolicy;
  draftFromValue(value: BoardValueByColumnType[TType]): BoardEditorDraft<TType>;
  normalizeDraft(draft: BoardEditorDraft<TType>): BoardValueByColumnType[TType];
}

export type CompleteBoardEditorRegistry = Readonly<{
  [TType in BoardColumnType]: BoardCellEditorContract<TType>;
}>;
