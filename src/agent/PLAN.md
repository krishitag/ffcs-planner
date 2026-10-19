# FFCS Planning Agent: build plan

How we work: one subtask at a time. Claude explains it → you write it (or Claude writes it and walks you through it, if it's marked **Claude**) → Claude reviews it like an interviewer and quizzes you → we tick it off. Nothing moves on until you say so.

Line numbers below were checked against `upstream/prod` @ `9f002de`. They will drift after the refactor (0.2–0.3).

---

## Decisions already made

| #   | Decision                                          | Choice                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | LLM                                               | **Gemini 3.8 Flash** (`gemini-3.8-flash`, a fixed version so eval results stay comparable), `LLM_PROVIDER=gemini`, model overridable with `LLM_MODEL`. Gemini 2.5 Flash was the first choice but is closed to new users (2026-10-19)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| D2  | Course-data conversion                            | Refactor into `src/lib/courseData.ts`: the helpers, `getCourseType` and a new `buildCourseData()`. No behaviour change. `FacultySelector` imports them                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| D3  | Working mode                                      | Claude scaffolds, you write, Claude reviews and quizzes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| D4  | Package manager                                   | yarn only (upstream also tracks `package-lock.json`, which will go stale; we leave it alone)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| D5  | Layout                                            | Everything in `src/agent/` (including `README.md`, `LEARNING.md`, `evals/`), plus a thin `src/app/api/agent/route.ts` and `src/app/planner/page.tsx`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| D6  | Existing code and data                            | The code and data were built and tested by the team around how VIT actually works, so **treat them as correct by default**. Never assume what something odd means and never "fix" it. Log it as an open question (Q-list below), and you explain how VIT works or we check the live site together. Nothing counts as a bug until it's confirmed that way. The refactor stays behaviour-identical                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| D7  | School (= the student's top-level list in `data`) | A "school" here is one **top-level key of `data`** (e.g. `SCOPE`). It holds the full course list for students of that program, **including courses taught by other departments** (e.g. `BECE204L` from SENSE sits under SCOPE's DisciplineLinked). Never mix top-level keys. If the student hasn't said theirs, ask once at the start (suggest SCOPE first), store it in state, and search only that list. If a course isn't in it, say so clearly; never suggest another list's slots. **Confirmed by you (Q7).** A student's key depends on program **and batch**: `('25 Batch)` keys are for the 2025 intake, and plain keys are for older batches                                                                                                                                                                                                                                                                                                     |
| D8  | Where changes go                                  | **Only your repo** (`origin` = `krishitag/ffcs-agent`). Never open PRs or push to CodeChef's repo (`upstream` = `CodeChefVIT/ffcs`). `upstream` is only used to _pull_ their data updates                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| D9  | Course nicknames (2.2)                            | **Option A:** a small alias list we write ourselves (`src/agent/data/aliases.ts`, e.g. `DBMS → Database Systems`), because initials can't find every nickname ("Database Systems" gives "DS"). It's student slang, not course data. The validator reports any alias that points to a course missing from the data                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| D10 | Constraint strength and v1 wishes (2.3)           | A wish with no stated strength counts as **must** (the relax step asks before dropping it). v1 wishes: courses (+ professor must/prefer/avoid, + **slot** must/prefer, e.g. "OS in A1+TA1"), free days, no classes before/after, shift (only if asked), same building, and the student's school/batch/branch if mentioned. Later maybe: max classes per day, no gaps                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| D11 | How "must" wishes filter options (2.4)            | **Shift ("mornings only") applies to theory classes only**: a morning theory slot always comes with an evening lab (R4), so applying it to labs would make every theory + lab course impossible. For lab-only courses it applies to the lab. **Slot wish "A1" matches option "A1+TA1"**: every part the student named must be in the option. **Wish combinations:** when a course drops to zero options, report the **smallest set of wishes** that together cause it (try each wish alone, then pairs), so the relax step can say e.g. "mornings only and no 8am can't both work for OS: its only morning slot B1+TB1 starts at 8 on Tuesday. Drop one?" **When every course has options but nothing fits together** (very common for free days: OS alone can only free Wed or Fri; OS + DBMS + DSA can't free Wed together), try dropping each wish, then each pair, and report which drops give timetables ("drop 'Wednesday free' → 164 timetables"). |
| D12 | Ranking (2.5)                                     | **Professor preferences count double** (2 points; VIT students care most about faculty); every other "prefer" wish is 1 point, and time wishes lose a little per class that breaks them. **Same building** = the venue's letters, where a **G suffix is the ground floor of the same building** (SJTG = SJT, SMVG = SMV, GDNG = GDN) and **SJTA is part of SJT** (you). **Top 2–3 must differ**: each one changes at least one course's theory slot or professor                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

## Decisions still open (we'll settle each when we reach its subtask)

| #   | Question                                                                                                                                                                                                                                                      | Subtask |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| O1  | The day and hour labels live as local constants _inside_ the `TimeTable` component. Should we export them (a small edit to an existing file) or mirror them in `src/agent/` with a comment citing the lines?                                                  | 1.5     |
| O2  | Data version: generate it at build time from git, or keep a constant you update by hand?                                                                                                                                                                      | 1.7     |
| O3  | Test runner: vitest (recommended) or `node:test`. **Decided (you, 2026-10-12): Vitest** (+ `vite` peer), config in `src/agent/vitest.config.ts`                                                                                                               | 2.0     |
| O4  | `resolve_courses`: a plain function call, or a real LLM tool-calling loop (ReAct)? **Decided (you, 2026-10-19): A, plain code** calls `searchCourses` for each course. A ReAct version (Gemini calling the search tool itself) is a possible later experiment | 3.5     |
| O6  | Persistent checkpointer: MongoDB (the repo already uses it) or Postgres                                                                                                                                                                                       | 7.1     |

---

## Slot rules (source of truth: VIT's official slot chart)

Every subtask that touches slots follows these rules. They're referenced below as **R1–R7**.

| #   | Rule                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R1  | **Lab pairs are one session.** `L1+L2` is ONE 100-minute lab session. That's why `slotMap` only stores the odd slot (`L1`) and draws it as `L1+L2`. Validation, constraints and `final_check` treat a pair as a single session, and an even slot (`L2`) is valid only as part of its pair                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| R2  | **Multi-session labs.** `L9+L10+L25+L26` is TWO sessions on different days (Tue and Fri). Split a lab string into consecutive odd+even pairs and check **every** session. Each pair is one session, so two slots = one session a week, four = two, six = three (e.g. `L31+L32+L45+L46+L57+L58`) (Q5)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| R3  | **Multi-part theory.** `A1+TA1+TAA1` is one subject meeting several times a week: A1 twice (Mon 8:00, Wed 9:00), TA1 once, TAA1 once. Check **every** meeting of every part                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| R4  | **Morning and evening.** Theory slots ending in `1` run 8am–1pm and those ending in `2` run 2pm–7pm. Labs L1–L30 are morning and L31–L60 evening. **Within one course**, theory and lab are on opposite shifts (morning theory → evening lab, evening theory → morning lab), which the existing code already enforces in `buildCourseData`. **Across different courses**, mixing is allowed as long as nothing clashes (e.g. course X's 8am lab with course Y's 10am theory). A pure morning or pure evening timetable is **never** forced; it's only applied when the student asks for it, and then as a preference                                                                                                                                                                                                                                                                                                                                                                                                           |
| R5  | **Constraints cover labs too.** "No 8am" and "Friday free" apply to lab sessions as well as theory (e.g. L1+L2 on Mon and L25+L26 on Fri both start at 8:00)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| R6  | **NIL** means **"no scheduled classes"**, whatever the course type: projects done outside college hours (summer or 4th year) **and online courses** (e.g. `BSSC101N` Essence of Traditional Knowledge; in the current data, `BSSC102N - Indian Constitution` under SHINE). It takes no time on the timetable, never clashes with anything (including other `NIL` courses), isn't flagged by validation, and isn't subject to day or time constraints. A student can have several, and the agent lists each as "no scheduled classes" (Q3)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| R7  | **Data is correct by default** (D6). Nothing in our code rejects, flags or "fixes" a data pattern unless you've confirmed what that pattern means                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| R8  | **Every slot string in the data is an indivisible unit.** The agent only chooses between options that exist in the data and never builds new combinations from parts of slot strings. By course kind:<br>• **Theory-only:** pick any offered theory string. Its shape depends on credits (`A1`, `A1+TA1`, `A1+TAA1`, or just `TAA1`), and it's taken whole.<br>• **Lab-only:** pick one offered lab bundle (e.g. `L31+L32+L47+L48` or `L43+L44+L51+L52`). Bundles are never split or mixed with each other.<br>• **Theory + lab (`L`+`P`) and embedded (`E`):** pick the theory slot and professor. The lab is locked to **that same professor's** lab slot on the opposite shift, and if they have several, each one is a separate option (Q2). E.g. `BCSE203E` theory `TAA1` and lab `L43+L44+L51+L52`, both ANTHONIRAJ A; `BCSE204L` `F1+TF1` and `BCSE204P` `L39+L40`, both DIVIYA M.<br>• **`BSTS…P` (soft skills):** uses a theory slot (e.g. `BSTS102P` in `D1+TD1`), matching the code's `BSTS` rule. Confirmed by you |

**Cross-check (done, read-only):** all 34 theory slot keys (every weekly meeting) and all 30 lab pairs in `slotMap` (`src/lib/slots.ts` 3–113) sit on the same day and in the same position as the official chart. The grid uses **6 columns per hour (10 minutes per column)** with column 2 = 8:00, so `time = 8:00 + (col − 2) × 10 min`:

- theory cells are 5 columns, or 50 minutes (A1 = 8:00–8:50);
- lab cells are 10 columns, or 100 minutes (L1+L2 = 8:00–9:40, L3+L4 = 9:50–11:30, L35+L36 = 17:40–19:20).

The chart only labels whole hours, so you confirm the exact minutes in 1.5.

---

## Open questions about VIT and the existing code

These are things that looked odd to Claude while reading the code. They are **questions, not bugs** (D6). Each is answered by you (how VIT works) or by checking the live site together (0.6). Write the answer here, then update the subtasks that depend on it. Until a question is answered, no code may assume an answer.

| #   | Question                                                                                                                                                                                                                                                                                                                                                                        | Where                                                                                 | Answer                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Blocks                 |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| Q1  | When a chosen faculty member has no lab slot in the opposite shift, `generateCourseSlotsBoth` sets `facultyLabSlot` to the **course code**. What does that represent at VIT (e.g. a lab assigned later)? How should it appear on a timetable?                                                                                                                                   | `FacultySelector.tsx` 219                                                             | **Unresolved: ask the CodeChef team.** You don't know how VIT handles it, and it never happens in SCOPE. Found in 23 cases across other schools (e.g. `BPHY101L` `E2+TE2` SAMIR RANJAN MEHER, no lab at all; SBST `BBIT202L` `C2+TC2` JANAKI RAMAIAH M, only a same-shift lab). **Agent rule for now (your decision):** don't offer that professor's option for the course. Tell the student "lab slot unavailable for this professor" instead of showing a fake lab                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | 1.4, 1.5, 1.6, 2.6     |
| Q2  | Embedded (`E`) courses become `'both'` without a `courseCodeLab`/`courseNameLab`. How do embedded courses work at VIT, and what should their theory and lab rows look like?                                                                                                                                                                                                     | `FacultySelector.tsx` 351–353, 393–400; `utils.ts` 33–35, 148–175                     | **Partly answered (you):** the lab is locked to the professor chosen for theory: the same professor's lab slot on the opposite shift. The student can't pick a different professor or slot for the lab. Example: OS theory in A1 with Prof Ruby D gives you Ruby D's evening lab automatically. So **one course option = theory slot + professor + that professor's lab slot, bundled**. **(a) Answered (you):** the lock applies to **both** `E` and `L+P` courses (see R8 for examples). **(b) Answered (you):** if the theory professor has more than one lab slot available, the student picks one. Each of that professor's lab slots is a separate option, which matches how `generateTT` already builds them. **(c) Answered (you):** VTOP shows an embedded course as two rows with the same code and name, labelled **"(Embedded Theory)"** and **"(Embedded Lab)"**. The agent uses that naming for `E` rows. **Observed locally (2026-10-10, same code as prod):** after generating with `BCSE203E`, the course list beside the timetable shows the lab row's code as `undefined` (slot `L31+L32+L51+L52`, KAUSER AHMED P). **Seen locally on the same code as the live site; ask CodeChef** (your decision, 0.6). The agent still shows "(Embedded Lab)", never `undefined` | 1.4, 2.6               |
| Q3  | Can a student take two `NIL` courses in the same semester? If so, how does the site handle the pair today?                                                                                                                                                                                                                                                                      | `utils.ts` 59–76                                                                      | **Answered (you):** yes, a student can have more than one. `NIL` means "no scheduled classes", whatever the course type: **projects** done outside college hours (summer or 4th year) **and online courses** (e.g. `BSSC101N`; `BSSC102N - Indian Constitution` in the data). They never take timetable time and never clash with anything, **including other `NIL` courses** (R6). The agent lists them as "no scheduled classes". To check together on the live site: does adding two `NIL` courses generate timetables as expected?                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | 2.4, 2.6, 2.7          |
| Q4  | Which lab-slot strings are possible at VIT? Can a lab string ever be a lone even slot (`L2`) or a non-adjacent pair (`L1+L4`)?                                                                                                                                                                                                                                                  | `src/data/**`                                                                         | **Answered (you):** labs always come in consecutive odd+even pairs (`L1+L2`, `L3+L4`, …, `L59+L60`). A lone `L2` or `L1+L4` should never appear. If the validator finds one, it **reports it to you as unexpected**; it never rejects or fixes it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | 1.5, 1.6               |
| Q5  | What does the six-slot lab string `L31+L32+L45+L46+L57+L58` mean? Three lab sessions a week?                                                                                                                                                                                                                                                                                    | `src/data/**` (one occurrence)                                                        | **Answered (you):** each odd+even pair is one lab session. Two slots = one session a week, four = two, six = three                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | 1.5, R2                |
| Q6  | `FacultySelector`'s `schools` list (12–31) and `data`'s keys differ (e.g. `MIS ('25 Batch)` is in `data` but not in the selector). Why? Which schools should the agent offer when it asks (4.2)?                                                                                                                                                                                | `FacultySelector.tsx` 12–31; `faculty.ts` 42–62                                       | **Answered (you): Option A.** The agent offers the same schools as the website's buttons, with **SCOPE first**. **Don't hardcode the list**: read it from the same source the website uses, so if CodeChef adds or removes a school, the agent follows automatically. `MIS ('25 Batch)` is the only school in `data` without a button, and its course list is empty (all groups commented out in `src/data/MTech_SCORE/index.ts`), so it's not offered. **Note: ask the CodeChef team whether MIS is a real program.** **Done (your choice A):** `schools` moved into `src/lib/courseData.ts` as part of the no-behaviour-change refactor (commit `6157b90`). The website and the agent both import it from there **Refined (you, 1.3):** offer the website's buttons **minus any school with no courses**, worked out automatically (today that hides SCE and SBST ('25 Batch), which have buttons but empty lists, as well as MIS). If a student says they're from a hidden empty school, **recognise it** and reply "no courses are listed for that school yet" instead of treating it as unknown                                                                                                                                                                                    | 1.3, 2.2, 4.2          |
| Q7  | Is each top-level key of `data` the course list for students of one program (including other departments' courses), so a student uses exactly one key?                                                                                                                                                                                                                          | `faculty.ts` 42–62; `src/data/*/index.ts`                                             | **Your hypothesis. The data is consistent with it (read-only check):**<br>• `BECE204L` sits under SCOPE (DisciplineLinked), SCORE (DLES_SPEC) and SENSE (DisciplineCore), and `BMAT202L` is in 8 school lists.<br>• Of 450 course codes, 94 appear under more than one key. 62 have identical offerings everywhere; **32 differ** (e.g. `BSTS301P`: SCOPE 103 entries vs 55 elsewhere; `BMEE355E`: SMEC 28 vs SBST/SCHEME 6).<br>• Most differences are SCOPE vs SCORE, and MTech vs MTech ('25 Batch).<br>**Answered (you): the program-list reading is right.** Your own VTOP has SCOPE courses alongside SENSE, SAS and SSL ones.<br>**Batches (your understanding):** `('25 Batch)` keys are for students who joined in 2025 (newer curriculum), and the plain key (e.g. `SCOPE`) is for older batches. You're 2024 batch and use `SCOPE`.<br>**Note from the data:** not every program has both kinds of key.<br>• Both plain and `('25 Batch)`: SCOPE, SCORE, SELECT, SENSE, SMEC, SBST, SHINE, MTech.<br>• `('25 Batch)` only: MIS.<br>• Plain only: SCE, SCHEME.<br>So the agent asks for program + batch year (or simply "which list do you pick on FFCS-inator?") and maps that to an **existing** key. If no key matches, it asks rather than guessing                       | D7, 1.3, 2.2, 3.3, 4.2 |
| Q8  | For `BSTS` courses the site saves the professor with the room added (`FACE (APT) (SJT404)`) and no separate venue. What does that represent at VIT (many sections with the same "professor" name, told apart by room)? How should the agent match and show these names?                                                                                                         | `FacultySelector.tsx` 510–514; `before.json` snapshot                                 | **Answered (you):** soft-skills (`BSTS`) courses are taught by training companies, and one company runs many sections told apart by room (your VTOP: `BSTS102P`, "SIXPHRASE (APT)", room PRP322). Students pick soft skills **by slot**, not by company or room. **Agent rules:**<br>• By default every section is a valid option, and the agent picks whatever fits the timetable.<br>• If the student names a company ("I want FACE"), match on the **company name**, and every room of that company is fine.<br>• **Show the room** in the final timetable (that's where they need to go).<br>• **Keep the saved name format exactly as the site does** (`FACE (APT) (SJT404)`); don't change the data                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | 1.4, 2.2, 2.5          |
| Q9  | The saved course name drops anything after a second `" - "` (`BSTS301P - Advanced Competitive Coding - I` → `Advanced Competitive Coding`). Is that intended? Which name should the agent search and show?                                                                                                                                                                      | `FacultySelector.tsx` 346 (`split(' - ')[1]`)                                         | **Partly answered (you): probably not intended, but not sure. Ask the CodeChef team.** 6 course keys have a second `" - "` (e.g. `BSTS301P`, `BBMD102L`/`BBMD201L` "- I"/"- II" both saved as the same name, `ENG1911`, `SET4001`). **Agent rule (your decision):** the agent searches and shows the **full name from the data key**, splitting only on the **first** `" - "` (e.g. "Advanced Competitive Coding - I"). The site's saved data stays exactly as it is                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | 1.3, 2.2               |
| Q10 | Some listed courses have **no type** (code doesn't end in L/P/E and isn't in `course_type_map`) and **only lab slots**, so the picker treats them as theory and shows an **empty slot list**. Can students add these on the site? What should the agent say? Found 7 (6 distinct): MTech `CSE1002`; `BAMEE310` in 5 '25-batch lists; SENSE ('25) `BAECE352`                     | `getCourseType` + `getTheorySlots` in `src/lib/courseData.ts`; `course_type_map.ts`   | **Ask CodeChef (with Q1 and Q9).** You checked `BAMEE310` on your local copy (the result wasn't written down), and you don't know these courses personally. **Agent rule (your decision):** copy the website: no options, with the note "the website offers no slot to pick for this course". No invented labs                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | 1.4, 1.6, 2.2          |
| Q11 | The same course code appears in several domain groups of one school, with different sections. In SCOPE all 15 cases are **Discipline Elective + Specialization Elective – X** (BAI, BDS, BCI, BCT, BKT), e.g. `BCSE209L` Machine Learning: DisciplineElective 3, BAI 1, BDS 5. Other lists have repeats too (SCORE 25, SELECT ('25) 15, a few others; patterns not yet checked) | `src/data/SCOPE/index.ts` (the `Specialization Elective - …` groups); `loadCourses()` | **Partly answered (you): probably** the Specialization Elective groups are sections reserved for students of that specialization, and Discipline Elective is for everyone else. **Not confirmed: ask CodeChef.** **Agent rule for now:** ask the student their **branch/specialization** (BCE, BAI, BDS, …) along with school and batch, and only offer the group that matches. If we don't know which group fits, show which group each section belongs to and let the student choose. **Never silently mix groups**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | 2.2, 2.4, 3.3, 4.2     |

**To ask the CodeChef team** (when you get the chance; the agent already has a rule for each, so nothing is blocked):

1. **Q1:** what a professor with no opposite-shift lab means (the site uses the course code as the lab slot).
2. **Q2:** the `undefined` lab row for embedded (`E`) courses next to the timetable (seen locally on the same code as the live site).
3. **Q6:** whether MIS ('25 Batch) is a real program (its course list is empty, and it has no button).
4. **Q9:** whether shortening course names at the second " - " is intended (e.g. BBMD102L and BBMD201L get the same saved name).
5. **Q10:** whether students can add courses with no type and only lab slots (`CSE1002`, `BAMEE310`, `BAECE352`); the picker shows an empty slot list for them.
6. **Q11:** whether `Specialization Elective – X` groups are reserved for that specialization's students (and Discipline Elective is for everyone else), and what the repeated codes mean in other schools.
7. **Q3 (seen locally, same code as the live site):** FFCS-inator's `generateTT` reports two `NIL` courses as a clash ("Slots (NIL)"), because it compares the text "NIL" with "NIL". You said NIL never clashes (R6). The agent follows R6 by keeping NIL-only courses out of `generateTT` and adding them back; the website's own generator is untouched.

---

## Phase 0: Prep (touches existing files, so each is its own commit)

### - [x] 0.1 Gitignore `.env*.local` (done: commit `a573238`)

- **What:** Add one line, `.env*.local`, to `.gitignore`.
- **Why:** Right now only `.env` is ignored, so `.env.local` holding your Gemini key could be committed and pushed. This has to happen before any key exists on disk.
- **Concepts:** How `.gitignore` glob patterns work. `git check-ignore -v <file>` tells you which rule ignores a file. If a secret is ever committed, ignoring it later doesn't remove it from history; you have to rotate the key.
- **Code to understand:** `.gitignore` lines 33–34.
- **Who writes it:** You.
- **Interview questions:**
  - A teammate pushed an API key last week and then added it to `.gitignore`. Is the key safe now? What do you do?
  - Where do secrets live in local dev vs production for a Next.js app?

### - [x] 0.2 Move the course-slot helpers into `src/lib/courseData.ts` (done: commit `6157b90`)

- **What:** Move `SubjectEntry`, `FacultyData`, `getCourseType`, `generateCourseSlotsSingle`, `generateCourseSlotsLabOnly` and `generateCourseSlotsBoth` out of the React component into a plain TS module and export them. `FacultySelector.tsx` imports them. The code is moved, not changed.
- **Why:** These are pure functions trapped inside a `'use client'` React file, so server code (our agent) can't import them. One shared copy means the website and the agent always build course data the same way.
- **Concepts:** Pure functions vs side effects. Why business logic shouldn't live inside UI components. What `'use client'` means in Next.js (the file is bundled for the browser) and why server code shouldn't import it. A refactor means the structure changes and the behaviour doesn't.
- **Code to understand:** `src/components/cards/FacultySelector.tsx`: `generateCourseSlotsSingle` (39–91), `generateCourseSlotsLabOnly` (101–139), `generateCourseSlotsBoth` (141–230), `getCourseType` (242–251). `src/lib/course_codes_map.ts` (the overrides `getCourseType` checks first).
- **Who writes it:** You. Claude reviews the diff line by line.
- **Interview questions:**
  - How did you prove the refactor didn't change behaviour?
  - Why can't a Next.js API route just import from a `'use client'` component file?
  - Walk me through how a course becomes theory, lab, both or embedded.

### - [x] 0.3 Extract `buildCourseData()` from `handleConfirm` (done: commit `6157b90`)

- **What:** Move the pure part of `handleConfirm` (find the lab sibling → decide `courseType` → pick lab code and name → call the right helper → assemble `fullCourseData`) into `buildCourseData({ data, school, domain, subject, slot, labShift, faculties })` in the same module. `handleConfirm` keeps the validation popups and localStorage, then calls it.
- **Why:** This "decide the type and assemble" logic is the real conversion. If it stays in the component, the agent has to copy it, and the two copies will drift apart.
- **Concepts:** Separating I/O (popups, localStorage, `onConfirm`) from computation. Designing a function signature that takes plain data instead of React state.
- **Code to understand:** `FacultySelector.tsx` `handleConfirm` (291–420), especially 326–402. The lab-pairing rules:
  - The sibling has the same base code (all but the last char), its type is `P` or `E`, and there must be **exactly one**.
  - A theory slot containing `1` needs a lab of L31 or above; a slot containing `2` needs L30 or below.
  - `E` courses take their lab slots from their own entry list.
  - `BSTS…P` courses count as theory (confirmed by you, see R8).
- **Who writes it:** You. Claude reviews.
- **Interview questions:**
  - What exactly did you leave inside the component, and why?
  - What happens when a theory course has two lab siblings?

### - [x] 0.4 Prove "no behaviour change" (done: runs locally on Node 22, not 25; all 5 courses identical before/after; snapshots in `~/Desktop/ffcs-snapshots/`)

- **First, check early whether the site runs locally without MongoDB or Google credentials.** Run `yarn dev`, open `http://localhost:3000`, add a course and generate a timetable. Note what works and what errors. What the code tells us so far, not yet tested:
  - The app reads `MONGODB_URI`, `GOOGLE_CLIENT_ID`/`SECRET`, `GOOGLE_CLIENT_EMAIL`/`PRIVATE_KEY`, `SHEET_ID` and `BASE_URL`.
  - `src/lib/mongodb-client.ts` throws `"Please add your Mongo URI to .env"` as soon as it's imported without `MONGODB_URI`. It's used by the login route (`api/auth/.../authOptions.ts`).
  - Course selection and generation run in the browser (localStorage + `generateTT`).

  If the parts we need (adding courses, generating) don't work locally, we ask you what to do. We don't patch anything.

- **Then:** before 0.2, add one course of each kind in the running site (theory+lab, embedded `E`, lab-only `P`, theory-only, a `BSTS` course) and save `localStorage.selectedCourses` as JSON. Redo the same picks after 0.3 and diff the JSON. Run `yarn build` and `yarn lint`.
- **Why:** The refactor touches a component used by about 30k students. Matching outputs is your evidence.
- **Concepts:** Characterization (golden-master) testing: record what the code does today and assert it still does exactly that. Useful when legacy code has no tests.
- **Code to understand:** `FacultySelector.tsx` 404–418 (where localStorage is written), and `landing.tsx` `facultySelectorOnConfirm` (how repeated picks of the same course merge their slots).
- **Who writes it:** You run it. Claude helps you diff.
- **Interview questions:**
  - The code had no tests. How did you refactor it safely?
  - What would a golden-master test miss?

### - [x] 0.5 ~~Open the refactor as a PR to CodeChef~~ (dropped: D8)

- **Dropped.** All changes stay in your repo (D8). The refactor is just a normal commit on your `ffcs-agent` branch.
- **What this means later:** when you `git pull upstream` and CodeChef has changed `FacultySelector.tsx`, Git may report a **merge conflict**, because you moved code they might also edit. You resolve it by keeping their change and making sure it ends up in `src/lib/courseData.ts`. Then you rerun the 0.4 check (snapshots in `~/Desktop/ffcs-snapshots/`).
- **Interview question:**
  - You refactored code in a fork that still pulls from upstream. What's the cost, and how do you handle it?

### - [x] 0.6 Answer the open questions together (done: all 9 answered or marked "ask CodeChef", each with an agent rule)

- **What:** Go through Q1–Q9 together. For each one, either you explain how VIT works, or we check it on the live FFCS-inator site (exact steps and a screenshot of what the site shows). Write the answer into the Q table, then update every subtask listed in its "Blocks" column.
- **Why:** The code and data encode how VIT actually works (D6). Something that looks odd from reading code usually has a real reason. Answering first means the agent is built on facts, not guesses. Only something confirmed as wrong on the live site counts as a bug (and might be fixed in your repo in 7.4).
- **Concepts:** Asking before assuming in an unfamiliar codebase. Domain knowledge vs code reading. Reproducing before changing anything.
- **Code to understand:** The "Where" column of each question.
- **Who writes it:** You answer or check the site. Claude asks the questions and updates the plan.
- **Interview questions:**
  - You joined a codebase where something looked wrong. How did you find out whether it really was?
  - Give an example where code looked odd but encoded a real-world rule.

> Suggested commits: `chore: gitignore .env*.local` (done) and `refactor: extract course-slot builders from FacultySelector into lib/courseData`

---

## Parallel track: learning exercises (do alongside Phase 0 and 1)

These don't depend on any project code, so you can do them whenever you have time during Phase 0 and 1. They're where you learn tool calling and LangGraph basics before you need them in Phase 3.

> **Packages:** both need `@langchain/core`, `@langchain/langgraph` and `zod`. After 1.1 they're installed in the repo. Before 1.1, do them in a throwaway folder outside the repo (`mkdir ~/langgraph-practice && cd ~/langgraph-practice && yarn init -y && yarn add @langchain/core @langchain/langgraph zod && yarn add -D tsx`), so nothing touches the project yet.

### - [x] P.1 What a "tool" is (concept, no project code) (done: `src/agent/playground/p1-tools.ts`)

- **What:** Write a tiny `tool()` in a scratch file: a function plus a name, a description and a zod schema. Inspect the JSON schema the LLM would see.
- **Why:** You know RAG, and this is the missing piece. The LLM never runs code. It _asks_ for a call ("call `searchCourses` with `{query: 'OS'}`"), your code runs it, and the result goes back as a `ToolMessage`.
- **Concepts:** Tool calling, JSON schema, why tool descriptions are prompts, and the `AIMessage.tool_calls` → `ToolMessage` round trip.
- **Who writes it:** You.
- **Interview questions:**
  - Explain tool calling to me as if I only know RAG.
  - Who executes the tool, the model or your code? Why does that matter for safety?

### - [x] P.2 Toy graph (learning only) (done: `src/agent/playground/p2-graph.ts`)

- **What:** `src/agent/playground/hello-graph.ts` (or a throwaway folder, see the note above): two nodes, one conditional edge and a counter in state. Run it and print each step.
- **Why:** You learn the moving parts with nothing else going on before you wire up the real graph.
- **Concepts:**
  - **State**: one typed object every node reads.
  - **Node**: `(state) => partial update`.
  - **Edge**: what runs next.
  - **Conditional edge**: a function that picks the next node.
  - **Reducer**: how an update merges (replace vs append).
  - `compile()`, `invoke()` vs `stream()`.
- **Who writes it:** You.
- **Interview questions:**
  - What does a node return: the whole state or part of it? Why?
  - What's a reducer, and when do you need one?

---

## Phase 1: Setup and data layer (no LLM)

### - [x] 1.1 Install dependencies (done: langgraph 1.4.21, core 1.2.17, zod 4.6.5, tsx 4.23.15)

- **What:** `yarn add @langchain/langgraph @langchain/core zod` and `yarn add -D tsx`.
- **Why:** LangGraph is the graph runtime, `@langchain/core` has the message, tool and model interfaces, zod gives schemas, and tsx runs `.ts` scripts directly (it understands the `@/` path alias from `tsconfig.json`).
- **Concepts:** Runtime deps vs dev deps. Lockfiles and why we keep only `yarn.lock` current. Peer dependencies (LangGraph needs a matching `@langchain/core`).
- **Code to understand:** `package.json`, `tsconfig.json` (`paths`).
- **Who writes it:** You run it.
- **Interview questions:**
  - Why is `tsx` a dev dependency but `zod` isn't?
  - What does a lockfile guarantee?

### - [x] 1.2 Skeleton, README.md and LEARNING.md (done: commit `d10e363`)

- **What:** Create `src/agent/{data,tools,nodes,evals}` plus `README.md` (what each file does and how they connect) and `LEARNING.md` (a log per phase: what we built, concepts, decisions, interview questions).
- **Why:** You should be able to open one folder and explain the whole project. LEARNING.md becomes your interview revision notes.
- **Concepts:** Organizing by role (data → tools → nodes → graph), so dependencies flow one way.
- **Code to understand:** None.
- **Who writes it:** Claude drafts both docs. You edit them in your own words (they need to sound like you).
- **Interview questions:**
  - Walk me through your folder structure. Why is `tools/` separate from `nodes/`?

### - [x] 1.3 `data/loadCourses.ts`: flatten the course catalogue (done: 938 courses, SCOPE 138)

- **What:** Read the single `data` export (school → domain → `"CODE - Name"` → entries) into a flat list of `{ school, domain, key, code, name, type, entries }`, using `getCourseType` from 0.2. `name` = everything after the **first** `" - "` in the key (Q9), so `"BSTS301P - Advanced Competitive Coding - I"` gives `"Advanced Competitive Coding - I"`. Don't reuse the site's `split(' - ')[1]` for this.
- **Why:** Everything downstream (search, validation, conversion) needs to iterate over courses. Reading at runtime from `src/data` means upstream data updates flow in automatically, with nothing hardcoded.
- **Concepts:** Reading nested `Record` types in TS. `Object.entries`. Defining your own small type instead of passing raw nested objects around.
- **Code to understand:** `src/data/faculty.ts` (types at 21–40, the `data` export at 42). One school index such as `src/data/SCOPE/index.ts`. `FacultySelector`'s `schools` list (12–31) and `data`'s keys differ. See **Q6** before deciding which schools the loader exposes.
- **Who writes it:** You.
- **Interview questions:**
  - Why read data at runtime instead of putting it in the prompt?
  - How does your loader handle a course key without `" - "` in it?

### - [x] 1.4 `data/toFullCourseData.ts`: every option for a course (done: 842 listed courses build; Q1 removes 55 options; 7 have nothing to pick, Q10. Picker rules moved first in commit `9de77de`)

- **What:** For a chosen course, build a `fullCourseData` with **all** its theory slots and all faculty for each, by calling `buildCourseData` once per theory slot (or per shift, for lab-only courses) and merging the results the same way `landing.tsx` does.
- **Why:** The website builds a course from what the student clicked. The agent needs the "every possible option" version so `generateTT` can search across them.
- **Concepts:** Reusing code you don't control by calling it in a loop instead of copying it. Merging by key.
- **Code to understand:** `buildCourseData` (0.3), `landing.tsx` `facultySelectorOnConfirm`. In `generateTT` (`src/lib/utils.ts` 11–52), see how `courseSlots` and `facultyLabSlot` become options. Keep the conversion faithful to the site (R7): whatever `buildCourseData` produces is what the agent uses. **Q1 rule:** when `buildCourseData` gives a professor the course code as their lab slot (no opposite-shift lab), the agent drops that professor's option and records "lab slot unavailable for this professor" for `present` to show. Embedded courses follow Q2 ("(Embedded Theory)" / "(Embedded Lab)"). **`BSTS` (Q8):** build each section's faculty name exactly as the site does (`${faculty} (${venue})`, the `startsWith('BSTS')` line in `FacultySelector.tsx`), one option per section. That formatting rule still lives inside the component; whether to move it into `src/lib/courseData.ts` (like `schools`) or mirror it is your call when we reach 1.4.
- **Who writes it:** You.
- **Interview questions:**
  - How many options does a typical lab course produce? Why does that matter for `generateTT`?
  - How did you reuse the UI's conversion without copying it?
- **Grouping same-slot options (your rule, applies to every course, not just `BSTS`):** options of one course that have the **exact same slot string** (including the lab part for theory + lab courses, e.g. `F1+TF1__L55+L56`) and differ only by professor/company or room are identical for clashes and time constraints. Group them, keeping every member (professor, room) in the group, so 2.4 can generate with one option per group. **Measured:** `BSTS301P` 103 options → 4 groups; `BCSE302L` 48 → 20; all SCOPE courses 930 → 466.

### - [x] 1.5 `data/slotTimes.ts`: slot → sessions table (done: commit `36db83c`; labels moved in `68ac48a`. **Still to do: you check the printed table against VIT's chart**)

- **What:** Two functions:
  - `sessionsOf(slotKey)` returns every weekly session as `{ day, start, end, kind: theory|lab, shift: morning|evening }`, derived from `slotMap` with the R-rules formula.
  - `sessionsOfSlotString("A1+TA1+TAA1" | "L9+L10+L25+L26" | "NIL")` splits the string, groups lab pairs (R1), and returns **every** session (R2, R3). It returns `[]` for `NIL` (R6). Each consecutive odd+even lab pair is one session (Q4, Q5). A course code used as a lab slot (Q1) never reaches here, because 1.4 drops those options first.

  Print the full table and check it against VIT's official chart.

- **Why:** "No 8am" and "Friday free" need real days and times for theory **and** labs (R5). The official chart is the source of truth, and `slotMap` has already been cross-checked against it.
- **Concepts:** Deriving data from an existing source of truth instead of hardcoding it. One slot key → many sessions (A1 meets twice). Grid columns → minutes (10 min per column). Decision **O1**.
- **Code to understand:** `src/lib/slots.ts` `slotMap` (3–113): odd lab keys only, drawn as `L1+L2` (R1). `src/components/ui/TimeTable.tsx`: `ROW_WEIGHTS` and `LAB_ROWS` (49–53), and `MERGE_CELLS_BOLD_TEXT` (60+). Rows 4/5 = Mon, 7/8 = Tue, 10/11 = Wed, 13/14 = Thu, 16/17 = Fri. Theory rows are 4, 7, 10, 13 and 16; lab rows are 5, 8, 11, 14 and 17. Hour labels sit at columns 2, 8, 14….
- **Who writes it:** You.
- **Interview questions:**
  - How did you get slot timings without hardcoding them? How did you check them?
  - `A1` meets twice a week and `L9+L10+L25+L26` is two lab sessions. How does your table represent that?
  - Why does `L2` on its own have no sessions?

### - [x] 1.6 `data/validate.ts`: data sanity checks (done: real data → only the 7 Q10 courses and 2 empty schools; bad strings like `L2`, `L1+L4` are caught in tests)

- **What:** Report anything in the data that our _agent code_ doesn't know how to read, so we can ask about it (D6). Log problems, never throw. Make it runnable as a script. It **reports**; it never rejects or changes data.
  - `NIL` is known and not reported (R6).
  - Multi-session lab strings (`L9+L10+L25+L26`) and multi-part theory (`A1+TA1+TAA1`) are known (R2, R3).
  - Lab strings are consecutive odd+even pairs (Q4). Anything else (a lone `L2`, a non-consecutive `L1+L4`) is **reported to you as unexpected**; it's never rejected or fixed.
  - Empty option lists, and the same code appearing twice: reported as "please check". What counts as a real duplicate (within one school and domain? across batches?) is confirmed with you first.
- **Why:** CodeChef updates the data before each registration. When a new pattern appears, we want to find out and ask, not have the agent silently misread it. The data is correct by default (R7), so anything reported is a gap in _our_ understanding until proven otherwise.
- **Concepts:** Validating at system boundaries. Warnings vs errors. Defining "valid" from the domain rules (R1–R6), not from what's easy to check.
- **Code to understand:** The real data has 29 one-session lab strings, 65 two-session strings, one three-session string and 28 `NIL` entries. `clashMap` is at `slots.ts` 115–182 (odd lab keys only).
- **Who writes it:** You.
- **Interview questions:**
  - What did validation find in the real data, and what did it turn out to mean?
  - Why does your validator report instead of reject?

### - [x] 1.7 Data version (done: option A. `updateDataVersion.ts` writes `dataVersion.ts` = 2026-06-28; the validator warns if it's stale and skips quietly without Git)

- **What:** Expose `DATA_VERSION`, such as the last commit date touching `src/data` (currently 2026-06-28).
- **Why:** Students should know whether the slots they're seeing are current.
- **Concepts:** Build-time vs runtime values. Production serverless deploys often have no `.git` folder. Decision **O2**.
- **Code to understand:** `git log -1 --format=%cI -- src/data`.
- **Who writes it:** You.
- **Interview questions:**
  - Why might `git log` work locally but fail on Vercel at runtime?

### - [x] 1.8 Phase 1 wrap-up (README and LEARNING updated; you edit them into your own words)

- **What:** Update README and LEARNING, run every script, and do a quiz round.
- **Who writes it:** You update the docs. Claude quizzes.

---

## Phase 2: Tools without an LLM

### - [x] 2.0 Test setup (done: Vitest, `yarn test:agent`, commit `12333ec`)

- **What:** Add a test runner (decision **O3**) and a `yarn test:agent` script.
- **Why:** Deterministic code should be tested deterministically. This is the "code verifies" half of the design.
- **Concepts:** Unit tests, fixtures, testing pure functions.
- **Who writes it:** Claude sets up the config. You write every test.
- **Interview questions:**
  - What did you test, and what did you deliberately not test?

_(2.1 moved to the parallel track as P.1.)_

### - [x] 2.2 `tools/searchCourses.ts` (done: code, name, initials, words + typos incl. swapped letters, aliases, BSTS company; Q11 groups; 12 tests pass)

- **What:** Fuzzy course search on code and name that returns ranked candidates with a score and an `ambiguous` flag. It handles codes (`BCSE303`), names, typos and abbreviations ("OS", "CN", "DBMS").
  - `school` is a **required** parameter and it searches **only** that school (D7). Valid school values are the website's `schools` list, imported from `src/lib/courseData.ts` (Q6). Never hardcoded. The meaning of a key (one program + batch list) is confirmed (Q7).
  - It returns a distinct `notOfferedInSchool` result when nothing matches in the student's school. It never falls back to other schools.
  - **Nicknames (D9):** also match the alias list (`DBMS` → Database Systems). Initials still cover "OS", "CN", "AI", "ML".
  - **One result = a course in one domain group (Q11).** If a code appears in several groups, keep them apart: offer only the group that matches the student's branch/specialization; if unknown, return each group labelled ("Specialization Elective – BAI", …) so the agent can ask. Never merge sections from different groups.
  - Search the **full** course name from 1.3 (Q9), so "Biomedical Instrumentation II" finds `BBMD201L`, not `BBMD102L`.
  - **`BSTS` (Q8):** a company name ("FACE") matches every section of that company, in every room. Match on the company part of the saved name, not the room.
- **Why:** Different schools are offered different slots for the same course, so mixing them would produce timetables the student can't register for. "OS" won't fuzzy-match "Operating Systems" by edit distance, so you need initials or alias matching. Ambiguity detection is what triggers the interrupt in Phase 4.
- **Concepts:** Edit distance vs token overlap vs initialisms. Score thresholds and the "top two are too close" ambiguity rule. Precision vs recall. Making illegal states unrepresentable (no `school`, no search).
- **Code to understand:** The output of 1.3. `src/data/faculty.ts` 42–62 (the school keys). How theory and lab siblings appear as separate keys (return the theory course and pair the lab automatically).
- **Who writes it:** You.
- **Interview questions:**
  - How do you decide a query is ambiguous?
  - Why not just let the LLM pick the course code?
  - A course exists in SCORE but not SCOPE. What does your agent tell a SCOPE student, and why not offer the SCORE slots?

### - [x] 2.3 `constraints.ts`: the constraints schema (done: D10 incl. per-course slot wish; 10 tests)

- **What:** One zod schema for what the student wants: courses, blocked days, earliest start or blocked hours, a free day, faculty must/prefer/avoid, shift preference, same building. Each constraint is marked **hard** or **soft**. Shift preference is **optional and absent by default** (R4). The parser only fills it when the student actually asks ("mornings only", "I prefer evenings"), and it's soft unless they say it's a must.
- **Why:** This is the contract between the LLM (which fills it in Phase 3) and the code (which enforces it). One schema serves both.
- **Concepts:** Zod (`z.infer` gives you the TS type for free). Structured output. Hard vs soft constraints. Making the schema easy for an LLM to fill (enums and descriptions).
- **Who writes it:** You.
- **Interview questions:**
  - Why is "Prof X for OS" hard in one sentence and soft in another?
  - How do you stop the LLM from inventing a field?

### - [x] 2.4 `tools/generate.ts`: generator wrapper (done: D11 rules, smallest conflict per course, fixes when nothing fits together; 19 tests, 41 in total)

- **What:** Pre-filter each course's options by hard constraints. Options are dropped whole and never trimmed or recombined (R8). An option is dropped if **any** of its sessions (theory and lab, using `sessionsOfSlotString`: R2, R3, R5) hits a blocked day or time, or if its faculty is avoided. `NIL` options are never dropped by time constraints (R6). **Group same-slot options before generating (your rule):** for every course, options with the exact same slot string that differ only by professor/company or room become one group (from 1.4), and the generator tries **one option per group**. Order matters: apply professor **must/avoid** constraints _before_ grouping, so a group only contains professors the student accepts; soft professor or same-building preferences are scored later from the group's members. This doesn't break R8, because every group member is a real, whole option from the data. **Measurable result:** for 6 typical SCOPE courses (`BCSE304L`, `BENG102P`, `BSTS301P`, `BCSE204L`, `BCSE203E`, `BCSE302L`) the combinations to try drop from **177,984 to 1,920 (~93× fewer)**; record this before/after in LEARNING.md and the README. Then estimate the combination count, refuse or ask to narrow if it's too big, call `generateTT`, cap the results, and return the `clashes` text.
- **Why:** `generateTT` is a brute-force Cartesian product, so 5 courses with 30 options each is 24 million. Filtering _before_ generating is the key performance decision in the project.
- **Concepts:** Cartesian products and exponential blow-up. Pushing filters down (the same idea as a database query planner). Guard rails.
- **Code to understand:** `src/lib/utils.ts` `generateTT` (4–146), especially the main loop (59–121) and `breakClubbed` (148–175). The `clashes` message is only filled in when there are zero results, and de-duplication is by faculty pair only (`seenPairs`, 57/104). `CourseCard.tsx` 132 (how the site calls it).
- **Who writes it:** You.
- **Interview questions:**
  - What's the complexity of `generateTT`? How did you keep it fast?
  - Why filter before generating rather than after?
  - What does `discardClashCombinations=false` do, and do you use it?

### - [x] 2.5 `tools/filterRank.ts` (done: D12; reasons per timetable; top 3 differ; 10 tests, 51 in total)

- **What:** Drop timetables that break a hard constraint, score the rest on soft preferences, and return the top N with **reasons** (for example "+2: Prof X for OS", "−1: lab at 8:00 Fri (L25+L26)"). Rules:
  - Day and time constraints and preferences are evaluated on **every session**, labs included (R2, R3, R5). "Friday free" fails if any theory meeting _or_ lab session is on Friday.
  - `NIL` contributes no sessions (R6).
  - Morning and evening are classified per R4 (slots ending in `1`/`2` for theory, L1–L30 vs L31–L60 for labs). A shift preference only affects the score, and only when the student asked for one. With no preference, timetables that mix shifts across courses are not penalised at all.
- **Why:** These reasons are the facts the `present` node explains later, so the LLM explains your scores instead of inventing its own.
- **Concepts:** Weighted scoring, explainable ranking, tie-breaking, reusing `evaluateFilters` only where it fits.
- **Code to understand:** `src/lib/filterUtils.ts` (10–37). Reuse it for `sameBuilding`. Its morning and evening check skips labs, so it's fine for the site's "theory shift" filter but **not** for R5 constraints. Use your `slotTimes` sessions for those. `ViewTimeTable.tsx` 219 (how the site uses it).
- **Who writes it:** You.
- **Interview questions:**
  - How did you choose the weights? How would you tune them?
  - How do you guarantee the explanation matches the ranking?

### - [x] 2.6 `tools/finalCheck.ts`: independent verifier (done: 11 tests; 62,614 real timetables from 680 course combos all pass, 0 false rejections)

- **What:** Re-check every timetable without trusting `generateTT`. It verifies on **sessions** (from `slotTimes`), not raw strings:
  - every slot string parses into known sessions, with lab pairs treated as one session (R1) and every session of multi-session labs and multi-part theory included (R2, R3);
  - every row's slot string is **exactly** one offered in the data for that course and professor. No split, merged or invented strings (R8). For theory + lab courses, the lab belongs to the same professor as the theory;
  - no two sessions overlap on the same day and time (also cross-check with `clashMap`);
  - `NIL` is skipped entirely: it never clashes and is never flagged (R6);
  - every hard constraint holds on every session, labs included (R5);
  - how to treat rows the agent can't map to sessions (the Q2 embedded rows, the Q4/Q5 string shapes) is **decided after 0.6**. Until then `final_check` doesn't reject them on its own judgment; it surfaces them and asks.
- **Why:** This is the core rule: the LLM plans, code verifies. Checking overlap on real day and time sessions is independent of `clashMap`, so the two checks back each other up.
- **Concepts:** Defence in depth. Invariants. Why a verifier should share as little code as possible with the thing it verifies.
- **Code to understand:** `clashMap` and `getSlot` (`slots.ts` 115–192). Your `slotTimes.ts` (1.5). The answers to Q1–Q5.
- **Who writes it:** You.
- **Interview questions:**
  - `generateTT` already removes clashes. Why check again?
  - A naive "slot must be in `slotMap`" check rejects every lab. Why?
  - Your verifier found something it didn't understand. What did it do, and why not just reject it?

### - [x] 2.7 Tests for 2.2–2.6 (done: 81 tests across data, search, constraints, generate, filterRank, finalCheck; found that `generateTT` treats two NIL courses as a clash, so the wrapper follows R6)

- **What:** Small fixtures:
  - a known clash pair;
  - "no 8am" violated only by a lab (L1+L2);
  - "Friday free" violated only by the second session of `L9+L10+L25+L26`;
  - `A1+TA1+TAA1` hitting Wednesday;
  - a `NIL` course alongside regular courses, and two `NIL` courses together. Both must be accepted and listed as "no scheduled classes" (Q3);
  - a three-session lab string (`L31+L32+L45+L46+L57+L58`) producing three sessions (Q5);
  - a lab-only course where "Friday free" removes one whole bundle and keeps the other. The removed bundle is never trimmed down to its non-Friday pair (R8);
  - a theory + lab timetable whose lab professor differs from the theory professor. `final_check` must catch it (R8);
  - cases for Q1, Q2, Q4 and Q5, written to match the confirmed answers;
  - an ambiguous query;
  - a course not offered in the student's school;
  - a valid mixed-shift timetable (course X's 8am lab with course Y's 10am theory) that must **not** be filtered out or penalised when there's no shift preference;
  - an impossible set of constraints.
- **Who writes it:** You. Claude reviews the coverage.
- **Interview questions:**
  - Which test caught a real mistake in your own code?

### - [x] 2.8 Phase 2 wrap-up: docs and quiz (README, LEARNING, INTERVIEW updated)

---

## Phase 3: Minimal graph (terminal only, no interrupts)

_(3.1 moved to the parallel track as P.2. Finish it before 3.2.)_

### - [x] 3.2 `llm.ts`: provider config (done: gemini-3.8-flash via getModel(); key in .env.local; `npx tsx src/agent/llm.check.ts`)

- **What:** `getModel()` reads `LLM_PROVIDER` and returns `ChatGoogleGenerativeAI` (`gemini-2.5-flash`) with the key from `.env.local`. Throw a clear error if the key is missing.
- **Why:** There's one place to switch providers, and the rest of the code depends on the `BaseChatModel` interface, not on Gemini.
- **Concepts:** Dependency inversion. Env vars: Next.js loads `.env.local` automatically but `tsx` scripts don't (`node --env-file` or dotenv). Temperature 0 for parsing.
- **Who writes it:** You. (Needs `@langchain/google-genai`, installed here.)
- **Interview questions:**
  - How would you add a second provider?
  - What did you set the temperature to for each node, and why?

### - [x] 3.3 `state.ts` (done: one writer per field, courses stored as small refs; 3 tests, 84 in total)

- **What:** The graph state: `messages` (append reducer), `school` (one of `data`'s top-level keys, set once: D7), `branch` (the student's branch/specialization, e.g. BCE, BAI, BDS; Q11), `constraints`, `resolvedCourses`, `notOffered` (courses missing from that school), `candidates`, `ranked`, `conflict`, `relaxRounds`.
- **Why:** State is the contract between nodes. Each field should have exactly one node that owns writing it.
- **Concepts:** `Annotation.Root`, `MessagesAnnotation`, reducers, keeping state serializable (needed for checkpointers later).
- **Who writes it:** You.
- **Interview questions:**
  - Why must state be serializable?
  - Which node writes each field?

### - [x] 3.4 `nodes/parseRequest.ts` (done: Gemini fills the form, Zod checks, retry with the error up to 3 times; professor titles ignored; 9 tests, 93 in total; live check: `npx tsx src/agent/nodes/parseRequest.check.ts`)

- **What:** The LLM turns the user's message into the constraints schema (2.3) via `withStructuredOutput`.
- **Why:** This is the only place free text becomes data.
- **Concepts:** Structured output vs tool calling (under the hood they're the same mechanism). Prompt design. Validation failures and retries.
- **Who writes it:** You (including the prompt).
- **Interview questions:**
  - What happens if Gemini returns something that fails the schema?
  - How do you parse "no 8am" vs "nothing before 9"?

### - [x] 3.5 `nodes/resolveCourses.ts` (done: O4 = A, plain code; unclear courses kept aside for Phase 4; 5 tests, 98 in total)

- **What:** Map course mentions to real codes with `searchCourses`, **always passing `state.school`** (D7). In Phase 3 the school comes from a CLI flag; in Phase 4 it comes from the ask-once interrupt (4.2).
  - A course not found in that school goes into `notOffered`, and `present` tells the student plainly ("BCSE303L isn't offered in SCOPE this semester"). It never substitutes another school's slots.
  - When it pairs a theory course with its lab, it follows R4's within-course rule (morning theory ↔ evening lab), by reusing `buildCourseData` rather than re-implementing it. Nothing here restricts shifts _across_ courses.

  Decision **O4**:
  - (A) Plain code calls the tool for each mention. This is predictable and cheap.
  - (B) The LLM gets the tool via `bindTools` and loops through `ToolNode` / `toolsCondition` (ReAct). You learn real tool calling, and it handles messy input better.

- **Why:** This is where "is this a workflow or an agent?" becomes concrete, which makes it a great interview topic.
- **Concepts:** ReAct loops, `bindTools`, `ToolNode`, `toolsCondition`. Workflow vs agent, and when to give the LLM control.
- **Who writes it:** You.
- **Interview questions:**
  - Is your project an agent or a workflow? Defend it.
  - How do you stop a ReAct loop running forever?
  - How do you make sure the LLM can't search another school, even if the user asks it to?

### - [x] 3.6 `nodes/generate.ts` and `nodes/filterAndRank.ts` (done: thin glue around 2.4/2.5/2.6; `rankIssue` says why ranking is empty; 4 tests, 102 in total)

- **What:** Thin nodes that call the 2.4 and 2.5 tools and write the results to state. No LLM.
- **Why:** Keeping nodes thin and logic in tools means the logic stays unit-testable without a graph.
- **Who writes it:** You.
- **Interview questions:**
  - Why are these nodes and not tools the LLM calls?

### - [ ] 3.7 `nodes/present.ts`

- **What:** The LLM explains the top 2–3 timetables using **only** the ranked results and reasons in state. Use the **full** course name from the data key (Q9), not the site's shortened saved name. For `BSTS` courses, show the **room** (it's part of the saved name, Q8), since that's where the student needs to go. **For grouped options (your rule):** after a timetable is chosen, tell the student which slot the course fits in and list the sections at that time, e.g. "Soft skills fits in D1+TD1. There are N sections at this time: [companies/rooms]. Pick one, or I'll leave it as any." If the student named a company or professor earlier, list only those. Optionally, a check that every faculty and slot name in the reply exists in state.
- **Why:** The LLM explains and the code decides. This stops hallucinated professors and slots.
- **Concepts:** Grounding (like RAG: the context is your state), prompt constraints, output checks.
- **Who writes it:** You.
- **Interview questions:**
  - How do you know the explanation doesn't contain hallucinations?

### - [ ] 3.8 `graph.ts` and a CLI script

- **What:** Wire parse → resolve → generate → filter_and_rank → present, plus `src/agent/scripts/cli.ts`, which streams each node's update to the terminal.
- **Who writes it:** You write `graph.ts`. Claude writes the CLI and walks you through it.
- **Interview questions:**
  - Draw your graph on the whiteboard.
  - Why not one big prompt with all the data?

### - [ ] 3.9 Smoke test and Phase 3 wrap-up

- **What:** Run 3 requests (easy, multi-course, one with a faculty preference), then update the docs and do a quiz round.

---

## Phase 4: Human-in-the-loop

### - [ ] 4.1 Checkpointer and threads

- **What:** Compile with `MemorySaver` and pass `thread_id` in the config.
- **Concepts:** A checkpointer saves state after every node, keyed by thread. That's what makes pausing, resuming and multi-turn chat possible. In-memory storage is lost on restart.
- **Who writes it:** You.
- **Interview questions:**
  - Where does conversation state live between two HTTP requests?

### - [ ] 4.2 Ask for the school, batch and branch once

- **What:** An `ask_school` node at the start. If `parse_request` didn't find the program and batch in the message and `state.school` is empty, it interrupts and asks for **program + batch year + branch/specialization** (BCE, BAI, BDS, …; Q11) (or "which list do you pick on FFCS-inator?"), with **SCOPE first**. It maps the answer to an **existing** top-level key of `data` (Q7). If nothing matches, for example a 2025 SCHEME student when only a plain `SCHEME` key exists, it asks again instead of guessing. It stores the key in state and never asks again in that thread. **Branch/specialization is only asked when it changes the result** (e.g. a requested course is in Specialization Elective groups, Q11), per the rules in 4.5. The options are the `schools` list in `src/lib/courseData.ts` (the website's buttons, SCOPE first) **minus schools with no courses**, worked out automatically, so they follow CodeChef's changes (Q6). If the student names a hidden empty school (SCE, SBST ('25 Batch), MIS), reply "no courses are listed for that school yet" instead of "unknown school".
- **Why:** Search is school-scoped (D7). Asking once and checkpointing the answer keeps later turns from asking again.
- **Concepts:** Your first `interrupt()`. Conditional entry routing (skip the node if `school` is already set). State that persists across turns via the checkpointer.
- **Who writes it:** You.
- **Interview questions:**
  - Why ask up front instead of searching every school and picking one?
  - How does the agent remember the school on the next message?

### - [ ] 4.3 Interrupt for ambiguous courses

- **What:** `interrupt({ question, options })` inside `resolve_courses`, and resume with `new Command({ resume: answer })`.
- **Concepts:** An interrupt pauses the graph and hands a value to the caller. On resume, **the node re-runs from its start**, so code before `interrupt()` must be safe to run twice.
- **Who writes it:** You.
- **Interview questions:**
  - What happens to code that ran before `interrupt()` when you resume?

### - [ ] 4.4 `nodes/relax.ts`

- **What:** Code works out _which_ hard constraints cause the zero results (re-run without each one and count the results). The LLM turns that into a question ("Keeping Friday free leaves nothing. Drop it, or drop Prof X?"). Then interrupt, apply the user's choice, and loop back to generate.
- **Why:** Diagnosing the conflict is deterministic and wording it is the LLM's job, the same split as everywhere else.
- **Concepts:** Counterfactual diagnosis. Cycles in graphs.
- **Who writes it:** You.
- **Interview questions:**
  - How do you find _which_ constraint causes infeasibility?
  - What if two constraints only conflict together?

### - [ ] 4.5 Clarifying questions, only when the answer changes which timetable wins

- **What:** after generating and ranking, the agent may ask the student **1–2 questions** to be more specific, but **only if the answer would change which timetable wins**. Four cases:
  1. **Vague wishes:** "not too early" → "nothing before 9:00 or before 10:00?" (only if 9 and 10 give different winners).
  2. **Top results differ by one choice:** the best timetables are equal except for one course's professor or slot → "for CN, Brisilla in F2+TF2 or Tamizharasi in F1+TF1?"
  3. **Trade-offs between two wishes:** keeping one wish costs the other (e.g. Prof Y only teaches after 5, but the student said "nothing after 5 if possible") → "which matters more?"
  4. **Missing info that changes results:** school, batch or branch (e.g. the branch decides the Specialization Elective group, Q11). If it changes nothing, don't ask.
- **Rules (yours):**
  - At most **1–2 questions per turn**.
  - **Always show the current best timetable alongside the question**, so the student is never blocked waiting.
  - **Never ask about something that doesn't change the outcome.** Check first: rank with each possible answer; if the winner is the same either way, skip the question.
  - **Pick the question whose answer splits the remaining timetables the most** (the most even split), so each answer removes as many options as possible.
- **Why:** a good assistant asks only questions that matter. Asking about things that don't change the result wastes the student's time; never asking means guessing on things they care about.
- **Concepts:** counterfactual checks (re-rank as if the student answered A, then B); choosing the most informative question (the same idea as "20 questions" or how a decision tree picks a split: information gain); not blocking the user (answer now, refine later); LangGraph `interrupt()` with a default answer.
- **Code to understand:** `tools/filterRank.ts` (the scores and reasons per timetable, `pickDifferent`), `tools/generate.ts` (`fixes` for trade-offs), 4.2 and 4.3 (the other questions the agent asks).
- **Who writes it:** Claude writes it; you review it and get quizzed.
- **Interview questions:**
  - How does your agent decide whether a clarifying question is worth asking?
  - Why show a timetable together with the question instead of waiting for the answer?
  - How do you pick which question to ask when several are possible?

### - [ ] 4.6 Conditional edges and the loop cap

- **What:** Route `0 results → relax` otherwise `→ final_check`. Add an ambiguity route, a `relaxRounds` cap (for example 3) and LangGraph's `recursionLimit`.
- **Who writes it:** You.
- **Interview questions:**
  - How do you guarantee the graph terminates?

### - [ ] 4.7 `final_check` node

- **What:** Run 2.6 just before present. Anything that fails is removed and logged, and if nothing survives the graph goes back to relax.
- **Who writes it:** You.

### - [ ] 4.8 Multi-turn CLI and Phase 4 wrap-up

- **What:** Extend the CLI to show interrupt questions, read your answer and resume. Then update the docs and do a quiz round.
- **Who writes it:** Claude writes the CLI. You do the docs.

> ## 🎯 Milestone: resume-ready
>
> At this point you have a working LangGraph agent you can demo from the terminal. It parses free-text requests, asks for the school and batch, resolves courses with a search tool, generates timetables with the existing generator, verifies them deterministically, and asks the student which constraint to relax when nothing fits. You can put it on your resume and talk about it in interviews even before the UI exists.
> **Checklist before calling it done:**
>
> - [ ] A 3-request terminal demo runs end to end: easy, ambiguous course, impossible constraints.
> - [ ] README.md and LEARNING.md are up to date through Phase 4.
> - [ ] A draft resume bullet and a 2-minute explanation of the graph, written in your own words.
> - [ ] You can answer every interview question in Phases 0–4 without notes.

---

## Phase 5: API and UI

### - [ ] 5.1 `src/agent/server.ts` and the thin `route.ts`

- **What:** `runAgent({ threadId, message | resume })` streams events. `route.ts` is a few lines that turn it into an SSE response (`runtime = 'nodejs'`).
- **Concepts:** Server-Sent Events. LangGraph stream modes (`updates`, `messages`). Why the API key must stay on the server.
- **Who writes it:** Claude writes the route plumbing. You write `server.ts`.
- **Interview questions:**
  - How does the frontend know the agent is waiting for an answer?

### - [ ] 5.2 Planner UI

- **What:** `src/app/planner/page.tsx` stays thin, and the components live in `src/agent/ui/`: a chat panel, an interrupt prompt and a timetable view that reuses `TimeTable` (you map results to `tableFacingSlot`). Also show `DATA_VERSION`.
- **Who writes it:** Claude writes the chat panel and walks you through it. You write the interrupt handling and the timetable mapping.
- **Interview questions:**
  - How did you reuse the existing `TimeTable` component?

### - [ ] 5.3 Phase 5 wrap-up: docs and quiz

---

## Phase 6: Evals (`src/agent/evals/`)

### - [ ] 6.1 `cases.json`

- **What:** About 50 cases (easy, ambiguous, impossible), each with expected _properties_: must be clash-free, must ask about X, must offer to relax.
- **Why:** You test properties, not exact text, because LLM output varies.
- **Concepts:** Ground truth. Label "impossible" cases by checking with code (the Phase 2 tools), not by guessing.
- **Who writes it:** You.

### - [ ] 6.2 `run.ts`

- **What:** Run each case through the graph, auto-answer interrupts from the script and record the outputs.
- **Who writes it:** Claude writes the harness. You write the metrics.

### - [ ] 6.3 Metrics and summary table

- **What:** % clash-free (must be 100%), % meeting every hard constraint, % of impossible cases that ask to relax. Use several trials per case and track cost and rate limits (Gemini free tier).
- **Who writes it:** You.
- **Interview questions:**
  - How do you know your agent works?
  - What was your failure rate, and what did you fix?

### - [ ] 6.4 Fix and re-run

- **What:** Investigate failures, fix them and record before/after numbers in LEARNING.md.

---

## Phase 7: Polish and deploy

### - [ ] 7.1 Persistent checkpointer (decision **O6**)

- **Concepts:** Why `MemorySaver` fails on serverless (every instance has its own memory). The repo already has MongoDB, and `@langchain/langgraph-checkpoint-mongodb` exists.

### - [ ] 7.2 README: architecture diagram and eval results

### - [ ] 7.3 Deploy

- **What:** Vercel env vars, function duration limits for LLM calls, checking that the data version shows.

### - [ ] 7.4 Fixes in your repo (only if 0.6 confirmed a real problem)

- **What:** Only if an open question turned out, after checking with you and on the live site, to be a real problem users see: fix it **in your repo** (D8) as its own commit, with the steps, the change and a before/after. Questions that turned out to encode a VIT rule get no change; they go in LEARNING.md as "what looked odd and why it's actually right". Nothing is sent to CodeChef's repo.
- **Who writes it:** You.
- **Interview questions:**
  - Tell me about something that looked wrong in someone else's code. How did you find out whether it really was, and what happened next?

### - [ ] 7.5 Launch

- **What:**
  1. **Pitch to the CodeChef team:** a short demo and a write-up covering what it does, the "LLM plans, code verifies" safety design, eval results, and how it plugs into FFCS-inator (the `/planner` page, no changes to their existing flow). Ask whether they'd link or host it.
  2. **Ship before the next FFCS registration**, when students actually need it. Work backwards from the registration date to set your deadline for Phases 5–7.
  3. **Track usage metrics:** requests, unique users and timetables saved. Decide with the team how, respecting their existing setup and student privacy.
- **Why:** A launched project with real users and numbers ("N students generated M timetables") is far stronger on a resume than a demo. Shipping before registration is when the tool is most useful.
- **Concepts:** Metrics that show value vs vanity metrics. Privacy when counting users (count, don't store personal data). Release timing.
- **Code to understand:** How the site currently tracks anything (to be checked with you; don't assume). The existing save-timetable API (`src/app/api/save-timetable/`), if "timetables saved" should reuse it.
- **Who writes it:** You (pitch and decisions). Claude helps with the metrics code once you and the team have agreed how.
- **Interview questions:**
  - How many people used it, and how do you know?
  - How did you decide what to measure?
  - What did you learn from launching to real users?

### - [ ] 7.6 Interview prep

- **What:** A resume bullet, a 2-minute project pitch and a mock interview using every question in this file.
