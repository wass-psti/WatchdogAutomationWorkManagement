import type { Capability } from '../../types/auth.ts';

export type CapabilityMatrix<TRole extends string> = Readonly<Record<TRole, readonly Capability[]>>;

export function capabilityAllowed<TRole extends string>(
  matrix: Readonly<Record<TRole, readonly Capability[]>>,
  role: TRole,
  capability: Capability,
): boolean {
  return matrix[role].includes(capability);
}
