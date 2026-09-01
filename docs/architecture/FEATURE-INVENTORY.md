# Feature Inventory

This inventory is the restructuring checklist used to prevent feature loss.

## Work Management shell

- Protected launcher/home route
- Responsive fixed sidebar/mobile navigation
- Applications registry and module cards
- Favorites and recent modules
- Launcher search/filter
- Command palette
- Theme: system/light/dark
- Comfortable/compact density
- Online/offline state
- PWA/service-worker updates
- Storage health/persistence request
- System diagnostics
- Module compatibility checks
- Workspace JSON backup/restore
- Shell preference reset
- Reduced-motion handling
- Keyboard and focus handling

## Authentication and account

- Supabase email/password registration
- Email verification lifecycle
- Verification retry/expired/invalid/already-used handling
- Login/session restore
- Proactive refresh
- Cross-tab sign-out/session synchronization
- Account profile editing
- Password updates
- Local/global sign-out
- Protected route return-to behavior
- Server-authoritative platform roles
- User directory and Admin access management
- Bootstrap Admin/General Manager safeguards

## Work Boards

- Board list/search/status filters
- Direct board-card opening
- Context menu actions
- Create empty board
- Create board with selected starting columns
- Rename/edit board
- Duplicate board
- Archive/restore/trash/permanent delete
- Board memberships: Owner/Editor/Viewer
- Groups: add/rename/delete
- Items: add/edit/archive/restore/move
- Table view
- Kanban view
- Drag/drop behavior
- Column types: Text, Long Text, Number, Status, Dropdown, Date, People, Checkbox, Timeline, Email, Link
- Contextual New (column type) names
- Add/add-to-right
- Rename/reorder/configure/show/hide/duplicate/delete columns
- Change custom column type with data-loss safeguards
- Per-user sort/filter/wrap preferences
- Typed cell editing/validation
- Board activity
- Item workspace
- Item Updates
- Item private Files
- Item Activity
- Signed file URLs
- Private Storage RLS
- Collaboration moderation rules
- Empty-board state
- PostgREST configured-create compatibility handling

## TimeTracker

All existing TimeTracker functionality remains domain-owned, including attendance Clock In/Out, GPS evidence, schedule rules, late status, working-time logic, automatic clock-out, overtime/leave, logs, reports, calendar, roles, audit history, cloud persistence, and transactional attendance behavior.

## FuelTrack+

All existing FuelTrack+ functionality remains domain-owned, including Dashboard, Analytics, All Requests, New Fuel Request, Approvals, LightFuels, Activity, Roles, request lifecycle, Admin-only Activity/Export, PDF reports, refueling completion, role management, and cloud synchronization.

## TradeLink

All existing TradeLink functionality remains domain-owned, including Create New document workflows, Electronic SI, Packing List, Delivery Receipt, Payment AR, Quotations, PO to Suppliers, All Documents, User Manual, Recovery, approval workflow, active company/templates, PDF generation, document actions, backup import/recovery, and audit behavior.

## Data/persistence contracts retained

- `config/modules.ts` module storage ownership
- Supabase Auth identity/session
- `profiles`, platform roles and module role assignments
- cloud module state revisions/conflict handling
- shared activity stream
- transactional attendance RPC
- Work Board tables/RPCs
- Work Board private Storage bucket
- all existing migrations through v1.21.6
- local shell preference namespace `wm.platform.*`
