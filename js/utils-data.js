import { calendarStep, coaches, currentCoachId } from "./config.js";

export function todayIso(offset = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
}

export function startOfWeekIso(dateString = todayIso()) {
  const date = new Date(`${dateString}T00:00:00`);
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1);
  return date.toISOString().slice(0, 10);
}

export function addDaysIso(dateString, offset) {
  const date = new Date(`${dateString}T00:00:00`);
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
}

export function isWeekday(dateString) {
  const day = new Date(`${dateString}T00:00:00`).getDay();
  return day >= 1 && day <= 5;
}

export function weekdayIndex(dateString) {
  return new Date(`${dateString}T00:00:00`).getDay();
}

export function isPastCalendarCell(date, minutes) {
  const cellEnd = new Date(`${date}T${timeFromMinutes(minutes + calendarStep)}`);
  return cellEnd < new Date();
}

export function nextWeekdayIso(offset = 0) {
  let date = todayIso(offset);
  while (!isWeekday(date)) {
    date = addDaysIso(date, 1);
  }
  return date;
}

export function minutesFromTime(time) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

export function timeFromMinutes(totalMinutes) {
  const hours = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
  const minutes = String(totalMinutes % 60).padStart(2, "0");
  return `${hours}:${minutes}`;
}

export function cellKey(date, minutes) {
  return `${currentCoachId}|${date}|${minutes}`;
}

export function markSlotCells(slot, targetSet) {
  for (let minutes = minutesFromTime(slot.start); minutes < minutesFromTime(slot.end); minutes += calendarStep) {
    targetSet.add(cellKey(slot.date, minutes));
  }
}

export function markRangeCells(date, startMinutes, endMinutes, targetSet) {
  for (let minutes = startMinutes; minutes < endMinutes; minutes += calendarStep) {
    targetSet.add(cellKey(date, minutes));
  }
}

export function formatDate(dateString) {
  return new Intl.DateTimeFormat("zh-CN", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(`${dateString}T00:00:00`));
}

export function formatWeekday(dateString) {
  return new Intl.DateTimeFormat("zh-CN", {
    weekday: "long",
  }).format(new Date(`${dateString}T00:00:00`));
}

export function getCoach(coachId) {
  return coaches.find((coach) => coach.id === coachId) || coaches[0];
}

export function createId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `slot-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createSlot(coachId, date, start, end, location, note, lesson) {
  return {
    id: createId(),
    coachId,
    date,
    start,
    end,
    location,
    availabilityLocation: location,
    note,
    lessonId: lesson.id,
    lessonName: lesson.name,
    lessonDuration: lesson.duration,
    lessonPrice: lesson.price,
    booked: false,
    student: null,
  };
}

export function createSlotsFromRange(coachId, date, startMinutes, endMinutes, lesson, location, note, checkExisting = true, existingSlots = []) {
  const newSlots = [];
  const duration = Number(lesson.duration);
  for (let current = startMinutes; current + duration <= endMinutes; current += duration) {
    const existing = checkExisting
      ? existingSlots.find((slot) => slot.coachId === coachId && slot.date === date && current >= minutesFromTime(slot.start) && current < minutesFromTime(slot.end))
      : null;
    if (!existing) {
      newSlots.push(createSlot(coachId, date, timeFromMinutes(current), timeFromMinutes(current + duration), location, note, lesson));
    }
  }
  return newSlots;
}
