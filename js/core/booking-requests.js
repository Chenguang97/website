import { currentCoachId } from "./config.js";
import { replaceBookingRequests, replaceSlots, saveBookingRequests, saveSlots, state } from "./state.js";
import { createId, minutesFromTime } from "./utils-data.js";
import { getAvailabilityLocation, isCancelledBooking, rangesOverlap } from "../domain/scheduling.mjs";
import {
  acceptBookingRequest,
  addBookingRequestMessage,
  endBookingRequest,
  expireBookingRequest,
  extendBookingRequest,
  getBookingRequestStatus,
  getPendingBookingRequests,
  proposeBookingRequestVersion,
} from "../domain/booking-requests.mjs";

function proposalMinutes(proposal) {
  return { start: minutesFromTime(proposal.start), end: minutesFromTime(proposal.end) };
}

export function getCoachPendingBookingRequests(now = new Date()) {
  return getPendingBookingRequests(state.bookingRequests, "coach", currentCoachId, now);
}

export function synchronizeExpiredBookingRequests(now = new Date()) {
  const next = state.bookingRequests.map((request) => expireBookingRequest(request, now));
  if (next.some((request, index) => request !== state.bookingRequests[index])) {
    replaceBookingRequests(next);
    saveBookingRequests();
  }
  return state.bookingRequests;
}

export function getBookingRequest(requestId) {
  return state.bookingRequests.find((request) => request.id === requestId) || null;
}

export function getBookingRequestConflict(request) {
  if (!request || getBookingRequestStatus(request) !== "negotiating") return null;
  const proposal = request.proposal;
  const range = proposalMinutes(proposal);
  return state.slots.find((slot) => slot.coachId === request.coachId
    && slot.booked
    && !isCancelledBooking(slot)
    && slot.id !== request.bookingId
    && slot.date === proposal.date
    && rangesOverlap(minutesFromTime(slot.start), minutesFromTime(slot.end), range.start, range.end)) || null;
}

export function synchronizeBookingRequestConflicts(now = new Date()) {
  let changed = false;
  const next = state.bookingRequests.map((request) => {
    const conflict = getBookingRequestConflict(request);
    if (conflict && request.conflictSlotId !== conflict.id) {
      changed = true;
      return {
        ...request,
        conflictSlotId: conflict.id,
        events: [...(request.events || []), {
          type: "proposal-time-conflict",
          at: now.toISOString(),
          demo: true,
          message: "Demo 提示：提案时段已被有效预约占用，需要商议其他时间。",
        }],
      };
    }
    if (!conflict && request.conflictSlotId) {
      changed = true;
      const { conflictSlotId, ...withoutConflict } = request;
      return withoutConflict;
    }
    return request;
  });
  if (changed) {
    replaceBookingRequests(next);
    saveBookingRequests();
  }
  return state.bookingRequests;
}

function replaceRequest(nextRequest) {
  replaceBookingRequests(state.bookingRequests.map((request) => request.id === nextRequest.id ? nextRequest : request));
  saveBookingRequests();
  return nextRequest;
}

export function extendCoachBookingRequest(requestId, now = new Date()) {
  const request = getBookingRequest(requestId);
  return request ? replaceRequest(extendBookingRequest(request, "coach", now)) : null;
}

export function addCoachBookingRequestMessage(requestId, coachName, message, now = new Date()) {
  const request = getBookingRequest(requestId);
  if (!request) return null;
  const nextRequest = addBookingRequestMessage(request, "coach", coachName, message, now);
  return nextRequest === request ? null : replaceRequest(nextRequest);
}

export function endCoachBookingRequest(requestId, coachName, now = new Date()) {
  const request = getBookingRequest(requestId);
  return request ? replaceRequest(endBookingRequest(request, "coach", coachName, now)) : null;
}

export function counterCoachBookingRequest(requestId, proposal, now = new Date()) {
  const request = getBookingRequest(requestId);
  return request ? replaceRequest(proposeBookingRequestVersion(request, { ...request.proposal, ...proposal }, "coach", now)) : null;
}

export function acceptCoachBookingRequest(requestId, now = new Date()) {
  const request = getBookingRequest(requestId);
  if (!request || getBookingRequestConflict(request)) return { accepted: false, reason: "conflict", request };
  const accepted = acceptBookingRequest(request, "coach", now);
  if (accepted === request) return { accepted: false, reason: "not-actionable", request };
  applyAgreedRequest(accepted, now);
  replaceRequest(accepted);
  saveSlots();
  return { accepted: true, request: accepted };
}

function createBookingFromProposal(request, now) {
  const proposal = request.proposal;
  const openSlot = state.slots.find((slot) => slot.coachId === request.coachId && !slot.booked && slot.date === proposal.date && slot.start === proposal.start);
  const booking = openSlot || { id: createId(), coachId: request.coachId, date: proposal.date, start: proposal.start };
  Object.assign(booking, {
    date: proposal.date,
    start: proposal.start,
    end: proposal.end,
    location: proposal.location,
    availabilityLocation: openSlot ? getAvailabilityLocation(openSlot) : proposal.location,
    booked: true,
    status: "Booked",
    student: { ...request.student },
    lessonName: proposal.lessonName,
    lessonDuration: proposal.duration,
    lessonPrice: proposal.price,
    specialRequestId: request.id,
    bookedAt: now.toISOString(),
    notifications: [{ type: "request-agreed", channel: "demo-event", message: "Demo 提示：特殊请求已达成，未发送真实通知。", at: now.toISOString() }],
  });
  const range = proposalMinutes(proposal);
  const consumed = state.slots.filter((slot) => slot !== booking
    && slot.coachId === request.coachId
    && !slot.booked
    && slot.date === proposal.date
    && rangesOverlap(minutesFromTime(slot.start), minutesFromTime(slot.end), range.start, range.end));
  booking.consumedAvailabilitySlots = consumed.map((slot) => ({ ...slot }));
  replaceSlots([...state.slots.filter((slot) => !consumed.includes(slot)), ...(openSlot ? [] : [booking])]);
  return booking;
}

function applyAgreedRequest(request, now) {
  if (request.type === "new-booking") {
    createBookingFromProposal(request, now);
    return;
  }
  const original = state.slots.find((slot) => slot.id === request.bookingId && slot.booked && !isCancelledBooking(slot));
  if (!original) return;
  const originalAvailabilityLocation = getAvailabilityLocation(original);
  const keepsOriginalTime = original.date === request.proposal.date && original.start === request.proposal.start;
  const targetAvailabilitySlot = keepsOriginalTime ? null : state.slots.find((slot) => slot !== original
    && slot.coachId === request.coachId
    && !slot.booked
    && slot.date === request.proposal.date
    && minutesFromTime(slot.start) <= minutesFromTime(request.proposal.start)
    && minutesFromTime(slot.end) > minutesFromTime(request.proposal.start));
  const nextAvailabilityLocation = keepsOriginalTime
    ? originalAvailabilityLocation
    : targetAvailabilitySlot
      ? getAvailabilityLocation(targetAvailabilitySlot)
      : request.proposal.location;
  const oldAvailability = {
    ...original,
    id: createId(),
    location: originalAvailabilityLocation,
    availabilityLocation: originalAvailabilityLocation,
    booked: false,
    student: null,
    status: undefined,
    specialRequestId: undefined,
    notifications: undefined,
  };
  Object.assign(original, {
    ...request.proposal,
    availabilityLocation: nextAvailabilityLocation,
    id: request.bookingId,
    booked: true,
    status: "Booked",
    student: original.student,
    specialRequestId: request.id,
    modifiedAt: now.toISOString(),
  });
  const range = proposalMinutes(request.proposal);
  const consumed = state.slots.filter((slot) => slot !== original
    && !slot.booked
    && slot.coachId === request.coachId
    && slot.date === request.proposal.date
    && rangesOverlap(minutesFromTime(slot.start), minutesFromTime(slot.end), range.start, range.end));
  original.consumedAvailabilitySlots = consumed.map((slot) => ({ ...slot }));
  replaceSlots([...state.slots.filter((slot) => !consumed.includes(slot)), oldAvailability]);
}
