// The "form" for what a student wants. The LLM fills it in from the student's message
// (Phase 3); Zod checks it before any of our code uses it. The .describe() texts are sent
// to the LLM as instructions, so they're written for it.
import { z } from 'zod';
import { slotProblem } from './data/validate';

// "must": the timetable has to obey it. "prefer": try to, but it can be traded off.
// If the student doesn't say how strongly, it's "must" (decision for 2.3); the relax step
// asks before dropping it.
export const Strength = z
  .enum(['must', 'prefer'])
  .default('must')
  .describe('"must" unless the student says "if possible", "prefer", "ideally" or similar');

// 24-hour "HH:MM", e.g. "09:00". (Times are compared as minutes since midnight; see toMinutes.)
export const Time = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'time must be 24-hour HH:MM, e.g. "09:00"');

export const Day = z.enum(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);

// A course as the student typed it; 2.2's search finds the real course later.
export const CourseWish = z.object({
  query: z
    .string()
    .min(1)
    .describe(
      'The course exactly as the student wrote it: a code, name or nickname ("OS", "BCSE303L")'
    ),
  professor: z
    .object({
      name: z
        .string()
        .min(1)
        .describe('Professor (or soft-skills company, e.g. "FACE") as the student wrote it'),
      wish: z
        .enum(['must', 'prefer', 'avoid'])
        .default('must')
        .describe('"avoid" if the student does NOT want this professor'),
    })
    .optional()
    .describe('Only if the student named a professor for this course'),
  slot: z
    .object({
      value: z
        .string()
        .refine(s => slotProblem(s) === null, {
          message: 'slot must be on the timetable grid, e.g. "A1+TA1" or "L31+L32"',
        })
        .describe('The slot as the student wrote it, e.g. "A1+TA1" or "B2"'),
      strength: Strength,
    })
    .optional()
    .describe('Only if the student named a slot for this course, e.g. "OS in A1+TA1"'),
});

export const Constraints = z
  .object({
    courses: z
      .array(CourseWish)
      .default([])
      .describe('Every course the student wants. Labs come with their theory course automatically'),

    freeDays: z
      .array(z.object({ day: Day, strength: Strength }))
      .default([])
      .describe('Days with no classes or labs at all, e.g. "keep Friday free"'),

    noClassesBefore: z
      .object({ time: Time, strength: Strength })
      .optional()
      .describe('Earliest allowed start, for theory AND labs. "No 8am classes" → "09:00"'),

    noClassesAfter: z
      .object({ time: Time, strength: Strength })
      .optional()
      .describe('Latest allowed end, for theory AND labs. "Done by 5" → "17:00"'),

    shift: z
      .object({ value: z.enum(['morning', 'evening']), strength: Strength })
      .optional()
      .describe('ONLY if the student asks for mornings or evenings; otherwise leave it out (R4)'),

    sameBuilding: z
      .object({ strength: Strength })
      .optional()
      .describe('Only if the student wants all classes in one building'),

    student: z
      .object({
        school: z.string().optional().describe('e.g. "SCOPE"'),
        batch: z.number().int().optional().describe('Year they joined, e.g. 2024'),
        branch: z.string().optional().describe('Branch or specialization code, e.g. "BCE", "BAI"'),
      })
      .optional()
      .describe('Only what the student actually said about themselves; never guess'),
  })
  .refine(
    c =>
      !c.noClassesBefore ||
      !c.noClassesAfter ||
      toMinutes(c.noClassesBefore.time) < toMinutes(c.noClassesAfter.time),
    { message: 'noClassesBefore must be earlier than noClassesAfter' }
  );

// The TypeScript type is worked out from the schema, so the two can never disagree.
export type Constraints = z.infer<typeof Constraints>;

// "09:00" → 540, to compare with Session.start / Session.end from slotTimes.ts.
export function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}
