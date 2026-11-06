import {
  calendarStep,
  coaches,
  currentCoachId,
  dayLabels,
  defaultEnd,
  defaultStart,
  recurringFutureWeeks,
  recurringPastWeeks,
  rinks,
  unavailableSelection
} from "./config.js";
import {
  addDaysIso,
  createSlotsFromRange,
  isWeekday,
  minutesFromTime,
  nextWeekdayIso,
  startOfWeekIso,
  todayIso,
  weekdayIndex
} from "./utils-data.js";
import { basePriceUnitMinutes, calculateLessonPrice } from "../domain/pricing.mjs";
function createDefaultProfile(coachId) {
  const index = Math.max(0, coaches.findIndex((coach) => coach.id === coachId));
  const rate = [60, 47, 55][index];
  const pageUrl = typeof globalThis.location?.href === "string"
    ? globalThis.location.href
    : "https://demo.local/coach/index.html";
  const photoUrl = {
    maya: new URL("../assets/coaches/maya-chen.jpg", pageUrl).href,
    alex: new URL("../assets/coaches/alex-rivera.jpg", pageUrl).href,
    sam: new URL("../assets/coaches/sam-patel.jpg", pageUrl).href,
  }[coachId] || "";
  const lessonDurationsByCoach = {
    maya: [30, 45, 60],
    alex: [30, 60],
    sam: [45, 60]
  };
  return {
    coachId,
    rate,
    basePriceUnitMinutes,
    homeRink: rinks[index % rinks.length],
    servedRinks: [...rinks],
    travelsToOtherRinks: false,
    travelFee: 0,
    travelConditions: "",
    city: "",
    bio: "",
    teachingDisciplines: [],
    skatingStartYear: null,
    coachingStartYear: null,
    specialties: [],
    customSpecialties: [],
    selectedCustomSpecialties: [],
    photoUrl,
    demoPhotoVersion: 1,
    lessonOptions: createDefaultLessonOptions(rate, lessonDurationsByCoach[coachId])
  };
}
function createDefaultLessonOptions(rate, durations = [30, 60]) {
  return durations.map((duration) => ({
    id: `lesson-${duration}`,
    name: `${duration} min private lesson`,
    duration,
    price: calculateLessonPrice(rate, duration),
    custom: false
  }));
}
function createDefaultProfiles() {
  return coaches.reduce((profiles, coach) => {
    profiles[coach.id] = createDefaultProfile(coach.id);
    return profiles;
  }, {});
}
function getDefaultAvailabilityLesson(coachId) {
  const profile = createDefaultProfile(coachId);
  const lesson30 = profile.lessonOptions.find((lesson) => Number(lesson.duration) === calendarStep);
  const baseLesson = lesson30 || profile.lessonOptions[0];
  return { ...baseLesson, duration: calendarStep };
}
function createDefaultSlots() {
  const generated = [];
  const recurringTemplate = {
    1: [
      { start: "06:00", end: "09:00", location: "Polar Ice Rink" },
      { start: "09:00", end: "12:00", location: "Arcadia Ice Arena" },
      { start: "12:00", end: "16:00", location: "Oceanside Ice Arena" }
    ],
    2: [{ start: defaultStart, end: defaultEnd, location: "Any served rink" }],
    3: [
      { start: "06:00", end: "10:00", location: "Any served rink" },
      { start: "10:00", end: "14:00", location: "Polar Ice Rink" },
      { start: "14:00", end: "16:00", location: "Zoom" }
    ],
    4: [{ start: defaultStart, end: defaultEnd, location: "Any served rink" }],
    5: [
      { start: "06:00", end: "11:00", location: "Arcadia Ice Arena" },
      { start: "11:00", end: "16:00", location: "Any served rink" }
    ]
  };
  coaches.forEach((coach) => {
    const lesson = getDefaultAvailabilityLesson(coach.id);
    for (let offset = -recurringPastWeeks * 7; offset <= recurringFutureWeeks * 7; offset += 1) {
      const date = todayIso(offset);
      if (!isWeekday(date)) continue;
      const dayTemplate = recurringTemplate[weekdayIndex(date)] || [{ start: defaultStart, end: defaultEnd, location: "Any served rink" }];
      dayTemplate.forEach((range) => {
        generated.push(
          ...createSlotsFromRange(
            coach.id,
            date,
            minutesFromTime(range.start),
            minutesFromTime(range.end),
            lesson,
            range.location,
            `Recurring ${dayLabels[(weekdayIndex(date) || 7) - 1]} availability: ${range.start}-${range.end}.`,
            false
          )
        );
      });
    }
  });
  [
    { date: addDaysIso(startOfWeekIso(nextWeekdayIso()), -7), start: "07:30", location: "Polar Ice Rink", name: "Emily Zhang", email: "emily@example.com", note: "Past lesson: forward stroking review." },
    { date: addDaysIso(startOfWeekIso(nextWeekdayIso()), -5), start: "10:30", location: "Polar Ice Rink", name: "Noah Kim", email: "noah@example.com", note: "Past lesson: test program run-through." },
    { date: addDaysIso(startOfWeekIso(nextWeekdayIso()), -3), start: "08:00", location: "Arcadia Ice Arena", name: "Ava Patel", email: "ava@example.com", note: "Past lesson: edge quality check." },
    { date: nextWeekdayIso(), start: "07:00", location: "Polar Ice Rink", name: "Emily Zhang", email: "emily@example.com", note: "Working on beginner edges." },
    { date: nextWeekdayIso(), start: "09:30", location: "Arcadia Ice Arena", name: "Emily Zhang", email: "emily@example.com", note: "Wants to review crossovers." },
    { date: addDaysIso(startOfWeekIso(nextWeekdayIso()), 2), start: "14:00", location: "Zoom", name: "Emily Zhang", email: "emily@example.com", note: "Off-ice rotation check." },
    { date: addDaysIso(startOfWeekIso(nextWeekdayIso()), 2), start: "10:30", location: "Polar Ice Rink", name: "Noah Kim", email: "noah@example.com", note: "Preparing for freestyle test." },
    { date: addDaysIso(startOfWeekIso(nextWeekdayIso()), 7), start: "12:30", location: "Oceanside Ice Arena", name: "Noah Kim", email: "noah@example.com", note: "Run-through on bigger ice." },
    { date: addDaysIso(startOfWeekIso(nextWeekdayIso()), 11), start: "08:30", location: "Arcadia Ice Arena", name: "Ava Patel", email: "ava@example.com", note: "Private lesson before competition." },
    { date: addDaysIso(startOfWeekIso(nextWeekdayIso()), 9), start: "14:30", location: "Zoom", name: "Mia Johnson", email: "mia@example.com", note: "Off-ice jump review." }
  ].forEach((booking) => {
    const slot = generated.find((item) => item.coachId === currentCoachId && item.date === booking.date && item.start === booking.start);
    if (!slot) return;
    slot.availabilityLocation = slot.availabilityLocation || slot.location || unavailableSelection;
    slot.location = booking.location;
    slot.booked = true;
    slot.student = { name: booking.name, email: booking.email, note: booking.note };
  });
  return generated;
}
export {
  createDefaultLessonOptions,
  createDefaultProfile,
  createDefaultProfiles,
  createDefaultSlots
};

