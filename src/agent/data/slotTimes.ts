// Turns a slot string ("A1+TA1+TAA1", "L9+L10+L25+L26", "NIL") into every weekly session it
// means, with real days and times. Everything is derived from the website's own grid
// (slotMap via getSlot, plus the day/hour labels), which matches VIT's official slot chart.
import { getSlot, DAY_LABEL_CELLS, HOUR_LABEL_CELLS } from '@/lib/slots';
import type { slot } from '@/lib/type';

export type Day = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri';

export type Session = {
  slot: string; // the grid cell's name, e.g. "A1" or "L1+L2"
  day: Day;
  start: number; // minutes since midnight, e.g. 8:00 -> 480
  end: number;
  kind: 'theory' | 'lab';
  shift: 'morning' | 'evening';
};

// One grid cell = one session. getSlot splits at "+" and only odd lab slots have cells,
// so "L1+L2" is one session (R1), "L9+L10+L25+L26" is two (R2) and "NIL" is none (R6).
export function sessionsOfSlotString(slotString: string): Session[] {
  return getSlot(slotString).map(cell => ({
    slot: cell.slotName,
    day: dayOfRow(cell.rowStart),
    start: timeOfColumn(cell.colStart),
    end: timeOfColumn(cell.colEnd),
    kind: cell.slotName.startsWith('L') ? 'lab' : 'theory',
    shift: shiftOf(cell),
  }));
}

// 480 -> "08:00", 1160 -> "19:20"
export function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// The day label whose rows cover this row (Mon covers rows 4 and 5, and so on).
function dayOfRow(row: number): Day {
  const label = DAY_LABEL_CELLS.find(d => d.rowStart <= row && row < d.rowEnd);
  if (!label) throw new Error(`No day label covers grid row ${row}`);
  return label.slotName as Day;
}

// Each column is 10 minutes. Find the last hour label at or before this column, then add
// 10 minutes per column after it. Labels use a 12-hour clock: "1".."7" mean 1pm..7pm.
function timeOfColumn(col: number): number {
  const label = [...HOUR_LABEL_CELLS].reverse().find(h => h.colStart <= col);
  if (!label) throw new Error(`No hour label at or before grid column ${col}`);
  const printed = Number(label.slotName);
  const hour = printed < 8 ? printed + 12 : printed;
  return hour * 60 + (col - label.colStart) * 10;
}

// R4: theory slots ending in 1 are morning and in 2 evening; labs L1-L30 are morning
// and L31-L60 evening.
function shiftOf(cell: slot): 'morning' | 'evening' {
  if (cell.slotName.startsWith('L')) {
    const firstNumber = parseInt(cell.slotName.slice(1), 10);
    return firstNumber <= 30 ? 'morning' : 'evening';
  }
  return cell.slotName.endsWith('1') ? 'morning' : 'evening';
}
