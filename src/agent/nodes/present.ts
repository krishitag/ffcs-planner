// Graph step 5 (3.7): explain the results to the student.
//   1. Code builds a FACT SHEET from checked data only (buildFacts).
//   2. The LLM turns the facts into friendly text.
//   3. Code checks the text mentions no slot or course code that isn't in the facts
//      (groundingProblems). One retry with the problem pointed out; then a plain, code-written
//      answer (fallbackText). The student always gets an answer, and never an invented one.
import { AIMessage } from '@langchain/core/messages';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { callLlm, getModel, LlmTimeoutError, LlmUnavailableError } from '../llm';
import { formatTime } from '../data/slotTimes';
import { DATA_VERSION } from '../data/dataVersion';
import { courseFor, type AgentStateType } from '../state';
import type { MustWish } from '../tools/generate';

// ---- 1. The fact sheet -------------------------------------------------------------------

export type CourseFact = {
  query: string; // what the student called it
  code: string;
  name: string;
  slot: string;
  labSlot?: string;
  professor: string; // the section shown
  otherSections: string[]; // same slot, other professors / rooms (grouping rule)
  times: string[]; // "Mon 08:00-08:50 (A1)"; empty for NIL courses
};

export type Facts = {
  school?: string;
  dataVersion: string;
  timetables: { rank: number; reasons: string[]; courses: CourseFact[] }[];
  notFound: { query: string; why: string; options?: string[] }[];
  noTimetable?: { why: string; ways_out: string[] };
};

export function buildFacts(state: AgentStateType): Facts {
  const facts: Facts = {
    school: state.school,
    dataVersion: DATA_VERSION,
    timetables: [],
    notFound: [],
  };

  // The checked, ranked timetables.
  state.ranked.forEach((r, i) => {
    facts.timetables.push({
      rank: i + 1,
      reasons: r.reasons.map(x => `${x.points >= 0 ? '+' : ''}${x.points}: ${x.text}`),
      courses: r.timetable.map(g => {
        const shown = g.members[0];
        const resolved = state.resolved.find(x => x.query === g.course);
        const course = resolved ? courseFor(resolved.ref) : undefined;
        return {
          query: g.course,
          code: shown.code,
          name: course?.name ?? shown.code,
          slot: g.slot,
          labSlot: g.labSlot,
          professor: shown.faculty,
          otherSections: g.members.slice(1).map(m => m.faculty),
          times: shown.sessions.map(
            s => `${s.day} ${formatTime(s.start)}-${formatTime(s.end)} (${s.slot})`
          ),
        };
      }),
    });
  });

  // Courses we couldn't match cleanly.
  for (const u of state.unresolved) {
    const r = u.result;
    if (r.status === 'ambiguous') {
      facts.notFound.push({
        query: u.query,
        why:
          r.reason === 'several groups'
            ? 'offered in several groups; which one depends on your branch/specialization'
            : 'matches several courses',
        options: r.candidates.map(c => `${c.code} ${c.name} (${c.domain})`),
      });
    } else if (r.status === 'notOfferedInSchool') {
      facts.notFound.push({ query: u.query, why: `not offered in ${r.school}` });
    } else if (r.status === 'noCoursesForSchool') {
      facts.notFound.push({ query: u.query, why: `no courses are listed for ${r.school} yet` });
    } else if (r.status === 'unknownSchool') {
      facts.notFound.push({ query: u.query, why: 'I need to know your school first' });
    }
  }

  // Why nothing fits, if nothing does.
  const g = state.generated;
  if (g?.status === 'courseImpossible') {
    facts.noTimetable = {
      why:
        g.conflict.length === 0
          ? `${g.course} has no section you can pick on FFCS-inator right now`
          : `no section of ${g.course} fits ${g.conflict.map(describeWish).join(' together with ')}`,
      ways_out: g.conflict.length ? g.conflict.map(w => `drop "${describeWish(w)}"`) : [],
    };
  } else if (g?.status === 'noTimetable') {
    facts.noTimetable = {
      why: 'every course has sections that fit your wishes, but they clash with each other',
      ways_out: g.fixes.map(
        f => `drop "${f.drop.map(describeWish).join('" and "')}" → ${f.timetables} timetables`
      ),
    };
  } else if (g?.status === 'tooMany') {
    facts.noTimetable = {
      why: `there are too many combinations (${g.combinations}) to check at once`,
      ways_out: ['add a wish (a professor, a free day or a time limit) to narrow it down'],
    };
  } else if (g?.status === 'ok' && state.rankIssue === 'same building') {
    facts.noTimetable = {
      why: 'no timetable puts all your classes in one building',
      ways_out: ['drop "same building", or make it "if possible"'],
    };
  }
  return facts;
}

export function describeWish(w: MustWish): string {
  switch (w.kind) {
    case 'freeDay':
      return `${w.day} free`;
    case 'noClassesBefore':
      return `nothing before ${w.time}`;
    case 'noClassesAfter':
      return `nothing after ${w.time}`;
    case 'shift':
      return `${w.value}s only`;
    case 'professor':
      return w.wish === 'must' ? `${w.name} for ${w.course}` : `not ${w.name} for ${w.course}`;
    case 'slot':
      return `${w.course} in ${w.value}`;
  }
}

// ---- 2. The LLM's wording -----------------------------------------------------------------

export const PRESENT_INSTRUCTIONS = `You are a friendly VIT timetable assistant. Explain the results below to the student.
Rules:
- Use ONLY the facts given. Never invent a course, slot, professor, room, day or time.
- If there are timetables: show each one briefly (course, slot, professor, lab slot) and explain its
  trade-offs using its reasons in plain words (don't show the point numbers). Mention when other
  sections share the same slot.
- If something isn't found or nothing fits: say so clearly, explain why, and offer the ways out as a question.
- Keep it short and easy to read. Use plain text with simple lists.
- End with one line: "Course data from <dataVersion>."`;

// ---- 3. Checking the wording --------------------------------------------------------------

const SLOT_TOKEN = /\b(?:T{1,2}[A-G]{1,2}\d|[A-G]\d|L\d{1,2})\b/g;
const CODE_TOKEN = /\b[A-Z]{3,5}\d{3}[A-Z]?\b/g;

// Slots or course codes in the text that the facts don't contain.
export function groundingProblems(text: string, facts: Facts): string[] {
  const known = JSON.stringify(facts);
  const allowedSlots = new Set(known.match(SLOT_TOKEN) ?? []);
  const allowedCodes = new Set(known.match(CODE_TOKEN) ?? []);
  const problems: string[] = [];
  for (const s of new Set(text.match(SLOT_TOKEN) ?? [])) {
    if (!allowedSlots.has(s)) problems.push(`slot ${s} is not in the facts`);
  }
  for (const c of new Set(text.match(CODE_TOKEN) ?? [])) {
    if (!allowedCodes.has(c)) problems.push(`course ${c} is not in the facts`);
  }
  return problems;
}

// A plain answer written by code: used if the LLM fails or keeps inventing things.
export function fallbackText(facts: Facts): string {
  const lines: string[] = [];
  for (const t of facts.timetables) {
    lines.push(`Option ${t.rank}:`);
    for (const c of t.courses) {
      const lab = c.labSlot ? `, lab ${c.labSlot}` : '';
      const others = c.otherSections.length ? ` (+${c.otherSections.length} other sections)` : '';
      lines.push(`  ${c.code} ${c.name}: ${c.slot}${lab}, ${c.professor}${others}`);
    }
    if (t.reasons.length) lines.push(`  Why: ${t.reasons.join('; ')}`);
  }
  for (const n of facts.notFound) {
    lines.push(`"${n.query}": ${n.why}${n.options ? `. Options: ${n.options.join(' | ')}` : ''}`);
  }
  if (facts.noTimetable) {
    lines.push(`No timetable fits: ${facts.noTimetable.why}.`);
    if (facts.noTimetable.ways_out.length) {
      lines.push(`You could: ${facts.noTimetable.ways_out.join('; or ')}.`);
    }
  }
  if (lines.length === 0) lines.push('Tell me which courses you need, and any wishes.');
  lines.push(`Course data from ${facts.dataVersion}.`);
  return lines.join('\n');
}

// Why the plain answer was used instead of the LLM's (undefined = the LLM's answer was used).
export type Fallback = 'llm-busy' | 'llm-timeout' | 'llm-error' | 'not-grounded';

export async function writeAnswer(
  facts: Facts,
  model: BaseChatModel
): Promise<{ text: string; fallback?: Fallback }> {
  let feedback = '';
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const reply = await callLlm(signal =>
        model.invoke(
          `${PRESENT_INSTRUCTIONS}\n\nFacts:\n${JSON.stringify(facts, null, 1)}${feedback}`,
          { signal }
        )
      );
      const text = String(reply.content).trim();
      const problems = groundingProblems(text, facts);
      if (text && problems.length === 0) return { text };
      feedback = `\n\nYour previous answer mentioned things that are not in the facts (${problems.join('; ')}). Rewrite it using only the facts.`;
    } catch (e) {
      // the LLM failed: use the plain answer
      return {
        text: fallbackText(facts),
        fallback:
          e instanceof LlmTimeoutError
            ? 'llm-timeout'
            : e instanceof LlmUnavailableError
              ? 'llm-busy'
              : 'llm-error',
      };
    }
  }
  return { text: fallbackText(facts), fallback: 'not-grounded' };
}

// The graph node: adds the answer to the conversation (messages append, state.ts).
// If the plain answer was used, the message says why in additional_kwargs.fallback
// (the student sees the same text either way; chat.ts shows the tag for us).
export async function present(
  state: AgentStateType,
  model: BaseChatModel = getModel({ temperature: 0.3 })
): Promise<Partial<AgentStateType>> {
  const { text, fallback } = await writeAnswer(buildFacts(state), model);
  return {
    messages: [new AIMessage({ content: text, additional_kwargs: fallback ? { fallback } : {} })],
  };
}
