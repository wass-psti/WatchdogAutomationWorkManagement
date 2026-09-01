export type UiControlTone = 'primary' | 'secondary' | 'tertiary' | 'ghost' | 'danger';
export type UiControlSize = 'sm' | 'md' | 'lg';
export type UiControlState = 'default' | 'selected' | 'loading' | 'error' | 'success';
export type UiFieldKind = 'text' | 'search' | 'select' | 'textarea';
export type UiNavigationLevel = 'primary' | 'secondary' | 'contextual';

export interface UiControlOptions {
  readonly tone?: UiControlTone;
  readonly size?: UiControlSize;
  readonly state?: UiControlState;
  readonly block?: boolean;
}

export interface UiFieldOptions {
  readonly kind?: UiFieldKind;
  readonly size?: UiControlSize;
  readonly invalid?: boolean;
  readonly compact?: boolean;
}

export interface UiNavigationOptions {
  readonly level?: UiNavigationLevel;
  readonly active?: boolean;
  readonly compact?: boolean;
}
