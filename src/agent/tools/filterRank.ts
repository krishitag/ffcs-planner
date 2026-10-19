// Filter and rank (step 2.5). Takes the timetables 2.4 generated (they already obey every
// "must" wish except same building), drops the ones that break a "must" same-building wish,
// scores the rest on the "prefer" wishes, and returns the best few with REASONS, so the
// agent explains our scores instead of inventing its own.
import type { Constraints } from '../constraints';
import { toMinutes } from '../constraints';
import type { Session } from '../data/slotTimes';
import type { Option, OptionGroup } from './generate';
import { professorMatches } from './names';

// One line of explanation: how many points, and why.
export type Reason = { points: number; text: string };

export type RankedTimetable = {
  timetable: OptionGroup[]; // one group per course; members the student would like come first
  score: number;
  reasons: Reason[];
};

export type RankResult =
  | { status: 'ok'; ranked: RankedTimetable[] }
  // Every timetable broke a "must" same-building wish.
  | { status: 'noneLeft'; reason: 'same building' };

const PROFESSOR_POINTS = 2; // D12: faculty matters most to VIT students
const WISH_POINTS = 1;
const PER_BREAK = 0.25; // a time wish loses this much per class that breaks it

export function filterRank(
  timetables: OptionGroup[][],
  constraints: Constraints,
  howMany = 3
): RankResult {
  // 1. A "must" same-building wish: keep only timetables that can all be in one building,
  //    and keep only the sections in that building.
  let candidates = timetables;
  if (constraints.sameBuilding?.strength === 'must') {
    candidates = timetables
      .map(t => inOneBuilding(t))
      .filter((t): t is OptionGroup[] => t !== null);
    if (candidates.length === 0) return { status: 'noneLeft', reason: 'same building' };
  }

  // 2. Score every timetable on the "prefer" wishes.
  const scored = candidates.map(t => score(t, constraints));

  // 3. Best first. sort() keeps equal scores in their original order, so with no wishes the
  //    generator's order is kept (we never invent preferences: R4).
  scored.sort((a, b) => b.score - a.score);

  // 4. Pick the best few that really differ (D12).
  return { status: 'ok', ranked: pickDifferent(scored, howMany) };
}

// ---- Scoring -------------------------------------------------------------------------------

function score(timetable: OptionGroup[], c: Constraints): RankedTimetable {
  const reasons: Reason[] = [];
  let groups = timetable;
  const sessions = (): Session[] => groups.flatMap(g => g.members[0].sessions);

  // Professor wishes (2 points). A group is several sections in the same slot; if one of them
  // is the wished professor, that's a match, and that section is moved to the front.
  for (const wish of c.courses) {
    const p = wish.professor;
    if (!p || p.wish !== 'prefer') continue;
    const i = groups.findIndex(g => g.course === wish.query);
    if (i < 0) continue;
    const match = (m: Option) => professorMatches(m.faculty, p.name);
    if (groups[i].members.some(match)) {
      groups = groups.map((g, j) => (j === i ? { ...g, members: sortFirst(g.members, match) } : g));
      reasons.push({ points: PROFESSOR_POINTS, text: `${p.name} for ${wish.query}` });
    } else {
      reasons.push({ points: 0, text: `${p.name} isn't available for ${wish.query} here` });
    }
  }

  // Slot wishes (1 point): "OS in A1+TA1 if possible".
  for (const wish of c.courses) {
    const s = wish.slot;
    if (!s || s.strength !== 'prefer') continue;
    const g = groups.find(x => x.course === wish.query);
    if (!g) continue;
    const parts = [...g.slot.split('+'), ...(g.labSlot?.split('+') ?? [])];
    const ok = s.value.split('+').every(p => parts.includes(p));
    reasons.push({
      points: ok ? WISH_POINTS : 0,
      text: `${wish.query} ${ok ? 'in' : 'not in'} ${s.value}`,
    });
  }

  // Time wishes: full point if kept; otherwise lose a little per class that breaks it.
  for (const f of c.freeDays) {
    if (f.strength !== 'prefer') continue;
    const bad = sessions().filter(s => s.day === f.day);
    reasons.push(timeReason(bad, `${f.day} free`, s => `${s.day} ${s.slot}`));
  }
  if (c.noClassesBefore?.strength === 'prefer') {
    const limit = toMinutes(c.noClassesBefore.time);
    const bad = sessions().filter(s => s.start < limit);
    reasons.push(timeReason(bad, `nothing before ${c.noClassesBefore.time}`, describe));
  }
  if (c.noClassesAfter?.strength === 'prefer') {
    const limit = toMinutes(c.noClassesAfter.time);
    const bad = sessions().filter(s => s.end > limit);
    reasons.push(timeReason(bad, `nothing after ${c.noClassesAfter.time}`, describe));
  }

  // Shift wish (theory slots only, like the "must" version, D11).
  if (c.shift?.strength === 'prefer') {
    const off = groups.filter(g => {
      const first = g.slot.split('+')[0];
      if (first === 'NIL') return false;
      const isLab = g.members[0].courseType === 'lab';
      const shift = isLab
        ? Number(first.slice(1)) <= 30
          ? 'morning'
          : 'evening'
        : first.endsWith('1')
          ? 'morning'
          : 'evening';
      return shift !== c.shift!.value;
    });
    reasons.push(
      off.length === 0
        ? { points: WISH_POINTS, text: `all ${c.shift.value} classes` }
        : {
            points: WISH_POINTS - PER_BREAK * off.length,
            text: `${off.map(g => g.course).join(', ')} not in the ${c.shift.value}`,
          }
    );
  }

  // Same building as a preference.
  if (c.sameBuilding?.strength === 'prefer') {
    const one = inOneBuilding(groups);
    if (one) {
      groups = one;
      reasons.push({ points: WISH_POINTS, text: `everything in ${buildingOf(one)}` });
    } else {
      const count = new Set(groups.map(g => building(g.members[0].venue)).filter(Boolean)).size;
      reasons.push({
        points: WISH_POINTS - PER_BREAK * (count - 1),
        text: `classes in ${count} buildings`,
      });
    }
  }

  const total = reasons.reduce((sum, r) => sum + r.points, 0);
  return { timetable: groups, score: total, reasons };
}

function timeReason(bad: Session[], wish: string, label: (s: Session) => string): Reason {
  if (bad.length === 0) return { points: WISH_POINTS, text: wish };
  return {
    points: WISH_POINTS - PER_BREAK * bad.length,
    text: `${wish} broken by ${bad.map(label).join(', ')}`,
  };
}

function describe(s: Session): string {
  const hhmm = (m: number) =>
    `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  return `${s.day} ${hhmm(s.start)} (${s.slot})`;
}

function sortFirst<T>(items: T[], first: (x: T) => boolean): T[] {
  return [...items.filter(first), ...items.filter(x => !first(x))];
}

// ---- Same building (D12) -------------------------------------------------------------------

// "SJTG508" → "SJT": the letters at the start; a trailing G is the ground floor of the same
// building, and SJTA is part of SJT. Undefined when there's no venue (e.g. NIL courses).
export function building(venue?: string): string | undefined {
  const letters = venue?.toUpperCase().match(/^[A-Z]+/)?.[0];
  if (!letters || letters === 'NIL') return undefined;
  if (letters === 'SJTA') return 'SJT';
  return letters.length > 2 && letters.endsWith('G') ? letters.slice(0, -1) : letters;
}

// Keep only sections in one shared building; null if no single building works.
// Groups with no venue at all (e.g. NIL) don't need a building.
function inOneBuilding(timetable: OptionGroup[]): OptionGroup[] | null {
  const needed = timetable.filter(g => g.members.some(m => building(m.venue)));
  if (needed.length === 0) return timetable;
  const shared = needed
    .map(g => new Set(g.members.map(m => building(m.venue)).filter(Boolean) as string[]))
    .reduce((a, b) => new Set([...a].filter(x => b.has(x))));
  const [home] = shared;
  if (!home) return null;
  return timetable.map(g =>
    needed.includes(g) ? { ...g, members: g.members.filter(m => building(m.venue) === home) } : g
  );
}

function buildingOf(timetable: OptionGroup[]): string {
  return timetable.map(g => building(g.members[0]?.venue)).find(Boolean) ?? 'one building';
}

// ---- Different choices (D12) ---------------------------------------------------------------

// Two timetables are "the same choice" if every course has the same theory slot and the same
// professors; a different lab alone doesn't count as a real choice.
function signature(timetable: OptionGroup[]): string {
  return timetable
    .map(
      g => `${g.course}:${g.slot}:${[...new Set(g.members.map(m => m.faculty))].sort().join(',')}`
    )
    .join('|');
}

function pickDifferent(scored: RankedTimetable[], howMany: number): RankedTimetable[] {
  const picked: RankedTimetable[] = [];
  const seen = new Set<string>();
  for (const t of scored) {
    const sig = signature(t.timetable);
    if (seen.has(sig)) continue;
    seen.add(sig);
    picked.push(t);
    if (picked.length === howMany) break;
  }
  return picked;
}
