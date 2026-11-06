import { calendarStep, fullDayEnd } from "./config.js";
import {
  canFitLessonFromSlot as canFitLessonFrom,
  findSlotAt as findSlotAtIn,
  getAvailabilitySlotsCoveredByLesson as getCoveredSlots,
  isPastBooking,
  slotOverlapsBlockedException as overlapsBlocked,
} from "../domain/scheduling.mjs";
import { state } from "./state.js";

export function canFitLessonFromSlot(slot, duration) {
  return canFitLessonFrom(slot, duration, state.slots, state.blockedExceptions, calendarStep, fullDayEnd);
}

export function findSlotAt(coachId, date, minutes) {
  return findSlotAtIn(state.slots, coachId, date, minutes);
}

export function getAvailabilitySlotsCoveredByLesson(slot, duration) {
  return getCoveredSlots(slot, duration, state.slots, state.blockedExceptions);
}

export function isPastStudentBooking(slot) {
  return isPastBooking(slot);
}

export function slotOverlapsBlockedException(slot) {
  return overlapsBlocked(slot, state.blockedExceptions);
}

