import { getElement, getElements, addClass, removeClass, toggleClass, setStyles, getDataAttr, setDataAttr } from '../dom-utils';

describe('dom-utils', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="app" class="container" data-theme="light"><span class="item">A</span><span class="item">B</span></div>';
  });

  it('getElement finds element by selector', () => {
    expect(getElement('#app')).not.toBeNull();
  });

  it('getElement returns null for missing', () => {
    expect(getElement('#missing')).toBeNull();
  });

  it('getElements returns array', () => {
    expect(getElements('.item')).toHaveLength(2);
  });

  it('getElements returns empty array for no match', () => {
    expect(getElements('.nope')).toHaveLength(0);
  });

  it('addClass adds class', () => {
    const el = getElement('#app')!;
    addClass(el, 'active');
    expect(el.classList.contains('active')).toBe(true);
  });

  it('removeClass removes class', () => {
    const el = getElement('#app')!;
    removeClass(el, 'container');
    expect(el.classList.contains('container')).toBe(false);
  });

  it('toggleClass toggles', () => {
    const el = getElement('#app')!;
    toggleClass(el, 'open');
    expect(el.classList.contains('open')).toBe(true);
    toggleClass(el, 'open');
    expect(el.classList.contains('open')).toBe(false);
  });

  it('setStyles sets styles', () => {
    const el = getElement('#app')!;
    setStyles(el, { color: 'red' });
    expect(el.style.color).toBe('red');
  });

  it('getDataAttr gets data attribute', () => {
    const el = getElement('#app')!;
    expect(getDataAttr(el, 'theme')).toBe('light');
  });

  it('setDataAttr sets data attribute', () => {
    const el = getElement('#app')!;
    setDataAttr(el, 'mode', 'dark');
    expect(el.dataset.mode).toBe('dark');
  });
});