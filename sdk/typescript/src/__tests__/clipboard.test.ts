import { copyToClipboard, readFromClipboard, copyFallback } from '../clipboard';

describe('clipboard', () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: { writeText: jest.fn(), readText: jest.fn() },
    });
    document.execCommand = jest.fn();
  });

  it('copyToClipboard resolves true on success', async () => {
    (navigator.clipboard.writeText as jest.Mock).mockResolvedValue(undefined);
    expect(await copyToClipboard('hello')).toBe(true);
  });

  it('copyToClipboard resolves false on error', async () => {
    (navigator.clipboard.writeText as jest.Mock).mockRejectedValue(new Error('denied'));
    expect(await copyToClipboard('hello')).toBe(false);
  });

  it('readFromClipboard returns text', async () => {
    (navigator.clipboard.readText as jest.Mock).mockResolvedValue('hello');
    expect(await readFromClipboard()).toBe('hello');
  });

  it('readFromClipboard returns empty string on error', async () => {
    (navigator.clipboard.readText as jest.Mock).mockRejectedValue(new Error());
    expect(await readFromClipboard()).toBe('');
  });

  it('copyFallback creates textarea and copies', () => {
    (document.execCommand as jest.Mock).mockReturnValue(true);
    expect(copyFallback('test')).toBe(true);
    expect(document.execCommand).toHaveBeenCalledWith('copy');
  });

  it('copyFallback returns false on error', () => {
    (document.execCommand as jest.Mock).mockImplementation(() => { throw new Error(); });
    expect(copyFallback('test')).toBe(false);
  });
});