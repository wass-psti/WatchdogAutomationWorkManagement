import { modules } from '../../../../config/modules.ts';
import type { ModuleId } from '../../../../src/types/identifiers.ts';
import type { WorkManagementModuleDefinition } from '../../../../src/types/modules.ts';

export interface ModuleRegistry {
  readonly all: readonly WorkManagementModuleDefinition[];
  get(id: ModuleId | string): WorkManagementModuleDefinition | null;
  active(): readonly WorkManagementModuleDefinition[];
  has(id: ModuleId | string): boolean;
}

export const moduleRegistry: ModuleRegistry = Object.freeze({
  all: Object.freeze([...modules]),
  get(id: ModuleId | string) { return modules.find((module) => module.id === id) ?? null; },
  active() { return modules.filter((module) => module.status === 'active'); },
  has(id: ModuleId | string) { return modules.some((module) => module.id === id); },
});

export { modules } from '../../../../config/modules.ts';
