import { copyJson, copyHtml, copyWithNotification, readClipboardItems } from '../clipboard-utils';

describe('clipboard-utils', () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: {
        writeText: jest.fn().mockResolvedValue(undefined),
        write: jest.fn().mockResolvedValue(undefined),
        read: jest.fn().mockResolvedValue([])
      }
    });
  });

  it('copyJson copies formatted JSON', async () => {
    await copyJson({ a: 1 });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(JSON.stringify({ a: 1 }, null, 2));
  });

  it('copyJson returns true on success', async () => {
    expect(await copyJson('test')).toBe(true);
  });

  it('copyJson returns false on error', async () => {
    (navigator.clipboard.writeText as jest.Mock).mockRejectedValueOnce(new Error());
    expect(await copyJson('x')).toBe(false);
  });

  it('copyHtml calls clipboard.write', async () => {
    await copyHtml('<b>hi</b>');
    expect(navigator.clipboard.write).toHaveBeenCalled();
  });

  it('copyHtml returns false on error', async () => {
    (navigator.clipboard.write as jest.Mock).mockRejectedValueOnce(new Error());
    expect(await copyHtml('<b>')).toBe(false);
  });

  it('copyWithNotification calls onSuccess', async () => {
    const fn = jest.fn();
    await copyWithNotification('hi', fn);
    expect(fn).toHaveBeenCalled();
  });

  it('copyWithNotification calls onError on failure', async () => {
    (navigator.clipboard.writeText as jest.Mock).mockRejectedValueOnce(new Error('fail'));
    const fn = jest.fn();
    await copyWithNotification('hi', undefined, fn);
    expect(fn).toHaveBeenCalled();
  });

  it('readClipboardItems returns empty array on error', async () => {
    (navigator.clipboard.read as jest.Mock).mockRejectedValueOnce(new Error());
    expect(await readClipboardItems()).toEqual([]);
  });
});