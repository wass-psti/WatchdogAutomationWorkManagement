export interface CommandPaletteContext {
  readonly authenticated: boolean;
  readonly canManageUsers: boolean;
  readonly user: string;
}

export interface ApplicationCommand {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  readonly icon: string;
  readonly keywords: readonly string[];
  readonly when: (context: CommandPaletteContext) => boolean;
  readonly run: (context: CommandPaletteContext) => unknown | Promise<unknown>;
}

export interface ApplicationCommandInput {
  readonly id: string;
  readonly title?: string;
  readonly subtitle?: string;
  readonly icon?: string;
  readonly keywords?: readonly string[];
  readonly when?: (context: CommandPaletteContext) => boolean;
  readonly run: (context: CommandPaletteContext) => unknown | Promise<unknown>;
}

export interface CommandSnapshot {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  readonly icon: string;
  readonly keywords: readonly string[];
}

export interface CommandRegistry {
  register(command: ApplicationCommandInput): () => boolean;
  list(context?: CommandPaletteContext): readonly ApplicationCommand[];
  get(id: string): ApplicationCommand | null;
  execute(id: string, context?: CommandPaletteContext): false | unknown | Promise<unknown>;
  clear(): void;
  snapshot(): readonly CommandSnapshot[];
}
