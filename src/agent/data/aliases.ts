// Student nicknames for courses that initials alone can't find (D9).
// Key: what a student types (upper case). Value: the course's full name in the data.
// This is student slang, not course data; the validator reports any alias whose course
// isn't in the data any more.
export const COURSE_ALIASES: Record<string, string> = {
  DBMS: 'Database Systems', // initials would be "DS"
  DSA: 'Data Structures and Algorithms', // what students call it
  COA: 'Computer Architecture and Organization', // initials would be "CAO"
};
