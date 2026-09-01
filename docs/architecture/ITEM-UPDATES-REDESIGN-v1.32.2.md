# Item Workspace Updates Redesign — v1.32.2

v1.32.2 completes the visual integration of the Work Boards Updates experience without changing its collaboration persistence contract.

## Goals

- Make the Updates surface feel native to the Board Item Workspace rather than like a nested standalone card.
- Reduce composer and empty-state vertical footprint while preserving readability.
- Keep Progress, Decision, Blocker, Handoff, mentions, 5,000-character validation, keyboard posting, visibility semantics, and timeline behavior intact.
- Improve stable layout, keyboard/focus clarity, reduced-motion behavior, and small-screen density.

## Changes

- Compact item header/tab proportions and a denser Updates body.
- Composer reorganized into title, update-type toolbar, editor, and stable action footer.
- Update-type buttons expose pressed state and automatically reflect typed prefixes.
- Clear-draft action appears only when content exists.
- Character counter highlights near-limit content without shifting layout.
- Update cards infer template type and expose a subtle semantic rail/type badge.
- Empty state is now a compact inline call-to-action instead of a tall placeholder area.
- Mobile layout wraps update types and keeps the Post action accessible without oversized vertical padding.
- Hover motion is restrained; no Board-wide or composer layout animation is introduced.

## Backend compatibility

No v1.32.2 Supabase migration is required. Updates continue through the existing protected Item Workspace RPC contract.
