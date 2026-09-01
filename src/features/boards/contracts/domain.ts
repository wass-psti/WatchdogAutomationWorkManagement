import type {
  BoardColumnId,
  BoardGroupId,
  BoardId,
  BoardItemId,
  ISODate,
  ISODateTime,
  StatusLabelId,
  UserId,
} from '../../../types/identifiers.ts';
import type { BoardRole } from '../../../types/auth.ts';

export type BoardLifecycleStatus = 'active' | 'archived' | 'trashed';
export type BoardViewMode = 'table' | 'kanban';

export type BoardColumnType =
  | 'text'
  | 'long_text'
  | 'number'
  | 'status'
  | 'dropdown'
  | 'date'
  | 'people'
  | 'checkbox'
  | 'timeline'
  | 'email'
  | 'url';

export interface BoardRecord {
  readonly id: BoardId;
  readonly name: string;
  readonly description: string;
  readonly status: BoardLifecycleStatus;
  readonly view?: BoardViewMode;
  readonly view_mode?: BoardViewMode;
  readonly member_role?: BoardRole;
  readonly owner_id?: UserId | null;
  readonly created_at?: ISODateTime;
  readonly updated_at?: ISODateTime;
  readonly item_count?: number;
  readonly [key: string]: unknown;
}

export interface BoardGroup {
  readonly id: BoardGroupId;
  readonly board_id: BoardId;
  readonly title: string;
  readonly position: number;
  readonly accent_color?: string | null;
  readonly [key: string]: unknown;
}

export interface BoardItem {
  readonly id: BoardItemId;
  readonly board_id: BoardId;
  readonly group_id: BoardGroupId;
  readonly title: string;
  readonly position: number;
  readonly status: StatusLabelId | null;
  readonly assignee_id?: UserId | null;
  readonly due_date?: ISODate | null;
  readonly notes?: string;
  readonly archived?: boolean;
  readonly archived_at?: ISODateTime | null;
  readonly [key: string]: unknown;
}

export interface StatusLabel {
  readonly id: StatusLabelId;
  readonly name: string;
  readonly color: string;
  readonly active: boolean;
  readonly description: string;
  readonly position: number;
}

export interface StatusColumnConfig {
  readonly labels: readonly StatusLabel[];
  readonly default_label_id: StatusLabelId | null;
}

export interface DropdownColumnConfig {
  readonly options?: readonly string[];
}

export interface EmptyColumnConfig {
  readonly [key: string]: unknown;
}

interface BoardColumnBase<TType extends BoardColumnType, TConfig extends object> {
  readonly id: BoardColumnId;
  readonly board_id: BoardId;
  readonly name: string;
  readonly data_type: TType;
  readonly config: TConfig;
  readonly position: number;
  readonly visible: boolean;
  readonly system_key?: string | null;
  readonly column_key?: string | null;
  readonly required?: boolean;
}

export type TextBoardColumn = BoardColumnBase<'text', EmptyColumnConfig>;
export type LongTextBoardColumn = BoardColumnBase<'long_text', EmptyColumnConfig>;
export type NumberBoardColumn = BoardColumnBase<'number', EmptyColumnConfig>;
export type StatusBoardColumn = BoardColumnBase<'status', StatusColumnConfig>;
export type DropdownBoardColumn = BoardColumnBase<'dropdown', DropdownColumnConfig>;
export type DateBoardColumn = BoardColumnBase<'date', EmptyColumnConfig>;
export type PeopleBoardColumn = BoardColumnBase<'people', EmptyColumnConfig>;
export type CheckboxBoardColumn = BoardColumnBase<'checkbox', EmptyColumnConfig>;
export type TimelineBoardColumn = BoardColumnBase<'timeline', EmptyColumnConfig>;
export type EmailBoardColumn = BoardColumnBase<'email', EmptyColumnConfig>;
export type UrlBoardColumn = BoardColumnBase<'url', EmptyColumnConfig>;

export type BoardColumn =
  | TextBoardColumn
  | LongTextBoardColumn
  | NumberBoardColumn
  | StatusBoardColumn
  | DropdownBoardColumn
  | DateBoardColumn
  | PeopleBoardColumn
  | CheckboxBoardColumn
  | TimelineBoardColumn
  | EmailBoardColumn
  | UrlBoardColumn;

export interface TimelineValue {
  readonly start: ISODate | null;
  readonly end: ISODate | null;
}

export interface BoardValueByColumnType {
  readonly text: string | null;
  readonly long_text: string | null;
  readonly number: number | null;
  readonly status: StatusLabelId | null;
  readonly dropdown: string | null;
  readonly date: ISODate | null;
  readonly people: UserId | null;
  readonly checkbox: boolean | null;
  readonly timeline: TimelineValue | null;
  readonly email: string | null;
  readonly url: string | null;
}

export type BoardCellValue = BoardValueByColumnType[BoardColumnType] | readonly string[];

export interface BoardValueRecord {
  readonly id?: string;
  readonly item_id: BoardItemId;
  readonly column_id: BoardColumnId;
  readonly value: BoardCellValue;
  readonly [key: string]: unknown;
}

export interface BoardMember {
  readonly user_id: UserId;
  readonly role: BoardRole;
  readonly email?: string | null;
  readonly display_name?: string | null;
  readonly [key: string]: unknown;
}

export interface BoardEnvelope {
  readonly board: BoardRecord | null;
  readonly groups: readonly BoardGroup[];
  readonly items: readonly BoardItem[];
  readonly columns: readonly BoardColumn[];
  readonly values: readonly BoardValueRecord[];
  readonly members: readonly BoardMember[];
  readonly [key: string]: unknown;
}

export interface BoardPreferences {
  readonly sort_column_id?: BoardColumnId | null;
  readonly sort_direction?: 'asc' | 'desc' | null;
  readonly column_filters?: Readonly<Record<string, unknown>>;
  readonly wrap_columns?: readonly BoardColumnId[];
  readonly column_widths?: Readonly<Record<string, number>>;
  readonly item_name_width?: number;
  readonly collapsed_groups?: readonly BoardGroupId[];
  readonly [key: string]: unknown;
}

export interface BoardEvent {
  readonly id: string;
  readonly board_id?: BoardId;
  readonly event_type: string;
  readonly message: string;
  readonly entity_type?: string | null;
  readonly entity_id?: string | null;
  readonly payload?: Readonly<Record<string, unknown>>;
  readonly created_at?: ISODateTime;
  readonly actor_id?: UserId | null;
  readonly actor_name?: string | null;
  readonly actor_email?: string | null;
  readonly [key: string]: unknown;
}

export interface ItemWorkspaceUpdate {
  readonly id: string;
  readonly item_id: BoardItemId;
  readonly body: string;
  readonly author_name?: string | null;
  readonly author_id?: UserId | null;
  readonly can_delete?: boolean;
  readonly created_at?: ISODateTime;
  readonly [key: string]: unknown;
}

export interface ItemWorkspaceFile {
  readonly id: string;
  readonly item_id: BoardItemId;
  readonly storage_path: string;
  readonly file_name?: string | null;
  readonly size_bytes?: number | null;
  readonly author_name?: string | null;
  readonly author_id?: UserId | null;
  readonly can_delete?: boolean;
  readonly created_at?: ISODateTime;
  readonly [key: string]: unknown;
}

export interface ItemActivityEvent {
  readonly id: string;
  readonly item_id: BoardItemId;
  readonly event_type?: string | null;
  readonly message?: string | null;
  readonly payload?: Readonly<Record<string, unknown>>;
  readonly created_at?: ISODateTime;
  readonly actor_name?: string | null;
  readonly actor_id?: UserId | null;
  readonly [key: string]: unknown;
}

export interface ItemWorkspaceEnvelope {
  readonly updates: readonly ItemWorkspaceUpdate[];
  readonly files: readonly ItemWorkspaceFile[];
  readonly activity: readonly ItemActivityEvent[];
  readonly [key: string]: unknown;
}
