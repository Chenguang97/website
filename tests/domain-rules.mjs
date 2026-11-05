import assert from "node:assert/strict";
import {
  canFitLessonFromSlot,
  findSlotAt,
  getAvailabilityLocation,
  getAvailabilitySlotsCoveredByLesson,
  isPastBooking,
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
assert.equal(findSlotAt(slots, "maya", "2026-10-30", 500)?.id, "a");
assert.equal(slotOverlapsBlockedException(slots[2], blocks), true);
assert.deepEqual([...slots].sort(slotSort).map((slot) => slot.id), ["a", "b", "c"]);
assert.equal(isPastBooking({ date: "2020-01-01", end: "10:00" }, new Date("2026-01-01")), true);
assert.deepEqual(getAvailabilitySlotsCoveredByLesson(slots[0], 60, slots, []), slots.slice(0, 2));
assert.equal(canFitLessonFromSlot(slots[0], 60, slots, [], 30, "24:00"), true);
assert.equal(canFitLessonFromSlot(slots[0], 90, slots, blocks, 30, "24:00"), false);
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
