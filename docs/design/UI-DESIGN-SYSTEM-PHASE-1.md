# Work Management UI Design System — Presentation Restructure Phase 1

## Direction: Operational Enterprise

The product uses a restrained enterprise productivity language optimized for dense operational workflows, long work sessions, tables, boards, administrative forms, and document processing. The system prioritizes information hierarchy and stable geometry over decorative surfaces.

## Foundation decisions

- **Typography:** 11–36px role scale, 14px default body, 13px dense data text, controlled line heights and label tracking.
- **Spacing:** 4px base rhythm with 2px density half-step; page/section spacing uses named tokens only.
- **Controls:** 32/36/42px size tiers; 40px minimum interaction target for primary navigation.
- **Radius:** 4–24px scale; operational data surfaces use 8–12px, overlays may use 12–18px.
- **Elevation:** borders define ordinary grouping; shadows are reserved for hover affordance and overlays.
- **Color:** semantic roles for canvas, three surface levels, text hierarchy, borders, focus, selection, success/warning/error/info.
- **Motion:** 80–320ms functional transitions, low movement amplitude, no persistent-shell transforms, full reduced-motion fallback.
- **Layout:** 248px stable desktop rail, 1480px content maximum, responsive collapse at 1120/840/640px.
- **Tables:** compact operational rows, sticky structure retained, hover/selection separated from semantic status color.
- **Focus:** product-wide 2px semantic focus ring with offset; never removed without replacement.

## Phase 1 scope

Completed in this slice:

1. authoritative design tokens and semantic theme roles;
2. layout and interaction primitives;
3. Work Management shell hierarchy and density normalization;
4. shared control/surface/overlay geometry;
5. table/Board presentation baseline without changing Board behavior;
6. cross-module presentation bridge for TimeTracker, FuelTrack+, and TradeLink;
7. embedded-module Vite copy contract for the shared design foundation;
8. responsive and reduced-motion foundation.

## Deliberately deferred

The following remain continuation work, not hidden legacy completion claims:

- component-by-component consolidation of duplicated shell markup;
- deep forms normalization in each embedded application;
- full table primitive adoption inside each embedded application;
- responsive behavior audit screen-by-screen;
- comprehensive accessibility audit and remediation of every workflow;
- module-specific navigation composition cleanup;
- final removal of obsolete CSS declarations after visual parity is proven;
- integrated application JavaScript-to-TypeScript migration.

No business rules, persistence schemas, RBAC policies, or backend contracts are changed by Phase 1.
