import {scrollToTop, scrollToElement, getScrollPosition, isElementInViewport, getElementDimensions, focusElement, copyTextToClipboard} from '../dom-utils';

describe('dom-utils', () => {
  beforeEach(() => {
    window.scrollTo = jest.fn();
    Object.defineProperty(window, 'scrollX', { value: 100, configurable: true });
    Object.defineProperty(window, 'scrollY', { value: 200, configurable: true });
    Object.assign(navigator, { clipboard: { writeText: jest.fn().mockResolvedValue(undefined) } });
  });

  it('scrollToTop calls scrollTo with auto behavior', () => {
    scrollToTop();
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'auto' });
  });

  it('scrollToTop with smooth calls scrollTo with smooth behavior', () => {
    scrollToTop(true);
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
  });

  it('getScrollPosition returns x and y', () => {
    expect(getScrollPosition()).toEqual({ x: 100, y: 200 });
  });

  it('isElementInViewport returns true for visible element', () => {
    const el = { getBoundingClientRect: () => ({ top: 10, left: 10, bottom: 100, right: 100 }) } as unknown as Element;
    expect(isElementInViewport(el)).toBe(true);
  });

  it('isElementInViewport returns false for hidden element', () => {
    const el = { getBoundingClientRect: () => ({ top: -200, left: 0, bottom: -100, right: 100 }) } as unknown as Element;
    expect(isElementInViewport(el)).toBe(false);
  });

  it('getElementDimensions returns width and height', () => {
    const el = { getBoundingClientRect: () => ({ width: 200, height: 100 }) } as unknown as Element;
    expect(getElementDimensions(el)).toEqual({ width: 200, height: 100 });
  });

  it('focusElement focuses element when found', () => {
    const el = { focus: jest.fn() };
    jest.spyOn(document, 'querySelector').mockReturnValue(el as Element);
    expect(focusElement('#test')).toBe(true);
    expect(el.focus).toHaveBeenCalled();
  });

  it('focusElement returns false when not found', () => {
    jest.spyOn(document, 'querySelector').mockReturnValue(null);
    expect(focusElement('#missing')).toBe(false);
  });

  it('copyTextToClipboard copies text successfully', async () => {
    expect(await copyTextToClipboard('hello')).toBe(true);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('hello');
  });

  it('copyTextToClipboard returns false on error', async () => {
    (navigator.clipboard.writeText as jest.Mock).mockRejectedValueOnce(new Error('denied'));
    expect(await copyTextToClipboard('hello')).toBe(false);
  });
});