import { coachUsesService, coachCanManage } from "../service-controller.js";
import { runCoachBookingCommand } from "./service-commands.js";
import { captureProductClock } from "../../core/product-clock.js";
import { synchronizeCoachBookingRequests } from "./request-sync.js";
import { currentCoachId } from "../../core/config.js";
import {
  acceptCoachBookingRequest,
  addCoachBookingRequestMessageResult,
  counterCoachBookingRequestResult,
  endCoachBookingRequestResult,
  extendCoachBookingRequestResult,
  getBookingRequest,
} from "../../core/booking-requests.js";
import { readProfileState, readScheduleState } from "../../core/state.js";
import { getBookingRequestStatus } from "../../domain/booking-requests.mjs";
import { openBookingDetails } from "../../ui/booking-details.js";
import { coachElements as elements } from "../../dom/coach-elements.js";
import { activateBookingSection, activateCoachPanel } from "../navigation.js";
import { confirmDiscardProfileChanges } from "../profile/save-controller.js";
import { receiveCoachBookingChanges } from "./refresh.js";
import {
  receiveCoachBookingRequests,
  chooseCoachBookingRequest,
  resetCoachRequestEditor,
} from "./request-editor.js";
import { getCoachCurrentRequestFilter, getCoachRequestFilter, getCoachRequestStudentScope, setCoachRequestFilter, setSelectedCoachRequestId } from "./request-state.js";
import { selectCoachBookingFilterScope } from "./filter-state.js";
import { previewCoachScheduledBooking } from "../../core/scheduling-rules.js";
import { clearCoachBookingStudentFilter, closeCoachBookingFilter, renderAppliedCoachBookingStudentFilter } from "./controls.js";

function selectRequestFilter(filter) {
  closeCoachBookingFilter();
  const enteringHistory = filter === "history" && getCoachRequestFilter() !== "history";
  setCoachRequestFilter(filter);
  selectCoachBookingFilterScope(getCoachRequestStudentScope(), { inheritFrom: enteringHistory ? "requests" : null });
}

function refreshRequests(message = "") {
  synchronizeCoachBookingRequests();
  receiveCoachBookingChanges({ resetRequest: true });
  elements.coachRequestMessage.textContent = message;
}

export function openCoachRequestWorkspace(requestId = "", { filter = requestId ? "all" : "coach", clearStudentFilter = true } = {}) {
  if (!coachCanManage() || !confirmDiscardProfileChanges()) return;
  const request = requestId ? getBookingRequest(requestId) : null;
  selectRequestFilter(request && getBookingRequestStatus(request) !== "negotiating" ? "history" : filter || getCoachRequestFilter());
  activateCoachPanel("bookingsPanel");
  activateBookingSection("coachRequestWorkspace");
  const bookingDialog = document.querySelector("#bookingDetailsDialog");
  if (bookingDialog?.open) bookingDialog.close();
  if (clearStudentFilter) clearCoachBookingStudentFilter();
  if (requestId) setSelectedCoachRequestId(requestId);
  resetCoachRequestEditor();
}

export function openCoachRequestSection() {
  openCoachRequestWorkspace("", { filter: null, clearStudentFilter: false });
}

export function handleCoachRequestRecordClick(event) {
  const target = event.target.closest("[data-request-id]");
  if (!target) return;
  if (elements.coachRequestWorkspace.hidden) openCoachRequestWorkspace(target.dataset.requestId);
  else chooseCoachBookingRequest(target.dataset.requestId);
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
  const snapshot = readScheduleState();
  const trigger = event.target.closest("[data-request-booking-id]");
  if (!trigger || !snapshot.slots.some((slot) => slot.id === trigger.dataset.requestBookingId && slot.coachId === currentCoachId)) return;
  openBookingDetails(trigger.dataset.requestBookingId);
}

export function openCoachRequestProposal() {
  elements.coachRequestProposalFields.hidden = false;
  elements.openCoachRequestProposal.hidden = true;
  elements.coachRequestDate.focus();
}

export function cancelCoachRequestProposal() {
  resetCoachRequestEditor();
}

export function sendCoachRequestReply() {
  const message = elements.coachRequestReply.value.trim();
  if (!message) {
    elements.coachRequestMessage.textContent = "请输入回复内容。";
    elements.coachRequestReply.focus();
    return;
  }
  if (coachUsesService()) return requestCommand('message-request', { message }, '回复已保存，未发送外部通知。', () => {
    if (elements.coachRequestReply.value.trim() === message) elements.coachRequestReply.value = '';
  });
  const profileState = readProfileState(currentCoachId);
  const coachName = (profileState.draft || profileState.saved)?.name || "Maya Chen";
  const result = addCoachBookingRequestMessageResult(elements.coachRequestId.value, coachName, message);
  if (!result.ok) {
    elements.coachRequestMessage.textContent = "回复未保存，请检查商议状态或稍后重试。输入已保留。";
    return;
  }
  refreshRequests("回复已保存，现在等待学生回应。Demo 内未发送真实通知。");
}

export function extendCurrentCoachRequest() {
  if (coachUsesService()) return requestCommand('extend-request', {}, '已延长商议；没有接受或变更行动方。');
  if (!extendCoachBookingRequestResult(elements.coachRequestId.value).ok) {
    elements.coachRequestMessage.textContent = "延长商议未能保存，请重试。";
    return;
  }
  refreshRequests("已从现在起延长商议；延长不代表接受，也没有改变当前行动方。Demo 内已记录事件。");
}

export function endCurrentCoachRequest() {
  if (!window.confirm("确定主动结束这次商议吗？记录会保留，如需再次协商应新建请求。")) return;
  if (coachUsesService()) return requestCommand('end-request', {}, '商议已结束，记录已保留。');
  const profileState = readProfileState(currentCoachId);
  const coachName = (profileState.draft || profileState.saved)?.name || "Maya Chen";
  if (!endCoachBookingRequestResult(elements.coachRequestId.value, coachName).ok) {
    elements.coachRequestMessage.textContent = "结束商议未能保存，原状态已保留，请重试。";
    return;
  }
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
  let start, end, clock;
  try {
    clock = captureProductClock();
    start = clock.instant ? clock.instant(proposal.date, proposal.start) : new Date(`${proposal.date}T${proposal.start}`);
    end = clock.instant ? clock.instant(proposal.date, proposal.end) : new Date(`${proposal.date}T${proposal.end}`);
  } catch (error) { elements.coachRequestMessage.textContent = error.message; return; }
  if (!proposal.date || !proposal.location || !Number.isFinite(proposal.price) || end <= start || start <= clock.at) {
    elements.coachRequestMessage.textContent = "请填写未来的有效上课时间、地点和价格。";
    return;
  }
  if (coachUsesService()) return requestCommand('propose-request', { proposal }, '新方案已保存；旧版本的接受已失效，未发送外部通知。');
  if (!counterCoachBookingRequestResult(elements.coachRequestId.value, proposal).ok) {
    elements.coachRequestMessage.textContent = "新方案未能保存，输入已保留，请重试。";
    return;
  }
  refreshRequests("已生成新版本；旧版本的接受结果已失效，现在等待学生回应。Demo 内未发送真实通知。");
}

export function acceptCurrentCoachRequest() {
  const request = getBookingRequest(elements.coachRequestId.value);
  if (request) {
    const preview = previewCoachScheduledBooking({ ...request.proposal, id: request.bookingId || `request-${request.id}`, replacesBookingId: request.bookingId, coachId: request.coachId });
    if (!preview.allowed) { refreshRequests(preview.message); return; }
    if (preview.requiresConfirmation && !window.confirm(`确认接受 ${request.proposal.date} ${request.proposal.start}–${request.proposal.end} 在 ${request.proposal.location} 的课程？\n将同步收紧 ${preview.closedMinutes} 分钟不再可行的开放时间，并更新必要通勤。${preview.lunch?.length ? `\n午餐保留：${preview.lunch.map((block) => `${block.start}–${block.end}`).join("、")}` : ""}\n剩余开放地点的优化将先提供建议，不自动发布。`)) return;
  }
  if (coachUsesService()) {
    if (!request) return;
    return requestCommand('accept-request', { proposalVersion: request.proposal.version }, '服务器已确认本次接受结果，预约以最新服务记录为准。');
  }
  const result = acceptCoachBookingRequest(elements.coachRequestId.value);
  if (!result.accepted) {
    refreshRequests(result.message || (result.reason === "conflict" ? "当前时段已被预约，不能接受；请提交其他时间的新方案。" : "当前请求不需要教练回应。"));
    return;
  }
  refreshRequests("双方已接受同一版本，方案已达成并应用。Demo 内未发送真实通知。");
}

function requestCommand(type, fields, message, success) {
  const requestId = elements.coachRequestId.value;
  const buttons = [elements.sendCoachRequestReply, elements.extendCoachRequest, elements.endCoachRequest, elements.counterCoachRequest, elements.acceptCoachRequest];
  return runCoachBookingCommand(type, { requestId, ...fields }, {
    key: `request:${requestId}`,
    busy(value) {
      if (elements.coachRequestId.value !== requestId) return;
      if (value) buttons.forEach(button => { button.disabled = true; });
      else receiveCoachBookingRequests();
    },
    success() { if (elements.coachRequestId.value === requestId) { success?.(); elements.coachRequestMessage.textContent = message; } },
    failure(receipt) { if (elements.coachRequestId.value === requestId) elements.coachRequestMessage.textContent = receipt.message || '结果未确认，输入已保留。'; },
    message,
  });
}
