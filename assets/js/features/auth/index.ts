/* Authentication feature boundary.
 *
 * v1.25 moves login/registration/verification presentation, transient form state,
 * cooldown rendering and auth-specific event handling out of the application shell.
 * The core Supabase implementation remains authoritative behind this controller.
 */
import { auth, AUTH_EVENT } from '../../core/auth.ts';

export { auth, AUTH_EVENT };

type AuthService = typeof auth;
type Navigate = (route: string) => unknown;
type EscapeHtml = (value: unknown) => string;
type QueueEntranceMotion = (scope?: string) => void;
interface AuthFeatureDeps { authService?: AuthService; host: HTMLElement; navigate: Navigate; escapeHtml: EscapeHtml; queueEntranceMotion?: QueueEntranceMotion; }
const messageOf = (error: unknown, fallback: string): string => error instanceof Error ? error.message : fallback;

export function createAuthenticationFeature({
  authService = auth,
  host,
  navigate,
  escapeHtml,
  queueEntranceMotion = () => {},
}: AuthFeatureDeps) {
  const esc = escapeHtml;
  const state = {
    busy: false,
    message: '',
    tone: 'success',
    pendingConfirmationEmail: '',
    needsConfirmation: false,
    registrationDraft: { displayName: '', email: '' },
  };
  let cooldownTimer: number | null = null;
  let epoch = 0;
  let active = false;

  const isCurrent = (ticket: number) => ticket === epoch;

  function shell(title: string, subtitle: string, body: string): string {
    return `<div class="auth-shell"><main id="main" class="auth-panel"><div class="auth-brand"><span class="brand-mark"><i></i><i></i><i></i><i></i></span><div><strong>Work Management</strong><small>Cloud identity</small></div></div><span class="auth-kicker">${esc(title)}</span><h1>${esc(subtitle)}</h1>${body}</main></div><div id="overlayRoot"></div><div id="toastRoot" class="toast-root" aria-live="polite" aria-atomic="true"></div>`;
  }

  function messageMarkup(): string {
    return state.message ? `<div class="auth-message ${state.tone}">${esc(state.message)}</div>` : '';
  }

  function setFeedback(message = '', tone: 'success' | 'warning' = 'success'): void {
    state.message = String(message || '');
    state.tone = tone === 'warning' ? 'warning' : 'success';
  }

  function consumeReturnRoute(): string {
    let target = '';
    try {
      target = sessionStorage.getItem('wm.platform.auth.return-to.v1') || '';
      sessionStorage.removeItem('wm.platform.auth.return-to.v1');
    } catch {}
    const cleaned = String(target).replace(/^#\/?/, '');
    if (!cleaned || ['login', 'register', 'verify'].includes(cleaned.split('/')[0] ?? '')) return '';
    return cleaned;
  }

  function cooldownLabel(ms: number, fallback: string): string {
    if (ms <= 0) return fallback;
    return `Try again in ${Math.max(1, Math.ceil(ms / 1000))}s`;
  }

  function scheduleCooldownRender(routeName: 'login' | 'register'): void {
    if (cooldownTimer !== null) window.clearTimeout(cooldownTimer);
    const remaining = routeName === 'register'
      ? authService.registrationCooldownRemaining('signup', state.registrationDraft.email)
      : authService.registrationCooldownRemaining('resend', state.pendingConfirmationEmail);
    if (remaining <= 0) return;
    const ticket = epoch;
    cooldownTimer = window.setTimeout(() => {
      if (!active || !isCurrent(ticket)) return;
      routeName === 'register' ? renderRegister() : renderLogin();
    }, Math.min(1000, remaining + 25));
  }

  function renderLogin(): void {
    active = true;
    if (!authService.isCloudEnabled) { navigate(''); return; }
    const setup = !authService.isConfigured
      ? `<div class="auth-message warning"><strong>Account backend is not configured.</strong><span>Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> in your Vite environment. Never place a secret or service-role key in client configuration.</span></div>`
      : '';
    const resendRemaining = authService.registrationCooldownRemaining('resend', state.pendingConfirmationEmail);
    const resend = state.needsConfirmation
      ? `<div class="auth-confirmation-help"><strong>Email confirmation is still required.</strong><span>Confirm the address from the Supabase email, or request a new message after the cooldown. Repeated requests are intentionally blocked to avoid unnecessary email API calls.</span><button type="button" class="secondary-btn" data-resend-confirmation ${state.busy || !authService.isConfigured || resendRemaining > 0 ? 'disabled' : ''}>${esc(cooldownLabel(resendRemaining, 'Resend confirmation email'))}</button></div>`
      : '';
    host.innerHTML = shell('SECURE ACCESS', 'Sign in to your workspace', `${setup}${messageMarkup()}${resend}<form class="auth-form" data-auth-form="login"><label>Email<input name="email" type="email" autocomplete="email" value="${esc(state.pendingConfirmationEmail)}" required></label><label>Password<input name="password" type="password" autocomplete="current-password" minlength="8" required></label><button class="primary-btn" type="submit" ${state.busy || !authService.isConfigured ? 'disabled' : ''}>${state.busy ? 'Signing in…' : 'Sign in'}</button></form>${authService.backend.allowRegistration ? '<p class="auth-switch">Need an account? <button type="button" data-nav="register">Register</button></p>' : ''}<p class="auth-security">Sessions use Supabase Auth. This client contains only public configuration; privileged keys remain server-side.</p>`);
    scheduleCooldownRender('login');
    queueEntranceMotion('page');
  }

  function renderRegister(): void {
    active = true;
    if (!authService.isCloudEnabled) { navigate(''); return; }
    const remaining = authService.registrationCooldownRemaining('signup', state.registrationDraft.email);
    const rateHelp = `<div class="auth-rate-note"><strong>Email delivery protection</strong><span>Registration is single-submit and cooldown protected. Supabase's built-in email service is low-volume; production deployments should configure Custom SMTP rather than repeatedly retrying a rate-limited request.</span></div>`;
    host.innerHTML = shell('ACCOUNT CREATION', 'Register for Work Management', `${messageMarkup()}<form class="auth-form" data-auth-form="register"><label>Display name<input name="displayName" type="text" autocomplete="name" maxlength="80" value="${esc(state.registrationDraft.displayName)}" required></label><label>Email<input name="email" type="email" autocomplete="email" value="${esc(state.registrationDraft.email)}" required></label><label>Password<input name="password" type="password" autocomplete="new-password" minlength="10" required></label><label>Confirm password<input name="confirmPassword" type="password" autocomplete="new-password" minlength="10" required></label><button class="primary-btn" type="submit" ${state.busy || !authService.isConfigured || remaining > 0 ? 'disabled' : ''}>${state.busy ? 'Creating account…' : esc(cooldownLabel(remaining, 'Create account'))}</button></form><p class="auth-switch">Already registered? <button type="button" data-nav="login">Sign in</button></p>${rateHelp}<p class="auth-security">New accounts are assigned the <strong>Employee</strong> role by the database trigger. Elevated roles are assigned by an Admin/General Manager and enforced by PostgreSQL/RLS.</p>`);
    scheduleCooldownRender('register');
    queueEntranceMotion('page');
  }

  function renderVerify(): void {
    active = true;
    const verification = authService.state?.verification || null;
    const status = verification?.status || 'idle';
    const message = verification?.message || 'No active email verification request was found.';
    const emailValue = state.pendingConfirmationEmail || state.registrationDraft.email || '';

    if (status === 'processing') {
      host.innerHTML = shell('EMAIL VERIFICATION', 'Confirming your account', '<div class="verification-state processing" role="status" aria-live="polite"><span class="verification-spinner"></span><strong>Verifying email address…</strong><p>Please keep this tab open while Work Management validates the one-time confirmation token with Supabase.</p></div>');
      return;
    }
    if (status === 'awaiting-confirmation') {
      host.innerHTML = shell('EMAIL VERIFICATION', 'Activate your account', `<div class="verification-state"><strong>Confirmation is ready</strong><p>${esc(message)}</p><button type="button" class="primary-btn" data-confirm-verification ${state.busy ? 'disabled aria-busy="true"' : ''}>${state.busy ? 'Confirming…' : 'Confirm email address'}</button></div><p class="auth-security">The verification token is submitted only after you explicitly confirm, reducing accidental consumption by email link scanners and preview services.</p>`);
      return;
    }
    if (status === 'success') {
      const target = authService.isAuthenticated ? '' : 'login';
      host.innerHTML = shell('EMAIL VERIFIED', 'Your email is confirmed', `<div class="verification-state success" role="status"><strong>Account verification completed.</strong><p>${esc(message)}</p><button type="button" class="primary-btn" data-nav="${target}">${authService.isAuthenticated ? 'Continue to Work Management' : 'Continue to sign in'}</button></div><p class="auth-security">Verification is stored by Supabase Auth and is not based on browser-only state.</p>`);
      return;
    }
    const recovery = `<div class="verification-state error" role="alert"><strong>Verification could not be completed.</strong><p>${esc(message)}</p></div><form class="auth-form compact" data-auth-form="verify-resend"><label>Email<input name="email" type="email" autocomplete="email" value="${esc(emailValue)}" required></label><button class="secondary-btn" type="submit" ${state.busy ? 'disabled' : ''}>${state.busy ? 'Requesting…' : 'Send a new confirmation email'}</button></form><p class="auth-switch">Already confirmed? <button type="button" data-nav="login">Sign in</button></p>`;
    host.innerHTML = shell('VERIFICATION RECOVERY', 'Confirm your email', recovery);
  }

  function renderCallbackProgress(): void {
    active = true;
    host.innerHTML = shell('EMAIL VERIFICATION', 'Confirming your account', '<div class="verification-state processing" role="status" aria-live="polite"><span class="verification-spinner"></span><strong>Validating confirmation link…</strong><p>Work Management is securely validating the one-time token with Supabase.</p></div>');
  }

  async function handleAction(action: Element | null): Promise<boolean> {
    if (!action) return false;
    if (action.matches?.('button[data-confirm-verification]')) {
      if (state.busy) return true;
      const ticket = epoch;
      state.busy = true;
      renderVerify();
      try {
        const result = await authService.confirmPendingCallback();
        if (result?.verified && result?.sessionCreated) await authService.init({ forceStorage: true });
        setFeedback(authService.state?.verification?.message || '', result?.verified ? 'success' : 'warning');
      } catch (error) {
        setFeedback(messageOf(error, 'Email verification could not be completed.'), 'warning');
      } finally {
        state.busy = false;
        if (active && isCurrent(ticket)) renderVerify();
      }
      return true;
    }
    if (action.matches?.('button[data-resend-confirmation]')) {
      if (state.busy) return true;
      const ticket = epoch;
      state.busy = true;
      if (action instanceof HTMLButtonElement) action.disabled = true;
      try {
        const email = state.pendingConfirmationEmail || (host.querySelector('[data-auth-form="login"] input[name="email"]') as HTMLInputElement | null)?.value || '';
        await authService.resendSignupConfirmation(email);
        setFeedback('A new confirmation email was sent. Open the newest message and use its confirmation link before signing in.', 'success');
      } catch (error) {
        setFeedback(messageOf(error, 'The confirmation email could not be resent.'), 'warning');
      } finally {
        state.busy = false;
        if (active && isCurrent(ticket)) renderLogin();
      }
      return true;
    }
    if (action.matches?.('button[data-auth-action="signout"]')) {
      await authService.signOut({ scope: 'local' });
      setFeedback('', 'success');
      navigate('login');
      return true;
    }
    return false;
  }

  async function handleSubmit(form: HTMLFormElement | null): Promise<boolean> {
    if (!form?.matches?.('[data-auth-form]')) return false;
    if (state.busy) return true;
    const ticket = epoch;
    state.busy = true;
    setFeedback('', 'success');
    const formType = form.dataset.authForm;
    const values = Object.fromEntries(new FormData(form).entries());
    let rerenderAuthForm = false;
    try {
      if (formType === 'verify-resend') {
        const email = String(values.email || '').trim();
        state.pendingConfirmationEmail = email;
        await authService.resendSignupConfirmation(email);
        setFeedback('A new confirmation email was sent. Use the newest link; older verification links may no longer be valid.', 'success');
        state.needsConfirmation = true;
        navigate('login');
      } else if (formType === 'login') {
        const email = String(values.email || '').trim();
        state.pendingConfirmationEmail = email;
        await authService.signIn(email, String(values.password || ''));
        setFeedback('', 'success');
        state.needsConfirmation = false;
        state.pendingConfirmationEmail = '';
        navigate(consumeReturnRoute());
      } else if (formType === 'register') {
        const email = String(values.email || '').trim();
        const password = String(values.password || '');
        const displayName = String(values.displayName || '').trim();
        state.registrationDraft = { displayName, email };
        if (password.length < 10) throw new Error('Use a password with at least 10 characters.');
        if (password !== String(values.confirmPassword || '')) throw new Error('Passwords do not match.');
        const result = await authService.signUp({ email, password, displayName });
        state.pendingConfirmationEmail = email;
        if (result.sessionCreated) {
          state.needsConfirmation = false;
          state.pendingConfirmationEmail = '';
          state.registrationDraft = { displayName: '', email: '' };
          navigate(consumeReturnRoute());
        } else {
          state.needsConfirmation = true;
          authService.setRegistrationCooldown('resend', email, 60_000);
          setFeedback('Registration submitted. Confirm your email address before signing in.', 'success');
          navigate('login');
        }
      }
    } catch (error) {
      setFeedback(messageOf(error, 'Authentication could not be completed.'), 'warning');
      state.needsConfirmation = formType === 'login' && authService.isEmailNotConfirmedError(error);
      rerenderAuthForm = true;
    } finally {
      state.busy = false;
      if (rerenderAuthForm && active && isCurrent(ticket)) {
        if (formType === 'register') renderRegister();
        else if (formType === 'verify-resend') {
          authService.state.verification = { status: 'error', code: 'resend_failed', message: state.message, sessionCreated: false };
          renderVerify();
        } else renderLogin();
      }
    }
    return true;
  }

  function handleInput(input: Element | null): boolean {
    const form = input?.closest('[data-auth-form="register"]') as HTMLFormElement | null;
    if (!form) return false;
    state.registrationDraft = {
      displayName: String((form.elements.namedItem('displayName') as HTMLInputElement | null)?.value || ''),
      email: String((form.elements.namedItem('email') as HTMLInputElement | null)?.value || '').trim(),
    };
    return true;
  }

  function activate() { active = true; }
  function deactivate() {
    active = false;
    epoch += 1;
    if (cooldownTimer !== null) window.clearTimeout(cooldownTimer);
  }

  return Object.freeze({
    renderLogin,
    renderRegister,
    renderVerify,
    renderCallbackProgress,
    shell,
    setFeedback,
    consumeReturnRoute,
    handleAction,
    handleSubmit,
    handleInput,
    activate,
    deactivate,
    snapshot: () => Object.freeze({
      busy: state.busy,
      message: state.message,
      tone: state.tone,
      pendingConfirmationEmail: state.pendingConfirmationEmail,
      needsConfirmation: state.needsConfirmation,
      registrationDraft: Object.freeze({ ...state.registrationDraft }),
    }),
  });
}

export const AUTH_FEATURE = Object.freeze({
  id: 'auth',
  owns: Object.freeze(['login', 'register', 'verify']),
  persistence: 'supabase-auth',
  architecture: 'controller-view-state',
});
