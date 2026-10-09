// Turns a student's picks (school, domain, subject, slot, faculties) into fullCourseData.
// Moved out of FacultySelector.tsx so server code (like the agent) can reuse it.

import { course_type_map } from '@/lib/course_codes_map';
import { fullCourseData } from '@/lib/type';

// The school/batch buttons shown in the course picker (in this order).
// Moved out of FacultySelector.tsx so the agent offers exactly the same list.
export const schools = [
  'SCOPE',
  'SCORE',
  'SELECT',
  'SMEC',
  'SBST',
  'SCHEME',
  'SENSE',
  'SCE',
  'SHINE',
  'MTech',
  "MTech ('25 Batch)",
  "SCOPE ('25 Batch)",
  "SCORE ('25 Batch)",
  "SELECT ('25 Batch)",
  "SMEC ('25 Batch)",
  "SBST ('25 Batch)",
  "SENSE ('25 Batch)",
  "SHINE ('25 Batch)",
];

export type SubjectEntry = {
  slot: string;
  faculty: string;
  venue?: string;
};

export type FacultyData = {
  [school: string]: {
    [domain: string]: {
      [subject: string]: SubjectEntry[];
    };
  };
};

export const getCourseType = (courseCode: string): 'L' | 'P' | 'E' | undefined => {
  if (course_type_map[courseCode]) {
    return course_type_map[courseCode] as 'L' | 'P' | 'E';
  }
  const lastChar = courseCode.slice(-1).toUpperCase();
  if (['L', 'P', 'E'].includes(lastChar)) {
    return lastChar as 'L' | 'P' | 'E';
  }
  return undefined;
};

export function generateCourseSlotsSingle({
  subjectData,
  selectedFaculties,
  selectedSlot,
  courseType,
}: {
  subjectData: SubjectEntry[];
  selectedFaculties: string[];
  selectedSlot: string;
  courseType: 'th' | 'lab';
}) {
  if (courseType === 'th') {
    return [
      {
        slotName: selectedSlot,
        slotFaculties: selectedFaculties.map(facultyName => {
          // try to get venue for this faculty and slot from subjectData
          const entry = subjectData.find(
            (e: SubjectEntry) => e.faculty === facultyName && e.slot === selectedSlot
          );
          return {
            facultyName,
            ...(entry && entry.venue ? { venue: entry.venue } : {}),
          };
        }),
      },
    ];
  }
  if (courseType === 'lab') {
    const labSlots = [
      ...new Set(
        subjectData
          .filter((entry: SubjectEntry) => selectedFaculties.includes(entry.faculty))
          .map((entry: SubjectEntry) => entry.slot)
      ),
    ];

    return labSlots.map(slotName => ({
      slotName,
      slotFaculties: subjectData
        .filter(
          (entry: SubjectEntry) =>
            entry.slot === slotName && selectedFaculties.includes(entry.faculty)
        )
        .map((entry: SubjectEntry) => ({
          facultyName: entry.faculty,
          ...(entry.venue ? { venue: entry.venue } : {}),
        })),
    }));
  }

  return [];
}

export function generateCourseSlotsLabOnly({
  subjectData,
  selectedFaculties,
  labShift,
}: {
  subjectData: SubjectEntry[];
  selectedFaculties: string[];
  labShift: 'morning' | 'evening';
}) {
  const isMorningSlot = (slot: string) => {
    const parts = slot.split('+').map(s => parseInt(s.replace('L', ''), 10));
    return parts.every(num => num <= 30); // Define morning range
  };

  const isEveningSlot = (slot: string) => {
    const parts = slot.split('+').map(s => parseInt(s.replace('L', ''), 10));
    return parts.every(num => num > 30); // Define evening range
  };

  const isSlotInShift = labShift === 'morning' ? isMorningSlot : isEveningSlot;

  const labSlots = [
    ...new Set(
      subjectData
        .filter(entry => selectedFaculties.includes(entry.faculty) && isSlotInShift(entry.slot))
        .map(entry => entry.slot)
    ),
  ];

  return labSlots.map(slotName => ({
    slotName,
    slotFaculties: subjectData
      .filter(entry => entry.slot === slotName && selectedFaculties.includes(entry.faculty))
      .map(entry => ({
        facultyName: entry.faculty,
        ...(entry.venue ? { venue: entry.venue } : {}),
      })),
  }));
}

export function generateCourseSlotsBoth({
  data,
  selectedSchool,
  selectedDomain,
  selectedSubject,
  selectedSlot,
  selectedFaculties,
  courseCodeType,
}: {
  data: FacultyData;
  selectedSchool: string;
  selectedDomain: string;
  selectedSubject: string;
  selectedSlot: string;
  selectedFaculties: string[];
  courseCodeType: 'L' | 'P' | 'E' | undefined;
}) {
  const [courseCode] = selectedSubject.split(' - ');
  const baseCode = courseCode.slice(0, -1);

  let labData: SubjectEntry[] = [];

  if (courseCodeType === 'E') {
    labData = data[selectedSchool][selectedDomain][selectedSubject];
  } else {
    const labEntryKey = Object.keys(data[selectedSchool][selectedDomain]).find(key => {
      const code = key.split(' - ')[0];
      const type = getCourseType(code);
      return code.slice(0, -1) === baseCode && (type === 'P' || type === 'E');
    });
    if (labEntryKey) {
      labData = data[selectedSchool][selectedDomain][labEntryKey];
    }
  }

  const isMorningTheory = selectedSlot.includes('1');
  const isEveningTheory = selectedSlot.includes('2');

  const isValidLabSlot = (slot: string): boolean => {
    const parts = slot.split('+').map(s => parseInt(s.replace('L', ''), 10));
    if (parts.some(isNaN)) return false;

    const allMorning = parts.every(num => num <= 30);
    const allEvening = parts.every(num => num >= 31);

    if (isMorningTheory) return allEvening;
    if (isEveningTheory) return allMorning;

    return false;
  };

  const slotFaculties = selectedFaculties.map(facultyName => {
    const labSlots = labData
      .filter(
        entry =>
          entry.faculty === facultyName && entry.slot.startsWith('L') && isValidLabSlot(entry.slot)
      )
      .map(entry => entry.slot);

    // try to find a venue for this faculty: prefer labData entry, otherwise try theory entry
    let venue: string | undefined;
    const labEntryForVenue = labData.find(
      entry =>
        entry.faculty === facultyName && entry.slot.startsWith('L') && isValidLabSlot(entry.slot)
    );
    if (labEntryForVenue && labEntryForVenue.venue) {
      venue = labEntryForVenue.venue;
    } else {
      // try to find theory entry
      const theoryEntries = data[selectedSchool][selectedDomain][selectedSubject];
      const thEntry = theoryEntries.find(
        (e: SubjectEntry) => e.faculty === facultyName && e.slot === selectedSlot
      );
      if (thEntry && thEntry.venue) venue = thEntry.venue;
    }

    return {
      facultyName,
      facultyLabSlot: labSlots.length > 0 ? labSlots.join(', ') : courseCode,
      ...(venue ? { venue } : {}),
    };
  });

  return [
    {
      slotName: selectedSlot,
      slotFaculties,
    },
  ];
}

// Builds the fullCourseData for one course from what the student picked.
// Moved out of FacultySelector.handleConfirm (no behaviour change); validation, popups and
// localStorage stay in the component.
export function buildCourseData({
  data,
  school: selectedSchool,
  domain: selectedDomain,
  subject: selectedSubject,
  slot: selectedSlot,
  labShift: selectedLabShift,
  faculties: priorityList,
}: {
  data: FacultyData;
  school: string;
  domain: string;
  subject: string;
  slot: string;
  labShift: '' | 'morning' | 'evening';
  faculties: string[];
}): fullCourseData {
  const courseCode = selectedSubject.split(' - ')[0];
  const courseCodeType = getCourseType(courseCode);

  const id = selectedSubject;

  const labSubject = Object.keys(data[selectedSchool][selectedDomain]).filter(subject => {
    const subjectCode = subject.split(' - ')[0];
    const subjectType = getCourseType(subjectCode);
    return (
      subjectCode.slice(0, -1) === courseCode.slice(0, -1) &&
      (subjectType === 'P' || subjectType === 'E') &&
      subjectCode !== courseCode &&
      !courseCode.startsWith('BSTS')
    );
  });

  const courseType: 'both' | 'th' | 'lab' =
    labSubject.length === 1 && courseCodeType !== 'E'
      ? 'both'
      : courseCodeType === 'P' && !courseCode.startsWith('BSTS')
        ? 'lab'
        : 'th';

  const courseName = selectedSubject.split(' - ')[1];

  let courseCodeLab;
  let courseNameLab;
  let courseSlots;
  if (courseCodeType === 'E') {
    courseCodeLab = '';
    courseNameLab = '';
  } else {
    courseCodeLab = labSubject.length == 1 ? labSubject[0].split(' - ')[0] : '';
    courseNameLab = labSubject.length == 1 ? labSubject[0].split(' - ')[1] : '';
  }
  if (selectedLabShift) {
    courseSlots = generateCourseSlotsLabOnly({
      subjectData: data[selectedSchool][selectedDomain][selectedSubject],
      selectedFaculties: priorityList,
      labShift: selectedLabShift,
    });
  } else {
    if (courseType == 'both' || courseCodeType === 'E') {
      courseSlots = generateCourseSlotsBoth({
        data,
        selectedSchool,
        selectedDomain,
        selectedSubject,
        selectedSlot,
        selectedFaculties: priorityList,
        courseCodeType,
      });
    } else if (courseType == 'th') {
      courseSlots = generateCourseSlotsSingle({
        subjectData: data[selectedSchool][selectedDomain][selectedSubject],
        selectedFaculties: priorityList,
        selectedSlot,
        courseType: 'th',
      });
    } else {
      courseSlots = generateCourseSlotsSingle({
        subjectData: data[selectedSchool][selectedDomain][selectedSubject],
        selectedFaculties: priorityList,
        selectedSlot,
        courseType: 'lab',
      });
    }
  }
  const courseData: fullCourseData = {
    id,
    courseType: courseCodeType === 'E' ? 'both' : courseType,
    courseCode,
    courseName,
    ...(labSubject.length == 1 &&
      courseCodeType !== 'E' && {
        courseCodeLab,
        courseNameLab,
      }),
    courseSlots: courseSlots!,
  };

  return courseData;
}
