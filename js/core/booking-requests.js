import { currentCoachId, readServiceContext } from "./config.js";
import { publishBookingRequests, readScheduleState } from "./state.js";
import { minutesFromTime } from "./utils-data.js";
import { isCancelledBooking, rangesOverlap } from "../domain/scheduling.mjs";
import { applyAgreedBookingRequest } from "./bookings.js";
import { refreshLocalScheduleFacts } from "./scheduling-transactions.js";
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
  return Object.freeze(getPendingBookingRequests(readScheduleState().bookingRequests, "coach", currentCoachId, now));
}

export function synchronizeExpiredBookingRequestsResult(now = new Date()) {
  if (readServiceContext().service) return { ok: true, persistence: null, requests: readScheduleState().bookingRequests };
  const next = readScheduleState().bookingRequests.map((request) => expireBookingRequest(request, now));
  const result = next.some((request, index) => request !== readScheduleState().bookingRequests[index]) ? publishBookingRequests(next) : { ok: true, persistence: null };
  return { ...result, requests: readScheduleState().bookingRequests };
}

export function getBookingRequest(requestId) {
  return readScheduleState().bookingRequests.find((request) => request.id === requestId) || null;
}

export function getBookingRequestConflict(request) {
  if (!request || getBookingRequestStatus(request) !== "negotiating") return null;
  const proposal = request.proposal;
  const range = proposalMinutes(proposal);
  return readScheduleState().publishedSlots.find((slot) => slot.coachId === request.coachId
    && slot.booked
    && !isCancelledBooking(slot)
    && slot.id !== request.bookingId
    && slot.date === proposal.date
    && rangesOverlap(minutesFromTime(slot.start), minutesFromTime(slot.end), range.start, range.end)) || null;
}

export function synchronizeBookingRequestConflictsResult(now = new Date()) {
  let changed = false;
  const next = readScheduleState().bookingRequests.map((request) => {
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
  const result = changed ? publishBookingRequests(next) : { ok: true, persistence: null };
  return { ...result, requests: readScheduleState().bookingRequests };
}

const serviceCommandRequired = () => ({ ok: false, reason: "service", message: "请通过服务命令提交商议变更。" });
const missingRequest = () => ({ ok: false, reason: "missing" });
export function extendCoachBookingRequestResult(requestId, now = new Date()) {
  if (readServiceContext().service) return serviceCommandRequired();
  const request = getBookingRequest(requestId);
  return request ? publishCoachRequestChange(extendBookingRequest(request, "coach", now)) : missingRequest();
}
export function addCoachBookingRequestMessageResult(requestId, coachName, message, now = new Date()) {
  const request = getBookingRequest(requestId);
  if (!request) return missingRequest();
  const next = addBookingRequestMessage(request, "coach", coachName, message, now);
  return next === request ? { ok: false, reason: "not-actionable" } : publishCoachRequestChange(next);
}
export function endCoachBookingRequestResult(requestId, coachName, now = new Date()) {
  const request = getBookingRequest(requestId);
  return request ? publishCoachRequestChange(endBookingRequest(request, "coach", coachName, now)) : missingRequest();
}
export function counterCoachBookingRequestResult(requestId, proposal, now = new Date()) {
  if (readServiceContext().service) return serviceCommandRequired();
  const request = getBookingRequest(requestId);
  return request ? publishCoachRequestChange(proposeBookingRequestVersion(request, { ...request.proposal, ...proposal }, "coach", now)) : missingRequest();
}
export function acceptCoachBookingRequest(requestId, now = new Date()) {
  if (refreshLocalScheduleFacts()) return { ok: false, accepted: false, reason: "schedule", message: "排期或规则已更新，已保留草稿并同步最新预约，请检查后再次确认。" };
  const request = getBookingRequest(requestId);
  if (!request || getBookingRequestConflict(request)) return { ok: false, accepted: false, reason: "conflict", request };
  const accepted = acceptBookingRequest(request, "coach", now);
  if (accepted === request) return { ok: false, accepted: false, reason: "not-actionable", request };
  const result = applyAgreedBookingRequest(accepted, now);
  if (!result.ok) return { ok: false, accepted: false, reason: result.reason === "storage" ? "storage" : "schedule", message: result.message, scheduling: result.scheduling, request, persistence: result.persistence };
  return { ok: true, accepted: true, request: JSON.parse(JSON.stringify(accepted)), persistence: result.persistence };
}

export function publishCoachRequestChange(nextRequest) {
  if (!nextRequest) return { ok: false, reason: "missing" };
  const requests = readScheduleState().bookingRequests;
  if (!requests.some(request => request.id === nextRequest.id)) return { ok: false, reason: "missing" };
  const result = publishBookingRequests(requests.map(request => request.id === nextRequest.id ? nextRequest : request));
  return result.ok ? { ...result, request: JSON.parse(JSON.stringify(nextRequest)) } : result;
}
