/**
 * MIME type lookup utilities for file extensions and MIME types.
 * @packageDocumentation
 */

export const MIME_MAP: Record<string, string> = {
  txt: 'text/plain', html: 'text/html', css: 'text/css', js: 'application/javascript',
  json: 'application/json', xml: 'application/xml', csv: 'text/csv', png: 'image/png',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml',
  webp: 'image/webp', ico: 'image/x-icon', pdf: 'application/pdf', zip: 'application/zip',
  gz: 'application/gzip', mp3: 'audio/mpeg', mp4: 'video/mp4', webm: 'video/webm',
  woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', ts: 'application/typescript',
  tsx: 'application/typescript', md: 'text/markdown', yaml: 'text/yaml', yml: 'text/yaml'
};

const TEXT_MIMES = new Set(['application/json', 'application/javascript', 'application/xml', 'application/typescript']);

export function getMimeType(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  if (lastDot === -1 || lastDot === filename.length - 1) return 'application/octet-stream';
  return MIME_MAP[filename.slice(lastDot + 1).toLowerCase()] ?? 'application/octet-stream';
}

export function getExtension(mimeType: string): string | null {
  for (const [ext, mime] of Object.entries(MIME_MAP)) if (mime === mimeType) return ext;
  return null;
}

export function isTextMime(mimeType: string): boolean {
  return mimeType.startsWith('text/') || TEXT_MIMES.has(mimeType);
}

export function isImageMime(mimeType: string): boolean {
  return mimeType.startsWith('image/');
}