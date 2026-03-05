import {parseDuration, formatDuration, durationToMs, humanizeMs, compareDurations} from '../duration';

describe('duration', () => {
  it('1. parseDuration parses 0ms', () => expect(parseDuration(0)).toEqual({days:0,hours:0,minutes:0,seconds:0,milliseconds:0}));
  it('2. parseDuration parses 90061500ms', () => expect(parseDuration(90061500)).toEqual({days:1,hours:1,minutes:1,seconds:1,milliseconds:500}));
  it('3. parseDuration parses 3600000ms', () => expect(parseDuration(3600000)).toEqual({days:0,hours:1,minutes:0,seconds:0,milliseconds:0}));
  it('4. formatDuration long format', () => expect(formatDuration(90060000)).toBe('1 day, 1 hour, 1 minute'));
  it('5. formatDuration short format', () => expect(formatDuration(90060000, {short:true})).toBe('1d 1h 1m'));
  it('6. formatDuration seconds only', () => expect(formatDuration(5000)).toBe('5 seconds'));
  it('7. formatDuration zero', () => expect(formatDuration(0)).toBe('0 seconds'));
  it('8. formatDuration hours+minutes', () => expect(formatDuration(7500000)).toBe('2 hours, 5 minutes'));
  it('9. durationToMs full', () => expect(durationToMs({days:1,hours:2,minutes:3,seconds:4,milliseconds:5})).toBe(93784005));
  it('10. durationToMs partial', () => expect(durationToMs({hours:1})).toBe(3600000));
  it('11. durationToMs empty', () => expect(durationToMs({})).toBe(0));
  it('12. humanizeMs just now', () => expect(humanizeMs(3000)).toBe('just now'));
  it('13. humanizeMs seconds', () => expect(humanizeMs(30000)).toBe('30s'));
  it('14. humanizeMs minutes', () => expect(humanizeMs(150000)).toBe('2m'));
  it('15. humanizeMs hours', () => expect(humanizeMs(7200000)).toBe('2h'));
  it('16. humanizeMs days', () => expect(humanizeMs(172800000)).toBe('2d'));
  it('17. compareDurations less', () => expect(compareDurations(100, 200)).toBe(-1));
  it('18. compareDurations equal', () => expect(compareDurations(100, 100)).toBe(0));
  it('19. compareDurations greater', () => expect(compareDurations(200, 100)).toBe(1));
});