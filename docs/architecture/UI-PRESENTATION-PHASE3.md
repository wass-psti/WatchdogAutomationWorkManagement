# UI presentation phase 3 — concrete editor and embedded-screen migration

This slice finishes the typed Work Boards editor contract and configurable Status-manager interaction model, then applies the existing presentation system directly to the major TimeTracker, FuelTrack+, and TradeLink screens. It does not introduce a second component framework or alter domain persistence/RBAC contracts.

## Boards

- Every Board column type is represented by a discriminated typed editor contract defining stored/draft conversion and interaction policy.
- Inline item/group/column-compatible editors use explicit Save/Cancel semantics, Enter/Escape behavior, duplicate-submit protection, draft retention on failed persistence, and authoritative-value restoration.
- Configurable Status management preserves stable label IDs and adds dirty-state/cancel/error handling while keeping create, rename, recolor, reorder, activate/deactivate, delete, description and default-label behavior.
- Existing single-active-overlay behavior remains authoritative.

## Embedded screens

- TimeTracker: Overview, Clock, Log, Reports, Calendar, OT and Roles now consume shared screen, field, action, tab, panel and table presentation contracts.
- FuelTrack+: Dashboard, Analytics, All Requests, New Fuel Request, Approvals, LightFuels, Activity and Roles are normalized at their concrete rendered screen boundary.
- TradeLink: Create New and its six document workflows, All Documents, User Manual and Recovery/Activity now consume the shared presentation system while preserving document/approval/PDF behavior.

## Accessibility and responsive changes

Navigation exposes explicit selected/current state, common focus-visible treatment remains authoritative, screen/action composition stacks at intermediate/narrow breakpoints, and forced-colors focus treatment is preserved.

## Remaining cleanup

Historical embedded-app stylesheets still carry presentation rules that remain necessary for specialized layouts. They should be removed only after usage/reference auditing and visual regression validation. This slice does not claim zero legacy CSS.
