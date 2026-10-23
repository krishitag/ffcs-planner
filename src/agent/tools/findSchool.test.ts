import { describe, it, expect } from 'vitest';
import { findBatch, findProgram, findSchool, offeredPrograms, offeredSchools } from './findSchool';

describe('reading the answer', () => {
  it('finds the program in free text, whatever the case or dots', () => {
    expect(findProgram('scope 2024')).toBe('SCOPE');
    expect(findProgram("I'm in SENSE, 25 batch")).toBe('SENSE');
    expect(findProgram('m.tech 2025')).toBe('MTech');
    expect(findProgram('2024')).toBeUndefined();
    expect(findProgram('SCOPE or SCORE')).toBeUndefined(); // two: not sure, so ask
  });

  it('finds the year: full, short or with an apostrophe', () => {
    expect(findBatch('SCOPE 2024')).toBe(2024);
    expect(findBatch('25 batch')).toBe(2025);
    expect(findBatch("SCOPE '25")).toBe(2025);
    expect(findBatch('SCOPE')).toBeUndefined();
    expect(findBatch('2024 or 2025')).toBeUndefined(); // two different years
  });
});

describe('findSchool: program + year → an existing list (Q7)', () => {
  it("older batches use the plain list, 2025 the ('25 Batch) list", () => {
    expect(findSchool('SCOPE', 2024)).toEqual({ status: 'found', school: 'SCOPE', batch: 2024 });
    expect(findSchool('SCOPE', 2025)).toEqual({
      status: 'found',
      school: "SCOPE ('25 Batch)",
      batch: 2025,
    });
    expect(findSchool('SCOPE', 25)).toMatchObject({ school: "SCOPE ('25 Batch)" }); // short year
  });

  it('never guesses when no list fits', () => {
    // Only a plain SCHEME list exists, so a 2025 SCHEME student is asked again.
    expect(findSchool('SCHEME', 2025)).toEqual({
      status: 'noList',
      program: 'SCHEME',
      batch: 2025,
    });
    // Nothing is known about batches after 2025 yet.
    expect(findSchool('SCOPE', 2026).status).toBe('noList');
  });

  it('says so when the list exists but is empty (Q6)', () => {
    expect(findSchool('SCE', 2024)).toEqual({ status: 'noCourses', school: 'SCE' });
    expect(findSchool('SBST', 2025)).toEqual({ status: 'noCourses', school: "SBST ('25 Batch)" });
  });

  it('says what is missing', () => {
    expect(findSchool(undefined, 2024)).toEqual({ status: 'needMore', missing: ['program'] });
    expect(findSchool('SCOPE')).toEqual({ status: 'needMore', missing: ['batch'] });
  });
});

describe('the options shown', () => {
  it("are the website's buttons minus empty lists, SCOPE first", () => {
    expect(offeredSchools()[0]).toBe('SCOPE');
    expect(offeredSchools()).not.toContain('SCE');
    expect(offeredSchools()).not.toContain("SBST ('25 Batch)");
    expect(offeredPrograms()[0]).toBe('SCOPE');
    expect(offeredPrograms()).toContain('SBST'); // the plain SBST list has courses
    expect(offeredPrograms()).not.toContain('SCE');
  });
});
