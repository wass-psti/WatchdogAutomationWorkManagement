const HTML_ESCAPE_MAP = Object.freeze({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  "'": '&#39;',
  '"': '&quot;',
} as const);

type EscapableCharacter = keyof typeof HTML_ESCAPE_MAP;

export const escapeHtml = (value: unknown): string => String(value ?? '').replace(/[&<>'"]/g, (character) => HTML_ESCAPE_MAP[character as EscapableCharacter]);

export const formatBytes = (bytes: number | null | undefined): string => {
  if (bytes == null) return 'Unavailable';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(1)} GB`;
};
