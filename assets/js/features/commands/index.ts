import { modules } from '../../../../config/modules.ts';
import type { ApplicationCommand, CommandPaletteContext } from '../../../../src/platform/contracts/commands.ts';
import type { EscapeHtml, IconSet, Navigate, ToastRenderer } from '../../../../src/platform/contracts/ui.ts';
import { downloadWorkspaceBackup } from '../../core/backup.ts';
import { createCommandRegistry } from './command-registry.ts';

export interface CommandPaletteAuthPort {
  readonly isAuthenticated: boolean;
  readonly canManageUsers: boolean;
  readonly isCloudEnabled: boolean;
  canAccessModule(moduleId: string): boolean;
}

export interface CommandPaletteFeatureOptions {
  readonly auth: CommandPaletteAuthPort;
  readonly navigate: Navigate;
  readonly icons: IconSet;
  readonly escapeHtml: EscapeHtml;
  readonly toast: ToastRenderer;
  readonly motionEnabled: () => boolean;
  readonly getUserLabel?: (() => string) | null;
}

export interface CommandPaletteFeature {
  open(): void;
  close(options?: Readonly<{ immediate?: boolean }>): void;
  update(query: string): void;
  handleAction(action: Element | null, eventTarget?: Element | null): Promise<boolean>;
  handleInput(target: EventTarget | null): boolean;
  handleKeydown(event: KeyboardEvent): boolean;
  readonly registry: ReturnType<typeof createCommandRegistry>;
  activate(): void;
  deactivate(): void;
}

const errorMessage = (error: unknown, fallback: string): string => error instanceof Error ? error.message : fallback;

/** Global command palette + command registration boundary. */
export function createCommandPaletteFeature({ auth, navigate, icons, escapeHtml, toast, motionEnabled, getUserLabel }: CommandPaletteFeatureOptions): CommandPaletteFeature {
  const esc = escapeHtml;
  const registry = createCommandRegistry();
  let selection = 0;
  let visible: readonly ApplicationCommand[] = [];
  let lastFocused: Element | null = null;

  const moduleIcon = (mod: (typeof modules)[number]): string => mod.icon === 'fuel' ? icons.fuel : mod.icon === 'trade' ? icons.trade : icons.clock;
  modules.forEach((mod) => registry.register({
    id: `module:${mod.id}`,
    title: mod.name,
    subtitle: `${mod.eyebrow} · ${mod.capabilities.join(', ')}`,
    icon: moduleIcon(mod),
    keywords: mod.capabilities,
    when: () => auth.canAccessModule(mod.id),
    run: () => navigate(`app/${mod.id}`),
  }));
  registry.register({ id: 'navigate:home', title: 'Applications', subtitle: 'Work Management home', icon: icons.grid, keywords: ['home', 'launcher'], run: () => navigate('') });
  registry.register({ id: 'navigate:boards', title: 'Boards', subtitle: 'Create and manage collaborative work boards', icon: icons.boards, keywords: ['tasks', 'work'], run: () => navigate('boards') });
  registry.register({ id: 'navigate:settings', title: 'Settings', subtitle: 'Appearance, backup, cloud and storage health', icon: icons.settings, run: () => navigate('settings') });
  registry.register({ id: 'navigate:users', title: 'Users', subtitle: 'Manage accounts, roles and access status', icon: icons.users, when: () => auth.canManageUsers, run: () => navigate('users') });
  registry.register({ id: 'navigate:account', title: 'Account', subtitle: 'Profile, security and session controls', icon: icons.user, when: () => auth.isCloudEnabled, run: () => navigate(auth.isAuthenticated ? 'account' : 'login') });
  registry.register({
    id: 'workspace:backup', title: 'Export workspace backup', subtitle: 'Download a recovery JSON file', icon: icons.download, keywords: ['recovery', 'json', 'export'],
    run: async () => {
      try {
        const count = await downloadWorkspaceBackup(modules);
        toast(`Backup exported with ${count} data entr${count === 1 ? 'y' : 'ies'}.`);
      } catch (error) {
        toast(errorMessage(error, 'Backup export failed.'), 'warning');
      }
    },
  });

  function context(): CommandPaletteContext {
    return { authenticated: auth.isAuthenticated, canManageUsers: auth.canManageUsers, user: getUserLabel?.() || '' };
  }

  function markup(): string {
    return `<div class="command-backdrop" data-close-command><div class="command-dialog" role="dialog" aria-modal="true" aria-label="Command palette" data-command-dialog><div class="command-input-wrap">${icons.search}<input id="commandInput" autocomplete="off" placeholder="Search applications, capabilities and commands…" aria-label="Command search" /></div><div class="command-results" id="commandResults" role="listbox"></div><footer><span><kbd>↑</kbd><kbd>↓</kbd> navigate <kbd>↵</kbd> open</span><span><kbd>Esc</kbd> close</span></footer></div></div>`;
  }

  function open(): void {
    if (document.querySelector('.command-backdrop')) return;
    lastFocused = document.activeElement;
    document.querySelector('#overlayRoot')?.insertAdjacentHTML('beforeend', markup());
    selection = 0;
    requestAnimationFrame(() => {
      const input = document.querySelector<HTMLInputElement>('#commandInput');
      input?.focus();
      update('');
    });
  }

  function close({ immediate = false }: Readonly<{ immediate?: boolean }> = {}): void {
    const backdrop = document.querySelector<HTMLElement>('.command-backdrop');
    if (!backdrop) return;
    const focusTarget = lastFocused;
    const finish = (): void => {
      backdrop.remove();
      if (focusTarget instanceof HTMLElement && focusTarget.isConnected) focusTarget.focus();
    };
    if (immediate || !motionEnabled()) {
      finish();
      return;
    }
    backdrop.classList.add('closing');
    window.setTimeout(finish, 170);
  }

  function search(query: string): readonly ApplicationCommand[] {
    const q = String(query || '').trim().toLowerCase();
    return registry.list(context()).filter((command) => !q || `${command.title} ${command.subtitle} ${command.keywords.join(' ')}`.toLowerCase().includes(q));
  }

  function update(query: string): void {
    const target = document.querySelector<HTMLElement>('#commandResults');
    if (!target) return;
    visible = search(query);
    selection = Math.min(selection, Math.max(0, visible.length - 1));
    target.innerHTML = visible.length ? visible.map((command, index) => `<button class="command-result ${index === selection ? 'selected' : ''}" role="option" aria-selected="${index === selection}" data-command-index="${index}" data-command-id="${esc(command.id)}"><span>${command.icon}</span><div><strong>${esc(command.title)}</strong><small>${esc(command.subtitle)}</small></div>${icons.arrow}</button>`).join('') : '<div class="command-empty">No matching commands.</div>';
    document.querySelector<HTMLElement>(`[data-command-index="${selection}"]`)?.scrollIntoView({ block: 'nearest' });
  }

  async function executeVisible(index: number | string | undefined): Promise<boolean> {
    const command = visible[Number(index)];
    if (!command) return false;
    close();
    await command.run(context());
    return true;
  }

  async function handleAction(action: Element | null, eventTarget: Element | null = null): Promise<boolean> {
    if (eventTarget?.matches('[data-close-command]')) {
      close();
      return true;
    }
    if (action?.matches('button[data-command]')) {
      open();
      return true;
    }
    if (action instanceof HTMLElement && action.matches('button[data-command-index]')) return executeVisible(action.dataset.commandIndex);
    return false;
  }

  function handleInput(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLInputElement) || target.id !== 'commandInput') return false;
    selection = 0;
    update(target.value);
    return true;
  }

  function handleKeydown(event: KeyboardEvent): boolean {
    const openNow = Boolean(document.querySelector('.command-backdrop'));
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      openNow ? close() : open();
      return true;
    }
    if (!openNow) return false;
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return true;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!visible.length) return true;
      selection = (selection + (event.key === 'ArrowDown' ? 1 : -1) + visible.length) % visible.length;
      update(document.querySelector<HTMLInputElement>('#commandInput')?.value || '');
      return true;
    }
    if (event.key === 'Enter' && (document.activeElement as HTMLElement | null)?.id === 'commandInput' && visible[selection]) {
      event.preventDefault();
      void executeVisible(selection);
      return true;
    }
    if (event.key === 'Tab') {
      const dialog = document.querySelector<HTMLElement>('[data-command-dialog]');
      if (!dialog) return false;
      const focusable = [...dialog.querySelectorAll<HTMLElement>('button,input')].filter((element) => !(element instanceof HTMLButtonElement || element instanceof HTMLInputElement) || !element.disabled);
      if (!focusable.length) return true;
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return true;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
      return true;
    }
    return false;
  }

  function deactivate(): void { close({ immediate: true }); }
  return Object.freeze({ open, close, update, handleAction, handleInput, handleKeydown, registry, activate() {}, deactivate });
}

export { createCommandRegistry } from './command-registry.ts';
export const COMMANDS_FEATURE = Object.freeze({ id: 'commands', architecture: 'registry-controller-view', shortcut: 'Mod+K' });
