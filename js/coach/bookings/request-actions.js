import { currentCoachId } from "../../core/config.js";
import {
  acceptCoachBookingRequest,
  addCoachBookingRequestMessage,
  counterCoachBookingRequest,
  endCoachBookingRequest,
  extendCoachBookingRequest,
  getBookingRequest,
} from "../../core/booking-requests.js";
import { getProfile, state } from "../../core/state.js";
import { getBookingRequestStatus } from "../../domain/booking-requests.mjs";
import { openBookingDetails } from "../../ui/booking-details.js";
import { coachElements as elements } from "../../dom/coach-elements.js";
import { activateBookingSection, activateCoachPanel } from "../navigation.js?v=confirmed-liquid-switch-1";
import { confirmDiscardProfileChanges } from "../profile/actions.js";
import { renderCoachBookingChanges } from "./refresh.js?v=coach-booking-row-effect-1";
import {
  renderCoachBookingRequests,
  selectCoachBookingRequest,
} from "./request-render.js?v=coach-booking-row-effect-1";
import { getCoachCurrentRequestFilter, getCoachRequestFilter, getCoachRequestStudentScope, setCoachRequestFilter, setSelectedCoachRequestId } from "./request-state.js";
import { selectCoachBookingFilterScope } from "./filter-state.js";
import { clearCoachBookingStudentFilter, closeCoachBookingFilter, renderAppliedCoachBookingStudentFilter } from "./controls.js?v=coach-booking-row-effect-1";

function selectRequestFilter(filter) {
  closeCoachBookingFilter();
  const enteringHistory = filter === "history" && getCoachRequestFilter() !== "history";
  setCoachRequestFilter(filter);
  selectCoachBookingFilterScope(getCoachRequestStudentScope(), { inheritFrom: enteringHistory ? "requests" : null });
}

function refreshRequests(message = "") {
  renderCoachBookingChanges();
  elements.coachRequestMessage.textContent = message;
}

export function openCoachRequestWorkspace(requestId = "", { filter = requestId ? "all" : "coach", clearStudentFilter = true } = {}) {
  if (!confirmDiscardProfileChanges()) return;
  const request = requestId ? getBookingRequest(requestId) : null;
  selectRequestFilter(request && getBookingRequestStatus(request) !== "negotiating" ? "history" : filter || getCoachRequestFilter());
  activateCoachPanel("bookingsPanel");
  activateBookingSection("coachRequestWorkspace");
  const bookingDialog = document.querySelector("#bookingDetailsDialog");
  if (bookingDialog?.open) bookingDialog.close();
  if (clearStudentFilter) clearCoachBookingStudentFilter();
  if (requestId) setSelectedCoachRequestId(requestId);
  renderCoachBookingRequests();
}

export function openCoachRequestSection() {
  openCoachRequestWorkspace("", { filter: null, clearStudentFilter: false });
}

export function handleCoachRequestRecordClick(event) {
  const target = event.target.closest("[data-request-id]");
  if (!target) return;
  if (elements.coachRequestWorkspace.hidden) openCoachRequestWorkspace(target.dataset.requestId);
  else selectCoachBookingRequest(target.dataset.requestId);
}

export function filterCoachRequests(event) {
  selectRequestFilter(event.currentTarget.dataset.requestFilter);
  renderAppliedCoachBookingStudentFilter();
  if (getCoachRequestFilter() === "history") elements.coachRequestReturnCurrent.focus({ preventScroll: true });
}

export function returnToCurrentCoachRequests() {
  selectRequestFilter(getCoachCurrentRequestFilter());
  renderAppliedCoachBookingStudentFilter();
  [...elements.coachRequestFilters].find((button) => button.dataset.requestFilter === getCoachRequestFilter())?.focus({ preventScroll: true });
}

export function openCoachRequestOriginalBooking(event) {
  const trigger = event.target.closest("[data-request-booking-id]");
  if (!trigger || !state.slots.some((slot) => slot.id === trigger.dataset.requestBookingId && slot.coachId === currentCoachId)) return;
  openBookingDetails(trigger.dataset.requestBookingId);
}

export function openCoachRequestProposal() {
  elements.coachRequestProposalFields.hidden = false;
  elements.openCoachRequestProposal.hidden = true;
  elements.coachRequestDate.focus();
}

export function cancelCoachRequestProposal() {
  renderCoachBookingRequests();
}

export function sendCoachRequestReply() {
  const message = elements.coachRequestReply.value.trim();
  if (!message) {
    elements.coachRequestMessage.textContent = "请输入回复内容。";
    elements.coachRequestReply.focus();
    return;
  }
  const coachName = getProfile(currentCoachId)?.name || "Maya Chen";
  const result = addCoachBookingRequestMessage(elements.coachRequestId.value, coachName, message);
  if (!result) {
    elements.coachRequestMessage.textContent = "当前商议已结束，无法发送回复。";
    return;
  }
  refreshRequests("回复已保存，现在等待学生回应。Demo 内未发送真实通知。");
}

export function extendCurrentCoachRequest() {
  extendCoachBookingRequest(elements.coachRequestId.value);
  refreshRequests("已从现在起延长商议；延长不代表接受，也没有改变当前行动方。Demo 内已记录事件。");
}

export function endCurrentCoachRequest() {
  if (!window.confirm("确定主动结束这次商议吗？记录会保留，如需再次协商应新建请求。")) return;
  const coachName = getProfile(currentCoachId)?.name || "Maya Chen";
  endCoachBookingRequest(elements.coachRequestId.value, coachName);
  refreshRequests("商议已结束，操作方已记录。Demo 内未发送真实通知。");
}

export function counterCurrentCoachRequest() {
  const proposal = {
    date: elements.coachRequestDate.value,
    start: elements.coachRequestStart.value,
    end: elements.coachRequestEnd.value,
    location: elements.coachRequestLocation.value.trim(),
    price: Number(elements.coachRequestPrice.value),
  };
  const start = new Date(`${proposal.date}T${proposal.start}`);
  const end = new Date(`${proposal.date}T${proposal.end}`);
  if (!proposal.date || !proposal.location || !Number.isFinite(proposal.price) || end <= start || start <= new Date()) {
    elements.coachRequestMessage.textContent = "请填写未来的有效上课时间、地点和价格。";
    return;
  }
  counterCoachBookingRequest(elements.coachRequestId.value, proposal);
  refreshRequests("已生成新版本；旧版本的接受结果已失效，现在等待学生回应。Demo 内未发送真实通知。");
}

export function acceptCurrentCoachRequest() {
  const result = acceptCoachBookingRequest(elements.coachRequestId.value);
  if (!result.accepted) {
    refreshRequests(result.reason === "conflict" ? "当前时段已被预约，不能接受；请提交其他时间的新方案。" : "当前请求不需要教练回应。");
    return;
  }
  refreshRequests("双方已接受同一版本，方案已达成并应用。Demo 内未发送真实通知。");
}
