import { defaultCancellationLeadMinutes, getCancellationEligibility } from "./booking-policy.mjs";

function minutesFromTimeValue(time) {
  const [hours, minutes] = String(time).split(":").map(Number);
  return hours * 60 + minutes;
}
import { overlap as rangesOverlap } from "./calendar-primitives.mjs";
import { isCancelledBooking, isActiveBooking } from "./booking-status.mjs";
export { rangesOverlap, isCancelledBooking, isActiveBooking };
export function getAvailabilityLocation(slot, unavailableValue = "Unavailable") {
  return slot?.availabilityLocation || slot?.location || unavailableValue;
}
export function hasBookingLocationChange(slot, concreteLocations = []) {
  const availabilityLocation = getAvailabilityLocation(slot);
  return Boolean(slot?.booked)
    && concreteLocations.includes(availabilityLocation)
    && Boolean(slot?.location)
    && slot.location !== availabilityLocation;
}
export function findSlotAt(slots, coachId, date, minutes) {
  const matches = slots.filter((slot) => {
    return slot.coachId === coachId && slot.date === date && minutes >= minutesFromTimeValue(slot.start) && minutes < minutesFromTimeValue(slot.end);
  });
  return matches.find((slot) => !isCancelledBooking(slot));
}
export function slotOverlapsBlockedException(slot, blockedExceptions) {
  return blockedExceptions.some((block) => {
    return block.coachId === slot.coachId && block.date === slot.date && rangesOverlap(
      minutesFromTimeValue(slot.start),
      minutesFromTimeValue(slot.end),
      minutesFromTimeValue(block.start),
      minutesFromTimeValue(block.end)
    );
  });
}
export function slotSort(slotA, slotB) {
  return `${slotA.date}${slotA.start}`.localeCompare(`${slotB.date}${slotB.start}`);
}
export function isPastBooking(slot, now = new Date(), resolveInstant) {
  const end = resolveInstant ? resolveInstant(slot.date, slot.end) : new Date(`${slot.date}T${slot.end}`);
  return end < now;
}
export function canCancelBooking(slot, now = new Date(), leadMinutes = defaultCancellationLeadMinutes, resolveInstant) {
  return getCancellationEligibility(slot, now, leadMinutes, resolveInstant).allowed;
}
export function getAvailabilitySlotsCoveredByLesson(startSlot, duration, slots, blockedExceptions) {
  const startMinutes = minutesFromTimeValue(startSlot.start);
  const endMinutes = startMinutes + Number(duration);
  const availabilityLocation = getAvailabilityLocation(startSlot);
  return slots.filter((slot) => {
    return slot.coachId === startSlot.coachId && slot.date === startSlot.date && !slot.booked && !slotOverlapsBlockedException(slot, blockedExceptions) && getAvailabilityLocation(slot) === availabilityLocation && rangesOverlap(minutesFromTimeValue(slot.start), minutesFromTimeValue(slot.end), startMinutes, endMinutes);
  });
}
export function canFitLessonFromSlot(startSlot, duration, slots, blockedExceptions, calendarStep2, fullDayEnd2) {
  const startMinutes = minutesFromTimeValue(startSlot.start);
  const endMinutes = startMinutes + Number(duration);
  const availabilityLocation = getAvailabilityLocation(startSlot);
  if (!Number.isFinite(endMinutes) || endMinutes > minutesFromTimeValue(fullDayEnd2)) return false;
  if (slots.some((slot) => isActiveBooking(slot) && slot.coachId === startSlot.coachId && slot.date === startSlot.date && rangesOverlap(startMinutes, endMinutes, minutesFromTimeValue(slot.start), minutesFromTimeValue(slot.end)))) return false;
  let coveredUntil = startMinutes;
  const available = slots.filter((slot) => slot.coachId === startSlot.coachId && slot.date === startSlot.date && !slot.booked && !slotOverlapsBlockedException(slot, blockedExceptions) && getAvailabilityLocation(slot) === availabilityLocation).slice().sort(slotSort);
  for (const slot of available) {
    if (minutesFromTimeValue(slot.start) > coveredUntil) break;
    if (minutesFromTimeValue(slot.end) > coveredUntil) coveredUntil = minutesFromTimeValue(slot.end);
    if (coveredUntil >= endMinutes) return true;
  }
  return false;
}

