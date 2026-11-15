import { calendarStep, fullDayEnd, rinks } from "./config.js";
import {
  canFitLessonFromSlot as canFitLessonFrom,
  findSlotAt as findSlotAtIn,
  getAvailabilitySlotsCoveredByLesson as getCoveredSlots,
  hasBookingLocationChange as hasLocationChange,
  isPastBooking,
  slotOverlapsBlockedException as overlapsBlocked,
} from "../domain/scheduling.mjs";
import { defaultCancellationLeadMinutes, getCancellationEligibility } from "../domain/booking-policy.mjs";
import { getProfile, state } from "./state.js";

export function canFitLessonFromSlot(slot, duration) {
  return canFitLessonFrom(slot, duration, state.slots, state.blockedExceptions, calendarStep, fullDayEnd);
}

export function findSlotAt(coachId, date, minutes) {
  return findSlotAtIn(state.slots, coachId, date, minutes);
}

export function hasBookingLocationChanged(slot) {
  return hasLocationChange(slot, rinks);
}

export function getAvailabilitySlotsCoveredByLesson(slot, duration) {
  return getCoveredSlots(slot, duration, state.slots, state.blockedExceptions);
}

export function isPastStudentBooking(slot) {
  return isPastBooking(slot);
}

export function getBookingCancellationLeadMinutes(slot) {
  const configured = Number(getProfile(slot?.coachId)?.cancellationLeadMinutes);
  return Number.isFinite(configured) && configured >= 0 ? configured : defaultCancellationLeadMinutes;
}

export function getBookingCancellationEligibility(slot, now = new Date()) {
  return getCancellationEligibility(slot, now, getBookingCancellationLeadMinutes(slot));
}

export function canCancelBooking(slot, now = new Date()) {
  return getBookingCancellationEligibility(slot, now).allowed;
}

export function slotOverlapsBlockedException(slot) {
  return overlapsBlocked(slot, state.blockedExceptions);
}

