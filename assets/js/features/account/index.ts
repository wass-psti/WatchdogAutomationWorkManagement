import type { WorkManagementModuleDefinition } from '../../../../src/types/modules.ts';
import { auth as defaultAuth } from '../../core/auth.ts';

type AuthService = typeof defaultAuth;
type ModuleIcon = (module: WorkManagementModuleDefinition) => string;
type Topbar = (title: string, subtitle: string) => string;
type RenderWorkspace = (content: string, route: string, motion?: string) => void;
type Navigate = (route: string) => unknown;
type Toast = (message: string, tone?: 'warning' | 'success') => void;
type EscapeHtml = (value: unknown) => string;
type AuthShell = (kicker: string, title: string, body: string) => string;
type QueueEntranceMotion = (scope?: string) => void;
interface AccountFeatureDeps {
  auth: AuthService; modules: readonly WorkManagementModuleDefinition[]; moduleIcon: ModuleIcon; topbar: Topbar;
  renderWorkspace: RenderWorkspace; navigate: Navigate; toast: Toast; escapeHtml: EscapeHtml; authShell: AuthShell;
  queueEntranceMotion: QueueEntranceMotion; setAuthFeedback?: (message?: string, tone?: 'warning'|'success') => void;
}
const messageOf = (error: unknown, fallback: string): string => error instanceof Error ? error.message : fallback;

/**
 * Account feature controller.
 *
 * Owns authenticated profile/security/session presentation and mutations so the
 * shell no longer carries account-specific busy state or form/action handlers.
 */
export function createAccountFeature({
  auth,
  modules,
  moduleIcon,
  topbar,
  renderWorkspace,
  navigate,
  toast,
  escapeHtml,
  authShell,
  queueEntranceMotion,
  setAuthFeedback = () => {},
}: AccountFeatureDeps) {
  const esc = escapeHtml;
  const busy = new Set<string>();
  let epoch = 0;
  let active = false;

  const isCurrent = (ticket: number) => ticket === epoch;

  function button(action: string, label: string, tone = 'secondary-btn'): string {
    const working = busy.has(action);
    const type = ['save-profile', 'change-password'].includes(action) ? 'submit' : 'button';
    return `<button type="${type}" class="${tone}" data-account-action="${esc(action)}" ${working ? 'disabled aria-busy="true"' : ''}>${working ? 'Working…' : esc(label)}</button>`;
  }

  function sessionExpiryText(): string {
    const expiresAt = Number(auth.state?.session?.expires_at || 0);
    return expiresAt ? new Date(expiresAt).toLocaleString() : 'Unavailable';
  }

  function displayName(): string {
    const metadata = auth.user?.user_metadata && typeof auth.user.user_metadata === 'object' ? auth.user.user_metadata as Record<string, unknown> : {};
    return auth.profile?.display_name || (typeof metadata.display_name === 'string' ? metadata.display_name : '') || auth.user?.email?.split('@')[0] || 'User';
  }

  function render(): void {
    if (!auth.isAuthenticated) { navigate('login'); return; }
    const assignments = modules.map((mod) => ({ mod, role: auth.moduleRole(mod.id), allowed: auth.canAccessModule(mod.id) }));
    const bootstrapWarning = auth.hasBootstrapRoleMismatch
      ? `<section class="settings-card"><div class="settings-row"><div><span>RBAC RECONCILIATION</span><h2>Bootstrap administrator role is not applied</h2><p>${esc(auth.state.notice || 'The database still reports this protected bootstrap account as a non-administrator. Run the RBAC reconciliation migration and refresh access.')}</p></div><span class="status warning"><i></i>Action required</span></div></section>`
      : '';
    const content = `${topbar('Account', 'Profile, security, session controls, and application authorization.')}
      <main id="main" class="page account-page">
        ${bootstrapWarning}
        <section class="settings-card">
          <div class="settings-row"><div><span>IDENTITY</span><h2>${esc(displayName())}</h2><p>${esc(auth.user?.email || '')}</p><small>User ID: ${esc(auth.user?.id || '')}</small></div><span class="status ${auth.isAccountActive ? 'success' : 'warning'}"><i></i>${esc(auth.profile?.status || 'unknown')}</span></div>
          <div class="settings-row"><div><span>PLATFORM ROLE</span><h2>${esc(auth.platformRoleLabel)}</h2><p>Cloud profile and module assignments are the authoritative shell-access model.</p></div><span class="status ${auth.isPlatformAdmin ? 'warning' : 'success'}"><i></i>${auth.isPlatformAdmin ? 'Elevated' : 'Standard'}</span></div>
        </section>
        <section class="settings-card settings-secondary">
          <div class="settings-row account-form-row"><div><span>PROFILE SETTINGS</span><h2>Display name</h2><p>Update the name shown throughout Work Management. Email identity is managed by Supabase Auth.</p></div><form class="inline-account-form" data-account-form="profile"><input name="displayName" maxlength="80" minlength="2" value="${esc(displayName())}" required aria-label="Display name">${button('save-profile', 'Save profile')}</form></div>
          <div class="settings-row role-map-row"><div><span>MODULE ACCESS</span><h2>Role mapping</h2><p>Roles are loaded from the cloud account and propagated into each integrated module without exposing authentication tokens.</p><div class="role-map-list">${assignments.map(({ mod, role, allowed }) => `<div><span class="module-mini-icon ${esc(mod.accent)}">${moduleIcon(mod)}</span><span><b>${esc(mod.name)}</b><small>${esc(role)}</small></span><span class="status ${allowed ? 'success' : 'muted'}"><i></i>${allowed ? 'Allowed' : 'Restricted'}</span></div>`).join('')}</div></div><div>${button('refresh-access', 'Refresh access')}</div></div>
          <div class="settings-row account-form-row"><div><span>SECURITY</span><h2>Change password</h2><p>A successful password change signs out every active Work Management session and requires a fresh login.</p></div><form class="inline-account-form password-form" data-account-form="password"><input name="password" type="password" autocomplete="new-password" minlength="10" placeholder="New password" required><input name="confirmPassword" type="password" autocomplete="new-password" minlength="10" placeholder="Confirm password" required>${button('change-password', 'Change password')}</form></div>
          <div class="settings-row"><div><span>SESSION</span><h2>Authenticated session</h2><p>Current session expiry: ${esc(sessionExpiryText())}. Sign out locally or revoke all Work Management refresh sessions for this account.</p></div><div class="settings-actions">${button('signout', 'Sign out this browser')}${button('signout-all', 'Sign out all sessions')}</div></div>
        </section>
      </main>`;
    renderWorkspace(content, 'account', 'page');
  }

  function renderDisabled(): void {
    const markup = authShell('ACCOUNT RESTRICTED', 'This account is disabled', `<div class="auth-message warning"><strong>Access has been suspended.</strong><span>Contact a platform administrator to restore the account. No application modules can be opened while the account is disabled.</span></div><button type="button" class="primary-btn auth-full-button" data-account-action="signout">Sign out</button>`);
    const app = document.querySelector<HTMLElement>('#app');
    if (app) app.innerHTML = markup;
    queueEntranceMotion('page');
  }

  async function handleAction(action: Element | null): Promise<boolean> {
    if (!action?.matches?.('button[data-account-action]')) return false;
    const kind = action instanceof HTMLElement ? action.dataset.accountAction || '' : '';
    if (busy.has(kind)) return true;
    if (kind === 'signout' || kind === 'signout-all') {
      busy.add(kind);
      try {
        await auth.signOut({ scope: kind === 'signout-all' ? 'global' : 'local' });
        setAuthFeedback('', 'success');
        navigate('login');
      } finally { busy.delete(kind); }
      return true;
    }
    if (kind === 'refresh-access') {
      const ticket = epoch;
      busy.add(kind);
      try {
        await auth.reloadAccessContext();
        toast('Account access refreshed.');
      } catch (error) {
        toast(messageOf(error, 'Account access could not be refreshed.'), 'warning');
      } finally {
        busy.delete(kind);
        if (active && isCurrent(ticket)) render();
      }
      return true;
    }
    return false;
  }

  async function handleSubmit(form: HTMLFormElement | null): Promise<boolean> {
    if (!form?.matches?.('[data-account-form]')) return false;
    const type = form.dataset.accountForm;
    const actionName = type === 'profile' ? 'save-profile' : 'change-password';
    if (busy.has(actionName)) return true;
    const ticket = epoch;
    busy.add(actionName);
    const values = Object.fromEntries(new FormData(form).entries());
    try {
      if (type === 'profile') {
        await auth.updateProfile({ displayName: String(values.displayName || '') });
        toast('Profile updated.');
        if (active && isCurrent(ticket)) render();
      } else if (type === 'password') {
        const password = String(values.password || '');
        if (password !== String(values.confirmPassword || '')) throw new Error('Passwords do not match.');
        await auth.updatePassword({ password });
        await auth.signOut({ scope: 'global' });
        setAuthFeedback('Password changed. Sign in again with your new password.', 'success');
        navigate('login');
      }
    } catch (error) {
      toast(messageOf(error, 'Account settings could not be updated.'), 'warning');
    } finally {
      busy.delete(actionName);
    }
    return true;
  }

  function activate() { active = true; }
  function deactivate() { active = false; epoch += 1; }

  return Object.freeze({ render, renderDisabled, handleAction, handleSubmit, activate, deactivate, state: () => Object.freeze({ active, busy: [...busy] }) });
}

export const ACCOUNT_FEATURE = Object.freeze({
  id: 'account',
  owns: Object.freeze(['account']),
  persistence: 'supabase-auth',
});
