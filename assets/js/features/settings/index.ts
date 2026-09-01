import type { ApplicationRoute } from '../../../../src/platform/contracts/routing.ts';
import type { EscapeHtml, IconSet, ToastRenderer, TopbarRenderer, WorkspaceRenderer } from '../../../../src/platform/contracts/ui.ts';
import type { WorkManagementModuleDefinition } from '../../../../src/types/modules.ts';
import type { DiagnosticResult, PlatformPreferences, StorageHealth, ThemePreference } from '../../core/platform.ts';

interface SettingsAuthPort {
  readonly isCloudEnabled: boolean;
  readonly isConfigured: boolean;
  readonly isAuthenticated: boolean;
  readonly user?: Readonly<{ readonly email?: string | null }> | null;
  diagnostics(): Promise<DiagnosticResult>;
}

interface SettingsFeatureOptions {
  readonly auth: SettingsAuthPort;
  readonly modules: readonly WorkManagementModuleDefinition[];
  readonly topbar: TopbarRenderer;
  readonly renderWorkspace: WorkspaceRenderer;
  readonly toast: ToastRenderer;
  readonly icons: IconSet;
  readonly escapeHtml: EscapeHtml;
  readonly currentRoute?: (() => ApplicationRoute) | null;
  readonly onPreferencesChanged?: (preferences: PlatformPreferences, meta: Readonly<{ reason: string }>) => void;
  readonly resetLauncherFilters?: () => void;
}

interface SettingsState {
  health: StorageHealth | null;
  diagnostics: DiagnosticResult | null;
  compatibility: DiagnosticResult | null;
  busy: Set<string>;
}

const errorMessage = (error: unknown, fallback: string): string => error instanceof Error ? error.message : fallback;

import {
  DEFAULT_PREFERENCES,
  applyTheme,
  applyDensity,
  getPreferences,
  savePreferences,
  getStorageHealth,
  requestPersistentStorage,
  runPlatformDiagnostics,
  verifyModuleCompatibility,
} from '../../core/platform.ts';
import { downloadWorkspaceBackup, parseBackupFile, restoreWorkspaceBackup } from '../../core/backup.ts';
import { applicationManifest } from '../../../../config/application-manifest.ts';
import { formatBytes } from '../../ui/format.ts';

/**
 * Platform Settings feature controller.
 *
 * Owns diagnostics, storage-health state, backup/restore interactions, density
 * and theme mutations. The shell only receives preference-change notifications
 * so launcher presentation stays synchronized without owning Settings state.
 */
export function createSettingsFeature({
  auth,
  modules,
  topbar,
  renderWorkspace,
  toast,
  icons,
  escapeHtml,
  currentRoute,
  onPreferencesChanged = () => {},
  resetLauncherFilters = () => {},
}: SettingsFeatureOptions) {
  const esc = escapeHtml;
  const fmtBytes = formatBytes;
  const state: SettingsState = {
    health: null,
    diagnostics: null,
    compatibility: null,
    busy: new Set<string>(),
  };
  let active = false;
  let epoch = 0;
  let backupInput: HTMLInputElement | null = null;

  const onRoute = () => currentRoute?.()?.name === 'settings';
  const isCurrent = (ticket: number): boolean => ticket === epoch;

  function preferences(): PlatformPreferences { return getPreferences(); }

  function notifyPreferences(next: PlatformPreferences, reason: string): void {
    onPreferencesChanged(next, { reason });
  }

  function cloneDefaults(): PlatformPreferences {
    return {
      theme: DEFAULT_PREFERENCES.theme,
      compact: DEFAULT_PREFERENCES.compact,
      favorites: [...DEFAULT_PREFERENCES.favorites],
      recent: [],
    };
  }

  function resultList(result: DiagnosticResult | null): string {
    if (!result?.checks?.length) return '';
    return `<div class="diagnostic-list">${result.checks.map((check) => `<span class="diagnostic-item ${check.ok ? 'pass' : 'fail'}"><i></i><b>${esc(check.label)}</b><small>${esc(check.detail)}</small></span>`).join('')}</div><small>Last checked ${new Date(result.checkedAt).toLocaleString()}</small>`;
  }

  function button(action: string, label: string, extra = ''): string {
    const busy = state.busy.has(action);
    return `<button type="button" class="secondary-btn" data-setting-action="${esc(action)}" ${busy ? 'disabled aria-busy="true"' : ''}>${extra}${busy ? 'Working…' : esc(label)}</button>`;
  }

  function setActionBusy(action: string, busy: boolean): void {
    for (const node of document.querySelectorAll<HTMLButtonElement>('[data-setting-action]')) {
      if (node.dataset.settingAction !== action) continue;
      node.disabled = busy;
      node.setAttribute('aria-busy', busy ? 'true' : 'false');
      if (busy) {
        if (!node.dataset.idleHtml) node.dataset.idleHtml = node.innerHTML;
        node.innerHTML = '<span class="button-spinner" aria-hidden="true"></span>Working…';
      } else if (node.dataset.idleHtml) {
        node.innerHTML = node.dataset.idleHtml;
        delete node.dataset.idleHtml;
      }
    }
  }

  async function refreshHealth({ rerender = false }: Readonly<{ rerender?: boolean }> = {}): Promise<StorageHealth | null> {
    const ticket = epoch;
    try {
      const value = await getStorageHealth();
      if (!isCurrent(ticket)) return value;
      state.health = value;
      if (rerender && active && onRoute() && isCurrent(ticket)) render('update');
      return value;
    } catch (error) {
      console.warn('[Work Management] Storage-health query failed', error);
      return null;
    }
  }

  function ensureBackupInput(): HTMLInputElement {
    if (backupInput?.isConnected) return backupInput;
    backupInput = document.querySelector<HTMLInputElement>('#wmBackupFileInput');
    if (backupInput) return backupInput;
    backupInput = document.createElement('input');
    backupInput.id = 'wmBackupFileInput';
    backupInput.type = 'file';
    backupInput.accept = 'application/json,.json';
    backupInput.hidden = true;
    backupInput.setAttribute('aria-hidden', 'true');
    document.body.appendChild(backupInput);
    backupInput.addEventListener('change', handleBackupSelection);
    return backupInput;
  }

  async function handleBackupSelection(event: Event): Promise<void> {
    const input = event.currentTarget instanceof HTMLInputElement ? event.currentTarget : null;
    if (!input) return;
    const file = input.files?.[0];
    if (!file) return;
    if (state.busy.has('import-backup')) { input.value = ''; return; }
    const ticket = epoch;
    state.busy.add('import-backup');
    setActionBusy('import-backup', true);
    try {
      const payload = await parseBackupFile(file, modules);
      const when = payload.createdAt ? new Date(payload.createdAt).toLocaleString() : 'unknown time';
      const rejectedNote = payload.rejectedCount ? ` ${payload.rejectedCount} unsupported or invalid entr${payload.rejectedCount === 1 ? 'y was' : 'ies were'} excluded.` : '';
      if (!confirm(`Restore ${payload.entryCount || Object.keys(payload.data).length} validated data entries from backup created ${when}? Current matching data will be overwritten.${rejectedNote}`)) return;
      const result = await restoreWorkspaceBackup(payload);
      const next = getPreferences();
      applyTheme(next.theme);
      applyDensity(next.compact);
      notifyPreferences(next, 'backup-restore');
      toast(`Restored ${result.restored} data entr${result.restored === 1 ? 'y' : 'ies'}. Reloading…`);
      window.setTimeout(() => location.reload(), 900);
    } catch (error) {
      console.error('[Work Management] Backup restore failed', error);
      toast(errorMessage(error, 'Backup restore failed.'), 'warning');
    } finally {
      input.value = '';
      state.busy.delete('import-backup');
      setActionBusy('import-backup', false);
      if (active && isCurrent(ticket) && onRoute()) render('update');
    }
  }

  async function verifyModules(): Promise<DiagnosticResult> {
    const results = await Promise.all(modules.filter((mod) => mod.status === 'active').map((mod) => verifyModuleCompatibility(mod)));
    return {
      checkedAt: new Date().toISOString(),
      checks: results.flatMap((result) => result.checks.map((check) => ({ ...check, label: `${result.moduleName}: ${check.label}` }))),
      passed: results.every((result) => result.passed),
    };
  }

  async function handleAction(action: Element | null): Promise<boolean> {
    if (!action) return false;
    if (action instanceof HTMLElement && action.matches('button[data-theme]')) {
      const theme = action.dataset.theme as ThemePreference | undefined;
      if (!theme || !['system','light','dark'].includes(theme)) return true;
      const next: PlatformPreferences = { ...preferences(), theme };
      if (!savePreferences(next)) {
        toast('Theme preference could not be saved.', 'warning');
        return true;
      }
      applyTheme(next.theme);
      notifyPreferences(getPreferences(), 'theme');
      if (active && onRoute()) render('update');
      return true;
    }

    if (!(action instanceof HTMLElement) || !action.matches('button[data-setting-action]')) return false;
    const kind = action.dataset.settingAction;
    if (!kind || state.busy.has(kind)) return true;

    // File selection must occur synchronously within the user activation.
    if (kind === 'import-backup') {
      const input = ensureBackupInput();
      input.value = '';
      input.click();
      return true;
    }

    const ticket = epoch;
    state.busy.add(kind);
    setActionBusy(kind, true);
    try {
      if (kind === 'density') {
        const current = preferences();
        const next = { ...current, compact: !current.compact };
        if (!savePreferences(next)) throw new Error('Workspace spacing could not be saved because shell preference storage is unavailable.');
        const saved = getPreferences();
        applyDensity(saved.compact);
        notifyPreferences(saved, 'density');
        toast(`Workspace spacing changed to ${saved.compact ? 'Compact' : 'Comfortable'}.`);
      } else if (kind === 'compatibility') {
        state.compatibility = await verifyModules();
        toast(state.compatibility.passed ? 'Application compatibility verification passed.' : 'Application compatibility verification found an issue.', state.compatibility.passed ? 'success' : 'warning');
      } else if (kind === 'persist') {
        const result = await requestPersistentStorage();
        state.health = await getStorageHealth();
        if (!result.supported) toast('This browser does not expose the Persistent Storage API. This affects shell preferences only; application records use authenticated cloud persistence.', 'warning');
        else if (result.granted) toast(result.already ? 'Persistent storage was already granted.' : 'Persistent storage granted.');
        else toast(result.reason === 'error' ? 'The persistent-storage request failed. Browser storage remains available under normal policy.' : 'The browser declined persistent storage for shell preferences. Application records continue to use authenticated cloud persistence.', 'warning');
      } else if (kind === 'refresh-storage') {
        state.health = await getStorageHealth();
        toast('Browser storage status refreshed.');
      } else if (kind === 'diagnostics') {
        const platform = await runPlatformDiagnostics(modules, applicationManifest);
        const authDiagnostics = await auth.diagnostics();
        state.diagnostics = {
          checkedAt: platform.checkedAt,
          checks: [...platform.checks, ...authDiagnostics.checks],
          passed: platform.passed && authDiagnostics.passed,
        };
        state.health = await getStorageHealth();
        toast(state.diagnostics.passed ? 'Platform verification passed.' : 'Platform verification found an issue requiring attention.', state.diagnostics.passed ? 'success' : 'warning');
      } else if (kind === 'export-backup') {
        const count = await downloadWorkspaceBackup(modules);
        toast(`Backup exported with ${count} data entr${count === 1 ? 'y' : 'ies'}.`);
      } else if (kind === 'reset-platform') {
        if (!confirm('Reset Work Management shell preferences? Registered application data will not be deleted.')) return true;
        const defaults = cloneDefaults();
        if (!savePreferences(defaults)) throw new Error('Shell preferences could not be reset because shell preference storage is unavailable.');
        const saved = getPreferences();
        resetLauncherFilters();
        applyTheme(saved.theme);
        applyDensity(saved.compact);
        notifyPreferences(saved, 'reset');
        toast('Shell preferences reset to defaults. Registered application data was preserved.');
      } else {
        throw new Error(`Unknown Settings action: ${kind}`);
      }
    } catch (error) {
      console.error('[Work Management] Settings action failed', kind, error);
      toast(errorMessage(error, 'The requested setting could not be completed.'), 'warning');
    } finally {
      state.busy.delete(kind);
      setActionBusy(kind, false);
      if (active && isCurrent(ticket) && onRoute()) render('update');
    }
    return true;
  }

  function render(motionMode = 'settings'): void {
    active = true;
    const prefs = preferences();
    const themes: readonly ThemePreference[] = ['system', 'light', 'dark'];
    const health = state.health;
    const usagePct = health?.quota && health?.usage != null ? Math.min(100, (health.usage / health.quota) * 100) : null;
    const storageCopy = !health
      ? 'Checking storage capabilities…'
      : `${health.available ? 'Shell preference storage is writable.' : 'Shell preference storage is unavailable or blocked.'} ${health.persistent ? 'Persistent storage is granted.' : health.persistenceSupported ? 'Persistent storage has not been granted.' : 'This browser does not expose persistent-storage controls.'}`;
    const persistenceControl = !health
      ? button('refresh-storage', 'Refresh status')
      : health.persistent
        ? `<div class="settings-actions"><span class="status success"><i></i>Persistent</span>${button('refresh-storage', 'Refresh status')}</div>`
        : `<div class="settings-actions">${health.persistenceSupported ? button('persist', 'Request persistence') : ''}${button('refresh-storage', 'Refresh status')}</div>`;
    const content = `${topbar('Settings', 'Platform-level controls, recovery, storage health, and appearance.')}
      <main id="main" class="page settings-page">
        <section class="settings-card">
          <div class="settings-row"><div><span>APPEARANCE</span><h2>Interface theme</h2><p>Use your operating-system preference or keep Work Management in a fixed theme.</p></div><div class="theme-options">${themes.map((theme) => `<button type="button" class="theme-chip ${prefs.theme === theme ? 'selected' : ''}" data-theme="${theme}" aria-pressed="${prefs.theme === theme}">${theme.charAt(0).toUpperCase() + theme.slice(1)}</button>`).join('')}</div></div>
          <div class="settings-row"><div><span>DENSITY</span><h2>Workspace spacing</h2><p>Compact mode reduces shell card, page, and settings spacing while leaving isolated application interfaces unchanged.</p><small>Current mode: ${prefs.compact ? 'Compact' : 'Comfortable'} · saved to this browser</small></div>${button('density', prefs.compact ? 'Compact' : 'Comfortable', `<span class="density-switch ${prefs.compact ? 'on' : ''}"><i></i></span>`)}</div>
          <div class="settings-row"><div><span>MODULE ISOLATION</span><h2>Application compatibility</h2><p>Validate every registered application runtime, storage contract, and safe local-data access without modifying module data.</p>${resultList(state.compatibility)}</div><div class="settings-actions"><span class="status ${state.compatibility ? (state.compatibility.passed ? 'success' : 'warning') : 'success'}"><i></i>${state.compatibility ? (state.compatibility.passed ? 'Verified' : 'Attention') : 'Protected'}</span>${button('compatibility', state.compatibility ? 'Verify again' : 'Verify applications')}</div></div>
        </section>
        <section class="settings-card settings-secondary">
          <div class="settings-row"><div><span>STORAGE HEALTH</span><h2>Shell preference persistence</h2><p>${storageCopy}</p>${usagePct != null && health ? `<div class="storage-meter"><span style="width:${usagePct.toFixed(2)}%"></span></div><small>${fmtBytes(health.usage)} used of approximately ${fmtBytes(health.quota)}</small>` : '<small>Storage quota information is not available from this browser.</small>'}</div>${persistenceControl}</div>
          <div class="settings-row"><div><span>CLOUD & IDENTITY</span><h2>Authentication backend</h2><p>${auth.isCloudEnabled ? (auth.isConfigured ? (auth.isAuthenticated ? `Connected to Supabase as ${esc(auth.user?.email || 'authenticated user')}. Shell authorization is enforced by cloud role mappings.` : 'Supabase is configured. Sign in to activate cloud identity and module authorization.') : 'Cloud mode is enabled but the public Supabase URL or publishable key is missing.') : 'Local-only mode is active. Configure Supabase to enable login, registration, sessions, cloud profiles and module role mapping.'}</p><small>Server secrets are never stored in the GitHub Pages client. Workspace backups explicitly exclude authentication session tokens.</small></div><div class="settings-actions"><span class="status ${!auth.isConfigured ? 'warning' : 'success'}"><i></i>${auth.isConfigured ? 'Configured' : 'Setup required'}</span><button type="button" class="secondary-btn" data-account>${auth.isAuthenticated ? 'Open account' : 'Sign in'}</button></div></div>
          <div class="settings-row diagnostics-row"><div><span>SYSTEM DIAGNOSTICS</span><h2>Platform verification</h2><p>Run non-destructive checks for shell preferences, authenticated cloud configuration, module registry correctness, and active application runtime availability.</p>${resultList(state.diagnostics)}</div>${button('diagnostics', state.diagnostics ? 'Run again' : 'Run diagnostics')}</div>
          <div class="settings-row"><div><span>BACKUP & RECOVERY</span><h2>Workspace backup</h2><p>Export Work Management plus all registered application data to JSON. Restore validates format, size, registered keys, and serialized values before writing, with rollback on write failure.</p></div><div class="settings-actions">${button('export-backup', 'Export backup', icons.download)}${button('import-backup', 'Restore backup', icons.upload)}</div></div>
          <div class="settings-row danger-row"><div><span>PLATFORM RESET</span><h2>Reset shell preferences</h2><p>Reset Work Management theme, spacing, favorites, recent application history, and launcher filters only. Registered application data is explicitly excluded.</p></div>${button('reset-platform', 'Reset preferences')}</div>
        </section>
      </main>`;
    renderWorkspace(content, 'settings', motionMode);
    if (!state.health) refreshHealth({ rerender: true });
  }

  function activate(): void {
    active = true;
    if (!state.health) refreshHealth({ rerender: true });
  }

  function deactivate(): void {
    active = false;
    epoch += 1;
  }

  return Object.freeze({
    render,
    handleAction,
    activate,
    deactivate,
    refreshHealth,
    snapshot: () => Object.freeze({
      health: state.health ? { ...state.health } : null,
      diagnosticsPassed: state.diagnostics?.passed ?? null,
      compatibilityPassed: state.compatibility?.passed ?? null,
      busy: Object.freeze([...state.busy]),
    }),
  });
}

export const SETTINGS_FEATURE = Object.freeze({
  id: 'settings',
  owns: Object.freeze(['settings']),
  persistence: 'browser-local-preferences',
  architecture: 'controller-view-state',
});
