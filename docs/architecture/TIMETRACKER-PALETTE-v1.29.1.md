# TimeTracker Palette Completion — v1.29.1

v1.29.1 completes the visual migration of TimeTracker from its pre-motion warm-neutral palette to the current cool-neutral design system. The patch is presentation-only and does not change attendance rules, RBAC, GPS behavior, routing, Supabase persistence, or application state contracts.

## Root cause

The v1.29.0 theme pass corrected the custom dropdown system, but older TimeTracker sections still contained direct warm-neutral values in Overview, Attendance Records, Calendar, RBAC, evidence/audit panels, status states, tracks, shadows, and utility components. Because those values were component-local, they could bypass the newer semantic motion layer.

## Corrections

- Added semantic TimeTracker surface, border, text, subtle-state, and track tokens.
- Replaced the Overview filter dock's beige surface with the current neutral glass surface.
- Replaced the Attendance Records table header's cream background with the cool muted surface.
- Normalized legacy warm-gray text in Calendar and supporting interfaces to current semantic typography tokens.
- Normalized old brown/gray borders and shadows to the current blue-gray neutral family.
- Aligned inactive dots, empty states, denied-permission states, skeletons, and status tracks with current semantic tokens.
- Updated legacy orange RGB literals to the current coral accent so translucent focus/hover states match the v1.28/v1.29 palette.
- Added final motion-layer guards for Overview and Attendance Records surfaces.

## Verification

The Chromium integration suite now evaluates computed styles for the TimeTracker custom dropdown, Overview filter dock, Attendance Records summary, and Attendance Records table header. The dedicated `verify-v1291-timetracker-palette.mjs` also rejects the known legacy warm-neutral values from the active TimeTracker stylesheet.

No v1.29.1 Supabase migration is required.
