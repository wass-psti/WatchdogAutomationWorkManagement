import type { ModuleId } from './identifiers.ts';

export type ModuleStatus = 'active' | 'disabled' | 'maintenance';
export type ModuleAccent = 'orange' | 'blue' | 'teal' | string;

export interface WorkManagementModuleDefinition {
  readonly id: ModuleId;
  readonly name: string;
  readonly eyebrow: string;
  readonly description: string;
  readonly route: string;
  readonly version: string;
  readonly status: ModuleStatus;
  readonly accent: ModuleAccent;
  readonly icon: string;
  readonly capabilities: readonly string[];
  readonly storageFormat: 'json' | string;
  readonly cloudStateKeys: readonly string[];
  readonly userStateKeys: readonly string[];
  readonly cloudStatePrefixes: readonly string[];
  readonly rawStorageKeys?: readonly string[];
  readonly rawStoragePatterns?: Readonly<Record<string, string>>;
}
