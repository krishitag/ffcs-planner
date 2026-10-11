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

## What each file does

### In this folder

| File                     | What it is                                                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `PLAN.md`                | The build plan: every subtask with a checkbox, plus the decisions, slot rules (R1–R8) and open questions (Q1–Q9)          |
| `README.md`              | This file: what each file does and how they connect                                                                       |
| `LEARNING.md`            | My learning log, one section per phase: what I built, the concepts, the decisions and why, and interview questions        |
| `playground/p1-tools.ts` | Learning exercise: one tool (`searchCourses`), what the LLM sees of it, and a tool-call round trip. Not used by the agent |
| `playground/p2-graph.ts` | Learning exercise: the smallest LangGraph (two nodes, a loop, a reducer). Not used by the agent                           |

### Coming next (folders appear when their first file is added)

| Folder / file    | What it will hold                                                                                          | Phase |
| ---------------- | ---------------------------------------------------------------------------------------------------------- | ----- |
| `data/`          | Loading all courses, the slot → day/time table, the data validator, the data version                       | 1     |
| `tools/`         | Course search, the generator wrapper, the filter and ranker, the final check                               | 2     |
| `constraints.ts` | The schema for what the student wants (courses, blocked days and times, professors...)                     | 2     |
| `llm.ts`         | Which LLM to use (Gemini 2.5 Flash), chosen by the `LLM_PROVIDER` env var                                  | 3     |
| `state.ts`       | The graph's shared state (the "notebook" every step reads and writes)                                      | 3     |
| `nodes/`         | One file per graph step (understand request, resolve courses, generate, rank, relax, present, final check) | 3–4   |
| `graph.ts`       | Wires the nodes together with edges                                                                        | 3     |
| `evals/`         | About 50 test requests and the script that scores the agent                                                | 6     |

### Outside this folder (existing FFCS-inator code the agent reuses)

| File                     | What the agent uses from it                                                                                                                                                            |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/courseData.ts`  | `buildCourseData()`, `getCourseType()`, the `schools` list. Moved here from `FacultySelector.tsx` in Phase 0 so the website and the agent build course data with exactly the same code |
| `src/data/faculty.ts`    | `data`: every course, slot, professor and room, by school → domain → course                                                                                                            |
| `src/lib/utils.ts`       | `generateTT()`: FFCS-inator's timetable generator (the source of truth for clash-free timetables)                                                                                      |
| `src/lib/slots.ts`       | `slotMap` (where each slot sits on the grid) and `clashMap` (which slots clash)                                                                                                        |
| `src/lib/filterUtils.ts` | `evaluateFilters()`: the site's same-building check                                                                                                                                    |
| `src/lib/type.ts`        | The shared types `fullCourseData` and `timetableDisplayData`                                                                                                                           |

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
