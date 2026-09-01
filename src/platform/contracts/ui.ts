import type { Capability, PlatformRole } from '../../types/auth.ts';
import type { ModuleId } from '../../types/identifiers.ts';

export type EscapeHtml = (value: unknown) => string;
export type DateFormatter = (value: unknown) => string;
export type WorkspaceRenderer = (content: string, routeKey?: string, motionMode?: string) => unknown;
export type TopbarRenderer = (title: string, subtitle?: string, actions?: string) => string;
export type ToastTone = 'success' | 'error' | 'warning' | 'info' | string;
export type ToastRenderer = (message: string, tone?: ToastTone) => unknown;
export type Navigate = (path: string) => unknown;
export type TransitionUpdate = (callback: () => void, kind?: 'route' | 'state' | string) => unknown;

export interface IconSet {
  readonly grid: string;
  readonly clock: string;
  readonly fuel: string;
  readonly trade: string;
  readonly search: string;
  readonly settings: string;
  readonly arrow: string;
  readonly back: string;
  readonly reload: string;
  readonly external: string;
  readonly star: string;
  readonly download: string;
  readonly upload: string;
  readonly check: string;
  readonly user: string;
  readonly users: string;
  readonly boards: string;
  readonly lock: string;
  readonly cloud: string;
}

export interface UiAuthPort {
  readonly isAuthenticated: boolean;
  readonly isPlatformAdmin: boolean;
  readonly isAccountActive: boolean;
  readonly platformRole: PlatformRole;
  readonly user?: Readonly<{ readonly id?: string | null; readonly email?: string | null }> | null;
  readonly profile?: Readonly<{ readonly display_name?: string | null; readonly email?: string | null }> | null;
  canAccessModule(moduleId: ModuleId | string): boolean;
  moduleRole(moduleId: ModuleId | string): string;
  hasCapability?(capability: Capability | string): boolean;
  roleLabel?(role?: PlatformRole): string;
}

export type InstallPrompt = Event & Readonly<{
  prompt?: () => Promise<void>;
  userChoice?: Promise<Readonly<{ outcome?: string }>>;
}>;

export interface ActionHandlerContext {
  readonly action: Element;
  readonly event?: Event | null;
}

export function isHTMLElement(value: EventTarget | null): value is HTMLElement {
  return value instanceof HTMLElement;
}

export function isHTMLInputElement(value: EventTarget | null): value is HTMLInputElement {
  return value instanceof HTMLInputElement;
}

export function isHTMLSelectElement(value: EventTarget | null): value is HTMLSelectElement {
  return value instanceof HTMLSelectElement;
}

export function isHTMLFormElement(value: EventTarget | null): value is HTMLFormElement {
  return value instanceof HTMLFormElement;
}
