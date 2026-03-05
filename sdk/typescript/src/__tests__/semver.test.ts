import { parseSemVer, compareSemVer, satisfiesMinimum, formatSemVer } from '../semver';

describe('semver', () => {
  it('parses valid semver', () => expect(parseSemVer('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3 }));
  it('parses semver with v prefix', () => expect(parseSemVer('v2.0.1')).toEqual({ major: 2, minor: 0, patch: 1 }));
  it('returns null for invalid semver', () => expect(parseSemVer('invalid')).toBeNull());
  it('returns null for incomplete semver', () => expect(parseSemVer('1.2')).toBeNull());
  it('compares equal versions', () => expect(compareSemVer('1.0.0', '1.0.0')).toBe(0));
  it('compares less than', () => expect(compareSemVer('1.2.0', '1.3.0')).toBe(-1));
  it('compares greater than', () => expect(compareSemVer('2.0.0', '1.9.9')).toBe(1));
  it('satisfies minimum requirement', () => expect(satisfiesMinimum('2.1.0', '2.0.0')).toBe(true));
  it('fails minimum requirement', () => expect(satisfiesMinimum('1.0.0', '2.0.0')).toBe(false));
  it('formats semver object', () => expect(formatSemVer({ major: 1, minor: 2, patch: 3 })).toBe('1.2.3'));
});