import { xssProtection } from '../security';

describe('security/xss', () => {
  const next = jest.fn();
  const req: any = { body: {}, query: {} };
  const res: any = {};

  beforeEach(() => { req.body = {}; req.query = {}; next.mockClear(); });

  it('calls next()', () => { xssProtection(req, res, next); expect(next).toHaveBeenCalled(); });

  it('removes HTML tags from req.body', () => {
    req.body = { name: '<script>alert(1)</script>hello' };
    xssProtection(req, res, next);
    expect(req.body.name).toContain('hello');
    expect(req.body.name).not.toContain('<script>');
  });

  it('encodes angle brackets in req.body', () => {
    req.body = { text: 'a<b' };
    xssProtection(req, res, next);
    expect(req.body.text).toContain('&lt;');
  });

  it('sanitizes nested objects in req.body', () => {
    req.body = { user: { name: '<b>evil</b>' } };
    xssProtection(req, res, next);
    expect(req.body.user.name).toContain('&lt;');
  });

  it('sanitizes req.query values', () => {
    req.query = { search: '<script>xss</script>' };
    xssProtection(req, res, next);
    expect(req.query.search).not.toContain('<script>');
  });
});