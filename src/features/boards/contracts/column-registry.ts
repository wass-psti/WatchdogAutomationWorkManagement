import type { BoardColumnType, BoardValueByColumnType } from './domain.ts';
import type { BoardCellEditorContract } from './editor.ts';

export interface BoardColumnTypeDefinition<TType extends BoardColumnType = BoardColumnType> {
  readonly id: TType;
  readonly label: string;
  readonly hint: string;
  readonly icon: string;
  readonly editor: string;
  readonly editorContract: BoardCellEditorContract<TType>;
  readonly sortable: boolean;
  readonly filterable: boolean;
  readonly defaultValue: () => BoardValueByColumnType[TType];
  readonly normalize: (value: unknown) => BoardValueByColumnType[TType];
}

export type CompleteBoardColumnRegistry = Readonly<{
  [TType in BoardColumnType]: BoardColumnTypeDefinition<TType>;
}>;

export interface BoardColumnTypeRegistry {
  register<TType extends BoardColumnType>(definition: BoardColumnTypeDefinition<TType>): BoardColumnTypeDefinition<TType>;
  get<TType extends BoardColumnType>(id: TType): BoardColumnTypeDefinition<TType>;
  get(id: string): BoardColumnTypeDefinition | null;
  list(): readonly BoardColumnTypeDefinition[];
  normalize<TType extends BoardColumnType>(type: TType, value: unknown): BoardValueByColumnType[TType];
}
