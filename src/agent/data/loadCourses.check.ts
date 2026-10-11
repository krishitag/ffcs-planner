// Run with:  npx tsx src/agent/data/loadCourses.check.ts
import { loadCourses } from './loadCourses';

const courses = loadCourses();
console.log('Total courses:', courses.length); // expect 938
console.log('SCOPE courses:', courses.filter(c => c.school === 'SCOPE').length); // expect 138
console.log(courses.find(c => c.key.startsWith('BSTS301P') && c.school === 'SCOPE'));
