# FFCS Planning Agent

A chat-based timetable planner built on top of FFCS-inator. A student types something like
_"I need OS, CN and DBMS with labs, no 8am classes, keep Friday free"_, and the agent finds
timetables that fit, using FFCS-inator's own course data and timetable generator.

**Core rule: the LLM plans, code verifies.** The LLM understands the request, chooses which
tools to call and explains results. It never decides on its own whether slots clash, and never
invents slots, professors or courses. Every fact comes from code that reads the repo's data.

Everything for the agent lives in this folder (`src/agent/`). The original FFCS-inator code stays
where it was.

## How to run things

The site and the scripts need **Node 22** (Node 25 crashes the site; see LEARNING.md, Phase 0).
In each new terminal tab:

```bash
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
node --version   # should print v22...
```

Run a TypeScript file directly with `tsx`:

```bash
npx tsx src/agent/playground/p2-graph.ts
```

### Chat with the agent

Needs `GOOGLE_API_KEY` (and `LLM_PROVIDER=gemini`) in `.env.local`.

```bash
npx tsx src/agent/scripts/chat.ts                              # chat, school SCOPE
npx tsx src/agent/scripts/chat.ts --school SCORE --branch BAI
npx tsx src/agent/scripts/chat.ts --once "OS and CN, no 8am"
LLM_MODEL=gemini-3.5-flash-lite npx tsx src/agent/scripts/chat.ts   # cheaper model for dev
npx tsx src/agent/scripts/latency.ts                           # time each step
```

### Tests

```bash
yarn test:agent         # run every agent test once (128 today; the LLM is faked)
yarn test:agent:watch   # rerun on every save
```

Test files sit next to the file they test and end in `.test.ts`.

### After every CodeChef data update

```bash
git pull upstream prod
npx tsx src/agent/data/updateDataVersion.ts   # writes the new data date into dataVersion.ts
npx tsx src/agent/data/validate.ts            # reports anything the agent can't read yet
```

Commit `dataVersion.ts` with the update. The validator never changes data; it only reports.

## What each file does

### In this folder

| File                        | What it is                                                                                                                                                                                                                                                                                                    |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PLAN.md`                   | The build plan: every subtask with a checkbox, plus the decisions, slot rules (R1–R8) and open questions (Q1–Q11)                                                                                                                                                                                             |
| `README.md`                 | This file: what each file does and how they connect                                                                                                                                                                                                                                                           |
| `LEARNING.md`               | My learning log, one section per phase: what I built, the concepts, the decisions and why, and interview questions                                                                                                                                                                                            |
| `INTERVIEW.md`              | My interview revision sheet: the pitch, key numbers, stories, a glossary and every interview question with short answers, by topic. Updated after every phase                                                                                                                                                 |
| `playground/p1-tools.ts`    | Learning exercise: one tool (`searchCourses`), what the LLM sees of it, and a tool-call round trip. Not used by the agent                                                                                                                                                                                     |
| `playground/p2-graph.ts`    | Learning exercise: the smallest LangGraph (two nodes, a loop, a reducer). Not used by the agent                                                                                                                                                                                                               |
| `data/loadCourses.ts`       | Reads every course from `src/data` into one flat list (school, domain, code, full name, type, entries). 938 courses today                                                                                                                                                                                     |
| `data/toFullCourseData.ts`  | Builds **every** option for one course (every slot, professor and lab) by "picking everything" with the website's own picker rules and `buildCourseData`. Drops professors with no real lab (Q1) and copies the site when nothing can be picked (Q10)                                                         |
| `data/slotTimes.ts`         | Turns a slot string into every weekly session with real day, start and end times (e.g. `A1` = Mon 08:00–08:50 and Wed 09:00–09:50), derived from the website's grid                                                                                                                                           |
| `data/validate.ts`          | Reports anything in the data the agent can't read (odd slot strings, empty courses, repeated codes, Q10 courses, empty schools, a stale data version). Never changes data                                                                                                                                     |
| `data/updateDataVersion.ts` | Writes the date `src/data` last changed (from Git) into `dataVersion.ts`                                                                                                                                                                                                                                      |
| `data/dataVersion.ts`       | Generated: `DATA_VERSION`, the course data's date (shown to students)                                                                                                                                                                                                                                         |
| `data/*.check.ts`           | Small scripts that run each file on real courses and print the results                                                                                                                                                                                                                                        |
| `data/aliases.ts`           | Student nicknames that initials can't find (`DBMS`, `DSA`, `COA`), checked by the validator (D9)                                                                                                                                                                                                              |
| `constraints.ts`            | The Zod "form" for what a student wants: courses (+ professor and slot wishes), free days, no classes before/after, shift, same building, school/batch/branch. Each wish is `must` or `prefer` (default `must`, D10)                                                                                          |
| `tools/searchCourses.ts`    | Finds the real course a student means (code, full name, initials, words with typos, nicknames, soft-skills company), only in their school; answers found / ambiguous / not offered / no courses for that school; keeps specialization groups apart (Q11)                                                      |
| `tools/generate.ts`         | The generator wrapper: removes options that break a must wish (D11), groups same-slot sections (~93× fewer combinations), refuses if too many, runs the website's `generateTT`, and explains failures (the smallest set of wishes to blame, or which wishes to drop). NIL-only courses skip `generateTT` (R6) |
| `tools/filterRank.ts`       | Scores timetables on the prefer wishes (professors count double, D12), keeps the top 3 that really differ, and gives a reason for every point; handles same building                                                                                                                                          |
| `tools/finalCheck.ts`       | The last gate: re-checks every timetable from the raw data (real slots, really offered, the professor's own lab, no clashes two ways, every must wish) before a student sees it                                                                                                                               |
| `llm.ts`                    | `getModel()`: the one place that picks the LLM (Gemini 3.8 Flash; `LLM_MODEL` overrides). `callLlm()`: wraps every LLM call with the rate-limit rule (≤10s wait → one retry, else `LlmUnavailableError`) and a 30s limit (`LlmTimeoutError`, request cancelled)                                               |
| `llm.check.ts`              | Sends Gemini one tiny message to check the key and model work                                                                                                                                                                                                                                                 |
| `state.ts`                  | The graph's shared state (the "notebook"). Each field has one writer node; courses are stored as small refs                                                                                                                                                                                                   |
| `nodes/parseRequest.ts`     | Graph step 1: Gemini fills the constraints form, Zod checks it, 3 tries with the error shown. Replies "can't reach the AI" or "please rephrase" instead of crashing                                                                                                                                           |
| `nodes/resolveCourses.ts`   | Graph step 2: plain code runs the course search for each course, only in the student's school; unclear ones are kept aside                                                                                                                                                                                    |
| `nodes/generate.ts`         | Graph step 3: thin glue around `tools/generate.ts`                                                                                                                                                                                                                                                            |
| `nodes/filterAndRank.ts`    | Graph step 4: ranks with `tools/filterRank.ts`, keeps only timetables that pass `tools/finalCheck.ts`                                                                                                                                                                                                         |
| `nodes/present.ts`          | Graph step 5: fact sheet from checked data → Gemini words it → code checks for invented slots/codes → one retry → plain code-written answer (tagged with why)                                                                                                                                                 |
| `nodes/*.check.ts`          | Live scripts that run a node against real Gemini and print the result                                                                                                                                                                                                                                         |
| `graph.ts`                  | Wires the nodes: parse → resolve → generate → filterAndRank → present, with `afterParse` (end the turn if parse already replied) and `afterResolve` (skip to present if no course was found)                                                                                                                  |
| `scripts/chat.ts`           | Chat with the agent in the terminal; prints `[present: plain fallback, <reason>]` when the plain answer was used                                                                                                                                                                                              |
| `scripts/latency.ts`        | Times parse (default thinking vs budget 0), the code steps and present on 3 requests                                                                                                                                                                                                                          |
| `**/*.test.ts`              | Vitest tests for all of the above (128 today)                                                                                                                                                                                                                                                                 |
| `vitest.config.mts`         | Test runner config (the `@/` alias, tests only inside `src/agent/`)                                                                                                                                                                                                                                           |

### Coming next (folders appear when their first file is added)

| Folder / file | What it will hold                                                                             | Phase |
| ------------- | --------------------------------------------------------------------------------------------- | ----- |
| `nodes/`      | More steps: ask for school/batch/branch, ask about unclear courses, relax a wish (interrupts) | 4     |
| `evals/`      | About 50 test requests and the script that scores the agent                                   | 6     |

### Outside this folder (existing FFCS-inator code the agent reuses)

| File                     | What the agent uses from it                                                                                                                                                                                                                                                                           |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/courseData.ts`  | `buildCourseData()`, `getCourseType()`, the `schools` list and the picker's option rules (`getVisibleSubjects`, `getTheorySlots`, `getFacultiesForSlot`, `getLabShiftSlots`, `getFacultiesForLabSlots`). Moved here from `FacultySelector.tsx` so the website and the agent use exactly the same code |
| `src/data/faculty.ts`    | `data`: every course, slot, professor and room, by school → domain → course                                                                                                                                                                                                                           |
| `src/lib/utils.ts`       | `generateTT()`: FFCS-inator's timetable generator (the source of truth for clash-free timetables)                                                                                                                                                                                                     |
| `src/lib/slots.ts`       | `getSlot()` (a slot string's grid cells), `clashMap` (which slots clash) and the grid's day/hour labels (`DAY_LABEL_CELLS`, `HOUR_LABEL_CELLS`, moved here from `TimeTable.tsx`)                                                                                                                      |
| `src/lib/filterUtils.ts` | `evaluateFilters()`: the site's same-building check                                                                                                                                                                                                                                                   |
| `src/lib/type.ts`        | The shared types `fullCourseData` and `timetableDisplayData`                                                                                                                                                                                                                                          |

## How the pieces connect

Built so far (Phase 3), in `graph.ts`:

```
START → parseRequest ─┬─ understood → resolveCourses ─┬─ some found → generate → filterAndRank → present → END
   (LLM → constraints) │   (search, own school only)   └─ none found ─────────────────────────→ present
                       └─ AI busy / not understood (it already replied) → END
```

Only `parseRequest` and `present` call the LLM, both through `callLlm`. Still to come: asking the
student about unclear courses and which wish to relax when nothing fits (Phase 4, interrupts).
