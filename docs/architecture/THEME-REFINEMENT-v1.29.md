# Theme Refinement and Contrast Audit — v1.29.0

## Scope

v1.29.0 is a presentation-only correction release focused on the three embedded applications: TimeTracker, FuelTrack+, and TradeLink. It preserves all routes, state, authorization, Supabase RPCs, RLS policies, Storage behavior, domain state keys, and business logic.

## Root causes corrected

### TimeTracker

TimeTracker's modern dropdown implementation predates the v1.28 motion design layer. Because open menus are portaled to `<body>`, the component duplicated warm legacy color tokens directly on `.modern-select-menu` (`#fffaf3`, the earlier cream control surface, and `#fbe9df`, the earlier selected state). Those explicit values bypassed the newer neutral/coral motion palette. v1.29 migrates the old warm surfaces to neutral white/cool-gray surfaces and keeps coral only as a semantic focus/selection accent. Native-select fallback surfaces, filters, modal inputs, overview controls, and other historical cream surfaces are migrated at the same source layer.

### FuelTrack+

FuelTrack+ had valid Light and Dark theme variables in its application stylesheet, but v1.28's motion layer later hardcoded a dark canvas, dark sidebar, dark top bar, and dark panel backgrounds. In Light Mode this produced dark motion chrome around components whose typography and cards had already switched to light-theme values. v1.29 replaces those hardcoded motion colors with a semantic FuelTrack motion palette that has explicit dark and `html.light` values. Both modes now use the same component geometry and interaction grammar while receiving appropriate theme-specific canvas, chrome, card, border, shadow, hover, placeholder, skeleton, table, and dialog values.

FuelTrack's tertiary text tokens were also strengthened to maintain readable contrast in both modes. The theme toggle now synchronizes the browser `theme-color` and exposes a state-aware accessible label (`Switch to light mode` / `Switch to dark mode`).

### TradeLink

TradeLink still contained a v1.38 dark-chrome layer that assigned white brand text, white/inactive navigation treatments, dark command-bar assumptions, and low-contrast secondary typography. v1.28 then moved the top bar and command bar to light translucent surfaces without neutralizing every child-level hardcoded color. The result was white or very pale text on white surfaces.

v1.29 reconciles the older source layer with the current light motion system rather than relying only on downstream overrides. Brand text, navigation, vendor controls, document headings, command actions, labels, help text, placeholders, disabled fields, table metadata, approval metadata, and other small secondary typography now use readable semantic colors. The motion layer repeats only the minimum authoritative overrides needed to protect dynamically rendered components from older selectors.

## Browser-level validation

The Chromium integration suite now injects the real TimeTracker, FuelTrack+, TradeLink, and shared motion styles and validates representative computed styles in the browser. The release gate checks:

- TimeTracker's portaled menu uses the neutral surface and no longer resolves to the legacy cream/selection colors.
- TimeTracker dropdown text maintains at least a 4.5:1 contrast ratio against its light surface.
- FuelTrack+ Light Mode resolves to a light canvas and light sidebar chrome instead of the old hardcoded dark motion surfaces.
- FuelTrack+ primary and tertiary text maintain strong/readable contrast in both Light and Dark Modes.
- TradeLink brand, navigation, document heading/status, placeholder, and disabled-field typography maintain at least a 4.5:1 contrast ratio against light surfaces.

## Backend scope

No v1.29.0 Supabase migration is required. This release does not change database tables, RPC signatures, RLS policies, Storage buckets/policies, authentication records, or persisted application data.
