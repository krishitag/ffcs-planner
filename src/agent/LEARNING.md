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

---

## Phase 2: Tools without an LLM

### What I built

- **Vitest** (2.0): `yarn test:agent`, tests next to each file; 81 tests by the end of the phase.
- **`tools/searchCourses.ts`** (2.2): finds the real course from a code (`BCSE303`), full name,
  initials (`OS`, `CN`, `TOC`), words with typos (`operating sytems`, `compiler desgin`), a small
  nickname list (`DBMS`, `DSA`, `COA`) or a soft-skills company (`FACE`). Searches only the student's
  school. Answers _found_, _ambiguous_ (top two within 0.1, so ask), _not offered in your school_ or
  _no courses listed for that school yet_. Keeps specialization groups apart (Q11).
- **`constraints.ts`** (2.3): the Zod form the LLM will fill: courses with professor and slot wishes,
  free days, no classes before/after, shift, same building, school/batch/branch. Every wish is `must`
  or `prefer`, and `must` when not stated (D10).
- **`tools/generate.ts`** (2.4): removes options that break a must wish, groups same-slot sections,
  refuses if there are too many combinations, runs FFCS-inator's `generateTT`, and maps results back.
  When nothing fits it explains why: the smallest set of wishes that kills a course, or which wishes
  to drop when courses only fail together.
- **`tools/filterRank.ts`** (2.5): scores timetables on prefer wishes (professors 2 points, others 1,
  time wishes lose 0.25 per class that breaks them), keeps the top 3 that really differ, with a reason
  for every point.
- **`tools/finalCheck.ts`** (2.6): re-checks every timetable from the raw data before a student sees it.
- **Edge-case tests** (2.7), and a fix so two NIL courses never clash (R6).

### Concepts

- **Unit tests and a spec:** tests written first describe exactly what the code must do.
- **Scoring and thresholds:** a match needs a score of 0.6; "found" needs a clear lead of more than
  0.1, otherwise ask (precision vs recall).
- **Edit distance:** the fewest single-letter changes between two words; I use the version where
  swapping two neighbouring letters counts once (Damerau-style), because that's a common typo.
- **Schemas with Zod:** one definition gives runtime checking, defaults, the TypeScript type
  (`z.infer`) and instructions for the LLM (`.describe`).
- **Filtering before generating:** cutting options early instead of filtering finished timetables.
- **Equivalence grouping:** options that behave the same for every check are tried once.
- **Minimal conflict sets:** try each wish alone, then pairs, to find the smallest cause.
- **Counterfactuals:** "what if this wish were dropped?" to suggest fixes.
- **Explainable ranking:** every point has a reason, so the explanation can't disagree with the score.
- **Defence in depth / independent verification:** the final check rebuilds everything from raw
  data and checks clashes two independent ways.
- **Testing a checker:** plant bugs to prove it catches them, and run real data to prove it doesn't
  raise false alarms.

### Decisions and why

| Decision                                                                      | Why                                                                                                                |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| A small nickname list (D9)                                                    | "Database Systems" has initials DS, so "DBMS" can't be found from initials                                         |
| One search result = a course in one group; ask if the branch is unknown (Q11) | Specialization Elective sections may be reserved; never mix groups                                                 |
| Unstated wishes are "must" (D10)                                              | Take the student at their word; the relax step asks before dropping anything                                       |
| "Mornings only" applies to theory only (D11)                                  | Morning theory always comes with an evening lab, so applying it to labs makes every theory + lab course impossible |
| Professors count double in ranking (D12)                                      | VIT students care most about faculty                                                                               |
| G suffix = same building; SJTA = SJT (D12)                                    | SJTG is the ground floor of SJT                                                                                    |
| Top 3 must differ by a slot or professor (D12)                                | Real choices, not near-copies                                                                                      |
| NIL-only courses skip `generateTT` (R6)                                       | The website's generator compares the text "NIL" and calls two NIL courses a clash                                  |

### What real data taught me

- OS on its own can only have **Wednesday or Friday** free; CN has a Friday class in **every** option.
- OS + DBMS + DSA can each avoid Wednesday alone but **not together**; dropping "Wednesday free" gives 164 timetables.
- Every OS section is in PRP and every CN section is in SJT, so "same building" is impossible for them.
- "Mornings only" + "no 8am" kills OS: its only morning slot B1 is Tuesday 08:00.
- Four times, a test I wrote from my own assumptions was wrong and the code was right.
- 62,614 real timetables from 680 course combinations all pass the final check (0 false alarms).

### Interview questions

1. How does your course search decide between "found" and "ambiguous"?
2. Why filter options before generating, instead of filtering the finished timetables?
3. A student's wishes make timetables impossible. How does your system explain why?
4. Why does your final check exist if the generator already avoids clashes?

**Short answers:**

1. "Every course gets a score from several matchers: code, name, initials, words with typos, nicknames.
   If the best isn't clearly ahead of the second (within 0.1), it's ambiguous and the agent asks,
   because a wrong course silently ruins the timetable."
2. "The generator tries every combination, so removing bad options first shrinks the search
   multiplicatively. Grouping same-slot sections cut six typical courses from about 178,000
   combinations to under 2,000."
3. "If one course has no option left, I find the smallest set of wishes responsible, trying each wish
   alone, then pairs. If every course is fine alone but they clash together, I try dropping each wish
   and report which drops give timetables, like 'drop Wednesday free, 164 timetables'."
4. "Nothing reaches a student without an independent check. It rebuilds sessions from the raw data and
   checks clashes two ways, by time overlap and the website's clash table. I proved it catches planted
   bugs and raised no false alarms on 62,614 real timetables."

---

## Phase 3: The first working agent (terminal only)

### What I built

- **`llm.ts`** (3.2): `getModel()`, the one place that picks the model (Gemini 3.8 Flash, a fixed
  version; Gemini 2.5 Flash is closed to new users). `LLM_MODEL` in the shell overrides it, e.g.
  Flash-Lite for cheap dev runs. Later in the phase it also got `callLlm`, which wraps every LLM call:
  - **Rate limits (429):** if Gemini asks for a wait of 10s or less, wait and try once more; otherwise
    fail fast with `LlmUnavailableError`. LangChain's own hidden retries are off (`maxRetries: 0`).
  - **Time limit:** each call is stopped after 30s (`LlmTimeoutError`) and the request is cancelled.
- **`state.ts`** (3.3): the shared notebook. Every field has exactly one node that writes it. Courses
  are stored as small refs (school, domain, key), not whole courses, so saved state stays small.
- **`nodes/parseRequest.ts`** (3.4): Gemini fills the 2.3 constraints form (`withStructuredOutput`),
  Zod checks it, and a bad answer is retried with the error shown to Gemini (3 tries). If the AI is
  busy it replies "can't reach the AI"; after 3 bad answers it asks the student to rephrase.
- **`nodes/resolveCourses.ts`** (3.5): plain code (O4 = A) runs the 2.2 search for each course, only in
  the student's school. Unclear ones are kept aside for Phase 4 to ask about.
- **`nodes/generate.ts` and `nodes/filterAndRank.ts`** (3.6): thin glue around the Phase 2 tools.
  `rankIssue` says why ranking came out empty (e.g. "same building").
- **`nodes/present.ts`** (3.7): code builds a **fact sheet** from checked data; Gemini words it; code
  checks the reply mentions no slot or course code that isn't in the facts. One retry, then a plain
  answer written by code. The answer is tagged with why a fallback was used (`llm-busy`,
  `llm-timeout`, `llm-error`, `not-grounded`).
- **`graph.ts`** (3.8): parse → resolve → generate → filterAndRank → present, with two conditional
  edges: `afterParse` ends the turn if parsing already replied; `afterResolve` skips straight to
  present if no course was found.
- **`scripts/chat.ts`**: chat with the agent in the terminal. **`scripts/latency.ts`**: times each step.
- 128 tests by the end of the phase (Gemini is faked in tests, so they're fast and free).

### Concepts

- **Dependency inversion:** nodes depend on LangChain's `BaseChatModel`, not on Gemini. Switching
  provider is a change in `llm.ts` only, and tests pass in a fake model.
- **Temperature:** 0 for parsing (same input → same form), 0.3 for explaining (more natural wording).
- **Structured output:** the LLM fills a schema instead of writing free text; under the hood it's
  the same mechanism as tool calling.
- **Validate and retry with the error:** the model sees what was wrong and fixes it.
- **Workflow vs agent:** my graph is a workflow (code decides the steps). The LLM is used only where
  free text is involved: reading the request and writing the answer.
- **Grounding:** like RAG, but the "retrieved context" is my own checked state. Plus an output check,
  because a prompt rule alone isn't a guarantee.
- **Conditional edges:** a function reads the state and picks the next node.
- **Graceful degradation:** when the LLM is slow, busy or wrong, the student still gets a correct
  (plainer) answer.
- **Retry policy in one place:** hidden library retries + my retries would multiply; I turned the
  library's off.
- **Timeouts with `Promise.race` + `AbortController`:** stop waiting, and also cancel the request.
- **Measure before optimising:** my code steps take 15–33 ms; all the waiting is on Gemini's side.

### Decisions and why

| Decision                                                                     | Why                                                                                           |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| A fixed model version (`gemini-3.8-flash`), not an alias like `-latest` (D1) | The model can't change under me between eval runs                                             |
| Plain code resolves courses, not a ReAct loop (O4 = A)                       | Predictable, fast, testable; the search is already good. ReAct is a possible later experiment |
| One writer per state field                                                   | A wrong value has exactly one suspect                                                         |
| State holds refs, not whole courses                                          | Phase 4 saves the state after every step; small refs keep that cheap                          |
| Only parseRequest and present call the LLM                                   | The LLM handles language; code handles every fact                                             |
| Fact sheet + grounding check + plain fallback in present                     | The student always gets an answer, and never an invented slot or course                       |
| Rate limit: ≤10s wait → one retry, else fail fast; library retries off       | Retrying a long limit just burns free-tier quota and keeps the student waiting                |
| 30s limit per LLM call, no retry after a timeout                             | A student once waited 127s; after 30s a plain answer is better than more waiting              |
| `thinkingBudget: 0` stays an option, not the default                         | No speed-up measured on 3.8 Flash, and Flash-Lite rejects it                                  |
| Bad output: 3 tries, then "please rephrase" instead of crashing              | The chat keeps going                                                                          |

### What live runs taught me

- **Latency is all Gemini.** Our code steps take 15–33 ms. On 2026-10-22 the 3.8 Flash free tier was
  slow: parse 19–102 s, present 44–127 s, and a 9-token "OK" test took 61.7 s. On 2026-10-23 Flash-Lite
  did parse in 8.8–22.3 s and present in 1.5–9.1 s.
- **Don't trust a setting without measuring it:** turning thinking off showed no gain, and one model
  rejects it outright.
- **Libraries hide behaviour:** LangChain silently retried up to 6 times. Found it, turned it off.

### Interview questions

1. Draw your graph and explain each edge.
2. How do you know the explanation doesn't contain hallucinations?
3. What happens when Gemini is down, rate-limited or slow?
4. Is your project an agent or a workflow? Defend it.

**Short answers:**

1. "Parse, resolve, generate, rank, present. After parse, a conditional edge ends the turn if parsing
   already replied (AI busy or not understood). After resolve, if no course was found, it skips to
   present to explain why. Only parse and present use the LLM."
2. "The LLM only sees a fact sheet built from checked data, then my code scans its reply for any slot or
   course code that isn't in the facts. One retry with the problem pointed out, then a plain answer
   written by code."
3. "Every call goes through one wrapper: a short rate limit gets one retry, a long one fails fast, and
   any call over 30 seconds is cancelled. Parsing then says 'can't reach the AI', and presenting falls
   back to a plain code-written answer, so the student is never left hanging."
4. "A workflow with LLM steps: code decides the order, because the steps are always the same and every
   fact must be checked. The LLM does what code can't: understand free text and explain results.
   Phase 4 adds human-in-the-loop questions; a ReAct course search is a possible experiment later."
