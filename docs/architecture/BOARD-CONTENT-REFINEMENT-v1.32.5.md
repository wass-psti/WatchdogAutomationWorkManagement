# Board content refinement — v1.32.5

This follow-up pass extends the existing Board content-design work without changing the release contract, database schema, routes, RPC payloads, enum keys, `data-*` selectors, permissions, or persistence behavior.

## Refinements

- Replaced remaining generic inline actions with contextual labels such as **Clear value**, **Clear dates**, **Save dates**, **Save text**, and **Save field value**.
- Standardized timeline field labels to **Start date** and **End date** in both inline and modal editors.
- Improved Board, item, group, member, column, attachment, and activity messages so confirmations and success feedback identify the affected action and consequence.
- Improved permission and membership language around **board access**, including clearer removal consequences.
- Made bulk-selection actions explicit, including **Export CSV** and **Delete permanently**, with descriptive titles for compact controls.
- Reduced implementation leakage in backend setup errors while preserving actionable recovery guidance.
- Added concise placeholders and helper text where users benefit from examples or context.
- Improved accessibility names for inline member search and destructive update actions.
- Extended text hierarchy CSS for helper copy, metadata readability, placeholders, and responsive bulk-action labels.

## Compatibility

All internal Board identifiers remain unchanged. This is a presentation/content-only refinement and does not require a database migration.
