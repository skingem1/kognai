import { ok, err, isOk, isErr, unwrap, unwrapOr, map, mapErr } from '../result';

describe('result', () => {
  it('ok creates success result', () => { const r = ok(42); expect(r.ok).toBe(true); expect(r.value).toBe(42); });
  it('err creates failure result', () => { const r = err('fail'); expect(r.ok).toBe(false); expect(r.error).toBe('fail'); });
  it('isOk returns true for ok', () => expect(isOk(ok(1))).toBe(true));
  it('isOk returns false for err', () => expect(isOk(err('x'))).toBe(false));
  it('isErr returns true for err', () => expect(isErr(err('x'))).toBe(true));
  it('isErr returns false for ok', () => expect(isErr(ok(1))).toBe(false));
  it('unwrap returns value for ok', () => expect(unwrap(ok(42))).toBe(42));
  it('unwrap throws for err', () => expect(() => unwrap(err(new Error('fail')))).toThrow('fail'));
  it('unwrapOr returns value for ok', () => expect(unwrapOr(ok(42), 0)).toBe(42));
  it('unwrapOr returns default for err', () => expect(unwrapOr(err('fail'), 0)).toBe(0));
  it('map transforms ok value', () => expect(map(ok(2), x => x * 3)).toEqual({ ok: true, value: 6 }));
  it('map passes through err', () => expect(map(err('fail'), x => x)).toEqual({ ok: false, error: 'fail' }));
  it('mapErr transforms error', () => expect(mapErr(err('fail'), e => e.toUpperCase())).toEqual({ ok: false, error: 'FAIL' }));
  it('mapErr passes through ok', () => expect(mapErr(ok(1), e => e)).toEqual({ ok: true, value: 1 }));
});