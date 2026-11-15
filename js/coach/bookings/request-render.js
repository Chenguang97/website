import { currentCoachId } from "../../core/config.js";
import { getBookingRequest, getBookingRequestConflict, getCoachPendingBookingRequests } from "../../core/booking-requests.js";
import { state } from "../../core/state.js";
import { formatLocationLabel } from "../../ui/display.js";
import { escapeAttribute, escapeHtml } from "../../ui/safe-html.mjs";
import { getBookingRequestStatus } from "../../domain/booking-requests.mjs";
import { coachElements as elements } from "../../dom/coach-elements.js";
import { getCoachRequestFilter, getCoachRequestStudentScope, getSelectedCoachRequestId, setSelectedCoachRequestId } from "./request-state.js";
import { getAppliedCoachBookingStudentKeys } from "./filter-state.js";
import { getCoachBookingStudentKey } from "./student-identity.js";

const statusLabels = { negotiating: "商议中", agreed: "已达成", expired: "商议已到期", ended: "商议已结束" };
const typeLabels = { "new-booking": "特殊请求", "booking-change": "修改预约" };
const systemEventLabels = {
  "proposal-created": "提出了新的具体方案",
  "proposal-accepted": "接受了当前方案",
  "request-extended": "延长了商议有效期",
  "request-ended": "结束了商议",
  "request-expired": "商议已到期",
  "proposal-time-conflict": "当前方案的时段发生冲突",
};

function formatDateTime(value) {
  if (!value || Number.isNaN(new Date(value).getTime())) return "";
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function getActionLabel(request) {
  const status = getBookingRequestStatus(request);
  if (status !== "negotiating") return statusLabels[status] || status;
  return request.waitingFor === "coach" ? "等我回应" : "等待学生回应";
}

function requestActivityTime(request) {
  const relevantEvents = (request.events || []).filter((event) => event.type === "message" || event.type === "proposal-created");
  return relevantEvents.at(-1)?.at || request.createdAt || "";
}

function requestMatchesStudent(request) {
  const appliedKeys = getAppliedCoachBookingStudentKeys(getCoachRequestStudentScope());
  return !appliedKeys.length || appliedKeys.includes(getCoachBookingStudentKey(request));
}

function updatePendingBadge(element, count) {
  const label = count > 99 ? "99+" : count > 0 ? String(count) : "";
  element.hidden = !label;
  element.textContent = label;
}

function requestTerminalTime(request) {
  return request.agreedAt || request.expiredAt || request.endedAt || request.events?.at(-1)?.at || request.createdAt || "";
}

function getScopedRequests() {
  return state.bookingRequests.filter((request) => request.coachId === currentCoachId && requestMatchesStudent(request));
}

function getVisibleRequests(requests) {
  const filter = getCoachRequestFilter();
  return requests
    .filter((request) => (getBookingRequestStatus(request) === "negotiating") === (filter !== "history"))
    .filter((request) => filter === "all" || filter === "history" || request.waitingFor === filter)
    .slice()
    .sort((a, b) => String(filter === "history" ? requestTerminalTime(b) : requestActivityTime(b)).localeCompare(String(filter === "history" ? requestTerminalTime(a) : requestActivityTime(a))));
}

function renderRequestRecord(request) {
  const proposal = request.proposal;
  const conflict = getBookingRequestConflict(request);
  const selected = request.id === getSelectedCoachRequestId();
  const updatedAt = requestActivityTime(request);
  const needsResponse = getBookingRequestStatus(request) === "negotiating" && request.waitingFor === "coach";
  return `
    <button class="coach-request-record ${selected ? "is-selected" : ""} ${conflict ? "has-conflict" : ""} ${needsResponse ? "needs-response" : ""}" type="button" data-request-id="${escapeAttribute(request.id)}" aria-pressed="${selected}">
      <span class="coach-request-record-heading">
        <strong>${escapeHtml(request.student?.name || "学生")}</strong><b>${escapeHtml(getActionLabel(request))}</b>
      </span>
      <small class="coach-request-record-course">${escapeHtml(typeLabels[request.type] || "特殊请求")} · ${escapeHtml(proposal.lessonName || "课程待定")}</small>
      <span class="coach-request-record-preview">${escapeHtml(request.note || `${proposal.date} ${proposal.start}–${proposal.end}`)}</span>
      ${conflict || updatedAt ? `<span class="coach-request-record-meta">${conflict ? `<em><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m12 3 10 18H2L12 3Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 9v5m0 3v.1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>时段冲突</em>` : ""}${updatedAt ? `<time datetime="${escapeAttribute(updatedAt)}">${escapeHtml(formatDateTime(updatedAt))}</time>` : ""}</span>` : ""}
    </button>`;
}

function renderConversation(request) {
  const messages = [];
  if (request.note) {
    messages.push({ type: "message", actorRole: request.proposerRole || "student", actorName: request.proposerRole === "coach" ? "我" : request.student?.name || "学生", message: request.note, at: request.createdAt });
  }
  messages.push(...(request.events || []).filter((event) => event.type === "message" || systemEventLabels[event.type]));
  if (!messages.length) return `<p class="empty-state compact-empty">暂无交流记录</p>`;
  const entries = [];
  for (const event of messages) {
    const previous = entries.at(-1);
    if (event.type === "proposal-time-conflict" && previous?.[0].type === event.type) previous.push(event);
    else entries.push([event]);
  }
  return entries.map((events) => {
    const event = events[0];
    if (events.length > 1) {
      return `<details class="coach-request-event-group"><summary><span>时段冲突提醒 · ${events.length} 次</span><span class="coach-request-event-toggle"><span class="when-closed">展开详情</span><span class="when-open">收起详情</span><svg class="control-chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="m3 6 5 5 5-5"/></svg></span></summary><div>${events.map(renderSystemEvent).join("")}</div></details>`;
    }
    if (event.type !== "message") {
      return renderSystemEvent(event);
    }
    const isCoach = event.actorRole === "coach";
    const actor = isCoach ? "我" : event.actorName || request.student?.name || "学生";
    return `
      <div class="coach-request-message ${isCoach ? "is-coach" : "is-student"}">
        <span class="coach-request-message-avatar" aria-hidden="true">${escapeHtml(isCoach ? "我" : actor.slice(0, 1))}</span>
        <div><p><strong>${escapeHtml(actor)}</strong><time>${escapeHtml(formatDateTime(event.at))}</time></p><span>${escapeHtml(event.message)}</span></div>
      </div>`;
  }).join("");
}

function renderSystemEvent(event) {
  return `<p class="coach-request-system-event"><time datetime="${escapeAttribute(event.at || "")}">${escapeHtml(formatDateTime(event.at))}</time>${escapeHtml(systemEventLabels[event.type])}</p>`;
}

function renderRequestDetail(request) {
  if (!request) {
    elements.coachRequestId.value = "";
    elements.coachRequestEmpty.hidden = false;
    elements.coachRequestDetailContent.hidden = true;
    const history = getCoachRequestFilter() === "history";
    elements.coachRequestEmpty.querySelector("strong").textContent = history ? "暂无请求历史" : "暂无商议记录";
    elements.coachRequestEmpty.querySelector("p").textContent = history ? "已达成、已到期和主动结束的请求会显示在这里。" : "新的特殊约课或预约修改请求会显示在这里。";
    return;
  }
  const proposal = request.proposal;
  const status = getBookingRequestStatus(request);
  const conflict = getBookingRequestConflict(request);
  const negotiating = status === "negotiating";
  elements.coachRequestId.value = request.id;
  elements.coachRequestEmpty.hidden = true;
  elements.coachRequestDetailContent.hidden = false;
  elements.coachRequestDialogTitle.textContent = request.student?.name || "学生";
  elements.coachRequestType.textContent = typeLabels[request.type] || "特殊请求";
  elements.coachRequestStatus.textContent = statusLabels[status] || status;
  elements.coachRequestActionLabel.textContent = getActionLabel(request);
  elements.coachRequestActionLabel.classList.toggle("needs-response", negotiating && request.waitingFor === "coach");
  elements.coachRequestExpiry.textContent = request.expiresAt ? `有效至 ${formatDateTime(request.expiresAt)}` : "";
  elements.coachRequestSummary.innerHTML = `
    <div><span>希望时间</span><strong>${escapeHtml(proposal.date)} ${escapeHtml(proposal.start)}–${escapeHtml(proposal.end)}</strong></div>
    <div><span>希望地点</span><strong>${escapeHtml(formatLocationLabel(proposal.location))}</strong></div>
    <div><span>课程</span><strong>${escapeHtml(proposal.lessonName || "课程待定")} · ${escapeHtml(proposal.duration || "—")}分钟</strong></div>
    <div><span>参考费用</span><strong>$${escapeHtml(proposal.price)}</strong></div>
    ${request.bookingId ? `<div class="coach-request-booking-link"><span>关联预约</span><button class="coach-request-text-action" type="button" data-request-booking-id="${escapeAttribute(request.bookingId)}">查看原预约</button></div>` : ""}
    ${negotiating ? `<p class="coach-request-rule-note">${request.type === "booking-change"
      ? "原预约继续保留；新方案尚未生效，拟调整的时段不保留。"
      : "尚未形成预约，拟预约时段不保留。"}</p>` : ""}
    ${request.endedBy ? `<div><span>结束记录</span><strong>${escapeHtml(request.endedBy.name || request.endedBy.role)} 主动结束</strong></div>` : ""}
  `;
  elements.coachRequestConflict.hidden = !conflict;
  elements.coachRequestConflict.textContent = conflict ? "当前方案时段已有预约，暂时不能接受；请调整方案后继续商议。" : "";
  elements.coachRequestConversation.innerHTML = renderConversation(request);
  elements.coachRequestDate.value = proposal.date;
  elements.coachRequestStart.value = proposal.start;
  elements.coachRequestEnd.value = proposal.end;
  elements.coachRequestLocation.value = proposal.location;
  elements.coachRequestPrice.value = proposal.price;
  elements.coachRequestProposalFields.hidden = true;
  elements.coachRequestMessage.textContent = "";
  elements.coachRequestReply.value = "";
  elements.coachRequestReply.disabled = !negotiating;
  elements.sendCoachRequestReply.disabled = !negotiating;
  elements.coachRequestReply.parentElement.hidden = !negotiating;
  elements.acceptCoachRequest.hidden = !negotiating || request.waitingFor !== "coach";
  elements.acceptCoachRequest.disabled = Boolean(conflict);
  elements.openCoachRequestProposal.hidden = !negotiating;
  elements.extendCoachRequest.hidden = !negotiating;
  elements.endCoachRequest.hidden = !negotiating;
}

export function renderCoachBookingRequests() {
  const history = getCoachRequestFilter() === "history";
  elements.coachRequestScopeTitle.textContent = history ? "请求历史" : "当前请求";
  elements.coachRequestReturnCurrent.hidden = !history;
  elements.coachRequestCurrentFilters.hidden = history;
  elements.coachRequestHistoryTrigger.hidden = history;
  const pending = getCoachPendingBookingRequests();
  const visiblePending = pending.filter(requestMatchesStudent);
  updatePendingBadge(elements.coachPendingBadge, pending.length);
  updatePendingBadge(elements.coachRequestNavBadge, pending.length);
  const scopedRequests = getScopedRequests();
  const currentRequests = scopedRequests.filter((request) => getBookingRequestStatus(request) === "negotiating");
  elements.coachRequestScopeCount.hidden = history;
  elements.coachRequestScopeCount.textContent = String(currentRequests.length);
  elements.coachRequestScopeCount.setAttribute("aria-label", `${currentRequests.length} 个当前请求`);
  elements.coachRequestAllCount.textContent = String(currentRequests.length);
  elements.coachRequestStudentCount.textContent = String(currentRequests.filter((request) => request.waitingFor === "student").length);
  elements.coachRequestFilterBadge.hidden = false;
  elements.coachRequestFilterBadge.textContent = String(visiblePending.length);
  elements.coachRequestFilterBadge.classList.toggle("has-action", visiblePending.length > 0);
  elements.coachRequestFilters.forEach((button) => {
    const active = button.dataset.requestFilter === getCoachRequestFilter();
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  const requests = getVisibleRequests(scopedRequests);
  let selectedId = getSelectedCoachRequestId();
  if (!requests.some((request) => request.id === selectedId)) {
    selectedId = requests[0]?.id || "";
    setSelectedCoachRequestId(selectedId);
  }
  elements.coachRequestRecords.innerHTML = requests.length ? requests.map(renderRequestRecord).join("") : `<p class="empty-state compact-empty">${history ? "此筛选下暂无请求历史" : "此筛选下暂无商议记录"}</p>`;
  renderRequestDetail(requests.find((request) => request.id === selectedId) || null);
}

export function selectCoachBookingRequest(requestId) {
  if (!getBookingRequest(requestId)) return;
  setSelectedCoachRequestId(requestId);
  renderCoachBookingRequests();
}

export function refreshOpenCoachBookingRequest() {
  if (elements.coachBookingPanel.dataset.bookingView === "requests") renderCoachBookingRequests();
}
