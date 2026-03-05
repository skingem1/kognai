import { basename, dirname, extname, join } from '../path-utils';

describe('path-utils', () => {
  it('basename extracts filename from Unix path', () => {
    expect(basename('/foo/bar/baz.txt')).toBe('baz.txt');
  });

  it('basename extracts filename from Windows path', () => {
    expect(basename('C:\\Users\\file.ts')).toBe('file.ts');
  });

  it('basename returns input when no separator', () => {
    expect(basename('file.txt')).toBe('file.txt');
  });

  it('dirname returns parent directory from Unix path', () => {
    expect(dirname('/foo/bar/baz.txt')).toBe('/foo/bar');
  });

  it('dirname returns dot for file in current dir', () => {
    expect(dirname('file.txt')).toBe('.');
  });

  it('dirname returns empty for root path', () => {
    expect(dirname('/foo')).toBe('');
  });

  it('extname extracts extension', () => {
    expect(extname('file.txt')).toBe('.txt');
  });

  it('extname gets last extension from compound', () => {
    expect(extname('file.tar.gz')).toBe('.gz');
  });

  it('extname returns empty for no extension', () => {
    expect(extname('file')).toBe('');
  });

  it('extname returns empty for dotfile', () => {
    expect(extname('.gitignore')).toBe('');
  });

  it('join combines path segments', () => {
    expect(join('foo', 'bar', 'baz')).toBe('foo/bar/baz');
  });

  it('join normalizes trailing/leading slashes', () => {
    expect(join('/foo/', '/bar')).toBe('/foo/bar');
  });

  it('join handles empty segments', () => {
    expect(join('a', '', 'b')).toBe('a/b');
  });
});