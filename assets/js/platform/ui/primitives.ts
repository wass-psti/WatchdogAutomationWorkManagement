import type { UiControlOptions, UiFieldOptions, UiNavigationOptions } from '../../../../src/platform/contracts/presentation-system.ts';

const join = (...values: Array<string | false | null | undefined>): string => values.filter(Boolean).join(' ');

export function buttonClass(options: UiControlOptions = {}, legacyClass = ''): string {
  const tone = options.tone ?? 'secondary';
  const size = options.size ?? 'md';
  const state = options.state ?? 'default';
  return join(
    'wm-button',
    `wm-button--${tone}`,
    `wm-control--${size}`,
    state !== 'default' && `is-${state}`,
    options.block && 'is-block',
    legacyClass,
  );
}

export function iconButtonClass(options: Omit<UiControlOptions, 'block'> = {}, legacyClass = ''): string {
  const tone = options.tone ?? 'ghost';
  const size = options.size ?? 'md';
  const state = options.state ?? 'default';
  return join(
    'wm-icon-button',
    `wm-icon-button--${tone}`,
    `wm-control--${size}`,
    state !== 'default' && `is-${state}`,
    legacyClass,
  );
}

export function fieldControlClass(options: UiFieldOptions = {}, legacyClass = ''): string {
  const kind = options.kind ?? 'text';
  const size = options.size ?? 'md';
  return join(
    'wm-field-control',
    `wm-field-control--${kind}`,
    `wm-control--${size}`,
    options.invalid && 'is-invalid',
    options.compact && 'is-compact',
    legacyClass,
  );
}

export function navigationItemClass(options: UiNavigationOptions = {}, legacyClass = ''): string {
  const level = options.level ?? 'primary';
  return join(
    'wm-nav-item',
    `wm-nav-item--${level}`,
    options.active && 'is-active',
    options.compact && 'is-compact',
    legacyClass,
  );
}

export function tabClass(active: boolean, legacyClass = ''): string {
  return join('wm-tab', active && 'is-active', legacyClass);
}

export function toolbarClass(legacyClass = ''): string {
  return join('wm-toolbar', legacyClass);
}
