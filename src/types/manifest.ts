import type { WorkManagementModuleDefinition } from './modules.ts';

export type FeatureId =
  | 'shell'
  | 'home'
  | 'commands'
  | 'auth'
  | 'account'
  | 'boards'
  | 'modules'
  | 'settings'
  | 'user-management'
  | 'module-host';

export interface RouteDefinition {
  readonly id: string;
  readonly pattern: string;
  readonly owner: FeatureId;
}

export interface FeatureDefinition {
  readonly id: FeatureId;
  readonly state: 'active' | 'disabled';
  readonly boundary: string;
  readonly dependencies: readonly string[];
}

export interface ArchitectureDefinition {
  readonly style: 'modular-platform';
  readonly compositionRoot: string;
  readonly serverState: string;
  readonly backendTransport: string;
  readonly authorizationPolicy: string;
  readonly overlayLifecycle: string;
  readonly errorBoundary: string;
  readonly moduleIsolation: 'same-origin-iframe';
  readonly buildPipeline: 'vite-8';
  readonly sourceMaps: 'production-disabled-by-default' | 'production-hidden';
  readonly hardening?: 'production-defense-in-depth';
  readonly runtimeValidation?: 'external-boundaries';
  readonly packageManager: 'npm';
  readonly typeSystem: 'typescript-incremental';
  readonly typecheck: 'strict-boundaries';
  readonly runtimeInfrastructure?: 'typescript-authoritative';
  readonly orchestration?: 'typescript-composition-controllers-services';
  readonly featureRuntime?: 'typescript-nonvisual-core';
  readonly uiRuntime?: 'typescript-authoritative';
}

export interface ApplicationManifest {
  readonly id: 'work-management';
  readonly name: string;
  readonly version: string;
  readonly architectureVersion: number;
  readonly runtime: 'vite-esm';
  readonly architecture: ArchitectureDefinition;
  readonly persistence: Readonly<Record<string, string>>;
  readonly routes: readonly RouteDefinition[];
  readonly features: readonly FeatureDefinition[];
  readonly modules: readonly WorkManagementModuleDefinition[];
}

export interface ManifestValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}
