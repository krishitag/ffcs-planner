// Graph step 1 (3.4): the LLM reads the student's message and fills in the constraints form
// (constraints.ts). Zod checks the answer; if it's invalid, the LLM sees the error and tries
// again (up to 3 attempts), so the student never sees a broken form.
import { AIMessage, type BaseMessage } from '@langchain/core/messages';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { Constraints } from '../constraints';
import { callLlm, getModel, LlmUnavailableError } from '../llm';
import type { AgentStateType } from '../state';

const MAX_ATTEMPTS = 3;

export const PARSE_INSTRUCTIONS = `You turn a VIT student's timetable request into a structured form.
Rules:
- Fill in ONLY what the student actually said. Never guess courses, professors, slots, times or days.
- Courses: copy each course exactly as the student wrote it ("OS", "DBMS", "BCSE303L"). Labs come with
  their theory course automatically, so "OS with lab" is just "OS".
- Times are 24-hour "HH:MM". "No 8am classes" means nothing before "09:00". "Done by 5" means nothing after "17:00".
- Days are Mon, Tue, Wed, Thu, Fri. Students make typos ("fridday", "thrusday"): use the day they meant.
- Strength: "must" unless they say "if possible", "prefer", "ideally", "would be nice" or similar.
- Professors: write only the name the student used, without titles ("Prof Brisilla" → "Brisilla").
- A professor the student does NOT want gets wish "avoid".
- Only fill "shift" if they ask for mornings or evenings. Only fill "student" with what they said
  about themselves (school like "SCOPE", batch year, branch like "BCE" or "BAI").
- If a previous form is given, this message may add to or change it: return the COMPLETE updated
  form, keeping earlier wishes unless the student changes or removes them.`;

// The text of the latest message from the student.
export function latestStudentText(messages: BaseMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].getType() === 'human') return String(messages[i].content);
  }
  return '';
}

// The prompt for one attempt: the rules, the previous form (for follow-ups), the message,
// and the previous attempt's error if there was one.
export function buildPrompt(message: string, previous?: Constraints, lastError?: string): string {
  const parts = [PARSE_INSTRUCTIONS];
  if (previous) parts.push(`Previous form:\n${JSON.stringify(previous)}`);
  parts.push(`Student's message:\n${message}`);
  if (lastError) {
    parts.push(`Your previous answer was invalid: ${lastError}\nFix it and answer again.`);
  }
  return parts.join('\n\n');
}

// The LLM never gave a valid form, even after seeing its errors.
export class CouldNotParseError extends Error {}

// Ask the model to fill the form; check it with Zod; retry with the error if it's invalid.
// Rate limits and time-outs are NOT retried here (callLlm handles them; retrying would only
// burn quota or make the student wait longer): LlmUnavailableError goes straight up.
export async function extractConstraints(
  message: string,
  previous?: Constraints,
  model: BaseChatModel = getModel({ temperature: 0 })
): Promise<Constraints> {
  const structured = model.withStructuredOutput(Constraints, { name: 'constraints' });
  let lastError: string | undefined;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const raw = await callLlm(signal =>
        structured.invoke(buildPrompt(message, previous, lastError), { signal })
      );
      return Constraints.parse(raw); // checks everything, including .refine rules and defaults
    } catch (e) {
      if (e instanceof LlmUnavailableError) throw e;
      lastError = e instanceof Error ? e.message.slice(0, 500) : String(e);
    }
  }
  throw new CouldNotParseError(
    `Couldn't understand the request after ${MAX_ATTEMPTS} tries: ${lastError}`
  );
}

// What the student sees when parsing fails (the chat keeps going; nothing else changes).
export const LLM_BUSY_REPLY =
  "Sorry, I can't reach the AI right now (it's busy or out of quota). Please try again in a minute.";
export const COULD_NOT_PARSE_REPLY =
  'Sorry, I couldn\'t understand that. Could you say it another way? For example: "OS and CN, no 8am classes".';

// The graph node: fills `constraints`, plus the branch if the student said it (and we didn't
// already know). School and batch stay inside `constraints.student`: askSchool turns them into a
// real course list (4.2). Writes nothing else (one writer per field, state.ts).
// If it fails, it adds a short reply to `messages` instead, and the graph ends the turn there
// (afterParse in graph.ts); the earlier constraints stay as they were.
export async function parseRequest(
  state: AgentStateType,
  model?: BaseChatModel
): Promise<Partial<AgentStateType>> {
  let constraints: Constraints;
  try {
    constraints = await extractConstraints(
      latestStudentText(state.messages),
      state.constraints,
      model
    );
  } catch (e) {
    if (e instanceof LlmUnavailableError) return { messages: [new AIMessage(LLM_BUSY_REPLY)] };
    if (e instanceof CouldNotParseError) {
      return { messages: [new AIMessage(COULD_NOT_PARSE_REPLY)] };
    }
    throw e;
  }
  return { constraints, branch: state.branch ?? constraints.student?.branch };
}
