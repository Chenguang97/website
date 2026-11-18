import { calendarStep, readServiceContext } from "./config.js";
import { readProfileState, readScheduleState, recordBookingUndo } from "./state.js";
import { createDefaultLessonOptions } from "./demo-data.js";
import { createId, minutesFromTime, timeFromMinutes } from "./utils-data.js";
import { canCancelBooking, canFitLessonFromSlot, checkCoachScheduledBooking, isPastStudentBooking } from "./scheduling-rules.js";
import { persistBookingSchedule, refreshLocalScheduleFacts } from "./scheduling-transactions.js";
import { cancelBookingInSchedule, changeBookingInSchedule, reserveBooking } from "../domain/bookings.mjs";
import { getAvailabilityLocation, isActiveBooking } from "../domain/scheduling.mjs";

const failure = (reason, message) => ({ ok: false, reason, message });
const staleSchedule = () => failure("stale", "排期或规则已更新，请检查最新安排后再次确认。");

export function getBookingLessonOptions(coachId) {
  const profile = readProfileState(coachId).saved;
  const lessons = profile.lessonOptions?.length ? profile.lessonOptions
    : readServiceContext().service ? [] : createDefaultLessonOptions(Number(profile.rate || 0)).map(lesson => Object.freeze(lesson));
  return Object.freeze(lessons.filter(lesson => Number(lesson.duration) > 0)
    .sort((a, b) => Number(a.duration) - Number(b.duration)));
}

function commitBooking(result, { undo = true, requests } = {}) {
  const previous = readScheduleState().publishedSlots;
  if (!result) return failure("not-booked", "原预约已不再有效，请刷新后重试。");
  const committed = persistBookingSchedule({ slots: result.slots, requests });
  if (!committed.ok) return committed;
  if (undo) recordBookingUndo(previous);
  return { ok: true, persistence: committed.persistence, booking: JSON.parse(JSON.stringify(readScheduleState().publishedSlots.find((slot) => slot.id === result.booking.id))) };
}

export function bookLesson({ slotId, lessonId, student, location }, now = new Date()) {
  if (refreshLocalScheduleFacts()) return staleSchedule();
  const slot = readScheduleState().publishedSlots.find((item) => item.id === slotId && !item.booked);
  const lesson = slot && getBookingLessonOptions(slot.coachId).find((item) => item.id === lessonId);
  if (!slot || !lesson || !canFitLessonFromSlot(slot, Number(lesson.duration), { source: "published" })) {
    return failure("unavailable", "这个时间已经无法完整容纳所选课程时长，请重新选择。");
  }
  const booking = {
    ...slot, end: timeFromMinutes(minutesFromTime(slot.start) + Number(lesson.duration)),
    location: slot.location === "Any served rink" ? location : slot.location,
    availabilityLocation: getAvailabilityLocation(slot), booked: true, status: "Booked",
    lessonId: lesson.id, lessonName: lesson.name, lessonDuration: Number(lesson.duration), lessonPrice: lesson.price,
    version: (slot.version || 0) + 1, transactionState: "atomic-booked", student: { ...student }, bookedAt: now.toISOString(),
    notifications: [{ type: "coach-booking-created", channel: "demo-event", message: "Demo 提示：预约成功，未发送真实通知。" }],
  };
  const eligibility = checkCoachScheduledBooking(booking, { requireOpen: true });
  if (!eligibility.allowed) return { ...failure("schedule", eligibility.message), scheduling: eligibility };
  return commitBooking(reserveBooking(readScheduleState().publishedSlots, booking));
}

export function updateBookingStudent(bookingId, student, now = new Date()) {
  if (refreshLocalScheduleFacts()) return staleSchedule();
  const original = readScheduleState().publishedSlots.find((slot) => slot.id === bookingId && isActiveBooking(slot));
  if (!original || isPastStudentBooking(original, now)) return failure("not-booked", "原预约已不再有效，请刷新后重试。");
  const booking = { ...original, student: { ...student, email: original.student?.email || "" } };
  return commitBooking({ booking, slots: readScheduleState().publishedSlots.map((slot) => slot.id === bookingId ? booking : slot) });
}

export function cancelBooking(bookingId, actor, now = new Date()) {
  if (refreshLocalScheduleFacts()) return staleSchedule();
  const slot = readScheduleState().publishedSlots.find((item) => item.id === bookingId);
  if (!canCancelBooking(slot, now)) return failure("policy", "当前预约不符合取消条件。");
  return commitBooking(cancelBookingInSchedule(readScheduleState().publishedSlots, bookingId, actor, { now, createId, calendarStep }));
}

export function applyAgreedBookingRequest(request, now = new Date()) {
  const proposal = request.proposal;
  const slots = readScheduleState().publishedSlots;
  const original = request.type === "booking-change" ? slots.find((slot) => slot.id === request.bookingId && isActiveBooking(slot)) : null;
  if (request.type === "booking-change" && !original) return failure("not-booked", "原预约已不再有效，请刷新请求后重新商议。");
  const open = slots.find((slot) => !slot.booked && slot.coachId === request.coachId && slot.date === proposal.date && slot.start === proposal.start);
  const booking = {
    ...proposal, id: original?.id || open?.id || createId(), coachId: request.coachId,
    location: proposal.location, booked: true, status: "Booked", student: original?.student || { ...request.student },
    lessonName: proposal.lessonName, lessonDuration: proposal.duration, lessonPrice: proposal.price,
    specialRequestId: request.id, replacesBookingId: original?.id,
  };
  const eligibility = checkCoachScheduledBooking(booking);
  if (!eligibility.allowed) return { ...failure("schedule", eligibility.message), scheduling: eligibility };
  delete booking.replacesBookingId;
  const result = original
    ? changeBookingInSchedule(slots, original.id, { ...booking, modifiedAt: now.toISOString() }, { createId, calendarStep })
    : reserveBooking(slots, {
      ...open, ...booking, availabilityLocation: open ? getAvailabilityLocation(open) : proposal.location,
      bookedAt: now.toISOString(), notifications: [{ type: "request-agreed", channel: "demo-event", message: "Demo 提示：特殊请求已达成，未发送真实通知。", at: now.toISOString() }],
    });
  return commitBooking(result, {
    undo: false, requests: readScheduleState().bookingRequests.map((item) => item.id === request.id ? request : item),
  });
}
