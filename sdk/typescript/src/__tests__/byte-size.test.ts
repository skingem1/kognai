import { formatBytes, parseBytes, isWithinLimit } from '../byte-size';

describe('byte-size', () => {
  it('formatBytes(0) => 0 B', () => expect(formatBytes(0)).toBe('0 B'));
  it('formatBytes(1024) => 1.00 KB', () => expect(formatBytes(1024)).toBe('1.00 KB'));
  it('formatBytes(1048576) => 1.00 MB', () => expect(formatBytes(1048576)).toBe('1.00 MB'));
  it('formatBytes(1536) => 1.50 KB', () => expect(formatBytes(1536)).toBe('1.50 KB'));
  it('formatBytes(1536, 0) => 2 KB', () => expect(formatBytes(1536, 0)).toBe('2 KB'));
  it('parseBytes(1 KB) => 1024', () => expect(parseBytes('1 KB')).toBe(1024));
  it('parseBytes(2.5 MB) => 2621440', () => expect(parseBytes('2.5 MB')).toBe(2621440));
  it('parseBytes(1gb) => 1073741824', () => expect(parseBytes('1gb')).toBe(1073741824));
  it('parseBytes(invalid) => NaN', () => expect(parseBytes('invalid')).toBeNaN());
  it('isWithinLimit(500000, 1 MB) => true', () => expect(isWithinLimit(500000, '1 MB')).toBe(true));
  it('isWithinLimit(2000000, 1 MB) => false', () => expect(isWithinLimit(2000000, '1 MB')).toBe(false));
});