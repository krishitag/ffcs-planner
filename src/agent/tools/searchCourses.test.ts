import { describe, it, expect } from 'vitest';
import { searchCourses, editDistance } from './searchCourses';

// Small helper: search SCOPE and return the code of a "found" result (or the status).
const find = (query: string, branch?: string) => {
  const r = searchCourses({ school: 'SCOPE', query, branch });
  return r.status === 'found' ? r.match.code : r.status;
};

describe('searchCourses: finding the right course', () => {
  it('finds a course by its code, even without the last letter', () => {
    expect(find('BCSE303')).toBe('BCSE303L');
    expect(find('bcse303l')).toBe('BCSE303L');
  });

  it('finds a course by its initials ("OS"), not NoSQL like the P.1 letter search', () => {
    expect(find('OS')).toBe('BCSE303L');
    expect(find('CN')).toBe('BCSE308L');
    expect(find('TOC')).toBe('BCSE304L');
  });

  it('finds a course despite a typo', () => {
    expect(find('operating sytems')).toBe('BCSE303L');
    expect(find('compiler desgin')).toBe('BCSE307L'); // two letters swapped
  });

  it('finds nicknames from the alias list (D9)', () => {
    expect(find('DBMS')).toBe('BCSE302L');
    expect(find('DSA')).toBe('BCSE202L');
    expect(find('COA')).toBe('BCSE205L');
  });

  it('attaches the lab that comes with a theory course', () => {
    const r = searchCourses({ school: 'SCOPE', query: 'OS' });
    expect(r.status === 'found' && r.match.labCode).toBe('BCSE303P');
  });
});

describe('searchCourses: the same course in several groups (Q11)', () => {
  it("picks the student's own specialization group", () => {
    const r = searchCourses({ school: 'SCOPE', query: 'ML', branch: 'BAI' });
    expect(r.status).toBe('found');
    expect(r.status === 'found' && r.match.domain).toBe('Specialization Elective - BAI');
  });

  it('picks the general group for a branch without its own group', () => {
    const r = searchCourses({ school: 'SCOPE', query: 'ML', branch: 'BCE' });
    expect(r.status === 'found' && r.match.domain).toBe('DisciplineElective');
  });

  it('asks (ambiguous, several groups) when the branch is unknown, never mixing groups', () => {
    const r = searchCourses({ school: 'SCOPE', query: 'ML' });
    expect(r.status).toBe('ambiguous');
    if (r.status !== 'ambiguous') return;
    expect(r.reason).toBe('several groups');
    expect(r.candidates.map(c => c.domain).sort()).toEqual([
      'DisciplineElective',
      'Specialization Elective - BAI',
      'Specialization Elective - BDS',
    ]);
  });
});

describe('searchCourses: when it should not find anything', () => {
  it('says "not offered in your school" for nonsense', () => {
    expect(find('quantum cooking')).toBe('notOfferedInSchool');
  });

  it('recognises an empty school instead of calling it unknown (Q6)', () => {
    expect(searchCourses({ school: 'SCE', query: 'OS' }).status).toBe('noCoursesForSchool');
    expect(searchCourses({ school: "MIS ('25 Batch)", query: 'OS' }).status).toBe(
      'noCoursesForSchool'
    );
  });

  it('refuses a school that does not exist', () => {
    expect(searchCourses({ school: 'HOGWARTS', query: 'OS' }).status).toBe('unknownSchool');
  });
});

describe('editDistance', () => {
  it('counts single-letter changes', () => {
    expect(editDistance('sytems', 'systems')).toBe(1);
    expect(editDistance('kitten', 'sitting')).toBe(3);
    expect(editDistance('same', 'same')).toBe(0);
    expect(editDistance('desgin', 'design')).toBe(1); // swapped neighbours count once
  });
});
