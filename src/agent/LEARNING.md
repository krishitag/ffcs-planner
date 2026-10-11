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
