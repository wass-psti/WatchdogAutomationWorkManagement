import type { ApplicationManifest, ManifestValidationResult } from '../../types/manifest.ts';

export function validateTypedManifest(manifest: ApplicationManifest): ManifestValidationResult {
  const errors: string[] = [];
  if (manifest.id !== 'work-management') errors.push('Application id is invalid.');
  if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) errors.push('Application version must be semantic.');
  if (manifest.runtime !== 'vite-esm') errors.push('The application runtime must use Vite ESM.');

  const routeIds = new Set<string>();
  const featureIds = new Set(manifest.features.map((feature) => feature.id));
  for (const route of manifest.routes) {
    if (routeIds.has(route.id)) errors.push(`Duplicate route id: ${route.id}`);
    routeIds.add(route.id);
    if (!featureIds.has(route.owner)) errors.push(`Route owner is not a declared feature: ${route.owner}`);
  }

  const moduleIds = new Set<string>();
  for (const module of manifest.modules) {
    if (moduleIds.has(module.id)) errors.push(`Duplicate module id: ${module.id}`);
    moduleIds.add(module.id);
  }

  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}
