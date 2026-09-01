import { CAPABILITIES, hasPlatformCapability, platformAdminModuleRole as resolvePlatformAdminModuleRole, canAccessModuleByPolicy } from '../platform/auth/permissions.ts';

import type { Capability, PlatformRole } from '../../../src/types/auth.ts';
import type { ModuleId as PlatformModuleId } from '../../../src/types/identifiers.ts';
import { deriveAuthLifecycle, normalizeAuthFailure } from './auth-state.ts';
import { createRequestSignal, timeoutError } from '../platform/data/request-signal.ts';
import type { AuthLifecycleState, AuthStatus } from './auth-state.ts';
import type { EmbeddedModuleIdentityContext } from '../../../src/platform/contracts/embedded-module.ts';
type AccountStatus = 'active' | 'disabled';
type VerificationStatus = 'processing' | 'awaiting-confirmation' | 'success' | 'error';
type VerificationType = 'email' | 'signup' | 'invite' | 'recovery' | 'magiclink' | 'email_change' | '';
type JsonRecord = Record<string, unknown>;

interface BackendConfig {
  provider: 'supabase'; accountBased: boolean; enabled: boolean; backendEnabled: boolean;
  supabaseUrl: string; publishableKey: string; configured: boolean; requireAuthentication: true; allowRegistration: boolean;
}
interface AuthSession { access_token: string; refresh_token: string; token_type: string; expires_in: number; expires_at: number; }
interface AuthUserRecord extends JsonRecord { id: string; email?: string; email_confirmed_at?: string | null; confirmed_at?: string | null; }
interface ProfileRecord extends JsonRecord { id: string; email?: string; display_name?: string; platform_role: PlatformRole; status: AccountStatus; created_at?: string; updated_at?: string; }
interface ModuleAssignmentRecord extends JsonRecord { module_id: PlatformModuleId; role?: string | null; enabled: boolean; updated_at?: string; }
interface VerificationState { status: VerificationStatus; code: string; message: string; sessionCreated: boolean; }
interface AuthState {
  initialized: boolean; status: AuthStatus; mode: 'cloud'; configured: boolean; session: AuthSession | null;
  user: AuthUserRecord | null; profile: ProfileRecord | null; assignments: ModuleAssignmentRecord[];
  error: string | null; notice: string | null; verification: VerificationState | null;
}
interface AuthCallbackInfo { hasCallback: boolean; errorCode: string; errorDescription: string; tokenHash: string; type: VerificationType; hasImplicitSession: boolean; callbackMarker: string; requireExplicitConfirm: boolean; }
interface AuthCallbackResult { handled: boolean; verified?: boolean; error?: boolean; awaitingConfirmation?: boolean; sessionCreated?: boolean; }
interface IdentityContext { version: 1; user: { id: string; email: string; displayName: string }; platformRole: PlatformRole; accountStatus: AccountStatus; modules: Record<string,{role:string|null;enabled:boolean}>; updatedAt: string; }
interface AuthError extends Error { code: string; status: number | null; }
interface ChannelMessage { type?: string; at?: number; }
interface CooldownGuard extends Record<string, number> {}

const asRecord = (value: unknown): JsonRecord => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
const stringField = (record: JsonRecord, key: string): string => typeof record[key] === 'string' ? record[key] as string : '';
const numberField = (record: JsonRecord, key: string, fallback = 0): number => { const value = Number(record[key]); return Number.isFinite(value) ? value : fallback; };
const errorMessage = (error: unknown, fallback = 'Authentication request failed.'): string => normalizeAuthFailure(error, fallback).message;
const errorCode = (error: unknown): string => normalizeAuthFailure(error).code;
const errorStatus = (error: unknown): number | null => normalizeAuthFailure(error).status;


const SESSION_KEY = 'wm.platform.auth.session.v1';
const IDENTITY_KEY = 'wm.platform.identity.v1';
const AUTH_EVENT = 'wm-auth-change';
const AUTH_CHANNEL = 'wm.platform.auth.channel.v1';
const REQUEST_TIMEOUT_MS = 15000;
const REFRESH_SKEW_MS = 60_000;
const REGISTRATION_GUARD_KEY = 'wm.platform.auth.registration-guard.v1';
const SIGNUP_COOLDOWN_MS = 60_000;
const RESEND_COOLDOWN_MS = 60_000;
const RATE_LIMIT_COOLDOWN_MS = 60_000;
const PROFILE_HYDRATION_RETRIES = 4;
const PROFILE_HYDRATION_BASE_DELAY_MS = 250;
const VERIFICATION_TYPES = Object.freeze(['email','signup','invite','recovery','magiclink','email_change']);
const PLATFORM_ROLES: readonly PlatformRole[] = Object.freeze(['admin_general_manager','hr','supervisor','employee']);
const PLATFORM_MODULE_IDS: readonly PlatformModuleId[] = Object.freeze(['time-tracker','fueltrack-plus','tradelink']);
const isPlatformModuleId = (value: string): value is PlatformModuleId => (PLATFORM_MODULE_IDS as readonly string[]).includes(value);
const BOOTSTRAP_ADMIN_EMAIL = 'lmsenagan@watchdogautomation.com.ph';
const PLATFORM_ROLE_LABELS = Object.freeze({
  admin_general_manager: 'Admin/General Manager',
  hr: 'HR',
  supervisor: 'Supervisor',
  employee: 'Employee',
});
const MODULE_ROLES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  'time-tracker': ['Employee', 'OJT', 'Supervisor', 'HR', 'Finance', 'System Admin', 'IT Administrator'],
  'fueltrack-plus': ['User', 'Pump Attendant', 'Admin'],
  'tradelink': ['User', 'Sales Supervisor', 'General Manager'],
});

const isPlatformRole = (value: unknown): value is PlatformRole => PLATFORM_ROLES.includes(value as PlatformRole);
const isAccountStatus = (value: unknown): value is AccountStatus => value === 'active' || value === 'disabled';

function parseAuthUser(value: unknown): AuthUserRecord {
  const record = asRecord(value);
  const id = stringField(record, 'id').trim();
  if (!id) throw new TypeError('Authentication user payload is missing a valid id.');
  const email = stringField(record, 'email').trim();
  const emailConfirmedAt = record.email_confirmed_at == null ? null : stringField(record, 'email_confirmed_at').trim() || null;
  const confirmedAt = record.confirmed_at == null ? null : stringField(record, 'confirmed_at').trim() || null;
  return Object.freeze({
    ...record,
    id,
    ...(email ? { email } : {}),
    email_confirmed_at: emailConfirmedAt,
    confirmed_at: confirmedAt,
  });
}

function parseProfile(value: unknown): ProfileRecord {
  const record = asRecord(value);
  const id = stringField(record, 'id').trim();
  const role = record.platform_role;
  const status = record.status;
  if (!id) throw new TypeError('Profile payload is missing a valid id.');
  if (!isPlatformRole(role)) throw new TypeError('Profile payload contains an unsupported platform role.');
  if (!isAccountStatus(status)) throw new TypeError('Profile payload contains an unsupported account status.');
  const email = stringField(record, 'email').trim();
  const displayName = stringField(record, 'display_name').trim();
  return Object.freeze({
    ...record,
    id,
    platform_role: role,
    status,
    ...(email ? { email } : {}),
    ...(displayName ? { display_name: displayName } : {}),
  });
}

function parseModuleAssignment(value: unknown): ModuleAssignmentRecord {
  const record = asRecord(value);
  const moduleId = stringField(record, 'module_id').trim();
  if (!isPlatformModuleId(moduleId)) throw new TypeError('Module assignment payload contains an unsupported module id.');
  if (typeof record.enabled !== 'boolean') throw new TypeError('Module assignment payload is missing a boolean enabled flag.');
  const role = record.role == null ? null : stringField(record, 'role').trim() || null;
  const allowedRoles = MODULE_ROLES[moduleId] ?? [];
  if (role !== null && !allowedRoles.includes(role)) throw new TypeError(`Module assignment payload contains an unsupported role for ${moduleId}.`);
  return Object.freeze({
    ...record,
    module_id: moduleId,
    enabled: record.enabled,
    role,
  });
}

function parseModuleAssignments(value: unknown): ModuleAssignmentRecord[] {
  if (!Array.isArray(value)) throw new TypeError('Module assignment response must be an array.');
  return value.map(parseModuleAssignment);
}

function config(): BackendConfig {
  const raw = asRecord((globalThis as typeof globalThis & { WM_BACKEND_CONFIG?: unknown }).WM_BACKEND_CONFIG);
  const accountBased = raw.accountBased !== false;
  const provider = typeof raw.provider === 'string' ? raw.provider : 'supabase';
  const backendEnabled = raw.enabled === true;
  const supabaseUrl = typeof raw.supabaseUrl === 'string' ? raw.supabaseUrl.trim().replace(/\/$/, '') : '';
  const publishableKey = typeof raw.publishableKey === 'string' ? raw.publishableKey.trim() : '';
  const configured = accountBased && backendEnabled && provider === 'supabase'
    && /^https:\/\/.+\.supabase\.co$/i.test(supabaseUrl)
    && (/^sb_publishable_/i.test(publishableKey) || /^eyJ/i.test(publishableKey));
  return {
    provider: 'supabase',
    accountBased,
    enabled: accountBased,
    backendEnabled,
    supabaseUrl,
    publishableKey,
    configured,
    requireAuthentication: true,
    allowRegistration: raw.allowRegistration !== false,
  };
}


function readRegistrationGuard(): CooldownGuard {
  try {
    const raw = localStorage.getItem(REGISTRATION_GUARD_KEY);
    const value = raw ? JSON.parse(raw) : {};
    return value && typeof value === 'object' ? value as CooldownGuard : {};
  } catch { return {}; }
}

function writeRegistrationGuard(value: CooldownGuard): void {
  try { localStorage.setItem(REGISTRATION_GUARD_KEY, JSON.stringify(value || {})); } catch {}
}

function normalizeEmail(value: unknown): string { return String(value || '').trim().toLowerCase(); }

function cooldownKey(kind: string, email: string): string { return `${kind}:${normalizeEmail(email) || '*'}`; }

function formatCooldown(ms: number): string {
  const seconds = Math.max(1, Math.ceil(ms / 1000));
  return seconds >= 60 ? `${Math.ceil(seconds / 60)} minute${Math.ceil(seconds / 60) === 1 ? '' : 's'}` : `${seconds} seconds`;
}

function readStoredSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return normalizeSession(JSON.parse(raw));
  } catch { return null; }
}

function writeStoredSession(session: AuthSession | null): boolean {
  try {
    if (!session) localStorage.removeItem(SESSION_KEY);
    else localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return true;
  } catch (error) {
    console.warn('[Work Management] Auth session persistence unavailable', error);
    return false;
  }
}

function writeIdentityContext(context: IdentityContext | null): void {
  try {
    if (!context) localStorage.removeItem(IDENTITY_KEY);
    else localStorage.setItem(IDENTITY_KEY, JSON.stringify(context));
  } catch (error) {
    console.warn('[Work Management] Identity context persistence unavailable', error);
  }
}

function jwtExpiry(token: string): number {
  try {
    const part = (token.split('.')[1] ?? '').replace(/-/g, '+').replace(/_/g, '/');
    const padded = part.padEnd(Math.ceil(part.length / 4) * 4, '=');
    const payload = JSON.parse(atob(padded));
    return Number(payload.exp || 0) * 1000;
  } catch { return 0; }
}

function normalizeSession(payload: unknown, fallbackRefresh: string | null = null): AuthSession | null {
  const record = asRecord(payload);
  const access = stringField(record, 'access_token');
  const refresh = stringField(record, 'refresh_token') || fallbackRefresh;
  if (!access || !refresh) return null;
  return {
    access_token: access,
    refresh_token: refresh,
    token_type: stringField(record, 'token_type') || 'bearer',
    expires_in: numberField(record, 'expires_in', 3600),
    expires_at: jwtExpiry(access) || Date.now() + numberField(record, 'expires_in', 3600) * 1000,
  };
}

function authError(payload: unknown, fallback: string, status: number | null = null): AuthError {
  const record = asRecord(payload);
  const error = new Error(stringField(record,'msg') || stringField(record,'message') || stringField(record,'error_description') || stringField(record,'error') || fallback) as AuthError;
  error.code = stringField(record,'error_code') || stringField(record,'code') || stringField(record,'error');
  error.status = status && status > 0 ? status : null;
  return error;
}

function applicationBaseUrl() {
  const url = new URL('./', location.href);
  url.search = '';
  url.hash = '';
  return url.toString();
}

function confirmationRedirectUrl() {
  const url = new URL(applicationBaseUrl());
  url.searchParams.set('wm_auth_callback', 'signup');
  return url.toString();
}

function callbackParams() {
  const hash = new URLSearchParams((location.hash || '').replace(/^#/, ''));
  const query = new URLSearchParams(location.search || '');
  return { hash, query };
}

function normalizeVerificationType(value: unknown): VerificationType {
  const type = String(value || '').trim().toLowerCase();
  if (type === 'email') return 'email';
  if (VERIFICATION_TYPES.includes(type)) return type as VerificationType;
  return '';
}

function inspectAuthCallback(): AuthCallbackInfo {
  const { hash, query } = callbackParams();
  const errorCode = hash.get('error_code') || query.get('error_code') || '';
  const errorDescription = hash.get('error_description') || query.get('error_description') || hash.get('error') || query.get('error') || '';
  const tokenHash = query.get('token_hash') || '';
  const type = normalizeVerificationType(query.get('type'));
  const hasImplicitSession = Boolean(hash.get('access_token'));
  const callbackMarker = query.get('wm_auth_callback') || '';
  return {
    hasCallback: Boolean(errorDescription || errorCode || tokenHash || hasImplicitSession || callbackMarker),
    errorCode, errorDescription, tokenHash, type, hasImplicitSession, callbackMarker,
    requireExplicitConfirm: query.get('verify_mode') === 'confirm',
  };
}

function verificationErrorMessage(code: unknown, description = ''): string {
  const normalized = String(code || '').toLowerCase();
  const detail = String(description || '').trim();
  if (normalized.includes('otp_expired') || /expired/i.test(detail)) return 'This verification link has expired. Request a new confirmation email and use the newest link.';
  if (normalized.includes('access_denied')) return 'This verification link was rejected. Request a new confirmation email or sign in if the address was already confirmed.';
  if (/already.*(used|confirmed)|invalid.*token|token.*invalid/i.test(detail)) return 'This verification link is invalid or has already been used. If you already confirmed the address, sign in; otherwise request a new confirmation email.';
  return detail || 'Email verification could not be completed. Request a new confirmation email and try again.';
}

function isEmailConfirmed(user: AuthUserRecord | null): boolean {
  return Boolean(user?.email_confirmed_at || user?.confirmed_at);
}

function delay(ms: number): Promise<void> { return new Promise((resolve) => window.setTimeout(resolve, ms)); }

function cleanName(value: unknown): string {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 80);
}

class AuthManager extends EventTarget {
  state: AuthState;
  refreshPromise: Promise<AuthSession> | null = null;
  refreshTimer: number | null = null;
  syncPromise: Promise<ReturnType<AuthManager['snapshot']>> | null = null;
  accessContextPromise: Promise<ReturnType<AuthManager['snapshot']>> | null = null;
  accessContextValidatedAt = 0;
  bootstrapReconcileAttempted = false;
  channel: BroadcastChannel | null = null;
  private generation = 0;
  private terminatedGeneration = -1;

  constructor() {
    super();
    this.state = {
      initialized: false,
      status: 'initializing',
      mode: 'cloud',
      configured: false,
      session: null,
      user: null,
      profile: null,
      assignments: [],
      error: null,
      notice: null,
      verification: null,
    };
    this.refreshPromise = null;
    this.refreshTimer = null;
    this.syncPromise = null;
    this.accessContextPromise = null;
    this.accessContextValidatedAt = 0;
    this.bootstrapReconcileAttempted = false;
    this.channel = null;
    try {
      if ('BroadcastChannel' in globalThis) {
        this.channel = new BroadcastChannel(AUTH_CHANNEL);
        this.channel.addEventListener('message', (event: MessageEvent<unknown>) => this.handleChannelMessage(asRecord(event.data) as ChannelMessage));
      }
    } catch {}
  }

  get lifecycle(): AuthLifecycleState {
    return deriveAuthLifecycle({
      status: this.state.status,
      userId: this.state.user?.id ?? null,
      expiresAt: this.state.session?.expires_at ?? null,
      generation: this.generation,
    });
  }
  get backend() { return config(); }
  get callbackInfo() { return inspectAuthCallback(); }
  get hasAuthCallback() { return this.callbackInfo.hasCallback; }
  get isCloudEnabled() { return this.backend.accountBased; }
  get isConfigured() { return this.backend.configured; }
  get isAuthenticated() { return Boolean(this.state.user && this.state.session && this.isAccountActive); }
  get hasSession() { return Boolean(this.state.session); }
  get isAccountActive() { return !this.state.profile || this.state.profile.status === 'active'; }
  get user() { return this.state.user; }
  get profile() { return this.state.profile; }
  get assignments() { return this.state.assignments || []; }
  get platformRole(): PlatformRole { return this.state.profile?.platform_role || 'employee'; }
  get platformRoleLabel() { return PLATFORM_ROLE_LABELS[this.platformRole] || 'Employee'; }
  get isPlatformAdmin() { return hasPlatformCapability(this.platformRole, CAPABILITIES.PLATFORM_ADMIN); }
  get canManageUsers() { return this.isAuthenticated && this.isAccountActive && hasPlatformCapability(this.platformRole, CAPABILITIES.ROLE_MANAGE); }
  hasCapability(capability: Capability) { return this.isAuthenticated && this.isAccountActive && hasPlatformCapability(this.platformRole, capability); }
  get isBootstrapAccount() { return normalizeEmail(this.state.user?.email || this.state.profile?.email) === BOOTSTRAP_ADMIN_EMAIL; }
  get hasBootstrapRoleMismatch() { return this.isBootstrapAccount && this.state.profile?.platform_role !== 'admin_general_manager'; }

  emit() {
    this.dispatchEvent(new CustomEvent(AUTH_EVENT, { detail: this.snapshot() }));
  }

  snapshot() {
    return {
      ...this.state,
      lifecycle: this.lifecycle,
      session: this.state.session ? { expires_at: this.state.session.expires_at } : null,
      backend: this.backend,
      isAuthenticated: this.isAuthenticated,
      isAccountActive: this.isAccountActive,
    };
  }

  broadcast(type: string): void {
    try { this.channel?.postMessage({ type, at: Date.now() }); } catch {}
  }

  headers(accessToken: string | null = null, extra: Record<string,string> = {}): Record<string,string> {
    const { publishableKey } = this.backend;
    const headers: Record<string,string> = { apikey: publishableKey, 'Content-Type': 'application/json', ...extra };
    if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
    return headers;
  }

  async request<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
    const { supabaseUrl } = this.backend;
    if (!supabaseUrl) throw new Error('Supabase project URL is not configured.');
    const requestSignal = createRequestSignal(options.signal, REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(`${supabaseUrl}${path}`, { ...options, signal: requestSignal.signal, cache: options.cache || 'no-store' });
      const text = await response.text();
      let payload: unknown = null;
      try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
      if (!response.ok) throw authError(payload, `Request failed with HTTP ${response.status}`, response.status);
      return payload as T;
    } catch (error) {
      if (requestSignal.timedOut()) throw timeoutError('The authentication service did not respond in time.');
      throw error;
    } finally {
      requestSignal.dispose();
    }
  }

  async consumeAuthCallback({ force = false }: {force?: boolean} = {}): Promise<AuthCallbackResult> {
    const info = inspectAuthCallback();
    if (!info.hasCallback) return { handled: false };

    this.state.verification = { status: 'processing', code: '', message: 'Verifying your email address…', sessionCreated: false };

    if (info.errorDescription || info.errorCode) {
      const message = verificationErrorMessage(info.errorCode, info.errorDescription);
      this.state.verification = { status: 'error', code: info.errorCode || 'verification_failed', message, sessionCreated: false };
      this.state.error = message;
      history.replaceState(null, '', `${location.pathname}#/verify`);
      return { handled: true, verified: false, error: true };
    }

    if (info.tokenHash && info.requireExplicitConfirm && !force) {
      this.state.verification = { status: 'awaiting-confirmation', code: '', message: 'Your confirmation link is ready. Confirm the email address to activate the account.', sessionCreated: false };
      history.replaceState(null, '', `${location.pathname}${location.search}#/verify`);
      return { handled: true, verified: false, awaitingConfirmation: true };
    }

    try {
      if (info.hasImplicitSession) {
        const { hash } = callbackParams();
        const session = normalizeSession({
          access_token: hash.get('access_token'),
          refresh_token: hash.get('refresh_token'),
          token_type: hash.get('token_type'),
          expires_in: hash.get('expires_in'),
        });
        if (!session) throw new Error('The verification callback did not contain a usable session.');
        this.acceptSession(session);
        this.state.verification = { status: 'success', code: '', message: 'Email confirmed successfully.', sessionCreated: true };
        this.state.notice = 'Email confirmed successfully.';
        history.replaceState(null, '', `${location.pathname}#/verify`);
        return { handled: true, verified: true, sessionCreated: true };
      }

      if (info.tokenHash) {
        if (!info.type) throw new Error('The verification link is malformed because its verification type is missing or unsupported.');
        const payload = await this.request<unknown>('/auth/v1/verify', {
          method: 'POST',
          headers: this.headers(),
          body: JSON.stringify({ token_hash: info.tokenHash, type: info.type }),
        });
        const session = normalizeSession(payload);
        if (session) this.acceptSession(session);
        this.state.verification = { status: 'success', code: '', message: 'Email confirmed successfully.', sessionCreated: Boolean(session) };
        this.state.notice = session ? 'Email confirmed successfully.' : 'Email confirmed successfully. Sign in to continue.';
        history.replaceState(null, '', `${location.pathname}#/verify`);
        return { handled: true, verified: true, sessionCreated: Boolean(session) };
      }

      // A callback marker without a token generally means Supabase redirected back after
      // consuming the link but did not provide a browser session. Treat it as recoverable
      // rather than leaving the application on an indefinite loading screen.
      if (info.callbackMarker) {
        const message = 'The verification callback did not include a token or session. The link may have expired, been consumed by an email security scanner, or the Supabase email template may be misconfigured.';
        this.state.verification = { status: 'error', code: 'callback_missing_token', message, sessionCreated: false };
        this.state.error = message;
        history.replaceState(null, '', `${location.pathname}#/verify`);
        return { handled: true, verified: false, error: true };
      }
    } catch (error) {
      const code = errorCode(error);
      const message = verificationErrorMessage(code, errorMessage(error, ''));
      this.state.verification = { status: 'error', code, message, sessionCreated: false };
      this.state.error = message;
      history.replaceState(null, '', `${location.pathname}#/verify`);
      return { handled: true, verified: false, error: true };
    }

    return { handled: false };
  }

  async confirmPendingCallback() {
    return this.consumeAuthCallback({ force: true });
  }

  acceptSession(session: AuthSession, { broadcast = false }: {broadcast?: boolean} = {}): void {
    this.generation += 1;
    this.state.session = session;
    writeStoredSession(session);
    this.scheduleRefresh();
    if (broadcast) this.broadcast('session-updated');
  }

  clearRuntimeIdentity({ preserveError = false }: {preserveError?: boolean} = {}): void {
    this.generation += 1;
    this.terminatedGeneration = this.generation;
    if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
    this.refreshTimer = null;
    this.accessContextValidatedAt = 0;
    this.state = {
      ...this.state,
      session: null,
      user: null,
      profile: null,
      assignments: [],
      status: this.isConfigured ? 'anonymous' : 'setup-required',
      error: preserveError ? this.state.error : null,
    };
    writeStoredSession(null);
    writeIdentityContext(null);
  }

  scheduleRefresh(): void {
    if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
    const expiresAt = Number(this.state.session?.expires_at || 0);
    if (!expiresAt) return;
    const delay = Math.max(5000, Math.min(2_147_000_000, expiresAt - Date.now() - REFRESH_SKEW_MS));
    this.refreshTimer = window.setTimeout(() => {
      this.ensureValidSession({ reason: 'scheduled-refresh' }).catch((error) => {
        console.warn('[Work Management] Scheduled session refresh failed', error);
      });
    }, delay);
  }

  async init({ forceStorage = false }: {forceStorage?: boolean} = {}) {
    if (this.syncPromise) return this.syncPromise;
    this.syncPromise = this._init({ forceStorage }).finally(() => { this.syncPromise = null; });
    return this.syncPromise;
  }

  async _init({ forceStorage = false }: {forceStorage?: boolean} = {}) {
    const backend = this.backend;
    this.state = { ...this.state, initialized: false, status: 'initializing', mode: 'cloud', configured: backend.configured, error: null };
    if (!backend.configured) {
      this.clearRuntimeIdentity();
      this.state = { ...this.state, initialized: true, configured: false, status: 'setup-required', error: 'Cloud authentication must be configured before Work Management can be used.' };
      this.emit();
      return this.snapshot();
    }

    try {
      const callbackResult = await this.consumeAuthCallback();
      if (callbackResult.awaitingConfirmation || callbackResult.error) {
        this.state.initialized = true;
        this.state.status = 'anonymous';
        this.emit();
        return this.snapshot();
      }
      let session = forceStorage ? readStoredSession() : (this.state.session || readStoredSession());
      if (!session) {
        this.clearRuntimeIdentity();
        this.state = { ...this.state, initialized: true, configured: true, status: 'anonymous', error: null };
        this.emit();
        return this.snapshot();
      }
      if (!session.expires_at || session.expires_at < Date.now() + REFRESH_SKEW_MS) session = await this.refresh(session.refresh_token, { broadcast: false });
      else this.acceptSession(session);
      await this.loadCurrentUserWithRetry();
      if (callbackResult.verified && !isEmailConfirmed(this.state.user)) throw new Error('Supabase returned a session, but the account is not marked as email-confirmed. Request a new verification link.');
      this.state.initialized = true;
      this.state.status = this.isAccountActive ? 'authenticated' : 'disabled';
      this.state.error = this.isAccountActive ? null : 'This account has been disabled.';
      this.publishIdentityContext();
    } catch (error) {
      console.warn('[Work Management] Existing cloud session could not be restored', error);
      this.state.error = errorMessage(error, 'The saved session could not be restored.');
      this.clearRuntimeIdentity({ preserveError: true });
      this.state.initialized = true;
    }
    this.emit();
    return this.snapshot();
  }


  registrationCooldownRemaining(kind: string, email = ''): number {
    const guard = readRegistrationGuard();
    const now = Date.now();
    const exact = Number(guard[cooldownKey(kind, email)] || 0);
    const globalUntil = Number(guard[`${kind}:*`] || 0);
    return Math.max(0, exact - now, globalUntil - now);
  }

  setRegistrationCooldown(kind: string, email: string, durationMs: number, { global = false }: {global?: boolean} = {}): number {
    const guard = readRegistrationGuard();
    const until = Date.now() + Math.max(1000, Number(durationMs || 0));
    guard[cooldownKey(kind, global ? '*' : email)] = until;
    for (const [key, value] of Object.entries(guard)) if (Number(value) <= Date.now()) delete guard[key];
    writeRegistrationGuard(guard);
    return until;
  }

  clearRegistrationCooldown(kind: string, email: string): void {
    const guard = readRegistrationGuard();
    delete guard[cooldownKey(kind, email)];
    writeRegistrationGuard(guard);
  }

  isRateLimitError(error: unknown): boolean {
    const message = String(errorMessage(error, '')).toLowerCase();
    return Number(errorStatus(error) || 0) === 429 || message.includes('rate limit') || message.includes('too many requests');
  }

  registrationErrorMessage(error: unknown, operation: 'signup'|'resend' = 'signup'): string {
    const code = String(errorCode(error)).toLowerCase();
    const message = String(errorMessage(error, '')).toLowerCase();
    if (code === 'user_already_exists' || message.includes('already registered') || message.includes('already exists')) {
      return 'An account already exists for this email address. Sign in instead of submitting another registration request.';
    }
    if (!this.isRateLimitError(error)) return errorMessage(error);
    const action = operation === 'resend' ? 'request another confirmation email' : 'create another account';
    return `Supabase has temporarily rate-limited authentication email delivery. Wait before trying to ${action}. The built-in Supabase email service is intentionally low-volume; configure Custom SMTP for production registration traffic.`;
  }

  async signIn(email: string, password: string) {
    if (!this.isConfigured) throw new Error('Cloud authentication is not configured.');
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!normalizedEmail || !password) throw new Error('Email and password are required.');
    const payload = await this.request<JsonRecord>('/auth/v1/token?grant_type=password', {
      method: 'POST', headers: this.headers(), body: JSON.stringify({ email: normalizedEmail, password })
    });
    const session = normalizeSession(payload);
    if (!session) throw new Error('Authentication succeeded without a usable session.');
    this.acceptSession(session, { broadcast: true });
    await this.loadCurrentUser(asRecord(payload).user && typeof asRecord(payload).user === 'object' ? asRecord(payload).user as AuthUserRecord : null);
    if (!this.isAccountActive) {
      await this.signOut({ scope: 'local', broadcast: false });
      throw new Error('This account is disabled. Contact a platform administrator.');
    }
    this.state.error = null;
    this.state.status = 'authenticated';
    this.publishIdentityContext();
    this.emit();
    return this.snapshot();
  }

  async signUp({ email, password, displayName }: {email:string;password:string;displayName:string}) {
    if (!this.isConfigured) throw new Error('Cloud registration is not configured.');
    if (!this.backend.allowRegistration) throw new Error('User registration is disabled for this deployment.');
    const normalizedEmail = normalizeEmail(email);
    const name = cleanName(displayName);
    if (!normalizedEmail || !password || !name) throw new Error('Display name, email, and password are required.');
    const remaining = this.registrationCooldownRemaining('signup', normalizedEmail);
    if (remaining > 0) throw new Error(`Please wait ${formatCooldown(remaining)} before submitting another registration request.`);
    this.setRegistrationCooldown('signup', normalizedEmail, SIGNUP_COOLDOWN_MS);
    const redirect = confirmationRedirectUrl();
    let payload: JsonRecord;
    try {
      payload = await this.request<JsonRecord>(`/auth/v1/signup?redirect_to=${encodeURIComponent(redirect)}`, {
        method: 'POST', headers: this.headers(), body: JSON.stringify({
          email: normalizedEmail, password, data: { display_name: name }
        })
      });
    } catch (error) {
      if (this.isRateLimitError(error)) this.setRegistrationCooldown('signup', normalizedEmail, RATE_LIMIT_COOLDOWN_MS, { global: true });
      else this.clearRegistrationCooldown('signup', normalizedEmail);
      const wrapped = new Error(this.registrationErrorMessage(error, 'signup')) as AuthError;
      wrapped.code = errorCode(error);
      wrapped.status = errorStatus(error);
      throw wrapped;
    }
    const session = normalizeSession(payload);
    if (session) {
      this.acceptSession(session, { broadcast: true });
      await this.loadCurrentUser(asRecord(payload).user && typeof asRecord(payload).user === 'object' ? asRecord(payload).user as AuthUserRecord : null);
      this.state.status = 'authenticated';
      this.publishIdentityContext();
      this.emit();
    }
    return { ...payload, sessionCreated: Boolean(session) };
  }

  async resendSignupConfirmation(email: string): Promise<boolean> {
    if (!this.isConfigured) throw new Error('Cloud authentication is not configured.');
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) throw new Error('Enter your email address first.');
    const remaining = this.registrationCooldownRemaining('resend', normalizedEmail);
    if (remaining > 0) throw new Error(`Please wait ${formatCooldown(remaining)} before requesting another confirmation email.`);
    this.setRegistrationCooldown('resend', normalizedEmail, RESEND_COOLDOWN_MS);
    const redirect = confirmationRedirectUrl();
    try {
      await this.request(`/auth/v1/resend?redirect_to=${encodeURIComponent(redirect)}`, {
        method: 'POST', headers: this.headers(), body: JSON.stringify({ type: 'signup', email: normalizedEmail }),
      });
    } catch (error) {
      if (this.isRateLimitError(error)) this.setRegistrationCooldown('resend', normalizedEmail, RATE_LIMIT_COOLDOWN_MS, { global: true });
      else this.clearRegistrationCooldown('resend', normalizedEmail);
      const wrapped = new Error(this.registrationErrorMessage(error, 'resend')) as AuthError;
      wrapped.code = errorCode(error);
      wrapped.status = errorStatus(error);
      throw wrapped;
    }
    return true;
  }

  isEmailNotConfirmedError(error: unknown): boolean {
    const code = String(errorCode(error)).toLowerCase();
    const message = String(errorMessage(error, '')).toLowerCase();
    return code === 'email_not_confirmed' || message.includes('email not confirmed');
  }

  async refresh(refreshToken: string | undefined = this.state.session?.refresh_token, { broadcast = true }: {broadcast?: boolean} = {}): Promise<AuthSession> {
    if (!refreshToken) throw new Error('No refresh token is available.');
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = this.request<unknown>('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST', headers: this.headers(), body: JSON.stringify({ refresh_token: refreshToken })
    }).then((payload) => {
      const session = normalizeSession(payload, refreshToken);
      if (!session) throw new Error('The refreshed session is invalid.');
      this.acceptSession(session, { broadcast });
      return session;
    }).finally(() => { this.refreshPromise = null; });
    return this.refreshPromise;
  }

  async ensureValidSession({ reason = 'access' }: {reason?: string} = {}): Promise<string | null> {
    const session = this.state.session || readStoredSession();
    if (!session) return null;
    try {
      if (!session.expires_at || session.expires_at < Date.now() + REFRESH_SKEW_MS) await this.refresh(session.refresh_token);
      else if (!this.state.session) this.acceptSession(session);
      if (!this.state.user) await this.loadCurrentUser();
      return this.state.session?.access_token || null;
    } catch (error) {
      console.warn(`[Work Management] Session validation failed during ${reason}`, error);
      this.state.error = 'Your session is no longer valid. Sign in again.';
      this.clearRuntimeIdentity({ preserveError: true });
      this.broadcast('signed-out');
      this.emit();
      return null;
    }
  }

  async ensureAccessToken(): Promise<string | null> {
    return this.ensureValidSession({ reason: 'token-access' });
  }

  async loadCurrentUserWithRetry(seedUser: AuthUserRecord | null = null): Promise<AuthUserRecord | null> {
    let lastError = null;
    for (let attempt = 0; attempt < PROFILE_HYDRATION_RETRIES; attempt += 1) {
      try {
        return await this.loadCurrentUser(seedUser);
      } catch (error) {
        lastError = error;
        const retryable = /profile is missing|failed with http 5|did not respond|network/i.test(String(errorMessage(error, '')));
        if (!retryable || attempt === PROFILE_HYDRATION_RETRIES - 1) break;
        await delay(PROFILE_HYDRATION_BASE_DELAY_MS * (2 ** attempt));
      }
    }
    throw lastError || new Error('The account profile could not be loaded.');
  }

  async loadCurrentUser(seedUser: AuthUserRecord | null = null): Promise<AuthUserRecord | null> {
    const generation = this.generation;
    const token = this.state.session?.access_token || await this.ensureAccessToken();
    if (!token) return null;
    const user = seedUser ? parseAuthUser(seedUser) : parseAuthUser(await this.request<unknown>('/auth/v1/user', { headers: this.headers(token) }));
    if (generation !== this.generation || generation === this.terminatedGeneration) return null;
    this.state.user = user;
    await this.loadAccessContext(generation);
    return user;
  }

  async loadAccessContext(expectedGeneration = this.generation): Promise<void> {
    const token = this.state.session?.access_token || await this.ensureAccessToken();
    const userId = this.state.user?.id;
    if (!token || !userId) return;
    const [profiles, assignments] = await Promise.all([
      this.request<unknown[]>(`/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=id,email,display_name,platform_role,status,created_at,updated_at`, { headers: this.headers(token) }),
      this.request<unknown[]>(`/rest/v1/module_role_assignments?user_id=eq.${encodeURIComponent(userId)}&select=module_id,role,enabled,updated_at`, { headers: this.headers(token) }),
    ]);
    if (expectedGeneration !== this.generation || expectedGeneration === this.terminatedGeneration) return;
    if (!Array.isArray(profiles)) throw new TypeError('Profile response must be an array.');
    this.state.profile = profiles[0] == null ? null : parseProfile(profiles[0]);
    this.state.assignments = parseModuleAssignments(assignments);
    if (!this.state.profile) throw new Error('Your user profile is missing. Contact a platform administrator.');

    // v1.17.0 reconciliation: the known bootstrap account is promoted only by a
    // SECURITY DEFINER RPC that validates auth.uid() and the persisted profile email.
    // The browser never grants itself a role. This repairs databases where the prior
    // migration stopped after the legacy CHECK-constraint failure.
    if (this.hasBootstrapRoleMismatch && !this.bootstrapReconcileAttempted) {
      this.bootstrapReconcileAttempted = true;
      try {
        const reconciled = await this.request<unknown[]>('/rest/v1/rpc/claim_bootstrap_admin', {
          method: 'POST', headers: this.headers(token, { Prefer: 'return=representation' }), body: '{}',
        });
        if (Array.isArray(reconciled) && reconciled[0]) {
          this.state.profile = parseProfile(reconciled[0]);
          const refreshedAssignments = await this.request<unknown[]>(`/rest/v1/module_role_assignments?user_id=eq.${encodeURIComponent(userId)}&select=module_id,role,enabled,updated_at`, { headers: this.headers(token) });
          this.state.assignments = parseModuleAssignments(refreshedAssignments);
          this.state.notice = 'Bootstrap administrator access was reconciled from the database.';
        }
      } catch (error) {
        console.warn('[Work Management] Bootstrap administrator reconciliation is unavailable', error);
        this.state.notice = 'RBAC database upgrade required: run supabase/migrations/v1.14.2-rbac-reconciliation.sql, then refresh access.';
      }
    }
    this.accessContextValidatedAt = Date.now();
    this.publishIdentityContext();
  }

  async revalidateAccessContext({ force = false, maxAgeMs = 60_000 }: {force?: boolean;maxAgeMs?: number} = {}) {
    if (!this.state.session || !this.state.user) return this.snapshot();
    const maxAge = Math.max(5_000, Math.trunc(maxAgeMs));
    if (!force && this.accessContextValidatedAt > 0 && Date.now() - this.accessContextValidatedAt < maxAge) return this.snapshot();
    if (this.accessContextPromise) return this.accessContextPromise;
    const expectedGeneration = this.generation;
    this.accessContextPromise = (async () => {
      const token = await this.ensureValidSession({ reason: 'access-context-revalidation' });
      if (!token || expectedGeneration !== this.generation) return this.snapshot();
      await this.loadAccessContext(expectedGeneration);
      if (expectedGeneration !== this.generation) return this.snapshot();
      this.state.status = this.isAccountActive ? 'authenticated' : 'disabled';
      this.state.error = this.isAccountActive ? null : 'This account has been disabled.';
      this.emit();
      return this.snapshot();
    })().finally(() => { this.accessContextPromise = null; });
    return this.accessContextPromise;
  }

  async reloadAccessContext() {
    if (!this.state.user || !this.state.session) throw new Error('No authenticated session is available.');
    await this.loadAccessContext();
    this.state.status = this.isAccountActive ? 'authenticated' : 'disabled';
    this.emit();
    return this.snapshot();
  }

  async updateProfile({ displayName }: {displayName:string}) {
    if (!this.isAuthenticated) throw new Error('Sign in before updating your profile.');
    const name = cleanName(displayName);
    if (name.length < 2) throw new Error('Display name must contain at least 2 characters.');
    const token = await this.ensureAccessToken();
    if (!token) throw new Error('Your session expired. Sign in again.');
    const rows = await this.request<unknown[]>('/rest/v1/rpc/update_own_profile', {
      method: 'POST',
      headers: this.headers(token, { Prefer: 'return=representation' }),
      body: JSON.stringify({ p_display_name: name }),
    });
    if (Array.isArray(rows) && rows[0] != null) this.state.profile = parseProfile(rows[0]);
    else await this.loadAccessContext();
    this.publishIdentityContext();
    this.emit();
    return this.snapshot();
  }

  async updatePassword({ password }: {password:string}): Promise<boolean> {
    if (!this.isAuthenticated) throw new Error('Sign in before changing your password.');
    if (typeof password !== 'string' || password.length < 10) throw new Error('Use a password with at least 10 characters.');
    const token = await this.ensureAccessToken();
    if (!token) throw new Error('Your session expired. Sign in again.');
    await this.request('/auth/v1/user', {
      method: 'PUT',
      headers: this.headers(token),
      body: JSON.stringify({ password }),
    });
    return true;
  }

  async signOut({ scope = 'local', broadcast = true }: {scope?: 'local'|'global';broadcast?: boolean} = {}): Promise<void> {
    const token = this.state.session?.access_token;
    this.clearRuntimeIdentity();
    this.state.initialized = true;
    this.state.status = 'anonymous';
    this.emit();
    if (broadcast) this.broadcast('signed-out');
    if (!token || !this.isConfigured) return;
    try {
      await this.request(`/auth/v1/logout?scope=${encodeURIComponent(scope === 'global' ? 'global' : 'local')}`, {
        method: 'POST', headers: this.headers(token),
      });
    } catch (error) {
      console.warn('[Work Management] Remote sign-out failed after local session termination', error);
    }
  }

  identityContext(): IdentityContext | null {
    if (!this.state.user || !this.state.profile) return null;
    const modules: Record<string,{role:string|null;enabled:boolean}> = {};
    for (const [moduleId] of Object.entries(MODULE_ROLES)) {
      const assignment = this.assignments.find((item) => item.module_id === moduleId);
      modules[moduleId] = {
        role: this.isPlatformAdmin ? this.platformAdminModuleRole(moduleId) : (assignment?.role || null),
        enabled: this.isPlatformAdmin ? true : Boolean(assignment?.enabled),
      };
    }
    return {
      version: 1,
      user: {
        id: this.state.user.id,
        email: this.state.user.email || this.state.profile.email || '',
        displayName: this.state.profile.display_name || this.state.user.email || 'User',
      },
      platformRole: this.platformRole,
      accountStatus: this.state.profile.status,
      modules,
      updatedAt: new Date().toISOString(),
    };
  }

  platformAdminModuleRole(moduleId: string): string { return resolvePlatformAdminModuleRole(moduleId); }

  publishIdentityContext(): IdentityContext | null {
    const context = this.identityContext();
    writeIdentityContext(context);
    return context;
  }

  moduleIdentityContext(moduleId: string): EmbeddedModuleIdentityContext | null {
    if (!isPlatformModuleId(moduleId)) return null;
    const identity = this.identityContext();
    if (!identity) return null;
    return {
      type: 'wm:identity-context',
      version: 1,
      moduleId,
      user: identity.user,
      platformRole: identity.platformRole,
      accountStatus: identity.accountStatus,
      module: identity.modules[moduleId] || { role: null, enabled: false },
      updatedAt: identity.updatedAt,
    };
  }

  canAccessModule(moduleId: string): boolean {
    return canAccessModuleByPolicy({ authenticated:this.isAuthenticated, accountActive:this.isAccountActive, platformRole:this.platformRole, assignments:this.assignments, moduleId });
  }


  async listUsers() {
    if (!this.canManageUsers) throw new Error('Administrator access is required.');
    const token = await this.ensureAccessToken();
    if (!token) throw new Error('Your session expired. Sign in again.');
    const rows = await this.request<unknown[]>('/rest/v1/rpc/list_user_directory', {
      method: 'POST', headers: this.headers(token), body: '{}',
    });
    return Array.isArray(rows) ? rows : [];
  }

  async updateUserAccess({ userId, platformRole, status }: {userId:string;platformRole:PlatformRole;status:'active'|'disabled'}) {
    if (!this.canManageUsers) throw new Error('Administrator access is required.');
    if (!userId) throw new Error('A user account is required.');
    if (!PLATFORM_ROLES.includes(platformRole)) throw new Error('Select a supported Work Management role.');
    if (!['active','disabled'].includes(status)) throw new Error('Select a valid account status.');
    const token = await this.ensureAccessToken();
    if (!token) throw new Error('Your session expired. Sign in again.');
    const rows = await this.request<unknown[]>('/rest/v1/rpc/admin_set_user_access', {
      method: 'POST', headers: this.headers(token, { Prefer: 'return=representation' }),
      body: JSON.stringify({ p_user_id: userId, p_platform_role: platformRole, p_status: status }),
    });
    if (userId === this.user?.id) await this.reloadAccessContext();
    return Array.isArray(rows) ? rows[0] || null : null;
  }

  roleLabel(role: PlatformRole = this.platformRole): string { return PLATFORM_ROLE_LABELS[role] || 'Employee'; }
  supportedPlatformRoles() { return PLATFORM_ROLES.map((value) => ({ value, label: PLATFORM_ROLE_LABELS[value] })); }

  moduleRole(moduleId: string): string {
    if (!this.isAuthenticated) return 'No access';
    if (this.isPlatformAdmin) return this.platformAdminModuleRole(moduleId);
    return this.assignments.find((item) => item.module_id === moduleId)?.role || 'No access';
  }

  allowedRoles(moduleId: string): string[] { return [...(MODULE_ROLES[moduleId] || ['User'])]; }

  async handleChannelMessage(message: ChannelMessage): Promise<void> {
    if (!message?.type) return;
    if (message.type === 'signed-out') {
      this.clearRuntimeIdentity();
      this.state.initialized = true;
      this.emit();
      return;
    }
    if (message.type === 'session-updated') await this.init({ forceStorage: true });
  }

  async diagnostics() {
    const checks = [];
    const backend = this.backend;
    checks.push({ id:'backend-config', label:'Cloud backend configuration', ok:backend.configured, detail:backend.configured ? 'Supabase public client configuration is valid' : 'Account-based mode requires a valid Supabase URL and publishable key' });
    if (!backend.configured) return { checkedAt:new Date().toISOString(), checks, passed:false };
    try {
      const response = await fetch(`${backend.supabaseUrl}/auth/v1/health`, { headers:{ apikey:backend.publishableKey }, cache:'no-store' });
      checks.push({ id:'auth-health', label:'Supabase Auth endpoint', ok:response.ok, detail:`HTTP ${response.status}` });
    } catch {
      checks.push({ id:'auth-health', label:'Supabase Auth endpoint', ok:false, detail:'Network request failed' });
    }
    checks.push({ id:'session', label:'Authentication session', ok:this.isAuthenticated, detail:this.isAuthenticated ? `Signed in as ${this.user?.email || 'user'}` : 'No authenticated session' });
    if (this.hasSession) {
      checks.push({ id:'session-expiry', label:'Session expiration', ok:Number(this.state.session?.expires_at || 0) > Date.now(), detail:this.state.session?.expires_at ? `Expires ${new Date(this.state.session.expires_at).toLocaleString()}` : 'Expiration unavailable' });
    }
    if (this.state.user) {
      checks.push({ id:'profile', label:'Cloud profile', ok:Boolean(this.profile) && this.isAccountActive, detail:this.profile ? `${this.profile.platform_role} · ${this.profile.status}` : 'Profile row is missing' });
      checks.push({ id:'email-verification', label:'Email verification', ok:isEmailConfirmed(this.state.user), detail:isEmailConfirmed(this.state.user) ? 'Supabase Auth reports this email as confirmed' : 'Email confirmation is still pending' });
      checks.push({ id:'roles', label:'Module role mapping', ok:this.isPlatformAdmin || this.assignments.length > 0, detail:this.isPlatformAdmin ? 'Platform Admin has mapped administrative module roles' : `${this.assignments.filter((x)=>x.enabled).length} enabled module assignment(s)` });
    }
    return { checkedAt:new Date().toISOString(), checks, passed:checks.every((x)=>x.ok) };
  }
}

export const auth = new AuthManager();
export { SESSION_KEY as AUTH_SESSION_STORAGE_KEY, IDENTITY_KEY as AUTH_IDENTITY_STORAGE_KEY, AUTH_EVENT };
