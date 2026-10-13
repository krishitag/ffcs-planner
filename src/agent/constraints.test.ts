import { describe, it, expect } from 'vitest';
import { Constraints, toMinutes } from './constraints';

describe('Constraints schema', () => {
  it('accepts the brief\'s example and fills in "must" where no strength is given', () => {
    // "I need OS, CN and DBMS with labs. No 8am classes, keep Friday free, and I want Prof X for OS."
    const c = Constraints.parse({
      courses: [{ query: 'OS', professor: { name: 'Prof X' } }, { query: 'CN' }, { query: 'DBMS' }],
      freeDays: [{ day: 'Fri' }],
      noClassesBefore: { time: '09:00' },
    });
    expect(c.courses[0].professor?.wish).toBe('must');
    expect(c.freeDays[0].strength).toBe('must');
    expect(c.noClassesBefore?.strength).toBe('must');
    expect(c.shift).toBeUndefined(); // never assumed (R4)
  });

  it('keeps "prefer" and "avoid" when the student says so', () => {
    const c = Constraints.parse({
      courses: [{ query: 'CN', professor: { name: 'Prof Y', wish: 'avoid' } }],
      noClassesAfter: { time: '17:00', strength: 'prefer' },
    });
    expect(c.courses[0].professor?.wish).toBe('avoid');
    expect(c.noClassesAfter?.strength).toBe('prefer');
  });

  it('accepts a slot wish per course, defaulting to "must"', () => {
    // "OS in A1+TA1, and CN in B2 if possible"
    const c = Constraints.parse({
      courses: [
        { query: 'OS', slot: { value: 'A1+TA1' } },
        { query: 'CN', slot: { value: 'B2', strength: 'prefer' } },
      ],
    });
    expect(c.courses[0].slot).toEqual({ value: 'A1+TA1', strength: 'must' });
    expect(c.courses[1].slot?.strength).toBe('prefer');
  });

  it('rejects a slot that is not on the timetable grid', () => {
    expect(
      Constraints.safeParse({ courses: [{ query: 'OS', slot: { value: 'Z9' } }] }).success
    ).toBe(false);
    expect(
      Constraints.safeParse({ courses: [{ query: 'OS', slot: { value: 'L2' } }] }).success
    ).toBe(false);
  });

  it('gives empty lists for things the student did not mention', () => {
    const c = Constraints.parse({});
    expect(c.courses).toEqual([]);
    expect(c.freeDays).toEqual([]);
  });

  it('rejects a day that is not Mon-Fri', () => {
    expect(Constraints.safeParse({ freeDays: [{ day: 'Fridday' }] }).success).toBe(false);
    expect(Constraints.safeParse({ freeDays: [{ day: 'Sat' }] }).success).toBe(false);
  });

  it('rejects times that are not 24-hour HH:MM', () => {
    expect(Constraints.safeParse({ noClassesBefore: { time: '8am' } }).success).toBe(false);
    expect(Constraints.safeParse({ noClassesBefore: { time: '25:00' } }).success).toBe(false);
  });

  it('rejects "no classes before" that is later than "no classes after"', () => {
    const r = Constraints.safeParse({
      noClassesBefore: { time: '18:00' },
      noClassesAfter: { time: '09:00' },
    });
    expect(r.success).toBe(false);
  });

  it('rejects an empty course name and an unknown professor wish', () => {
    expect(Constraints.safeParse({ courses: [{ query: '' }] }).success).toBe(false);
    expect(
      Constraints.safeParse({ courses: [{ query: 'OS', professor: { name: 'X', wish: 'love' } }] })
        .success
    ).toBe(false);
  });
});

describe('toMinutes', () => {
  it('turns HH:MM into minutes since midnight', () => {
    expect(toMinutes('09:00')).toBe(540);
    expect(toMinutes('17:40')).toBe(1060);
  });
});
