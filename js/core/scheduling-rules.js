import { captureProductClock } from "./product-clock.js";
import { indexScheduleSnapshot } from "./schedule-index.js";
import { availabilityRestoration } from "../domain/availability-provenance.mjs";
import { normalizeSchedulingConfig } from "../domain/scheduling-config.mjs";
import { withTravelPresets } from "./rink-catalog.js";
import { calendarStep, fullDayEnd, rinks } from "./config.js";
import { readProfileState, getSchedulingConfig, readSchedulingInputs, readAvailabilityModel, readScheduleRevision } from "./state.js";
import { hasBookingLocationChange as hasLocationChange, isPastBooking } from "../domain/scheduling.mjs";
import { resolveCancellationLeadMinutes, getCancellationEligibility } from "../domain/booking-policy.mjs";
import { fitLesson, findContextSlot, coveredContextSlots, overlapsContextBlock, weeklyContextAvailability, underlyingContextAvailability, optimizationContextInput, checkContextBooking, contextBookingEffects, planContextOpenAvailabilityChange } from "../domain/scheduling-context.mjs";

// The sole runtime selection boundary. Published/draft ownership is explicit;
// Each operation captures its source and clock once.
const configurations = new WeakMap();
function contextConfiguration(planning, profile, coachId, service) {
  if (!configurations.has(planning)) configurations.set(planning, new WeakMap());
  const profiles = configurations.get(planning);
  if (!profiles.has(profile)) profiles.set(profile, new Map());
  const coaches = profiles.get(profile);
  const key = `${service ? "service" : "static"}:${coachId}`;
  if (!coaches.has(key)) {
    const config = withTravelPresets(normalizeSchedulingConfig(planning.configs[coachId], profile.servedRinks || []));
    const freeze = value => {
      if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
      return value;
    };
    coaches.set(key, freeze(config));
  }
  return coaches.get(key);
}
export function captureSchedulingContext(coachId, source = "draft", now = new Date(), selection = null) {
  const inputs = readSchedulingInputs(coachId, source, selection);
  const clock = captureProductClock(now);
  return {
    ...inputs, config: contextConfiguration(inputs.planning, inputs.profile, coachId, clock.service),
    calendarStep, fullDayEnd, locations: Object.freeze(rinks.slice()), today: clock.today, now: clock.now,
  };
}

export function canFitLessonFromSlot(slot, duration, { source = "draft" } = {}) {
  return fitLesson(captureSchedulingContext(slot.coachId, source, new Date(), slot), slot, duration);
}

export function findSlotAt(coachId, date, minutes) {
  return findContextSlot(captureSchedulingContext(coachId, "draft", new Date(), { coachId, date }), coachId, date, minutes);
}

export function hasBookingLocationChanged(slot) {
  return hasLocationChange(slot, rinks);
}

export function getAvailabilitySlotsCoveredByLesson(slot, duration) {
  return coveredContextSlots(captureSchedulingContext(slot.coachId, "draft", new Date(), slot), slot, duration);
}

export function isPastStudentBooking(slot, now = new Date()) {
  const clock = captureProductClock(now);
  return isPastBooking(slot, clock.at, clock.instant);
}

export function getBookingCancellationLeadMinutes(slot) {
  return resolveCancellationLeadMinutes(readProfileState(slot?.coachId).saved?.cancellationLeadMinutes);
}

export function getBookingCancellationEligibility(slot, now = new Date()) {
  const clock = captureProductClock(now);
  return getCancellationEligibility(slot, clock.at, getBookingCancellationLeadMinutes(slot), clock.instant);
}

export function canCancelBooking(slot, now = new Date()) {
  return getBookingCancellationEligibility(slot, now).allowed;
}

export function slotOverlapsBlockedException(slot, { source = "draft" } = {}) {
  return overlapsContextBlock(captureSchedulingContext(slot.coachId, source, new Date(), slot), slot);
}

export function checkCoachScheduledBooking(candidate, { requireOpen = false, source = "published" } = {}) {
  return checkContextBooking(captureSchedulingContext(candidate.coachId, source), candidate, { requireOpen });
}

export function buildBookingScheduleEffects(coachId, slots, planning, dates) {
  return contextBookingEffects(captureSchedulingContext(coachId, "published"), coachId, slots, planning, dates);
}

export function previewCoachScheduledBooking(candidate) {
  const feasibility = checkCoachScheduledBooking(candidate);
  if (!feasibility.allowed || !getSchedulingConfig(candidate.coachId, "published").enabled) return feasibility;
  return { ...feasibility, requiresConfirmation: false, closedMinutes: 0, lunch: [] };
}

export function getCoachWeeklyAvailability(coachId, start, source = "draft") {
  return weeklyContextAvailability(captureSchedulingContext(coachId, source), coachId, start);
}

export function planCoachOpenAvailabilityChange(coachId, removals, additions, scope, options = {}) {
  const context = captureSchedulingContext(coachId);
  const model = options.draftModel || readAvailabilityModel();
  const underlying = options.restoreUnderlying ? availabilityRestoration(model, removals.map(range => ({ ...range, coachId }))) : [];
  return { ...planContextOpenAvailabilityChange(context, coachId, removals, additions, scope, { ...options, draftModel: undefined, underlying }), restoration: underlying };
}

export function getCoachUnderlyingAvailability(coachId, start, end, source = "draft") {
  return underlyingContextAvailability(captureSchedulingContext(coachId, source), coachId, start, end);
}

export function getCoachOptimizationInputs(coachId, dates, config, now = new Date()) {
  const operation = captureSchedulingOperation(coachId, { source: "draft", now });
  return dates.map(date => operation.optimizationInput(date, config));
}

// Stable read operation for callers evaluating many candidates. Create a new
// operation after a write; this one deliberately keeps its captured source/clock.
export function captureSchedulingOperation(coachId, { source = "draft", now = new Date() } = {}) {
  const context = captureSchedulingContext(coachId, source, now);
  const slots = indexScheduleSnapshot(context.slots);
  const blocked = indexScheduleSnapshot(context.blocked);
  const forDay = date => ({ ...context, slots: slots.forDay(coachId, date), blocked: blocked.forDay(coachId, date) });
  function owned(slot) {
    if (slot.coachId !== coachId) throw new TypeError("Candidate belongs to another coach");
    return forDay(slot.date);
  }
  return Object.freeze({
    source,
    revision: readScheduleRevision(),
    canFit: (slot, duration) => fitLesson(owned(slot), slot, duration),
    overlapsBlocked: slot => overlapsContextBlock(owned(slot), slot),
    slotAt: (date, minutes) => findContextSlot(forDay(date), coachId, date, minutes),
    coveredSlots: (slot, duration) => Object.freeze(coveredContextSlots(owned(slot), slot, duration)),
    checkBooking: (candidate, options) => checkContextBooking(owned(candidate), candidate, options),
    optimizationInput: (date, config = context.config) => optimizationContextInput(context, coachId, date, config, context.now),
  });
}
