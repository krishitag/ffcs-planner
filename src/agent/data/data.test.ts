// Tests for the data layer (Phase 1), turning the *.check.ts printouts into real checks.
// Some use specific courses from today's data; if CodeChef's data changes, a failing test
// here means "look at what changed", like the validator.
import { describe, it, expect } from 'vitest';
import { loadCourses } from './loadCourses';
import { toFullCourseData } from './toFullCourseData';
import { sessionsOfSlotString, formatTime } from './slotTimes';
import { slotProblem, validateData } from './validate';

const all = loadCourses();
const find = (school: string, code: string) =>
  all.find(c => c.school === school && c.code === code)!;
const show = (slot: string) =>
  sessionsOfSlotString(slot).map(
    s => `${s.day} ${formatTime(s.start)}-${formatTime(s.end)} ${s.kind}`
  );

describe('loadCourses', () => {
  it('keeps the full name after the first " - " (Q9)', () => {
    expect(find('SCOPE', 'BSTS301P').name).toBe('Advanced Competitive Coding - I');
  });

  it('gives every course a code, a name and a list of entries', () => {
    for (const c of all) {
      expect(c.code.length).toBeGreaterThan(0);
      expect(c.name.length).toBeGreaterThan(0);
      expect(Array.isArray(c.entries)).toBe(true);
    }
  });
});

describe('slotTimes: every session of a slot string', () => {
  it('A1 meets twice a week (R3)', () => {
    expect(show('A1')).toEqual(['Mon 08:00-08:50 theory', 'Wed 09:00-09:50 theory']);
  });

  it('a lab pair is ONE session (R1)', () => {
    expect(show('L1+L2')).toEqual(['Mon 08:00-09:40 lab']);
  });

  it('a four-slot lab is two sessions on different days (R2)', () => {
    expect(show('L9+L10+L25+L26')).toEqual(['Tue 09:50-11:30 lab', 'Fri 08:00-09:40 lab']);
  });

  it('a six-slot lab is three sessions (Q5)', () => {
    expect(sessionsOfSlotString('L31+L32+L45+L46+L57+L58')).toHaveLength(3);
  });

  it('A1+TA1+TAA1 hits Wednesday through A1 (check every part, R3)', () => {
    expect(show('A1+TA1+TAA1')).toContain('Wed 09:00-09:50 theory');
    expect(show('A1+TA1+TAA1')).toHaveLength(4);
  });

  it('NIL has no sessions (R6)', () => {
    expect(show('NIL')).toEqual([]);
  });

  it('labels the shift by R4', () => {
    expect(sessionsOfSlotString('L31+L32')[0].shift).toBe('evening');
    expect(sessionsOfSlotString('TAA1')[0].shift).toBe('morning');
  });
});

describe('toFullCourseData', () => {
  it('contains the website pick from the Phase 0 snapshot', () => {
    const f1 = toFullCourseData(find('SCOPE', 'BCSE204L')).course!.courseSlots.find(
      s => s.slotName === 'F1+TF1'
    )!;
    expect(f1.slotFaculties).toContainEqual(
      expect.objectContaining({ facultyName: 'SRIVANI A', facultyLabSlot: 'L55+L56' })
    );
  });

  it('drops a professor with no real lab and says why (Q1)', () => {
    const r = toFullCourseData(find('SENSE', 'BPHY101L'));
    expect(r.unavailable).toContainEqual({
      slot: 'E2+TE2',
      faculty: 'SAMIR RANJAN MEHER',
      reason: 'lab slot unavailable for this professor',
    });
  });

  it('copies the website when nothing can be picked (Q10)', () => {
    const r = toFullCourseData(find("SCOPE ('25 Batch)", 'BAMEE310'));
    expect(r.course).toBeNull();
    expect(r.noOptionsReason).toBe('the website offers no slot to pick for this course');
  });
});

describe('validate', () => {
  it('accepts the slot shapes VIT uses (Q4, Q5, R6)', () => {
    for (const s of ['NIL', 'A1+TA1+TAA1', 'L1+L2', 'L9+L10+L25+L26', 'L31+L32+L45+L46+L57+L58']) {
      expect(slotProblem(s)).toBeNull();
    }
  });

  it('reports shapes that should never appear (Q4)', () => {
    for (const s of ['L2', 'L1+L4', 'A1+L1', 'XYZ1', 'L61+L62', 'BCSE303L']) {
      expect(slotProblem(s)).not.toBeNull();
    }
  });

  it('finds no slot, empty-course, duplicate or alias problems in the real data', () => {
    const serious = validateData().filter(i =>
      ['slot', 'empty course', 'duplicate code', 'alias'].includes(i.check)
    );
    expect(serious).toEqual([]);
  });
});
