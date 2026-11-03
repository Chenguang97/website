function minutesFromTimeValue(time) {
  const [hours, minutes] = String(time).split(":").map(Number);
  return hours * 60 + minutes;
}
export function rangesOverlap(startA, endA, startB, endB) {
  return startA < endB && endA > startB;
}
export function getAvailabilityLocation(slot, unavailableValue = "Unavailable") {
  return slot?.availabilityLocation || slot?.location || unavailableValue;
}
export function findSlotAt(slots, coachId, date, minutes) {
  return slots.find((slot) => {
    return slot.coachId === coachId && slot.date === date && minutes >= minutesFromTimeValue(slot.start) && minutes < minutesFromTimeValue(slot.end);
  });
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
export function isPastBooking(slot, now = new Date()) {
  return /* @__PURE__ */ new Date(`${slot.date}T${slot.end}`) < now;
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
  for (let minutes = startMinutes; minutes < endMinutes; minutes += calendarStep2) {
    const coveringSlot = slots.find((slot) => {
      return slot.coachId === startSlot.coachId && slot.date === startSlot.date && !slot.booked && !slotOverlapsBlockedException(slot, blockedExceptions) && getAvailabilityLocation(slot) === availabilityLocation && minutesFromTimeValue(slot.start) <= minutes && minutesFromTimeValue(slot.end) >= Math.min(minutes + calendarStep2, endMinutes);
    });
    if (!coveringSlot) return false;
  }
  return true;
}

