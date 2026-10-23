# Interview revision sheet

Everything I need to talk about this project in an interview, organised the way interviewers ask.
`LEARNING.md` is the phase-by-phase diary; this file is what I revise from. Updated after every phase.

**Status:** Phases 0–3 done: data layer, all the tools, and a working LangGraph agent with Gemini in the
terminal (128 tests). Phases 4–7 to go (human-in-the-loop, web UI, evals). Only claim what's built.

---

## 1. The pitch

**30 seconds:**

> "I'm building a chat-based timetable planner on top of FFCS-inator, the course-registration helper
> CodeChef VIT built for about 30,000 students. A student types something like 'OS, CN and DBMS with
> labs, no 8am classes, keep Friday free', and the agent finds timetables that fit. It's built with
> LangGraph in TypeScript, and the core rule is: the LLM plans, code verifies. The LLM understands the
> request and explains results, but every slot, clash and professor comes from the real data and the
> site's own generator."

**2 minutes (add after the 30 seconds):**

> "Before writing any AI code, I made the site's course logic reusable. It lived inside a React
> component, so I moved it into shared functions and proved nothing changed: I snapshotted what the
> picker offers for all 938 courses before and after, and they were byte-identical.
> Then I built the data layer: every course in one list, every option for a course built with the
> site's own rules, real days and times for every slot derived from the site's grid, and a validator
> that reports anything unusual in the data instead of crashing.
> One design win: soft-skills courses have about 100 sections that differ only by room, so I group
> options by slot before generating. For six typical courses that cuts the combinations to try from
> about 178,000 to under 2,000, about 93 times fewer.
> Then I built the tools the agent will call, all plain tested code with no LLM: a course search
> that understands codes, nicknames, initials and typos and asks when it isn't sure; a generator
> wrapper that applies the student's must-haves and, when nothing fits, finds the smallest set of
> wishes to blame or which wish to drop; a ranker that explains every point it gives; and an
> independent final check. 62,614 real timetables pass the final check with zero false alarms.
> Then I wired it into a LangGraph agent with Gemini. Only two steps use the LLM: reading the request
> into a schema that Zod checks, and explaining the results. The explanation only sees a fact sheet of
> checked data, and code rejects any slot or course code it invents. When Gemini is slow or
> rate-limited, every call has one retry rule and a 30-second limit, and the student gets a plain
> code-written answer instead of waiting. Next is human-in-the-loop questions, then evals."

---

## 2. Numbers to remember

| Number          | What it is                                                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------------------------- |
| ~30,000         | students who use FFCS-inator                                                                                        |
| 938             | courses in the data (138 in SCOPE), across 98 school/domain lists                                                   |
| 842             | courses the picker lists; all of them build without errors                                                          |
| 177,984 → 1,920 | combinations to try for 6 typical SCOPE courses, before/after grouping same-slot options (~93× fewer)               |
| 103 → 4         | `BSTS301P` soft-skills options → distinct slot groups                                                               |
| 930 → 466       | all SCOPE options → distinct slot strings                                                                           |
| 55              | options removed because the professor has no real lab (Q1)                                                          |
| 7               | courses the site offers nothing to pick for (Q10)                                                                   |
| 25              | LangGraph's default recursion limit (steps per run)                                                                 |
| 10 min          | one column of the timetable grid; theory = 50 min, lab = 100 min                                                    |
| 81              | automated tests (Vitest) after Phase 2                                                                              |
| 62,614 / 0      | real timetables from 680 course combinations checked by the final check / false alarms                              |
| 0.6 / 0.1       | search: minimum score to count as a match / lead needed to say "found" instead of asking                            |
| 2 vs 1          | ranking points for a preferred professor vs any other preference (time wishes lose 0.25 per class that breaks them) |
| 164             | timetables that appear for OS + DBMS + DSA when "Wednesday free" is dropped                                         |
| 128             | automated tests after Phase 3 (Gemini faked, so they run in about a second)                                         |
| 2 of 5          | graph steps that call the LLM (parse and present); the other 3 are plain code                                       |
| 15–33 ms        | time our own code steps take per request; all the rest of the wait is Gemini                                        |
| 3 / 2           | tries for parsing (bad output shown back to Gemini) / for presenting (then a plain code-written answer)             |
| 10 s / 30 s     | longest rate-limit wait we accept before one retry / time limit per LLM call                                        |
| 6 → 0           | LangChain's hidden retries per call, turned off so there's one retry policy                                         |
| 127 s           | the slowest answer seen live (3.8 Flash, slow free-tier day), which led to the 30 s limit                           |

---

## 3. Architecture in one picture

The graph as built (Phase 3):

```
START → parseRequest ─┬─ understood → resolveCourses ─┬─ some found → generate → filterAndRank → present → END
  (LLM → constraints,  │   (search, own school only)   └─ none found ─────────────────────────→ present
   Zod-checked)        └─ AI busy / not understood (it already replied) → END
```

- `generate` uses the site's own `buildCourseData` and `generateTT`; `filterAndRank` ranks and runs the
  independent final check; `present` has the LLM word a fact sheet of checked data.
- Still to come (Phase 4): ask about unclear courses, and when nothing fits, ask which wish to relax.

Folders follow the data flow: `data/` → `tools/` → `nodes/` → `graph.ts`. Tools hold the tested
logic; nodes are thin glue between the graph's state and the tools.

---

## 4. Stories (problem → what I did → result)

**Refactoring code with no tests (Phase 0 and 1)**

- _Problem:_ the course logic lived inside a React UI component (`'use client'`), so server code
  couldn't reuse it, and there were no tests.
- _What I did:_ moved it into pure functions in `src/lib/` word for word; before moving, recorded the
  old behaviour (5 real course picks; later the picker's output for all 938 courses) and compared after.
- _Result:_ byte-identical output, so no behaviour change, and the website and agent now share one copy.

**Debugging a crash that wasn't in the code (Phase 0)**

- _Problem:_ the site returned 500 errors locally: `localStorage.getItem is not a function`.
- _What I did:_ read the first warning instead of the repeated error; it pointed at Node 25's new
  built-in `localStorage` on the server. Changed one thing: ran the site on Node 22 (LTS).
- _Result:_ it worked with zero code changes; I documented Node 22 in the README.

**Treating odd code as a question, not a bug (Phase 0 and 1)**

- _Problem:_ several things in the existing code looked wrong (lab pairs, `NIL` slots, soft-skill
  names with rooms, a lab slot set to a course code).
- _What I did:_ wrote each one down as a question and checked how VIT actually works before changing
  anything. Unresolved ones went on a list for the maintainers, with a safe rule for the agent meanwhile.
- _Result:_ most turned out to be real VIT rules; nothing got "fixed" wrongly.

**Cutting the search space ~93× (Phase 1)**

- _Problem:_ the site's generator tries every combination; a soft-skills course alone has 103 sections.
- _What I did:_ noticed sections in the same slot differ only by company/room, which never affects
  clashes or time constraints, so options are grouped by exact slot string before generating.
- _Result:_ 177,984 → 1,920 combinations for 6 typical courses; the student picks the section after.

**A validator that reports instead of rejecting (Phase 1)**

- _Problem:_ the course data changes every semester and might contain patterns my code doesn't know.
- _What I did:_ a validator that reports odd slot strings, empty courses, repeated codes and a stale
  data date, but never rejects or changes data; tested it on deliberately bad inputs.
- _Result:_ on the real data it found only known cases; after each data update it flags surprises early.

**When real data proved my tests wrong (Phase 2)**

- _Problem:_ I wrote tests from my own assumptions: OS + CN can have Friday free; OS + CN can share a building.
- _What I did:_ ran them against the real course data and investigated each failure before touching code.
- _Result:_ four times the code was right and my test was wrong (CN has a Friday class in every option;
  OS is all in PRP and CN all in SJT). Lesson: test against real data, and investigate a failure before
  "fixing" it.

**Explaining why nothing fits (Phase 2)**

- _Problem:_ "keep Friday free" or "mornings only + no 8am" often make timetables impossible, and a bare
  "no results" helps nobody.
- _What I did:_ if one course has no option left, find the smallest set of wishes that causes it (each
  wish alone, then pairs); if courses only fail together, try dropping each wish and count what appears.
- _Result:_ answers like "mornings only and no 8am can't both work for OS" or "drop Wednesday free → 164 timetables".

**Testing the tester (Phase 2)**

- _Problem:_ a final check is useless if it misses bugs, and just as useless if it rejects good timetables.
- _What I did:_ planted one bug at a time in a real timetable (a clash, a fake slot, another professor's lab,
  an 8am class) and ran 62,614 real timetables through it.
- _Result:_ every planted bug caught, zero false alarms.

**Finding an existing-code quirk without "fixing" it (Phase 2)**

- _Problem:_ the website's generator reports two NIL (no-class) courses as a clash, because it compares the
  text "NIL" with "NIL".
- _What I did:_ left the website's code alone and made my wrapper keep NIL-only courses out of the generator,
  adding them back after; put the finding on the list for the maintainers.
- _Result:_ the agent follows the real rule (NIL never clashes) without changing shared code.

**Stopping the LLM from inventing slots (Phase 3)**

- _Problem:_ an LLM explaining timetables can name a slot, professor or course that doesn't exist, and a
  prompt rule alone is no guarantee.
- _What I did:_ code builds a fact sheet from checked data only; the LLM words it; code then scans the
  reply for any slot or course code not in the facts. One retry with the problem pointed out, then a plain
  answer written by code.
- _Result:_ the student always gets an answer, and never an invented one. Tests prove invented `A1` or
  `BCSE999L` are caught.

**Slow answers that weren't my code (Phase 3)**

- _Problem:_ live answers took up to 127 s, and one idea was to turn off Gemini's "thinking".
- _What I did:_ wrote a timing script before changing anything. My code steps took 15–33 ms; a 9-token
  "OK" test alone took 61.7 s, so the delay was the free tier. Thinking budget 0 showed no gain, and
  Flash-Lite rejected it. I also found LangChain was silently retrying up to 6 times and turned that off.
- _Result:_ one retry rule in one place, a 30 s limit per call with a plain answer as the fallback, and
  thinking left at the default. Lesson: measure before optimising.

---

## 5. Quick glossary

**LangGraph / agents**

- **State:** the shared notebook every step reads and writes.
- **Node:** a function that gets the state and returns only what it changes.
- **Edge / conditional edge:** a fixed next step / a function that picks the next step from the state.
- **Reducer:** how an update merges into state (replace by default; append for chat messages).
- **Recursion limit:** max steps per run (25 by default), so loops can't run forever.
- **Tool:** my function + name + description + input schema; the LLM sees only the last three.
- **Tool call:** the LLM's request (name, args, id); my code runs it and replies with a `ToolMessage`
  carrying the same id.
- **Workflow vs agent:** fixed steps decided by code vs the LLM choosing tools in a loop (ReAct).
- **Structured output:** the LLM fills a schema (`withStructuredOutput`) instead of writing free text.
- **Grounding:** the LLM may only use the facts it's given; like RAG, with my checked state as the context.
- **Temperature:** 0 = always the most likely answer (parsing); higher = more varied wording (explaining).
- **Thinking budget:** how many "thinking" tokens a model may use before answering.

**Reliability**

- **429 / rate limit:** the API says "too many requests", often with how long to wait.
- **Fail fast:** give up at once when waiting won't help, instead of burning quota on retries.
- **Timeout:** stop waiting after a fixed time (`Promise.race`) and cancel the request (`AbortController`).
- **Graceful degradation / fallback:** a plainer but correct answer when the smart path fails.
- **Latency:** how long a step takes; measure it before trying to make it faster.

**TypeScript / JavaScript**

- **Pure function:** output depends only on input; no screen, storage or network.
- **`'use client'`:** marks browser-only code in Next.js; server code shouldn't import it.
- **Destructuring:** `const [school, domains] = pair` / `({ school: selectedSchool })` to rename.
- **`[...new Set(list)]`:** removes duplicates.
- **`async` / `await`:** wait for slow work (search, LLM calls) before moving on.
- **Regular expression:** a text pattern, e.g. `/^L\d+$/` = "L followed by digits, nothing else".

**Engineering**

- **Golden-master / snapshot test:** record today's output, change code, compare.
- **Lockfile (`yarn.lock`):** exact installed versions, so every machine gets the same code.
- **Dev dependency (`-D`):** only needed while developing (tsx), not by the running app (zod).
- **Build-time vs runtime:** values baked in before deploying vs computed while running.
- **Edit distance:** fewest single-letter changes between two words (I count a swap of neighbours as one).
- **Threshold / close call:** a score cut-off for "match" and a minimum lead for "sure"; otherwise ask.
- **Zod schema:** one definition gives runtime checks, defaults, the TypeScript type (`z.infer`) and LLM
  instructions (`.describe`).
- **Must vs prefer:** a hard constraint the result has to obey vs a soft one that only affects the score.
- **Minimal conflict set:** the smallest group of wishes that together make something impossible.
- **Counterfactual:** "what would happen if this wish were dropped?"
- **Defence in depth:** an independent second check that shares as little code as possible with the first.
- **Fail loudly vs never crash:** stop on bad input when a person is watching (scripts); report and
  continue inside the running app (validator).

---

## 6. Questions and answers by topic

### Design and architecture

1. **Why not put all the course data in the prompt?** It changes every semester, it's far too big, it
   would be slow and expensive, and the LLM could still misread or invent things. Tools look things up.
2. **Why are `tools/` and `nodes/` separate?** Tools are the tested logic; nodes are thin glue.
   Testing a search shouldn't need the whole graph and an LLM.
3. **Why reuse the website's `buildCourseData` instead of your own?** One copy of the VIT rules, so
   the agent can never offer an option the website wouldn't.
4. **Why does the LLM never decide clashes?** It can make mistakes; code checks clashes
   deterministically and the LLM only explains verified results.

### Refactoring and testing

5. **The code had no tests. How did you refactor safely?** Snapshot the behaviour first (5 real picks;
   later the picker output for all 938 courses), make a pure move, compare: identical.
6. **Why remove an import after moving a function?** Nothing used it anymore; unused imports confuse
   readers and fail lint. It went with the only function that used it.
7. **Why did `prettifyDomain` stay in the component but `getCourseType` move?** Display formatting
   stays with the UI; data rules move to shared code so the server can reuse them.
8. **Why do popups and `localStorage` stay out of `buildCourseData`?** They're browser-only side
   effects; the shared function must be pure so the agent can call it on the server.
9. **Why does `buildCourseData` recompute the course type instead of taking it as input?** Fewer
   inputs, fewer ways to call it wrong; the cost is one string split.
10. **How do you trust a refactor script?** Never by eye: diff the moved lines, type-check, lint, and
    compare outputs. (My script once dropped a `};` and the checks caught it at once.)

### Data layer

11. **Why read the data at runtime instead of copying it?** CodeChef updates it each semester; reading
    at runtime keeps the agent current with no code changes.
12. **Why `indexOf` + `slice` instead of `split(' - ')`?** `split` cuts at every dash and loses "- I"
    from names; I cut only at the first dash.
13. **How do you turn `A1` into days and times?** Grid rows → days, columns → time (10 min per column
    from 8:00, using the grid's own labels); one grid cell = one session. Checked against VIT's chart.
14. **Why store times as minutes since midnight?** Constraints become number comparisons:
    "no 8am" is `start < 9 * 60`.
15. **Why does the validator report instead of reject?** The data is maintained against real VIT
    rules; odd things are questions first. Reporting keeps the agent working.
16. **Why is the data date written by a script, not read from Git at runtime?** Deployed servers
    usually have no Git history; the script bakes it in, and the validator warns if it's stale.
17. **How did you avoid exploding the number of timetables?** Group options with the same slot string
    (they differ only by professor/room), generate one per group: ~93× fewer combinations.

### LangGraph and tool calling

18. **Explain tool calling to someone who only knows RAG.** In RAG my code always calls the retriever;
    with tools the LLM decides whether and with what input, but my code still runs it.
19. **Who runs the tool?** My code, never the LLM. That's what keeps it safe: it can only ask for
    tools I defined, and I validate the input.
20. **What does the LLM see of a tool?** Name, description, input schema. Not the code or the data.
21. **Why does each tool call have an id?** The LLM can request several at once; ids pair each result
    with its request.
22. **A node returns only `{ log }`. What happens to `count`?** Nothing; nodes return partial updates.
23. **Normal vs conditional edge?** Fixed next step vs a function that picks the next step from state.
24. **Why do chat messages need a reducer?** Without one each update overwrites the history; an append
    reducer keeps the conversation.
25. **How do you stop a loop running forever?** My own round counter in the state, plus LangGraph's
    recursion limit as a safety net.

### Tooling, Git and security

26. **A teammate pushed an API key, then gitignored it. Safe?** No. Revoke and replace the key first;
    `git rm --cached` the file; it's still in history, so assume it leaked.
27. **Why `.env*.local` and not `.env*`?** `.env.example` (no secrets) should still be committed.
28. **Why is `tsx` a dev dependency but `zod` isn't?** zod runs inside the app; tsx only runs my scripts.
29. **What does `yarn.lock` guarantee?** Exact versions of everything installed, so every machine gets
    identical code (`package.json` only gives allowed ranges like `^4.6.5`).
30. **The site crashed locally. How did you debug it?** Read the first warning, suspect the
    environment (Node 25), change one thing (Node 22), confirm.

### Phase 2: tools and testing

31. **What did you test, and what did you deliberately not test?** Every tool's rules on real courses
    (search, constraints, generator, ranker, final check) plus planted bugs. I didn't test the website's
    own `generateTT` internals or the UI; I test the behaviour my agent relies on.
32. **Why does "found" need a clear lead, not just the top score?** A narrow win is a guess; when two
    courses score within 0.1 the agent asks instead of silently planning the wrong course.
33. **Why only search the student's own school?** Other schools' sections may differ and aren't
    registrable for them; saying "not offered in your school" is honest.
34. **Why test with real data instead of made-up courses?** Real data found the surprises: DBMS isn't
    "DS", hidden labs, specialization groups, swapped-letter typos.
35. **Why have the LLM fill a Zod schema instead of plain text?** Code can check it: wrong days, bad
    times or impossible combinations are rejected before anything acts on them, and the LLM retries.
36. **Why does an unstated wish default to "must"?** Take the student at their word; if that makes
    things impossible, the relax step asks before dropping it, rather than quietly ignoring it.
37. **Why do `.describe()` texts matter?** They're sent to the LLM as instructions, so they're a small prompt.
38. **Why remove bad options before generating?** The generator tries every combination; filtering early
    shrinks the search multiplicatively, and grouping cuts it ~93×.
39. **"One course is impossible" vs "no timetable fits together": why report them differently?** The first
    has a cause inside one course (a wish or pair of wishes); the second only appears in combination, so
    the fix is to drop a wish and see what appears.
40. **Why try each wish alone before pairs?** The smallest explanation is the most useful and the cheapest
    to find; pairs only when no single wish explains it.
41. **Why return reasons with each ranked timetable?** The LLM explains my reasons, so its explanation can't
    disagree with the ranking or invent its own.
42. **Why do professors count double, and how would you set weights in a real product?** VIT students care
    most about faculty; in production I'd tune weights from what students actually pick.
43. **Why is "same building" checked in the ranker, not the generator?** It's about the whole timetable,
    not one option, so it can only be judged once every course is chosen.
44. **The generator already avoids clashes. Why a separate final check?** Nothing reaches a student
    without an independent check; a bug in one place gets caught by the other.
45. **Why rebuild sessions from slot strings instead of reusing the generator's?** If the generator
    computed them wrongly, reusing them would hide the bug.
46. **How do you test a checker?** Prove it catches problems (planted bugs) and prove it doesn't raise false
    alarms (thousands of real good cases).
47. **Why fix the NIL problem in your wrapper instead of the website's generator?** The website's code is
    shared and maintained by another team; I don't change it without confirming, so my code follows the rule.
48. **Some tests use today's courses. What happens when the data changes?** A failing test means "look at what
    changed", like the validator; I check whether the data or my rule changed before editing anything.

### Phase 3: the LLM and the graph

49. **How would you add a second LLM provider?** Add a branch in `getModel()` for the new provider. Every
    node depends on LangChain's `BaseChatModel`, not on Gemini, so nothing else changes.
50. **What temperature did you use for each node, and why?** 0 for parsing, so the same message always
    gives the same form; 0.3 for explaining, so the wording sounds natural. Facts never depend on it.
51. **Why a fixed model version instead of `-latest`?** So the model can't change under me between eval
    runs and make results incomparable.
52. **Why must state be serializable?** From Phase 4 the whole state is saved after every step (the
    checkpointer). Plain data can be saved and loaded; functions and class instances can't.
53. **Which node writes each field, and why does it matter?** One writer per field (parse → constraints,
    school, batch, branch; resolve → resolved/unresolved; generate → generated; filterAndRank → ranked and
    rankIssue). A wrong value then has exactly one suspect. The exception is `messages`, which is
    append-only: present adds the answer, and parse adds a reply only when it can't continue.
54. **Why store course refs in state instead of whole courses?** State is saved after every step; a ref
    (school, domain, key) is tiny and the full course is looked up when needed.
55. **What happens if Gemini returns something that fails the schema?** Zod rejects it, and Gemini gets the
    error message back and tries again, up to 3 times. After that the student is asked to rephrase.
56. **How do you parse "no 8am" vs "nothing before 9"?** Both become "no classes before 09:00": the prompt
    states the rule, and times are stored as 24-hour `HH:MM` that Zod checks.
57. **Is your project an agent or a workflow? Defend it.** A workflow with LLM steps: the steps are always
    the same and every fact must be checked, so code decides the order. The LLM does only what code can't:
    understand free text and explain results.
58. **How would you stop a ReAct loop running forever?** A cap on tool-call rounds in my own state, plus
    LangGraph's recursion limit as a safety net.
59. **How do you make sure the LLM can't search another school, even if the student asks?** The LLM never
    calls the search: plain code does, always with the school from state. Even in a ReAct version the
    school would come from state, not from the LLM's arguments.
60. **Why are generate and filterAndRank nodes, not tools the LLM calls?** They must always run, in the same
    order, on the same inputs. Letting the LLM decide whether to call them only adds ways to fail.
61. **How do you know the explanation doesn't contain hallucinations?** The LLM only sees a fact sheet of
    checked data, and code scans its reply for any slot or course code not in the facts: one retry, then a
    plain code-written answer.
62. **Draw your graph.** parse → resolve → generate → filterAndRank → present. `afterParse` ends the turn if
    parse already replied (AI busy or not understood); `afterResolve` skips to present if no course was found.
63. **Why not one big prompt with all the data?** Too big, slow and expensive, it changes every semester,
    and the LLM could still get clashes wrong. Code computes; the LLM only reads and explains.
64. **What happens when Gemini is rate-limited?** If it asks for a wait of 10 s or less, wait and retry once;
    otherwise fail fast. Parsing says "can't reach the AI"; presenting gives the plain answer.
65. **Why turn off LangChain's own retries?** It silently retried up to 6 times. Two retry layers multiply
    each other, so I keep one policy in one place where I can test it.
66. **Why does `withTimeout` fail with its own error before calling `abort()`?** `Promise.race` takes
    whichever settles first. Failing first means the race ends with my clear `LlmTimeoutError`, not the
    "aborted" error that the cancelled call throws.
67. **Why is a timeout not retried, when bad output gets 3 tries?** Bad output is quick to retry and the
    error helps the model fix it. A timeout means the student has already waited 30 s; another try could
    double that, so a plain answer now is better.
68. **`Promise.race` already stops your code waiting. Why pass the `signal` to LangChain too?** The race only
    stops _my_ wait; without the signal the request keeps running in the background and still uses quota.
    The signal actually cancels it.
69. **Your answers were slow. How did you find out why?** A timing script per step: my code took 15–33 ms,
    and a 9-token test prompt alone took 61.7 s, so the delay was on Gemini's side, not in my code.
70. **Did turning thinking off help?** No measurable gain on 3.8 Flash, and Flash-Lite rejected it, so it
    stays an option, not the default. Measure before optimising.
71. **Why does the plain answer say _why_ it was used?** The student sees the same text either way, but the
    tag (`llm-busy`, `llm-timeout`, `llm-error`, `not-grounded`) tells me how often each failure happens.

---

## 7. Resume bullet (draft, update as phases finish)

> Building a LangGraph (TypeScript) agent that turns natural-language timetable requests into
> clash-free VIT course schedules on top of FFCS-inator (~30k users); refactored its course logic into
> shared pure functions with snapshot-verified zero behaviour change across 938 courses, cut the
> timetable search space ~93× by grouping equivalent sections, and built an independent final check
> that passed 62,614 real timetables with zero false alarms; the LLM (Gemini) only parses requests into a
> Zod-checked schema and explains a fact sheet of verified data, with an output check against invented
> slots, a single retry policy and a 30 s limit with code-written fallbacks (128 automated tests).

(When Phases 4–6 are done, add: asks clarifying questions, and the eval results, e.g. "100% clash-free
on N test requests".)
