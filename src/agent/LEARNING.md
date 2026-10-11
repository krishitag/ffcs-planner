# Learning log

One section per phase: what I built, the concepts, the decisions and why, and questions I should
be able to answer in an interview. Short answers are at the end of each section; I should be able
to say them in my own words without reading.

---

## Phase 0: Prep (making the existing code reusable)

### What I built

- **`.gitignore`:** added `.env*.local` so my Gemini key can never be committed (commit `a573238`).
- **Refactor:** moved the course-data logic out of the website's course picker
  (`FacultySelector.tsx`) into `src/lib/courseData.ts`: `getCourseType`, the three
  `generateCourseSlots*` helpers, a new `buildCourseData()` and the `schools` list. The website now
  imports them from there, and so will the agent (commit `6157b90`).
- **Proof of "no behaviour change":** saved what the site stores for 5 courses of every type
  (theory+lab, embedded, theory-only, lab-only, soft skills) before the refactor, redid the same
  picks after it, and compared. All 5 were identical, and the timetable results matched (0 with
  All Subjects Mode ON because of a real clash, 2 with it OFF).
- **Open questions:** wrote down 9 things in the existing code that looked odd, and got each one
  answered (by me, from how VIT works) or marked "ask the CodeChef team", with a rule for the agent.

### Concepts

- **Refactor:** change where code lives, not what it does.
- **Golden-master (characterization) test:** record what the code does today, change it, check
  the output is identical. Useful when old code has no tests.
- **Pure function vs side effects:** `buildCourseData` only turns inputs into data. Popups and
  `localStorage` (browser-only side effects) stayed in the component.
- **`'use client'`:** marks a file as browser code in Next.js. Server code (like the agent) shouldn't
  import it, which is why the logic had to move.
- **Environment debugging:** the site crashed with `localStorage.getItem is not a function`. The
  real cause was **Node 25**, which adds a half-working `localStorage` on the server. Switching to
  Node 22 (LTS) fixed it without touching any code.

### Decisions and why

| Decision                                                                       | Why                                                                                                                  |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Move the logic into `src/lib/courseData.ts`, not copy it                       | One copy means the website and the agent can never drift apart                                                       |
| Keep the moved code word for word, verified line by line                       | The only way to be sure a refactor changes nothing                                                                   |
| Treat odd-looking code as a question, not a bug                                | The team built it around real VIT rules; most "odd" things turned out to be rules (lab pairs, NIL, soft-skill rooms) |
| All changes stay in my own repo                                                | My choice; `upstream` is only used to pull CodeChef's data updates                                                   |
| Agent offers the same schools as the site's buttons, read from the shared list | If CodeChef adds or removes a school, the agent follows automatically                                                |

### Interview questions

1. The code had no tests. How did you refactor it safely?
2. The site crashed locally. How did you find the cause?
3. Tell me about something in the existing code that looked wrong. What did you do?

**Short answers:**

1. "I saved what the site produced for one course of every type before the change, made the change
   as a pure move, then redid the same picks and compared. Identical output, plus type check and
   lint, meant no behaviour change."
2. "I read the first warning, not just the repeated error. It pointed at Node's new built-in
   `localStorage`. Switching from Node 25 to Node 22 fixed it, with no code changes."
3. "I wrote it down as a question instead of fixing it, then checked with how VIT actually works.
   Most were real rules; the rest went on a list for the maintainers, and the agent got a safe rule
   for each in the meantime."

---

## Learning track: tools (P.1) and graphs (P.2)

### What I built

- **`playground/p1-tools.ts`:** one tool, `searchCourses`, that searches SCOPE course names.
- **`playground/p2-graph.ts`:** the smallest LangGraph: an `addOne` node that loops until
  `count` reaches 3, then a `finish` node.

### Concepts

- **Tool:** my function + a name + a description + an input schema (Zod). The LLM sees only the
  name, description and schema, never my code or data.
- **Tool call round trip:** the LLM sends a tool call (name, args, id) → my code runs the function
  → a `ToolMessage` with the same id goes back → the LLM continues. The LLM never runs code.
- **State:** the shared "notebook" every node reads and writes.
- **Node:** a function that gets the state and returns only the parts it changes.
- **Edge / conditional edge:** a fixed next step, or a function that looks at the state and picks
  the next step.
- **Reducer:** how an update goes into the state. No reducer = replace; with a reducer (like
  "append") = combine.
- **Recursion limit:** LangGraph stops a run after 25 steps by default, so a loop can't run forever.

### What the experiments showed

- Searching "OS" by letters found **NoSQL Databases** and missed **Operating Systems**. Real search
  needs initials, typos and an "ambiguous" answer (step 2.2).
- Removing the reducer from `log` left 1 entry instead of 4: each update overwrote the last. Chat
  messages need an "append" reducer or the agent forgets the conversation.
- A loop that never stops hit `GraphRecursionError` after 25 steps. The relax loop needs its own
  counter (about 3 rounds) plus this limit as a safety net.

### Interview questions

1. Explain tool calling to someone who only knows RAG.
2. Why does each tool call have an id?
3. What's a reducer, and when do you need one?
4. How do you stop a graph loop from running forever?

**Short answers:**

1. "In RAG my code always calls the retriever. With tools, the LLM decides whether to call one and
   with what input, but my code still runs it and sends the result back."
2. "The LLM can request several calls at once; each answer carries the matching id so results get
   paired with the right request."
3. "It decides how a node's update is merged into the state. Without one, new values replace old
   ones; for chat messages you need an append reducer so history is kept."
4. "My own counter in the state that stops after a few rounds, with LangGraph's recursion limit as a
   last safety net."

---

## Phase 1: Data layer (no LLM yet)

### What I built

- **Packages:** LangGraph 1.4, LangChain core 1.2, Zod 4.6, tsx 4.23 (with yarn).
- **`data/loadCourses.ts`:** every course from `src/data` in one flat list (938 courses, 138 in
  SCOPE). The name is everything after the **first** `" - "`, so "Advanced Competitive Coding - I"
  keeps its "- I" (the site shortens it; Q9).
- **Picker rules moved to `src/lib/courseData.ts`** (commit `9de77de`): the 5 rules for what the
  course picker offers (which subjects, theory slots, professors per slot, morning/evening labs,
  professors per lab shift). Proved unchanged by snapshotting their output for all 938 courses
  before the move and comparing after: byte-identical.
- **`data/toFullCourseData.ts`:** every option for one course, built by "picking everything" with
  the website's own rules and `buildCourseData`. 842 listed courses build; 55 options removed
  because the professor has no real lab (Q1); 7 courses have nothing to pick, same as the site (Q10).
- **Grid labels moved to `src/lib/slots.ts`** (commit `68ac48a`): the timetable's day and hour labels,
  proved unchanged (same 40 label cells, same order).
- **`data/slotTimes.ts`:** any slot string → every weekly session with day and times
  (`A1` = Mon 08:00–08:50 + Wed 09:00–09:50; `L9+L10+L25+L26` = Tue 09:50–11:30 + Fri 08:00–09:40;
  `NIL` = none).
- **`data/validate.ts`:** reports anything the agent can't read. On the real data: only the 7 Q10
  courses and 2 empty schools. Tested on bad strings (`L2`, `L1+L4`, `A1+L1`) to prove it catches them.
- **Data version:** `updateDataVersion.ts` writes the date `src/data` last changed (2026-06-28) into
  `dataVersion.ts`; the validator warns if it's stale and skips quietly when Git isn't there.

### Concepts

- **Flattening nested data** with `Object.entries` and three loops.
- **Pure functions** that take plain data and return lists: easy to test and to share between the
  website and the agent.
- **Snapshot (golden-master) testing at scale:** record the old rules' output for every course, then
  compare the new functions against it. Stronger than a few manual checks.
- **Deriving instead of hardcoding:** day and time come from the grid the website already draws,
  which was checked against VIT's official chart.
- **Times as minutes since midnight:** "no 8am" becomes `start < 9 * 60`, a simple number comparison.
- **Fail loudly vs never crash:** the update script stops on a bad date (I'm watching it); the
  validator never stops (it may run inside the agent), it only reports.
- **Build-time vs runtime values:** a deployed site often has no Git history, so the data date is
  written into code before deploying.

### Decisions and why

| Decision                                                                                 | Why                                                                                                     |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Move the picker rules and grid labels into `src/lib/`, not copy them                     | One copy: the website and the agent can never disagree                                                  |
| Snapshot all 938 courses before moving the picker rules                                  | Proves the move changed nothing, for every course, not just a few                                       |
| Drop a professor with no real lab and say "lab slot unavailable for this professor" (Q1) | Never show a student a lab that doesn't exist                                                           |
| Copy the website when nothing can be picked (Q10)                                        | The agent must never invent options the website wouldn't offer                                          |
| Group options with the same slot string (only professor/room differ) before generating   | Same clashes and times, far fewer combinations: 6 typical courses go from 177,984 to 1,920 (~93× fewer) |
| Validator reports, never rejects                                                         | The data is correct by default; odd things are questions, not errors                                    |
| Data date written by a script after each update, with a validator reminder               | Works on Vercel (no Git there) without touching website files                                           |

### Interview questions

1. How did you make sure moving the picker's rules didn't change what students can pick?
2. How do you turn a slot like `A1` into real days and times?
3. A soft-skills course has 103 sections. How did you stop that from exploding the number of
   timetables to try?
4. Why does your validator only report problems instead of rejecting bad data?

**Short answers:**

1. "Before touching the code, I ran the old rules on all 938 courses and saved every dropdown list.
   Then I ran the new functions and compared: byte-identical."
2. "The website already knows where each slot sits on its grid. I map grid rows to days and columns
   to times, 10 minutes per column from 8:00, using the grid's own labels, and checked the result
   against VIT's slot chart. One grid cell is one session, so `A1` gives Monday and Wednesday."
3. "Sections in the same slot differ only by company and room, so for clashes and times they're
   identical. I group them by exact slot string, generate with one option per group, and let the
   student pick the section afterwards. For six typical courses that's about 93× fewer combinations."
4. "The data comes from a team that tests it against how VIT works. Something unusual is usually a
   real rule I don't know yet, so the validator reports it for me to ask about, and the agent keeps
   working."
