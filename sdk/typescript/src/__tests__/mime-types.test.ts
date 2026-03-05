import { getMimeType, getExtension, isTextMime, isImageMime, MIME_MAP } from '../mime-types';

describe('mime-types', () => {
  describe('getMimeType', () => {
    it('returns correct mime for json', () => expect(getMimeType('data.json')).toBe('application/json'));
    it('returns correct mime for png', () => expect(getMimeType('photo.png')).toBe('image/png'));
    it('returns correct mime for html', () => expect(getMimeType('index.html')).toBe('text/html'));
    it('returns octet-stream for unknown extension', () => expect(getMimeType('file.xyz')).toBe('application/octet-stream'));
    it('returns octet-stream for no extension', () => expect(getMimeType('README')).toBe('application/octet-stream'));
    it('handles case insensitivity', () => expect(getMimeType('file.JSON')).toBe('application/json'));
    it('handles nested path', () => expect(getMimeType('path/to/file.css')).toBe('text/css'));
    it('returns correct mime for typescript', () => expect(getMimeType('app.ts')).toBe('application/typescript'));
  });

  describe('getExtension', () => {
    it('returns correct extension for json', () => expect(getExtension('application/json')).toBe('json'));
    it('returns correct extension for png', () => expect(getExtension('image/png')).toBe('png'));
    it('returns null for unknown mime', () => expect(getExtension('application/weird')).toBeNull());
  });

  describe('isTextMime', () => {
    it('returns true for text/plain', () => expect(isTextMime('text/plain')).toBe(true));
    it('returns true for text/html', () => expect(isTextMime('text/html')).toBe(true));
    it('returns true for application/json', () => expect(isTextMime('application/json')).toBe(true));
    it('returns true for application/javascript', () => expect(isTextMime('application/javascript')).toBe(true));
    it('returns false for image/png', () => expect(isTextMime('image/png')).toBe(false));
  });

  describe('isImageMime', () => {
    it('returns true for image/png', () => expect(isImageMime('image/png')).toBe(true));
    it('returns true for image/jpeg', () => expect(isImageMime('image/jpeg')).toBe(true));
    it('returns false for text/plain', () => expect(isImageMime('text/plain')).toBe(false));
  });

  describe('MIME_MAP', () => {
    it('has sufficient entries', () => expect(Object.keys(MIME_MAP).length).toBeGreaterThan(20));
  });
});