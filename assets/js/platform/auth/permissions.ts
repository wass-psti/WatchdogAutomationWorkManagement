import type {
  BoardRole,
  Capability,
  ModuleAccessDecisionInput,
  ModuleAssignment,
  PlatformRole,
} from '../../../../src/types/auth.ts';
import type { ModuleId } from '../../../../src/types/identifiers.ts';
import type { CapabilityMatrix } from '../../../../src/platform/contracts/rbac.ts';

export const CAPABILITIES = Object.freeze({
  PLATFORM_ADMIN: 'platform.admin',
  ROLE_MANAGE: 'role.manage',
  MODULE_ACCESS_ALL: 'module.access.all',
  BOARD_VIEW: 'board.view',
  BOARD_EDIT: 'board.edit',
  BOARD_MANAGE: 'board.manage',
  BOARD_ACTIVITY_VIEW: 'board.activity.view',
} as const satisfies Readonly<Record<string, Capability>>);

const PLATFORM_ROLE_CAPABILITIES = Object.freeze({
  admin_general_manager: Object.freeze([CAPABILITIES.PLATFORM_ADMIN, CAPABILITIES.ROLE_MANAGE, CAPABILITIES.MODULE_ACCESS_ALL]),
  hr: Object.freeze([]),
  supervisor: Object.freeze([]),
  employee: Object.freeze([]),
} as const satisfies CapabilityMatrix<PlatformRole>);

const BOARD_ROLE_CAPABILITIES = Object.freeze({
  owner: Object.freeze([CAPABILITIES.BOARD_VIEW, CAPABILITIES.BOARD_EDIT, CAPABILITIES.BOARD_MANAGE, CAPABILITIES.BOARD_ACTIVITY_VIEW]),
  editor: Object.freeze([CAPABILITIES.BOARD_VIEW, CAPABILITIES.BOARD_EDIT, CAPABILITIES.BOARD_ACTIVITY_VIEW]),
  viewer: Object.freeze([CAPABILITIES.BOARD_VIEW, CAPABILITIES.BOARD_ACTIVITY_VIEW]),
} as const satisfies CapabilityMatrix<BoardRole>);

const PLATFORM_ADMIN_MODULE_ROLE = Object.freeze({
  'time-tracker': 'System Admin',
  'fueltrack-plus': 'Admin',
  tradelink: 'General Manager',
} as const satisfies Readonly<Record<ModuleId, string>>);

export const isPlatformRole = (value: unknown): value is PlatformRole =>
  value === 'admin_general_manager' || value === 'hr' || value === 'supervisor' || value === 'employee';

export const isBoardRole = (value: unknown): value is BoardRole =>
  value === 'owner' || value === 'editor' || value === 'viewer';

export const isCapability = (value: unknown): value is Capability =>
  typeof value === 'string' && (Object.values(CAPABILITIES) as readonly string[]).includes(value);

export function hasPlatformCapability(role: PlatformRole | string | null | undefined, capability: Capability): boolean {
  return isPlatformRole(role) ? (PLATFORM_ROLE_CAPABILITIES[role] as readonly Capability[]).includes(capability) : false;
}

export function hasBoardCapability(role: BoardRole | string | null | undefined, capability: Capability): boolean {
  return isBoardRole(role) ? (BOARD_ROLE_CAPABILITIES[role] as readonly Capability[]).includes(capability) : false;
}

export function platformAdminModuleRole(moduleId: ModuleId | string): string {
  return moduleId in PLATFORM_ADMIN_MODULE_ROLE
    ? PLATFORM_ADMIN_MODULE_ROLE[moduleId as ModuleId]
    : 'Admin';
}

function assignmentFor(assignments: readonly ModuleAssignment[], moduleId: ModuleId | string): ModuleAssignment | undefined {
  return assignments.find((entry) => String(entry.module_id) === String(moduleId));
}

export function canAccessModuleByPolicy(input: Partial<ModuleAccessDecisionInput> = {}): boolean {
  if (!input.authenticated || !input.accountActive) return false;
  if (hasPlatformCapability(input.platformRole, CAPABILITIES.MODULE_ACCESS_ALL)) return true;
  const assignments = Array.isArray(input.assignments) ? input.assignments : [];
  return assignmentFor(assignments, input.moduleId ?? '')?.enabled === true;
}

export const capabilityPolicy = Object.freeze({
  platform: PLATFORM_ROLE_CAPABILITIES,
  board: BOARD_ROLE_CAPABILITIES,
  platformAdminModuleRole: PLATFORM_ADMIN_MODULE_ROLE,
});
