# Item Workspace Updates Redesign — v1.32.2

v1.32.2 refines the Work Boards Item Workspace collaboration surface without changing its Supabase persistence contract.

## Goals

- Make Updates feel like an intentional collaboration workspace instead of an oversized empty drawer.
- Preserve the v1.32 overlay model so opening Item Details never shifts the Board canvas.
- Improve composer hierarchy, posting feedback, keyboard efficiency, and first-use guidance.
- Keep Updates, Files, and Activity within one consistent visual system.

## Updates improvements

- Stronger item identity and breadcrumb hierarchy.
- Purpose-built collaboration composer with Board-visible context.
- Progress, Decision, Blocker, and Handoff writing prompts.
- Live 5,000-character counter and disabled-empty submit state.
- Ctrl/Cmd+Enter submission shortcut.
- Cleaner timeline heading and update cards.
- Focus-first empty-state action for the first update.
- Responsive composer/footer treatment and reduced-motion compatibility.

## Persistence

No v1.32.2 Supabase migration is required. Updates continue through the existing `wm_add_board_item_update` and Item Workspace RPC/storage contract.
