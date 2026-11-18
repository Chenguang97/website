export const defaultCancellationLeadMinutes = 24 * 60;

// Zero is an explicit override. Empty/boolean/container values are not numbers,
// even when Number(value) would coerce them to zero. Keep fractional legacy
// minutes and nonempty numeric strings; callers retain the original raw field.
export function parseCancellationLeadMinutes(value) {
  if (typeof value !== "number" && !(typeof value === "string" && value.trim() !== "")) return null;
  const minutes = Number(value);
  return Number.isFinite(minutes) && minutes >= 0 ? minutes : null;
}

export function isValidCancellationLeadMinutes(value) {
  return parseCancellationLeadMinutes(value) !== null;
}

export function resolveCancellationLeadMinutes(value) {
  return parseCancellationLeadMinutes(value) ?? defaultCancellationLeadMinutes;
}

export function getBookingStart(slot, resolveInstant) {
  if (resolveInstant) return resolveInstant(slot?.date, slot?.start);
  return new Date(`${slot?.date || ""}T${slot?.start || ""}`);
}

export function getCancellationEligibility(slot, now = new Date(), leadMinutes = defaultCancellationLeadMinutes, resolveInstant) {
  if (!slot?.booked) return { allowed: false, reason: "not-booked" };
  if (String(slot.status || "").trim().toLocaleLowerCase() === "cancelled") {
    return { allowed: false, reason: "cancelled" };
  }

  const bookingEnd = resolveInstant ? resolveInstant(slot.date, slot.end) : new Date(`${slot.date}T${slot.end}`);
  const bookingStart = getBookingStart(slot, resolveInstant);
  if (!Number.isFinite(bookingStart.getTime()) || !Number.isFinite(bookingEnd.getTime())) {
    return { allowed: false, reason: "invalid-schedule" };
  }
  if (bookingEnd <= now) {
    return { allowed: false, reason: "ended" };
  }

  const minutes = resolveCancellationLeadMinutes(leadMinutes);
  const cutoff = new Date(bookingStart.getTime() - minutes * 60_000);
  if (now > cutoff) {
    return { allowed: false, reason: "inside-policy-window", cutoff, leadMinutes: minutes };
  }

  return { allowed: true, reason: "eligible", cutoff, leadMinutes: minutes };
}
