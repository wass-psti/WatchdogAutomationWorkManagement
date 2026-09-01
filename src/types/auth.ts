import type { ModuleId, UserId } from './identifiers.ts';

export type PlatformRole = 'admin_general_manager' | 'hr' | 'supervisor' | 'employee';
export type BoardRole = 'owner' | 'editor' | 'viewer';

export type Capability =
  | 'platform.admin'
  | 'role.manage'
  | 'module.access.all'
  | 'board.view'
  | 'board.edit'
  | 'board.manage'
  | 'board.activity.view';

export interface AuthenticatedUser {
  readonly id: UserId;
  readonly email: string;
  readonly displayName?: string | null;
  readonly platformRole: PlatformRole;
  readonly active: boolean;
}

export interface ModuleAssignment {
  readonly module_id: ModuleId;
  readonly enabled: boolean;
  readonly role?: string | null;
}

export interface ModuleAccessDecisionInput {
  readonly authenticated: boolean;
  readonly accountActive: boolean;
  readonly platformRole: PlatformRole | string | null | undefined;
  readonly assignments?: readonly ModuleAssignment[];
  readonly moduleId: ModuleId | string;
}
