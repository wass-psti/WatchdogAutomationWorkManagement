import type {
  ApplicationCommand,
  ApplicationCommandInput,
  CommandPaletteContext,
  CommandRegistry,
  CommandSnapshot,
} from '../../../../src/platform/contracts/commands.ts';

const DEFAULT_CONTEXT: CommandPaletteContext = Object.freeze({ authenticated: false, canManageUsers: false, user: '' });

/** Typed command registry used by the global command palette. */
export function createCommandRegistry(): CommandRegistry {
  const commands = new Map<string, ApplicationCommand>();

  const register = (command: ApplicationCommandInput): (() => boolean) => {
    const id = String(command?.id ?? '').trim();
    if (!id) throw new TypeError('Command id is required.');
    if (commands.has(id)) throw new Error(`Command "${id}" is already registered.`);
    if (typeof command.run !== 'function') throw new TypeError(`Command "${id}" requires a run function.`);
    const record: ApplicationCommand = Object.freeze({
      id,
      title: String(command.title ?? id),
      subtitle: String(command.subtitle ?? ''),
      icon: String(command.icon ?? ''),
      keywords: Object.freeze([...(command.keywords ?? [])].map(String)),
      when: typeof command.when === 'function' ? command.when : () => true,
      run: command.run,
    });
    commands.set(id, record);
    return () => commands.delete(id);
  };

  const list = (context: CommandPaletteContext = DEFAULT_CONTEXT): readonly ApplicationCommand[] =>
    Object.freeze([...commands.values()].filter((command) => {
      try { return command.when(context) !== false; } catch { return false; }
    }));

  const get = (id: string): ApplicationCommand | null => commands.get(String(id ?? '')) ?? null;

  const execute: CommandRegistry['execute'] = (id, context = DEFAULT_CONTEXT) => {
    const command = get(id);
    if (!command || command.when(context) === false) return false;
    return command.run(context);
  };

  const clear = (): void => { commands.clear(); };

  const snapshot = (): readonly CommandSnapshot[] => Object.freeze([...commands.values()].map(({ run: _run, when: _when, ...command }) => Object.freeze(command)));

  return Object.freeze({ register, list, get, execute, clear, snapshot });
}
