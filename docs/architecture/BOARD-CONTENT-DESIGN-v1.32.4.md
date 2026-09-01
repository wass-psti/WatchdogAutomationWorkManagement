# Board content design — v1.32.4

v1.32.4 includes a Board-wide content-design pass alongside the Item Workspace tab-transition stabilization work. The objective is to make every user-facing Board message clearer and more consistent without changing internal identifiers, RPC payloads, persistence contracts, or authorization behavior.

## Terminology

The Board UI now consistently uses these presentation terms:

- **Board** for a shared workspace.
- **Item** for a row/card of work.
- **Group** for an item section.
- **Column** for configurable structured information.
- **Board member** for a person with Board access.
- **Updates**, **Files**, and **Activity** for the three Item Workspace collaboration areas.
- **Archive** for reversible removal from the active workflow.
- **Trash** for reversible Board removal before permanent deletion.
- **Delete permanently** where data cannot be restored.

Internal keys such as `active`, `trashed`, `owner`, `editor`, `viewer`, column type IDs, status values, event types, selectors, and RPC parameters are unchanged. Presentation labels are mapped separately where a friendlier label is needed.

## Content hierarchy

Copy was revised across Board lists, Board workspace controls, Table/Kanban, column workflows, item workflows, member management, Item Workspace, files, activity, selection, validation, confirmations, loading/error states, and notifications.

The pass favors:

- action labels that start with clear verbs;
- explicit consequences for destructive actions;
- specific recovery guidance for recoverable errors;
- useful empty-state next steps;
- concise labels in dense controls and fuller explanations in dialogs;
- consistent sentence case and terminology;
- human-readable activity labels instead of internal event codes;
- Board/item/column names in confirmations and success feedback where practical.

## Readability

Long Board names, group names, item names, column names, and Kanban metadata now have explicit wrapping/truncation boundaries and native title tooltips where the dense presentation must truncate. Supporting text uses consistent line-height and maximum readable widths.

## Accessibility

Accessible names were refined for contextual menus, row selection, drag handles, item-detail actions, attachments, search, filters, and membership removal. Visible labels and accessible labels use the same product terminology while keeping stable DOM hooks and IDs for application behavior and tests.

## Compatibility

This pass changes presentation copy and text styling only. It does not require a Supabase migration and does not rename database enums, RPCs, internal status keys, role keys, column type IDs, selectors, persisted preference keys, or event types.
