import { describe, it, expect } from 'vitest';
import { cleanName, professorMatches } from './names';

describe('professor names', () => {
  it('drops titles and punctuation', () => {
    expect(cleanName('Prof. Brisilla')).toBe('brisilla');
    expect(cleanName('Dr Jaya Subalakshmi')).toBe('jaya subalakshmi');
  });

  it('matches what the student typed against the name in the data', () => {
    expect(professorMatches('BRISILLA R M', 'Prof Brisilla')).toBe(true);
    expect(professorMatches('MANIVANNAN P', 'manivannan')).toBe(true);
    expect(professorMatches('JAYA SUBALAKSHMI R', 'jaya subalakshmi')).toBe(true);
    expect(professorMatches('FACE (APT) (SJT404)', 'FACE')).toBe(true); // soft-skills company (Q8)
  });

  it('does not match a different person or an empty name', () => {
    expect(professorMatches('BRISILLA R M', 'Tamizharasi')).toBe(false);
    expect(professorMatches('BRISILLA R M', 'Prof')).toBe(false);
  });
});
