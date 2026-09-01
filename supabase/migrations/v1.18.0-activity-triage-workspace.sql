-- Work Management v1.18.0
-- Register the FuelTrack+ per-user Activity triage workspace.
-- This state only stores personal UI organization (archived event IDs / active view).
-- It never mutates or deletes the append-only shared Activity audit stream.

insert into public.module_state_key_policies(
  module_id,key_pattern,match_type,required_scope,max_bytes,writable,description
) values (
  'fueltrack-plus',
  'fueltrackplus.activity.workspace.v1',
  'exact',
  'user',
  1048576,
  true,
  'Per-user FuelTrack+ Activity triage/archive workspace'
)
on conflict (module_id,key_pattern,match_type) do update set
  required_scope=excluded.required_scope,
  max_bytes=excluded.max_bytes,
  writable=excluded.writable,
  description=excluded.description;
