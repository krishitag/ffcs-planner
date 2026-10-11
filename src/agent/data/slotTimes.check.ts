// Run with:  npx tsx src/agent/data/slotTimes.check.ts
import { getAllSlots } from '@/lib/slots';
import { sessionsOfSlotString, formatTime } from './slotTimes';

const show = (s: string) => {
  const sessions = sessionsOfSlotString(s);
  console.log(`${s}: ${sessions.length} session(s)`);
  for (const x of sessions) {
    console.log(
      `   ${x.day} ${formatTime(x.start)}–${formatTime(x.end)} ${x.kind} ${x.shift} (${x.slot})`
    );
  }
};

console.log('=== Test cases ===');
for (const s of ['A1', 'L1+L2', 'L9+L10+L25+L26', 'NIL', 'A1+TA1+TAA1']) show(s);

// Every slot on the grid, to compare with VIT's official slot chart.
console.log('\n=== Full table (every slot on the grid) ===');
for (const name of getAllSlots()) {
  const key = name.split('+')[0]; // lab cells are named "L1+L2"; look them up by "L1"
  const row = sessionsOfSlotString(key)
    .map(x => `${x.day} ${formatTime(x.start)}–${formatTime(x.end)}`)
    .join(' | ');
  console.log(`${name.padEnd(8)} ${row}`);
}
