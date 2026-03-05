import { copyToClipboard, readFromClipboard, selectAllText, copyWithFallback, formatForClipboard } from '../clipboard-utils';

describe('clipboard-utils', () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: {
        writeText: jest.fn().mockResolvedValue(undefined),
        readText: jest.fn().mockResolvedValue('data'),
      },
    });
    jest.spyOn(document, 'execCommand').mockReturnValue(true);
    jest.spyOn(window, 'getSelection').mockReturnValue({
      removeAllRanges: jest.fn(),
      addRange: jest.fn(),
    } as unknown as Selection);
    jest.spyOn(document, 'createRange').mockReturnValue({
      selectNodeContents: jest.fn(),
    } as unknown as Range);
    jest.spyOn(document, 'createElement').mockReturnValue({
      value: '',
      style: { display: '' },
      select: jest.fn(),
      remove: jest.fn(),
    } as unknown as HTMLTextAreaElement);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('copyToClipboard', () => {
    it('returns true on success', async () => {
      expect(await copyToClipboard('test')).toBe(true);
    });

    it('returns false on failure', async () => {
      (navigator.clipboard.writeText as jest.Mock).mockRejectedValueOnce(new Error('fail'));
      expect(await copyToClipboard('test')).toBe(false);
    });

    it('passes text to writeText', async () => {
      await copyToClipboard('hello');
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('hello');
    });
  });

  describe('readFromClipboard', () => {
    it('returns text', async () => {
      expect(await readFromClipboard()).toBe('data');
    });

    it('returns null on error', async () => {
      (navigator.clipboard.readText as jest.Mock).mockRejectedValueOnce(new Error('fail'));
      expect(await readFromClipboard()).toBeNull();
    });
  });

  describe('copyWithFallback', () => {
    it('returns true when execCommand succeeds', async () => {
      expect(await copyWithFallback('test')).toBe(true);
    });

    it('returns false when execCommand fails', async () => {
      jest.spyOn(document, 'execCommand').mockReturnValueOnce(false);
      expect(await copyWithFallback('test')).toBe(false);
    });
  });

  describe('formatForClipboard', () => {
    it('formats JSON with indentation', () => {
      expect(formatForClipboard({ a: 1 })).toBe(JSON.stringify({ a: 1 }, null, 2));
    });

    it('handles nested objects', () => {
      expect(formatForClipboard({ a: { b: 1 } })).toContain('  ');
    });
  });

  describe('selectAllText', () => {
    it('calls getSelection', () => {
      const el = document.createElement('div');
      selectAllText(el);
      expect(window.getSelection).toHaveBeenCalled();
    });
  });
});