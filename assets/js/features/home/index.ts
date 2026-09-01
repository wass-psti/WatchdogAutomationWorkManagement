import { modules } from '../../../../config/modules.ts';
import type { WorkManagementModuleDefinition } from '../../../../src/types/modules.ts';
import type { EscapeHtml, IconSet, InstallPrompt, Navigate, TopbarRenderer, TransitionUpdate, WorkspaceRenderer } from '../../../../src/platform/contracts/ui.ts';
import type { PlatformPreferences } from '../../core/platform.ts';
import {
  getPreferences,
  markRecent,
  toggleFavorite,
  safeModuleStatus,
  readTimeTrackerSnapshot,
  readFuelTrackSnapshot,
  readTradeLinkSnapshot,
} from '../../core/platform.ts';

export interface HomeFeatureAuthPort {
  canAccessModule(moduleId: string): boolean;
  moduleRole(moduleId: string): string;
}

export interface HomeFeatureOptions {
  readonly auth: HomeFeatureAuthPort;
  readonly renderWorkspace: WorkspaceRenderer;
  readonly topbar: TopbarRenderer;
  readonly icons: IconSet;
  readonly escapeHtml: EscapeHtml;
  readonly transitionUpdate: TransitionUpdate;
  readonly navigate: Navigate;
  readonly getInstallPrompt?: () => InstallPrompt | null;
  readonly consumeInstallPrompt?: () => void;
}

interface ModuleSnapshot {
  readonly records: number;
  readonly active: unknown;
}

/** Home/Application Launcher feature. */
export function createHomeFeature({
  auth,
  renderWorkspace,
  topbar,
  icons,
  escapeHtml,
  transitionUpdate,
  navigate,
  getInstallPrompt = () => null,
  consumeInstallPrompt = () => {},
}: HomeFeatureOptions) {
  const esc = escapeHtml;
  let preferences: PlatformPreferences = getPreferences();
  let filter = '';
  let favoritesOnly = false;

  const moduleById = (id: string | undefined): WorkManagementModuleDefinition | null => modules.find((module) => module.id === id) || null;
  const moduleIcon = (mod: WorkManagementModuleDefinition | null | undefined): string => mod?.icon === 'fuel' ? icons.fuel : mod?.icon === 'trade' ? icons.trade : icons.clock;
  const moduleSnapshot = (mod: WorkManagementModuleDefinition): ModuleSnapshot => {
    if (mod.id === 'time-tracker') return readTimeTrackerSnapshot();
    if (mod.id === 'fueltrack-plus') return readFuelTrackSnapshot();
    if (mod.id === 'tradelink') return readTradeLinkSnapshot();
    return { records: 0, active: null };
  };
  const activityText = (mod: WorkManagementModuleDefinition): string => `${auth.moduleRole(mod.id)} · cloud-backed workspace`;

  function moduleCard(mod: WorkManagementModuleDefinition): string {
    const status = safeModuleStatus(mod);
    const snap = moduleSnapshot(mod);
    const favorite = preferences.favorites.includes(mod.id);
    const allowed = auth.canAccessModule(mod.id);
    return `<article class="module-card ${allowed ? '' : 'module-locked'}" data-module-id="${esc(mod.id)}" ${allowed ? `tabindex="0" data-open-module="${esc(mod.id)}" aria-label="Open ${esc(mod.name)}"` : `aria-disabled="true" aria-label="${esc(mod.name)} access restricted"`}>
      <div class="module-card-head"><div class="module-icon ${esc(mod.accent)}">${moduleIcon(mod)}</div><div class="card-head-actions"><button class="favorite-btn ${favorite ? 'selected' : ''}" data-favorite="${esc(mod.id)}" aria-label="${favorite ? 'Remove from' : 'Add to'} favorites" aria-pressed="${favorite}">${icons.star}</button><span class="status ${allowed ? status.tone : 'muted'}"><i></i>${allowed ? esc(status.label) : 'Restricted'}</span></div></div>
      <div class="module-card-body"><span class="module-eyebrow">${esc(mod.eyebrow)}</span><h2>${esc(mod.name)}</h2><p>${esc(mod.description)}</p></div>
      <div class="capabilities">${mod.capabilities.slice(0, 4).map((capability) => `<span>${esc(capability)}</span>`).join('')}</div>
      <div class="module-card-foot"><span>${allowed ? `<i class="activity-dot ${snap.active ? 'live' : ''}"></i>${esc(activityText(mod))}` : `${icons.lock}<span>${esc(auth.moduleRole(mod.id))}</span>`}</span><span class="card-arrow" aria-hidden="true">${allowed ? icons.arrow : icons.lock}</span></div>
    </article>`;
  }

  function recentSection(): string {
    const recent = preferences.recent
      .map((entry) => ({ ...entry, mod: moduleById(entry.id) }))
      .filter((entry): entry is typeof entry & { readonly mod: WorkManagementModuleDefinition } => entry.mod !== null)
      .slice(0, 4);
    if (!recent.length) return '';
    return `<section class="recent-strip" aria-label="Recently opened"><div><span>RECENT</span><strong>Pick up where you left off</strong></div><div class="recent-list">${recent.map(({ mod, openedAt }) => `<button data-open-module="${esc(mod.id)}"><span class="recent-icon ${esc(mod.accent)}">${moduleIcon(mod)}</span><span><strong>${esc(mod.name)}</strong><small>${new Date(openedAt).toLocaleString()}</small></span>${icons.arrow}</button>`).join('')}</div></section>`;
  }

  function filteredModules(): readonly WorkManagementModuleDefinition[] {
    const q = filter.trim().toLowerCase();
    return modules.filter((mod) => (!favoritesOnly || preferences.favorites.includes(mod.id)) && (!q || `${mod.name} ${mod.eyebrow} ${mod.description} ${mod.capabilities.join(' ')}`.toLowerCase().includes(q)));
  }

  function render(): void {
    const active = modules.filter((module) => module.status === 'active');
    const filtered = filteredModules();
    const liveModules = active.filter((module) => moduleSnapshot(module).active).length;
    const installPrompt = getInstallPrompt();
    const content = `${topbar('Applications', 'One workspace for focused, independently maintained operational tools.', installPrompt ? '<button class="secondary-btn install-btn" data-install>Install app</button>' : '')}
      <main id="main" class="page home-page">
        <section class="hero-panel"><div><span class="hero-kicker">Unified operations</span><h2>Your work systems,<br><em>without the sprawl.</em></h2><p>Launch operational applications from a single responsive workspace. Each module remains isolated, recoverable, and independently maintainable.</p></div><div class="hero-stats"><div><strong>${active.length}</strong><span>Available app${active.length === 1 ? '' : 's'}</span></div><div><strong>${liveModules}</strong><span>Live session${liveModules === 1 ? '' : 's'}</span></div><div><strong>${navigator.onLine ? 'Online' : 'Offline'}</strong><span>Workspace state</span></div></div></section>
        ${recentSection()}
        <section class="section-block"><div class="section-title"><div><span>WORKSPACE</span><h3>Applications</h3></div><p>Modules are independently maintained while sharing one resilient platform shell.</p></div>
        <div class="app-toolbar"><label class="app-search">${icons.search}<input id="appSearch" value="${esc(filter)}" placeholder="Search applications or capabilities" autocomplete="off"></label><button class="filter-chip ${favoritesOnly ? 'selected' : ''}" data-toggle-favorites aria-pressed="${favoritesOnly}">${icons.star}<span>Favorites</span></button><span class="result-count">${filtered.length} of ${modules.length}</span></div>
        ${filtered.length ? `<div class="module-grid">${filtered.map(moduleCard).join('')}</div><div id="dynamicSearchEmpty" class="empty compact-empty" hidden><strong>0</strong><h2>No applications match</h2><p>Clear the search or favorites filter.</p><button class="secondary-btn" data-clear-filter>Clear filters</button></div>` : '<div class="empty compact-empty"><strong>0</strong><h2>No applications match</h2><p>Clear the search or favorites filter.</p><button class="secondary-btn" data-clear-filter>Clear filters</button></div>'}</section>
        <section class="architecture-strip"><div><span>MODULAR BY DESIGN</span><strong>Shared shell. Isolated domains.</strong></div><p>Navigation, accessibility, recovery, preferences and presentation remain consistent while each application keeps its own runtime and business rules.</p></section>
      </main>`;
    renderWorkspace(content, 'home', 'home');
  }

  async function handleAction(action: Element): Promise<boolean> {
    if (!(action instanceof HTMLElement)) return false;
    if (action.matches('button[data-favorite]')) {
      preferences = toggleFavorite(preferences, action.dataset.favorite ?? '');
      transitionUpdate(render, 'state');
      return true;
    }
    if (action.matches('button[data-toggle-favorites]')) {
      favoritesOnly = !favoritesOnly;
      transitionUpdate(render, 'state');
      return true;
    }
    if (action.matches('button[data-clear-filter]')) {
      filter = '';
      favoritesOnly = false;
      transitionUpdate(render, 'state');
      return true;
    }
    if (action.matches('button[data-install]')) {
      const prompt = getInstallPrompt();
      if (!prompt) return true;
      await prompt.prompt?.();
      await prompt.userChoice;
      consumeInstallPrompt();
      render();
      return true;
    }
    return false;
  }

  function handleInput(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLInputElement) || target.id !== 'appSearch') return false;
    filter = target.value;
    const q = filter.trim().toLowerCase();
    document.querySelectorAll<HTMLElement>('.module-card').forEach((card) => {
      const mod = moduleById(card.dataset.moduleId || card.dataset.openModule);
      if (!mod) return;
      card.hidden = Boolean(q && !`${mod.name} ${mod.eyebrow} ${mod.description} ${mod.capabilities.join(' ')}`.toLowerCase().includes(q));
    });
    const shown = [...document.querySelectorAll<HTMLElement>('.module-card')].filter((card) => !card.hidden).length;
    const counter = document.querySelector<HTMLElement>('.result-count');
    if (counter) counter.textContent = `${shown} of ${modules.length}`;
    const empty = document.querySelector<HTMLElement>('#dynamicSearchEmpty');
    if (empty) empty.hidden = shown !== 0;
    return true;
  }

  function handleKeydown(event: KeyboardEvent): boolean {
    if (!(event.target instanceof Element)) return false;
    const card = event.target.closest<HTMLElement>('[data-open-module]');
    const nested = event.target.closest('button,a,input,select,textarea');
    if (!card || nested || (event.key !== 'Enter' && event.key !== ' ')) return false;
    event.preventDefault();
    navigate(`app/${card.dataset.openModule ?? ''}`);
    return true;
  }

  function recordRecent(moduleId: string): PlatformPreferences {
    preferences = markRecent(preferences, moduleId);
    return preferences;
  }

  function syncPreferences(next: PlatformPreferences = getPreferences()): PlatformPreferences {
    preferences = next;
    return preferences;
  }

  function resetFilters(): void { filter = ''; favoritesOnly = false; }
  function activate(): void { syncPreferences(); }
  function deactivate(): void {}

  return Object.freeze({ render, handleAction, handleInput, handleKeydown, recordRecent, syncPreferences, resetFilters, activate, deactivate, moduleIcon });
}

export const HOME_FEATURE = Object.freeze({ id: 'home', routes: Object.freeze(['home']), architecture: 'controller-state-view' });
