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

### After every CodeChef data update

```bash
git pull upstream prod
npx tsx src/agent/data/updateDataVersion.ts   # writes the new data date into dataVersion.ts
npx tsx src/agent/data/validate.ts            # reports anything the agent can't read yet
```

Commit `dataVersion.ts` with the update. The validator never changes data; it only reports.

## What each file does

### In this folder

| File                        | What it is                                                                                                                                                                                                                                            |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PLAN.md`                   | The build plan: every subtask with a checkbox, plus the decisions, slot rules (R1–R8) and open questions (Q1–Q10)                                                                                                                                     |
| `README.md`                 | This file: what each file does and how they connect                                                                                                                                                                                                   |
| `LEARNING.md`               | My learning log, one section per phase: what I built, the concepts, the decisions and why, and interview questions                                                                                                                                    |
| `playground/p1-tools.ts`    | Learning exercise: one tool (`searchCourses`), what the LLM sees of it, and a tool-call round trip. Not used by the agent                                                                                                                             |
| `playground/p2-graph.ts`    | Learning exercise: the smallest LangGraph (two nodes, a loop, a reducer). Not used by the agent                                                                                                                                                       |
| `data/loadCourses.ts`       | Reads every course from `src/data` into one flat list (school, domain, code, full name, type, entries). 938 courses today                                                                                                                             |
| `data/toFullCourseData.ts`  | Builds **every** option for one course (every slot, professor and lab) by "picking everything" with the website's own picker rules and `buildCourseData`. Drops professors with no real lab (Q1) and copies the site when nothing can be picked (Q10) |
| `data/slotTimes.ts`         | Turns a slot string into every weekly session with real day, start and end times (e.g. `A1` = Mon 08:00–08:50 and Wed 09:00–09:50), derived from the website's grid                                                                                   |
| `data/validate.ts`          | Reports anything in the data the agent can't read (odd slot strings, empty courses, repeated codes, Q10 courses, empty schools, a stale data version). Never changes data                                                                             |
| `data/updateDataVersion.ts` | Writes the date `src/data` last changed (from Git) into `dataVersion.ts`                                                                                                                                                                              |
| `data/dataVersion.ts`       | Generated: `DATA_VERSION`, the course data's date (shown to students)                                                                                                                                                                                 |
| `data/*.check.ts`           | Small scripts that run each file on real courses and print the results                                                                                                                                                                                |

### Coming next (folders appear when their first file is added)

| Folder / file    | What it will hold                                                                                          | Phase |
| ---------------- | ---------------------------------------------------------------------------------------------------------- | ----- |
| `tools/`         | Course search, the generator wrapper, the filter and ranker, the final check                               | 2     |
| `constraints.ts` | The schema for what the student wants (courses, blocked days and times, professors...)                     | 2     |
| `llm.ts`         | Which LLM to use (Gemini 2.5 Flash), chosen by the `LLM_PROVIDER` env var                                  | 3     |
| `state.ts`       | The graph's shared state (the "notebook" every step reads and writes)                                      | 3     |
| `nodes/`         | One file per graph step (understand request, resolve courses, generate, rank, relax, present, final check) | 3–4   |
| `graph.ts`       | Wires the nodes together with edges                                                                        | 3     |
| `evals/`         | About 50 test requests and the script that scores the agent                                                | 6     |

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

```
student message
   → understand the request (LLM → constraints)
   → find the real courses (search tool, asks if ambiguous)
   → build every option (buildCourseData) → generate timetables (generateTT)
   → filter and rank (code) → final check (code)
   → explain the top 2–3 (LLM, using only checked data)
   ↺ if nothing fits: explain the conflict and ask which constraint to relax
```
