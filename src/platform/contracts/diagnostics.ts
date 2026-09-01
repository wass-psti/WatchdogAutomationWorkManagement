export interface DiagnosticContext { readonly [key: string]: unknown; }
export type DiagnosticLevel = 'debug' | 'info' | 'warning' | 'error';
export interface DiagnosticEntry { readonly id: number; readonly at: string; readonly level: DiagnosticLevel; readonly code: string; readonly message: string; readonly context: unknown; }
export interface DiagnosticsPort { debug(code: string, message: string, context?: DiagnosticContext): void; info?(code: string, message: string, context?: DiagnosticContext): void; warn(code: string, message: string, context?: DiagnosticContext): void; error?(code: string, message: string, context?: DiagnosticContext): void; }
export interface DiagnosticsService extends DiagnosticsPort { info(code: string, message: string, context?: DiagnosticContext): void; error(code: string, message: string, context?: DiagnosticContext): void; snapshot(): readonly DiagnosticEntry[]; clear(): void; }
export interface DiagnosticsOptions { readonly limit?: number; }
