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

// Fictional planning totals, including parking and venue access. Not route data.
export const demoDefaultRinkTravelMinutes = 30;
export const demoRinkTravelTimes = Object.freeze([
  { from: "Polar Ice Rink", to: "Arcadia Ice Arena", minutes: demoDefaultRinkTravelMinutes },
  { from: "Polar Ice Rink", to: "Oceanside Ice Arena", minutes: demoDefaultRinkTravelMinutes },
  { from: "Arcadia Ice Arena", to: "Oceanside Ice Arena", minutes: demoDefaultRinkTravelMinutes },
].map(Object.freeze));

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
function createLocationChangeDemoBookings() {
  return [
    { date: nextWeekdayIso(), start: "08:30", location: "Arcadia Ice Arena", name: "Lena Wu", email: "lena.special@example.com", note: "Demo 验证：该时段开放冰场为 Polar Ice Rink，实际授课地点为 Arcadia Ice Arena，应显示「另约场地」。" },
    { date: nextWeekdayIso(), start: "10:30", location: "Polar Ice Rink", name: "Alexandria Catherine Montgomery", email: "alexandria.special@example.com", note: "Demo 验证：该时段开放冰场为 Arcadia Ice Arena，实际授课地点为 Polar Ice Rink，应显示「另约场地」；用于检查长姓名截断及标签保留。" },
    { date: addDaysIso(startOfWeekIso(nextWeekdayIso()), 2), start: "08:30", location: "Polar Ice Rink", name: "Sofia Martinez", email: "any-rink.special@example.com", note: "Demo 验证对照：原开放地点为不限冰场，实际授课地点为 Polar Ice Rink，不应显示「另约场地」。" },
  ];
}
function applyDemoBooking(slots, booking) {
  const slot = slots.find((item) => item.coachId === currentCoachId && item.date === booking.date && item.start === booking.start && !item.booked);
  if (!slot) return false;
  slot.availabilityLocation = slot.availabilityLocation || slot.location || unavailableSelection;
  slot.location = booking.location;
  slot.booked = true;
  slot.student = { name: booking.name, email: booking.email, note: booking.note };
  return true;
}
function ensureLocationChangeDemoBookings(slots) {
  let changed = false;
  createLocationChangeDemoBookings().forEach((booking) => {
    const existing = slots.find((slot) => slot.student?.email === booking.email);
    if (existing) {
      if (existing.student.name !== booking.name || existing.student.note !== booking.note) {
        existing.student = { ...existing.student, name: booking.name, note: booking.note };
        changed = true;
      }
      return;
    }
    changed = applyDemoBooking(slots, booking) || changed;
  });
  return changed;
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
    ...createLocationChangeDemoBookings(),
    { date: addDaysIso(startOfWeekIso(nextWeekdayIso()), 2), start: "14:00", location: "Zoom", name: "Emily Zhang", email: "emily@example.com", note: "Off-ice rotation check." },
    { date: addDaysIso(startOfWeekIso(nextWeekdayIso()), 2), start: "10:30", location: "Polar Ice Rink", name: "Noah Kim", email: "noah@example.com", note: "Preparing for freestyle test." },
    { date: addDaysIso(startOfWeekIso(nextWeekdayIso()), 7), start: "12:30", location: "Oceanside Ice Arena", name: "Noah Kim", email: "noah@example.com", note: "Run-through on bigger ice." },
    { date: addDaysIso(startOfWeekIso(nextWeekdayIso()), 11), start: "08:30", location: "Arcadia Ice Arena", name: "Ava Patel", email: "ava@example.com", note: "Private lesson before competition." },
    { date: addDaysIso(startOfWeekIso(nextWeekdayIso()), 9), start: "14:30", location: "Zoom", name: "Mia Johnson", email: "mia@example.com", note: "Off-ice jump review." }
  ].forEach((booking) => {
    applyDemoBooking(generated, booking);
  });
  return generated;
}
function createDefaultBookingRequests(slots) {
  const now = new Date();
  const activityAt = (minutesAgo) => new Date(now.getTime() - minutesAgo * 60 * 1000).toISOString();
  const futureOpenSlots = slots.filter((slot) => slot.coachId === currentCoachId && !slot.booked && new Date(`${slot.date}T${slot.start}`) > now).slice(0, 3);
  const futureBookings = slots.filter((slot) => slot.coachId === currentCoachId && slot.booked && new Date(`${slot.date}T${slot.start}`) > now);
  const futureBooking = futureBookings[0];
  const createProposal = (slot, version = 1) => ({
    version,
    date: slot?.date || todayIso(4),
    start: slot?.start || "10:00",
    end: slot?.end || "10:30",
    location: slot?.location || rinks[0],
    lessonName: slot?.lessonName || "30 min private lesson",
    duration: Number(slot?.lessonDuration) || calendarStep,
    price: Number(slot?.lessonPrice) || 60,
  });
  const makeExpiry = (proposal, offsetHours = 72) => {
    const proposedStart = new Date(`${proposal.date}T${proposal.start}`);
    return new Date(Math.min(now.getTime() + offsetHours * 60 * 60 * 1000, proposedStart.getTime())).toISOString();
  };
  const firstProposal = createProposal(futureOpenSlots[0]);
  const secondProposal = createProposal(futureOpenSlots[1]);
  const changeProposal = createProposal(futureBookings[1] || futureOpenSlots[2] || futureOpenSlots[0]);
  return [
    {
      id: "demo-request-special-time",
      type: "new-booking",
      coachId: currentCoachId,
      student: { name: "Lena Wu", email: "lena@example.com" },
      status: "negotiating",
      proposerRole: "student",
      acceptedBy: ["student"],
      waitingFor: "coach",
      proposal: firstProposal,
      expiresAt: makeExpiry(firstProposal),
      createdAt: activityAt(24),
      note: "希望在测试前增加一节专项训练。",
      events: [
        { type: "message", actorRole: "coach", actorName: "Maya Chen", message: "可以考虑，请先确认冰场是否允许外教授课。", at: activityAt(12), demo: true },
        { type: "message", actorRole: "student", actorName: "Lena Wu", message: "我会向冰场确认，确认后马上回复您。", at: activityAt(5), demo: true },
      ],
    },
    {
      id: "demo-request-location",
      type: "new-booking",
      coachId: currentCoachId,
      student: { name: "Mia Johnson", email: "mia@example.com" },
      status: "negotiating",
      proposerRole: "coach",
      acceptedBy: ["coach"],
      waitingFor: "student",
      proposal: secondProposal,
      expiresAt: makeExpiry(secondProposal),
      createdAt: activityAt(40),
      note: "已提出改为 Zoom 的方案，等待学生回应。",
      events: [
        { type: "message", actorRole: "coach", actorName: "Maya Chen", message: "现场时间已满，可以改为 Zoom 做陆地训练。", at: activityAt(18), demo: true },
      ],
    },
    ...(futureBooking ? [{
      id: "demo-request-change",
      type: "booking-change",
      bookingId: futureBooking.id,
      coachId: currentCoachId,
      student: { ...futureBooking.student },
      status: "negotiating",
      proposerRole: "student",
      acceptedBy: ["student"],
      waitingFor: "coach",
      proposal: changeProposal,
      expiresAt: makeExpiry(changeProposal),
      createdAt: activityAt(32),
      note: "希望调整上课时间，原预约在达成前保持不变。",
      events: [],
    }] : []),
  ];
}
export {
  createDefaultBookingRequests,
  createDefaultLessonOptions,
  createDefaultProfile,
  createDefaultProfiles,
  createDefaultSlots,
  ensureLocationChangeDemoBookings,
};

