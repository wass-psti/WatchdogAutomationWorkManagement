# Motion Design System — v1.28.0

## Scope

v1.28.0 introduces one motion-focused visual language across the Work Management shell, Work Boards, authentication/account/settings/user-management surfaces, module host, TimeTracker, FuelTrack+, and TradeLink. The release is presentation/runtime-only: it does not change Supabase tables, RPC signatures, RLS, Storage policies, domain state keys, routes, or authorization behavior.

## Shared presentation layer

`assets/css/motion-design.css` is loaded after each application's established stylesheet. It supplies the final visual composition while keeping domain-specific CSS and business logic intact.

The shared layer standardizes:

- kinetic depth and elevation;
- rounded glass/elevated surfaces;
- accent gradients and luminous state indicators;
- consistent focus rings;
- button press/lift feedback;
- card hover/focus motion;
- modal/panel entrance motion;
- active-navigation motion indicators;
- responsive floating chrome;
- status and loading transitions;
- coherent scrollbar treatment;
- light/dark/system compatibility in the Work Management shell.

The surfaces remain individually recognizable:

- Work Management: graphite navigation with coral/violet motion accents;
- TimeTracker: neutral workforce canvas with coral/violet timing motion;
- FuelTrack+: dark operational canvas with teal/violet motion accents;
- TradeLink: bright commercial canvas with blue/teal motion accents.

## Motion runtime

`assets/js/runtime/motion-design.ts` provides progressive enhancement only. It does not own application state or routing.

It provides:

- pointer-position variables used by ambient background gradients;
- IntersectionObserver reveal staging for high-value cards/panels;
- MutationObserver support so dynamically rendered views receive the same reveal language;
- kinetic press feedback for interactive controls;
- a `data-wm-motion` state reflecting the user's reduced-motion preference;
- a `data-wm-motion-ready` marker for browser-level verification.

If the runtime is unavailable, the application remains usable; the base CSS and business behavior do not depend on it.

## Shell redesign

The desktop shell now uses a floating navigation rail and floating translucent top bar rather than edge-to-edge chrome. Active navigation has a kinetic accent rail. Home cards, settings, user administration, authentication, command palette, Work Boards, and module host surfaces use the same radius/depth/motion vocabulary.

Work Boards receives the same treatment across Board cards, Table, Kanban, controls, column menus, Item Workspace, updates/files/activity, and dialogs. No board schema or persistence behavior changes.

## Embedded applications

Each embedded runtime loads the shared motion stylesheet and motion runtime after its established CSS. Existing app-specific selectors are enhanced without modifying data/controller contracts.

## Accessibility

`prefers-reduced-motion: reduce` is a first-class mode. The shared layer reduces animations/transitions to effectively instantaneous behavior, disables ambient drift, restores revealed content immediately, and keeps interaction/focus semantics unchanged.

The redesign also preserves visible `:focus-visible` treatment across keyboard-operable controls.

## Performance safeguards

Motion is limited primarily to opacity, transform, background, border, and shadow transitions. The pointer-position update is requestAnimationFrame-throttled. Reveal observation stops once an element has entered. Mutation observation only scans newly inserted elements. No continuous layout-measurement loop is introduced.

## Backend compatibility

No v1.28.0 Supabase migration is required.
