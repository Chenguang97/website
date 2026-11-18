import { coachCanManage } from "../service-controller.js";
import { captureCoachBookingReadModel } from "./read-model.js";
import { formatLocationLabel } from "../../ui/display.js";
import { escapeAttribute, escapeHtml } from "../../ui/safe-html.mjs";
import { coachElements as elements } from "../../dom/coach-elements.js";
import { getSelectedCoachRequestId } from "./request-state.js";

let conversationRequestId = "";
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

function formatDateTime(value, clock) {
  if (!value || Number.isNaN(new Date(value).getTime())) return "";
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", ...(clock.service ? { timeZone: clock.timeZone } : {}) }).format(new Date(value));
}

function getActionLabel(request, model) {
  const status = model.request(request).status;
  if (status !== "negotiating") return statusLabels[status] || status;
  return request.waitingFor === "coach" ? "等我回应" : "等待学生回应";
}

function updatePendingBadge(element, count) {
  const label = count > 99 ? "99+" : count > 0 ? String(count) : "";
  element.hidden = !label;
  element.textContent = label;
}

function renderRequestRecord(request, model) {
  const proposal = request.proposal;
  const conflict = model.request(request).conflict;
  const selected = request.id === getSelectedCoachRequestId();
  const updatedAt = model.request(request).activityTime;
  const needsResponse = model.request(request).status === "negotiating" && request.waitingFor === "coach";
  return `
    <button class="coach-request-record ${selected ? "is-selected" : ""} ${conflict ? "has-conflict" : ""} ${needsResponse ? "needs-response" : ""}" type="button" data-request-id="${escapeAttribute(request.id)}" aria-pressed="${selected}">
      <span class="coach-request-record-heading">
        <strong>${escapeHtml(request.student?.name || "学生")}</strong><b>${escapeHtml(getActionLabel(request, model))}</b>
      </span>
      <small class="coach-request-record-course">${escapeHtml(typeLabels[request.type] || "特殊请求")} · ${escapeHtml(proposal.lessonName || "课程待定")}</small>
      <span class="coach-request-record-preview">${escapeHtml(request.note || `${proposal.date} ${proposal.start}–${proposal.end}`)}</span>
      ${conflict || updatedAt ? `<span class="coach-request-record-meta">${conflict ? `<em><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m12 3 10 18H2L12 3Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 9v5m0 3v.1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>时段冲突</em>` : ""}${updatedAt ? `<time datetime="${escapeAttribute(updatedAt)}">${escapeHtml(formatDateTime(updatedAt, model.clock))}</time>` : ""}</span>` : ""}
    </button>`;
}

function renderConversation(request, model) {
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
      return `<details class="coach-request-event-group"><summary><span>时段冲突提醒 · ${events.length} 次</span><span class="coach-request-event-toggle"><span class="when-closed">展开详情</span><span class="when-open">收起详情</span><svg class="control-chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="m3 6 5 5 5-5"/></svg></span></summary><div>${events.map(event => renderSystemEvent(event, model)).join("")}</div></details>`;
    }
    if (event.type !== "message") {
      return renderSystemEvent(event, model);
    }
    const isCoach = event.actorRole === "coach";
    const actor = isCoach ? "我" : event.actorName || request.student?.name || "学生";
    return `
      <div class="coach-request-message ${isCoach ? "is-coach" : "is-student"}">
        <span class="coach-request-message-avatar" aria-hidden="true">${escapeHtml(isCoach ? "我" : actor.slice(0, 1))}</span>
        <div><p><strong>${escapeHtml(actor)}</strong><time>${escapeHtml(formatDateTime(event.at, model.clock))}</time></p><span>${escapeHtml(event.message)}</span></div>
      </div>`;
  }).join("");
}

function renderSystemEvent(event, model) {
  return `<p class="coach-request-system-event"><time datetime="${escapeAttribute(event.at || "")}">${escapeHtml(formatDateTime(event.at, model.clock))}</time>${escapeHtml(systemEventLabels[event.type])}</p>`;
}

function renderRequestDetail(request, model) {
  if (!request) {
    elements.coachRequestEmpty.hidden = false;
    elements.coachRequestDetailContent.hidden = true;
    const history = model.requestFilter === "history";
    elements.coachRequestEmpty.querySelector("strong").textContent = history ? "暂无请求历史" : "暂无商议记录";
    elements.coachRequestEmpty.querySelector("p").textContent = history ? "已达成、已到期和主动结束的请求会显示在这里。" : "新的特殊约课或预约修改请求会显示在这里。";
    return;
  }
  const proposal = request.proposal;
  const status = model.request(request).status;
  const conflict = model.request(request).conflict;
  const negotiating = status === "negotiating" && coachCanManage();
  elements.coachRequestEmpty.hidden = true;
  elements.coachRequestDetailContent.hidden = false;
  elements.coachRequestDialogTitle.textContent = request.student?.name || "学生";
  elements.coachRequestType.textContent = typeLabels[request.type] || "特殊请求";
  elements.coachRequestStatus.textContent = statusLabels[status] || status;
  elements.coachRequestActionLabel.textContent = getActionLabel(request, model);
  elements.coachRequestActionLabel.classList.toggle("needs-response", negotiating && request.waitingFor === "coach");
  elements.coachRequestExpiry.textContent = request.expiresAt ? `有效至 ${formatDateTime(request.expiresAt, model.clock)}` : "";
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
  const conversation = renderConversation(request, model);
  if (conversationRequestId !== request.id) {
    conversationRequestId = request.id;
    elements.coachRequestConversation.innerHTML = conversation;
  } else if (elements.coachRequestConversation.innerHTML !== conversation) {
    // Keep expanded conflict groups and focus when their event sequence survives.
    const template = document.createElement("template");
    template.innerHTML = conversation;
    const previous = [...elements.coachRequestConversation.children];
    let position = elements.coachRequestConversation.firstElementChild;
    for (const next of [...template.content.children]) {
      const node = previous.find(node => node.outerHTML === next.outerHTML ||
        node.matches("details") && next.matches("details") && node.innerHTML === next.innerHTML) || next;
      if (node !== position) elements.coachRequestConversation.insertBefore(node, position);
      position = node.nextElementSibling;
      const index = previous.indexOf(node);
      if (index >= 0) previous.splice(index, 1);
    }
    for (const node of previous) node.remove();
  }
  if (!negotiating) elements.coachRequestProposalFields.hidden = true;
  elements.coachRequestReply.disabled = !negotiating;
  elements.sendCoachRequestReply.disabled = !negotiating;
  elements.coachRequestReply.parentElement.hidden = !negotiating;
  elements.acceptCoachRequest.hidden = !negotiating || request.waitingFor !== "coach";
  elements.acceptCoachRequest.disabled = Boolean(conflict);
  if (!negotiating) elements.openCoachRequestProposal.hidden = true;
  elements.extendCoachRequest.hidden = !negotiating;
  elements.endCoachRequest.hidden = !negotiating;
}

export function renderCoachBookingRequests(model = captureCoachBookingReadModel()) {
  const history = model.requestFilter === "history";
  elements.coachRequestScopeTitle.textContent = history ? "请求历史" : "当前请求";
  elements.coachRequestReturnCurrent.hidden = !history;
  elements.coachRequestCurrentFilters.hidden = history;
  elements.coachRequestHistoryTrigger.hidden = history;
  updatePendingBadge(elements.coachPendingBadge, model.pendingCount);
  updatePendingBadge(elements.coachRequestNavBadge, model.pendingCount);
  elements.coachRequestScopeCount.hidden = history;
  elements.coachRequestScopeCount.textContent = String(model.currentRequestCount);
  elements.coachRequestScopeCount.setAttribute("aria-label", `${model.currentRequestCount} 个当前请求`);
  elements.coachRequestAllCount.textContent = String(model.currentRequestCount);
  elements.coachRequestStudentCount.textContent = String(model.studentWaitingCount);
  elements.coachRequestFilterBadge.hidden = false;
  elements.coachRequestFilterBadge.textContent = String(model.visiblePendingCount);
  elements.coachRequestFilterBadge.classList.toggle("has-action", model.visiblePendingCount > 0);
  elements.coachRequestFilters.forEach((button) => {
    const active = button.dataset.requestFilter === model.requestFilter;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  const requests = model.requests;
  const selectedId = getSelectedCoachRequestId();
  const records = requests.length ? requests.map(request => renderRequestRecord(request, model)).join("") : `<p class="empty-state compact-empty">${history ? "此筛选下暂无请求历史" : "此筛选下暂无商议记录"}</p>`;
  if (elements.coachRequestRecords.innerHTML !== records) elements.coachRequestRecords.innerHTML = records;
  renderRequestDetail(model.visibleRequest(selectedId), model);
}
