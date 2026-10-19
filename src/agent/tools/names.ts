// Matching a professor the student named ("Prof Brisilla", "dr. manivannan") against the name
// in the data ("BRISILLA R M", "MANIVANNAN P"). Shared by generate, filterRank and finalCheck so
// all three agree on what "Prof X" means.

const TITLES = new Set([
  'prof',
  'professor',
  'dr',
  'mr',
  'mrs',
  'ms',
  'miss',
  'sir',
  'madam',
  'maam',
]);

// "Prof. Brisilla" → "brisilla"; "Dr Jaya Subalakshmi" → "jaya subalakshmi".
export function cleanName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w && !TITLES.has(w))
    .join(' ');
}

// Does this faculty name contain every word the student gave? ("jaya subalakshmi" matches
// "JAYA SUBALAKSHMI R"; "brisilla" matches "BRISILLA R M"; a soft-skills company "FACE" matches
// "FACE (APT) (SJT404)", Q8.)
export function professorMatches(faculty: string, wanted: string): boolean {
  const words = cleanName(wanted).split(' ').filter(Boolean);
  if (words.length === 0) return false;
  const have = cleanName(faculty).split(' ');
  return words.every(w => have.includes(w));
}
