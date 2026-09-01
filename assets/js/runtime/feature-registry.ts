import type { ApplicationManifest, FeatureDefinition, FeatureId } from '../../../src/types/manifest.ts';

export interface RegisteredFeature<TImplementation = unknown> {
  readonly id: FeatureId;
  readonly declaration: FeatureDefinition;
  readonly implementation: TImplementation;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface FeatureRegistryValidation {
  readonly valid: boolean;
  readonly missing: readonly FeatureId[];
}

export interface FeatureRegistrySnapshotEntry {
  readonly id: FeatureId;
  readonly boundary: string;
  readonly state: FeatureDefinition['state'];
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface FeatureRegistry {
  register<TImplementation>(id: FeatureId, implementation: TImplementation, metadata?: Readonly<Record<string, unknown>>): RegisteredFeature<TImplementation>;
  get<TImplementation = unknown>(id: FeatureId | string): RegisteredFeature<TImplementation> | null;
  has(id: FeatureId | string): boolean;
  ownerForRoute(routeId: string): FeatureId | null;
  validate(): FeatureRegistryValidation;
  snapshot(): readonly FeatureRegistrySnapshotEntry[];
}

export function createFeatureRegistry(manifest: ApplicationManifest): FeatureRegistry {
  const declared = new Map<FeatureId, FeatureDefinition>(manifest.features.map((feature) => [feature.id, feature]));
  const records = new Map<FeatureId, RegisteredFeature>();

  const register = <TImplementation>(id: FeatureId, implementation: TImplementation, metadata: Readonly<Record<string, unknown>> = {}): RegisteredFeature<TImplementation> => {
    const key = String(id ?? '').trim() as FeatureId;
    if (!key) throw new Error('Feature id is required.');
    const declaration = declared.get(key);
    if (!declaration) throw new Error(`Feature "${key}" is not declared in the application manifest.`);
    if (records.has(key)) throw new Error(`Feature "${key}" is already registered.`);
    const record = Object.freeze({
      id: key,
      declaration,
      implementation,
      metadata: Object.freeze({ ...metadata }),
    }) satisfies RegisteredFeature<TImplementation>;
    records.set(key, record as RegisteredFeature);
    return record;
  };

  const get = <TImplementation = unknown>(id: FeatureId | string): RegisteredFeature<TImplementation> | null =>
    (records.get(String(id ?? '') as FeatureId) as RegisteredFeature<TImplementation> | undefined) ?? null;

  const has = (id: FeatureId | string): boolean => records.has(String(id ?? '') as FeatureId);

  const ownerForRoute = (routeId: string): FeatureId | null =>
    manifest.routes.find((entry) => entry.id === routeId)?.owner ?? null;

  const validate = (): FeatureRegistryValidation => {
    const missing = manifest.features
      .filter((feature) => feature.state === 'active' && !records.has(feature.id))
      .map((feature) => feature.id);
    return Object.freeze({ valid: missing.length === 0, missing: Object.freeze(missing) });
  };

  const snapshot = (): readonly FeatureRegistrySnapshotEntry[] => Object.freeze([...records.values()].map((record) => Object.freeze({
    id: record.id,
    boundary: record.declaration.boundary,
    state: record.declaration.state,
    metadata: record.metadata,
  })));

  return Object.freeze({ register, get, has, ownerForRoute, validate, snapshot });
}
