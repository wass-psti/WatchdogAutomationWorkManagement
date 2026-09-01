import type { ApplicationRoute } from '../../../../src/platform/contracts/routing.ts';
import type { EscapeHtml, IconSet, ToastRenderer, TopbarRenderer, WorkspaceRenderer } from '../../../../src/platform/contracts/ui.ts';
import type { PlatformRole } from '../../../../src/types/auth.ts';

interface UserDirectoryRecord {
  readonly id: string;
  readonly email: string;
  readonly display_name: string;
  readonly platform_role: PlatformRole;
  readonly status: 'active' | 'disabled';
}

interface RoleOption {
  readonly value: PlatformRole;
  readonly label: string;
}

export interface UserManagementAuthPort {
  readonly canManageUsers: boolean;
  supportedPlatformRoles(): readonly RoleOption[];
  roleLabel(role: PlatformRole): string;
  listUsers(): Promise<readonly unknown[]>;
  updateUserAccess(input: Readonly<{ userId: string; platformRole: PlatformRole; status: 'active' | 'disabled' }>): Promise<unknown>;
}

export interface UserManagementFeatureOptions {
  readonly auth: UserManagementAuthPort;
  readonly topbar: TopbarRenderer;
  readonly renderWorkspace: WorkspaceRenderer;
  readonly toast: ToastRenderer;
  readonly icons: IconSet;
  readonly escapeHtml: EscapeHtml;
  readonly currentRoute?: (() => ApplicationRoute) | null;
}

interface UserManagementState {
  directory: UserDirectoryRecord[] | null;
  loading: boolean;
  error: string;
  filter: string;
  busy: Set<string>;
  loadedAt: number;
}

const PLATFORM_ROLES = new Set<PlatformRole>(['admin_general_manager', 'hr', 'supervisor', 'employee']);
const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const errorMessage = (error: unknown, fallback: string): string => error instanceof Error ? error.message : fallback;

function parseUserDirectoryRecord(value: unknown): UserDirectoryRecord | null {
  if (!isRecord(value)) return null;
  const id = typeof value.id === 'string' ? value.id.trim() : '';
  const email = typeof value.email === 'string' ? value.email : '';
  const displayName = typeof value.display_name === 'string' ? value.display_name : '';
  const role = typeof value.platform_role === 'string' && PLATFORM_ROLES.has(value.platform_role as PlatformRole) ? value.platform_role as PlatformRole : null;
  const status = value.status === 'active' || value.status === 'disabled' ? value.status : null;
  if (!id || !role || !status) return null;
  return { id, email, display_name: displayName, platform_role: role, status };
}

function parseDirectory(rows: readonly unknown[]): UserDirectoryRecord[] {
  return rows.map(parseUserDirectoryRecord).filter((row): row is UserDirectoryRecord => row !== null);
}

/**
 * Administrator user-directory controller.
 * Server-side authorization remains authoritative in the auth service.
 */
export function createUserManagementFeature({ auth, topbar, renderWorkspace, toast, icons, escapeHtml, currentRoute }: UserManagementFeatureOptions) {
  const esc = escapeHtml;
  const state: UserManagementState = {
    directory: null,
    loading: false,
    error: '',
    filter: '',
    busy: new Set<string>(),
    loadedAt: 0,
  };
  let epoch = 0;
  let active = false;

  const onRoute = (): boolean => currentRoute?.()?.name === 'users';
  const roleOptions = (selected: PlatformRole): string => auth.supportedPlatformRoles().map((role) => `<option value="${esc(role.value)}" ${role.value === selected ? 'selected' : ''}>${esc(role.label)}</option>`).join('');

  function filteredRows(): readonly UserDirectoryRecord[] {
    const q = state.filter.trim().toLowerCase();
    return state.directory
      ? state.directory.filter((user) => !q || `${user.display_name} ${user.email} ${auth.roleLabel(user.platform_role)} ${user.status}`.toLowerCase().includes(q))
      : [];
  }

  function render(): void {
    if (!auth.canManageUsers) {
      renderWorkspace(`${topbar('Access restricted', 'User administration is available only to Admin/General Manager accounts.')}<main id="main" class="page"><div class="empty"><strong>${icons.lock}</strong><h2>Administrator access required</h2><p>Your account is not authorized to manage Work Management users or roles.</p><button class="primary-btn" data-nav="">Return to applications</button></div></main>`, 'users-denied', 'page');
      return;
    }
    const rows = filteredRows();
    const body = state.loading
      ? '<div class="user-directory-state"><span class="button-spinner" aria-hidden="true"></span><strong>Loading user directory…</strong></div>'
      : state.error
        ? `<div class="user-directory-state error"><strong>User directory unavailable</strong><p>${esc(state.error)}</p><button class="secondary-btn" data-user-directory-refresh>Retry</button></div>`
        : `<div class="user-toolbar"><label class="app-search">${icons.search}<input id="userDirectorySearch" value="${esc(state.filter)}" placeholder="Search name, email, role, or status" autocomplete="off"></label><button class="secondary-btn" data-user-directory-refresh>Refresh</button></div>
          <div class="user-directory" role="list">${rows.length ? rows.map((user) => {
            const bootstrap = user.email.toLowerCase() === 'lmsenagan@watchdogautomation.com.ph';
            const busy = state.busy.has(user.id);
            return `<form class="user-row" data-user-access-form data-user-id="${esc(user.id)}" role="listitem">
              <div class="user-identity"><span class="avatar mini">${esc((user.display_name || user.email || 'U').slice(0, 2).toUpperCase())}</span><span><strong>${esc(user.display_name || 'Unnamed user')}</strong><small>${esc(user.email)}</small>${bootstrap ? '<em>Bootstrap administrator</em>' : ''}</span></div>
              <label><span>Role</span><select name="platformRole" ${bootstrap ? 'disabled' : ''}>${roleOptions(user.platform_role)}</select></label>
              <label><span>Status</span><select name="status" ${bootstrap ? 'disabled' : ''}><option value="active" ${user.status === 'active' ? 'selected' : ''}>Active</option><option value="disabled" ${user.status === 'disabled' ? 'selected' : ''}>Disabled</option></select></label>
              <div class="user-row-actions"><span class="status ${user.status === 'active' ? 'success' : 'warning'}"><i></i>${esc(user.status)}</span>${bootstrap ? '<span class="status success"><i></i>Protected</span>' : `<button class="secondary-btn" type="submit" ${busy ? 'disabled aria-busy="true"' : ''}>${busy ? 'Saving…' : 'Save'}</button>`}</div>
            </form>`;
          }).join('') : '<div class="user-directory-state"><strong>No matching accounts</strong><p>Adjust the search query to view other registered users.</p></div>'}</div>`;
    const content = `${topbar('Users', 'Manage Work Management account roles and access status.')}<main id="main" class="page users-page"><section class="section-block users-intro"><div class="section-title"><div><span>ACCESS CONTROL</span><h3>User management</h3></div><p>Role and status changes are executed through protected Supabase RPCs and synchronized into module role assignments.</p></div><div class="role-policy"><span><b>Admin/General Manager</b> Full platform administration</span><span><b>HR</b> HR-aligned workforce access</span><span><b>Supervisor</b> Supervisory access</span><span><b>Employee</b> Default least-privilege access</span></div></section><section class="settings-card user-directory-card">${body}</section></main>`;
    renderWorkspace(content, 'users', 'page');
    if (!state.directory && !state.loading && !state.error) void load();
  }

  async function load({ force = false }: Readonly<{ force?: boolean }> = {}): Promise<void> {
    if (!auth.canManageUsers || state.loading) return;
    if (state.directory && !force) return;
    const ticket = ++epoch;
    state.loading = true;
    state.error = '';
    if (active && onRoute()) render();
    try {
      const rows = await auth.listUsers();
      if (ticket !== epoch) return;
      state.directory = parseDirectory(rows);
      state.loadedAt = Date.now();
    } catch (error) {
      if (ticket !== epoch) return;
      state.error = errorMessage(error, 'User directory could not be loaded.');
      state.directory = null;
    } finally {
      if (ticket === epoch) {
        state.loading = false;
        if (active && onRoute()) render();
      }
    }
  }

  async function handleAction(action: Element | null): Promise<boolean> {
    if (!action?.matches('button[data-user-directory-refresh]')) return false;
    state.directory = null;
    state.error = '';
    await load({ force: true });
    return true;
  }

  function handleInput(input: EventTarget | null): boolean {
    if (!(input instanceof HTMLInputElement) || input.id !== 'userDirectorySearch') return false;
    state.filter = input.value;
    render();
    requestAnimationFrame(() => {
      const next = document.querySelector<HTMLInputElement>('#userDirectorySearch');
      if (next) {
        next.focus();
        next.setSelectionRange(state.filter.length, state.filter.length);
      }
    });
    return true;
  }

  async function handleSubmit(form: HTMLFormElement | null): Promise<boolean> {
    if (!form?.matches('[data-user-access-form]')) return false;
    if (!auth.canManageUsers) {
      toast('Administrator access is required.', 'warning');
      return true;
    }
    const userId = form.dataset.userId;
    if (!userId || state.busy.has(userId)) return true;
    const ticket = epoch;
    const values = Object.fromEntries(new FormData(form).entries());
    const roleValue = String(values.platformRole || '');
    const statusValue = String(values.status || '');
    if (!PLATFORM_ROLES.has(roleValue as PlatformRole) || (statusValue !== 'active' && statusValue !== 'disabled')) {
      toast('Select a valid role and account status.', 'warning');
      return true;
    }
    state.busy.add(userId);
    if (active && onRoute()) render();
    try {
      await auth.updateUserAccess({ userId, platformRole: roleValue as PlatformRole, status: statusValue });
      const rows = await auth.listUsers();
      if (ticket === epoch) {
        state.directory = parseDirectory(rows);
        state.loadedAt = Date.now();
      }
      toast('User access updated. Module permissions were synchronized.');
    } catch (error) {
      toast(errorMessage(error, 'User access could not be updated.'), 'warning');
    } finally {
      state.busy.delete(userId);
      if (active && ticket === epoch && onRoute()) render();
    }
    return true;
  }

  function activate(): void { active = true; }
  function deactivate(): void { active = false; epoch += 1; state.loading = false; }

  return Object.freeze({
    render,
    load,
    handleAction,
    handleInput,
    handleSubmit,
    activate,
    deactivate,
    snapshot: () => Object.freeze({ loading: state.loading, error: state.error, filter: state.filter, loadedAt: state.loadedAt, count: state.directory?.length ?? 0 }),
  });
}

export const USER_MANAGEMENT_FEATURE = Object.freeze({
  id: 'user-management',
  owns: Object.freeze(['users']),
  persistence: 'supabase-auth-rpc',
});
