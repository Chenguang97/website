export const defaultCancellationLeadMinutes = 24 * 60;

export function getBookingStart(slot) {
  return new Date(`${slot?.date || ""}T${slot?.start || ""}`);
}

export function getCancellationEligibility(slot, now = new Date(), leadMinutes = defaultCancellationLeadMinutes) {
  if (!slot?.booked) return { allowed: false, reason: "not-booked" };
  if (String(slot.status || "").trim().toLocaleLowerCase() === "cancelled") {
    return { allowed: false, reason: "cancelled" };
  }

  const bookingEnd = new Date(`${slot.date}T${slot.end}`);
  const bookingStart = getBookingStart(slot);
  if (!Number.isFinite(bookingStart.getTime()) || !Number.isFinite(bookingEnd.getTime())) {
    return { allowed: false, reason: "invalid-schedule" };
  }
  if (bookingEnd <= now) {
    return { allowed: false, reason: "ended" };
  }

  const cutoff = new Date(bookingStart.getTime() - Number(leadMinutes) * 60_000);
  if (now > cutoff) {
    return { allowed: false, reason: "inside-policy-window", cutoff, leadMinutes: Number(leadMinutes) };
  }

  return { allowed: true, reason: "eligible", cutoff, leadMinutes: Number(leadMinutes) };
}
