import { captureProductClock } from "./product-clock.js";
import { addCalendarDays, calendarWeekdayIndex, isCalendarDate, startOfCalendarWeek } from "../domain/calendar-date.mjs";
import { looseMinuteOf as minutesFromTime, timeOf as timeFromMinutes } from "../domain/calendar-primitives.mjs";
import { createAvailabilitySlot } from "../domain/availability-slot.mjs";
import { calendarStep, coaches, currentCoachId } from "./config.js";

export function todayIso(offset = 0, now = new Date()) {
  const clock = captureProductClock(now);
  if (clock.service) return addCalendarDays(clock.today, offset);
  const date = clock.at;
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
}

export function startOfWeekIso(dateString = todayIso()) {
  if (isCalendarDate(dateString)) return startOfCalendarWeek(dateString);
  // Preserve the old invalid/non-date argument behavior; no new normalization.
  const date = new Date(`${dateString}T00:00:00`);
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1);
  return date.toISOString().slice(0, 10);
}

export function addDaysIso(dateString, offset) {
  if (isCalendarDate(dateString) && Number.isInteger(offset)) return addCalendarDays(dateString, offset);
  // Invalid dates and non-integer/non-numeric offsets keep their legacy path.
  const date = new Date(`${dateString}T00:00:00`);
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
}

export function isWeekday(dateString) {
  const day = weekdayIndex(dateString);
  return day >= 1 && day <= 5;
}

export function weekdayIndex(dateString) {
  if (isCalendarDate(dateString)) return calendarWeekdayIndex(dateString);
  return new Date(`${dateString}T00:00:00`).getDay();
}

export function isPastCalendarCell(date, minutes, now = new Date()) {
  const clock = captureProductClock(now);
  const time = timeFromMinutes(minutes + calendarStep);
  const cellEnd = clock.instant ? clock.instant(date, time) : new Date(`${date}T${time}`);
  return cellEnd < clock.at;
}

export function nextWeekdayIso(offset = 0, now = new Date()) {
  let date = todayIso(offset, now);
  while (!isWeekday(date)) {
    date = addDaysIso(date, 1);
  }
  return date;
}

// These unchecked colon/time formatting semantics are shared with planning;
// strict and fixed-width persisted-record parsers remain separate leaf functions.
export { minutesFromTime, timeFromMinutes };

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
  return createAvailabilitySlot({ id: createId(), coachId, date, start, end, location, note, lesson });
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

