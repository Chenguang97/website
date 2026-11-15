import assert from "node:assert/strict";
import {
  canCancelBooking,
  canFitLessonFromSlot,
  findSlotAt,
  getAvailabilityLocation,
  getAvailabilitySlotsCoveredByLesson,
  hasBookingLocationChange,
  isPastBooking,
  isCancelledBooking,
  rangesOverlap,
  slotOverlapsBlockedException,
  slotSort,
} from "../js/domain/scheduling.mjs";
import {
  basePriceUnitMinutes,
  calculateLessonPrice,
  isValidBasePrice,
  isValidLessonPrice,
  migrateLegacyProfilePricing,
} from "../js/domain/pricing.mjs";
import { escapeAttribute, escapeHtml } from "../js/ui/safe-html.mjs";
import { getCancellationEligibility } from "../js/domain/booking-policy.mjs";
import {
  acceptBookingRequest,
  addBookingRequestMessage,
  calculateRequestExpiry,
  endBookingRequest,
  extendBookingRequest,
  getBookingRequestStatus,
  getPendingBookingRequests,
  proposeBookingRequestVersion,
} from "../js/domain/booking-requests.mjs";
import {
  coachSpecialtyOptions,
  coachTeachingDisciplineOptions,
  customCoachSpecialtyMaxLength,
  getCoachSpecialtyLabels,
  getCoachTeachingDisciplineLabels,
  normalizeCoachSpecialties,
  normalizeCoachTeachingDisciplines,
  normalizeStartYear,
  normalizeCustomCoachSpecialties,
} from "../js/domain/coach-profile.mjs";

const slots = [
  { id: "a", coachId: "maya", date: "2026-10-30", start: "08:00", end: "08:30", location: "Polar Ice Rink", booked: false },
  { id: "b", coachId: "maya", date: "2026-10-30", start: "08:30", end: "09:00", location: "Polar Ice Rink", booked: false },
  { id: "c", coachId: "maya", date: "2026-10-30", start: "09:00", end: "09:30", location: "Zoom", booked: false },
];
const blocks = [{ coachId: "maya", date: "2026-10-30", start: "09:00", end: "09:30" }];

assert.equal(rangesOverlap(0, 30, 29, 60), true);
assert.equal(rangesOverlap(0, 30, 30, 60), false);
assert.equal(getAvailabilityLocation({ location: "Zoom" }), "Zoom");
assert.equal(hasBookingLocationChange({ booked: true, availabilityLocation: "Arcadia Ice Arena", location: "Polar Ice Rink" }, ["Arcadia Ice Arena", "Polar Ice Rink"]), true);
assert.equal(hasBookingLocationChange({ booked: true, availabilityLocation: "Any served rink", location: "Polar Ice Rink" }, ["Arcadia Ice Arena", "Polar Ice Rink"]), false);
assert.equal(hasBookingLocationChange({ booked: true, availabilityLocation: "Polar Ice Rink", location: "Polar Ice Rink" }, ["Arcadia Ice Arena", "Polar Ice Rink"]), false);
assert.equal(findSlotAt(slots, "maya", "2026-10-30", 500)?.id, "a");
assert.equal(slotOverlapsBlockedException(slots[2], blocks), true);
assert.deepEqual([...slots].sort(slotSort).map((slot) => slot.id), ["a", "b", "c"]);
assert.equal(isPastBooking({ date: "2020-01-01", end: "10:00" }, new Date("2026-01-01")), true);
assert.equal(isCancelledBooking({ status: "Cancelled" }), true);
assert.equal(canCancelBooking({ booked: true, status: "Confirmed", date: "2026-01-02", start: "10:00", end: "10:30" }, new Date("2026-01-01")), true);
assert.equal(canCancelBooking({ booked: true, status: "Confirmed", date: "2020-01-01", start: "09:30", end: "10:00" }, new Date("2026-01-01")), false);
assert.equal(canCancelBooking({ booked: true, status: "Cancelled", date: "2026-01-02", start: "09:30", end: "10:00" }, new Date("2026-01-01")), false);
const cancellable = { booked: true, status: "Booked", date: "2026-01-03", start: "10:00", end: "10:30" };
assert.equal(getCancellationEligibility(cancellable, new Date("2026-01-02T09:59:59")).allowed, true);
assert.equal(getCancellationEligibility(cancellable, new Date("2026-01-02T10:00:00")).allowed, true);
assert.equal(getCancellationEligibility(cancellable, new Date("2026-01-02T10:00:01")).reason, "inside-policy-window");
assert.deepEqual(getAvailabilitySlotsCoveredByLesson(slots[0], 60, slots, []), slots.slice(0, 2));
assert.equal(canFitLessonFromSlot(slots[0], 60, slots, [], 30, "24:00"), true);
assert.equal(canFitLessonFromSlot(slots[0], 90, slots, blocks, 30, "24:00"), false);
const proposal = { version: 1, date: "2026-01-05", start: "10:00", end: "10:30", location: "Zoom", price: 60 };
const request = {
  id: "request-1", coachId: "maya", status: "negotiating", proposerRole: "student", acceptedBy: ["student"], waitingFor: "coach",
  proposal, expiresAt: calculateRequestExpiry(new Date("2026-01-01T08:00:00"), proposal), events: [],
};
assert.equal(getBookingRequestStatus(request, new Date("2026-01-02T08:00:00")), "negotiating");
assert.equal(getPendingBookingRequests([request], "coach", "maya", new Date("2026-01-02T08:00:00")).length, 1);
const extended = extendBookingRequest(request, "coach", new Date("2026-01-03T12:00:00"));
assert.equal(extended.waitingFor, "coach", "Extending must not count as a response.");
assert.equal(extended.acceptedBy.join(","), "student", "Extending must not accept the proposal.");
assert.equal(new Date(extended.expiresAt).getTime(), new Date("2026-01-05T10:00:00").getTime(), "Expiry must not pass the proposed lesson start.");
const messaged = addBookingRequestMessage(request, "coach", "Maya Chen", "  请确认场地。  ", new Date("2026-01-02T09:00:00Z"));
assert.equal(messaged.waitingFor, "student", "A coach reply must hand the conversation to the student.");
assert.deepEqual(messaged.acceptedBy, ["student"], "A normal reply must not change proposal acceptance.");
assert.deepEqual(messaged.events.at(-1), { type: "message", actorRole: "coach", actorName: "Maya Chen", message: "请确认场地。", at: "2026-01-02T09:00:00.000Z" });
assert.equal(addBookingRequestMessage(request, "coach", "Maya Chen", "   "), request, "A blank reply must not mutate the request.");
const countered = proposeBookingRequestVersion(request, { ...proposal, start: "11:00", end: "11:30" }, "coach", new Date("2026-01-02T08:00:00"));
assert.equal(countered.proposal.version, 2);
assert.deepEqual(countered.acceptedBy, ["coach"]);
assert.equal(countered.waitingFor, "student");
const agreed = acceptBookingRequest(request, "coach", new Date("2026-01-02T08:00:00"));
assert.equal(agreed.status, "agreed");
assert.deepEqual(agreed.acceptedBy.sort(), ["coach", "student"]);
const ended = endBookingRequest(request, "coach", "Maya Chen", new Date("2026-01-02T08:00:00"));
assert.equal(ended.status, "ended");
assert.equal(ended.endedBy.name, "Maya Chen");
assert.equal(escapeHtml('<img alt="x">'), "&lt;img alt=&quot;x&quot;&gt;");
assert.equal(escapeAttribute("'quoted'"), "&#39;quoted&#39;");
assert.equal(basePriceUnitMinutes, 30);
assert.equal(calculateLessonPrice(55, 45), 82);
assert.equal(calculateLessonPrice(95, 15), 47);
assert.equal(isValidBasePrice(1), true);
assert.equal(isValidBasePrice(47.5), false);
assert.equal(isValidBasePrice(0), false);
assert.equal(isValidLessonPrice(82.75), true);
assert.equal(isValidLessonPrice(82.755), false);
const legacyLessons = [{ id: "lesson-30", duration: 30, price: 77 }];
const migratedPricing = migrateLegacyProfilePricing({ coachId: "alex", rate: 95, lessonOptions: legacyLessons });
assert.equal(migratedPricing.profile.rate, 47);
assert.equal(migratedPricing.profile.basePriceUnitMinutes, 30);
assert.deepEqual(migratedPricing.profile.lessonOptions, legacyLessons);
assert.equal(migrateLegacyProfilePricing(migratedPricing.profile).profile.rate, 47);
assert.equal(coachSpecialtyOptions.length, 5);
assert.deepEqual(normalizeCoachSpecialties(["edges", "unknown", "edges", "jumps"]), ["edges", "jumps"]);
assert.deepEqual(getCoachSpecialtyLabels(["edges", "jumps"]), ["滑行与用刃（Edges）", "跳跃（Jumps）"]);
assert.equal(customCoachSpecialtyMaxLength, 30);
assert.deepEqual(normalizeCustomCoachSpecialties(["  成人零基础  ", "成人零基础", "ADULT", "adult", ""]), ["成人零基础", "ADULT"]);
assert.deepEqual(getCoachSpecialtyLabels(["edges"], ["成人零基础"]), ["滑行与用刃（Edges）", "成人零基础"]);
assert.equal(coachTeachingDisciplineOptions.length, 4);
assert.deepEqual(normalizeCoachTeachingDisciplines(["singles", "unknown", "ice-dance", "singles"]), ["singles", "ice-dance"]);
assert.deepEqual(getCoachTeachingDisciplineLabels(["pairs", "synchronized"]), ["双人滑", "同步滑"]);
assert.equal(normalizeStartYear("2018", 2026), 2018);
assert.equal(normalizeStartYear("2027", 2026), null);

console.log("Domain rule tests passed.");
