import { bookingDetailsElements as elements } from "../dom/booking-details-elements.js";
import { readScheduleState } from "../core/state.js";
import { formatLocationLabel } from "./display.js";
import { escapeHtml } from "./safe-html.mjs";
import { formatDate } from "../core/utils-data.js";
import { getBookingCancellationEligibility, hasBookingLocationChanged, isPastStudentBooking } from "../core/scheduling-rules.js";
import { getBookingStatusLabel } from "./booking-status.js";
import { getBookingRequestStatus } from "../domain/booking-requests.mjs";
import { getAvailabilityLocation, isCancelledBooking } from "../domain/scheduling.mjs";

export function openBookingDetails(slotId) {
  const snapshot = readScheduleState();
  const slot = snapshot.slots.find((item) => item.id === slotId);
  if (!slot || !slot.booked) return;
  const now = new Date();
  const past = isPastStudentBooking(slot, now);
  const cancelled = isCancelledBooking(slot);
  const student = slot.student || {};
  const duration = Number(slot.lessonDuration) || "";
  const hasPrice = slot.lessonPrice !== null && slot.lessonPrice !== undefined && slot.lessonPrice !== "";
  const locationChanged = document.body.dataset.page === "coach" && hasBookingLocationChanged(slot);
  const actualLocation = formatLocationLabel(slot.location);
  const availabilityLocation = formatLocationLabel(getAvailabilityLocation(slot));
  elements.bookingDetailsTitle.textContent = `${formatDate(slot.date)} ${slot.start} - ${slot.end}`;
  elements.removeBookingDetails.dataset.id = slot.id;
  const cancellation = getBookingCancellationEligibility(slot, now);
  elements.removeBookingDetails.hidden = !cancellation.allowed;
  elements.removeBookingDetails.disabled = !cancellation.allowed;
  const cancellationNotice = cancellation.reason === "inside-policy-window"
    ? `<div><span>取消政策</span><strong>距离上课不足 24 小时，不能通过普通入口直接取消，请联系对方。</strong></div>`
    : "";
  const cancellationAudit = slot.cancellation
    ? `<div><span>取消记录</span><strong>${escapeHtml(slot.cancellation.actorName || slot.cancellation.actorRole || "一方")} · ${escapeHtml(new Date(slot.cancellation.at).toLocaleString("zh-CN"))}</strong></div>`
    : "";
  const demoEvent = [...(slot.notifications || [])].reverse().find((event) => event.channel === "demo-event");
  const requestStatusLabels = { negotiating: "商议中", agreed: "已达成", expired: "商议已到期", ended: "商议已结束" };
  const relatedRequests = document.body.dataset.page === "coach"
    ? snapshot.bookingRequests.filter((request) => request.bookingId === slot.id).map((request) => {
      const status = getBookingRequestStatus(request, now);
      const action = status === "negotiating" ? (request.waitingFor === "coach" ? "等你回应" : "等待学生回应") : requestStatusLabels[status];
      return `<button class="coach-booking-related-request" type="button" data-request-id="${escapeHtml(request.id)}"><span>${escapeHtml(requestStatusLabels[status] || status)}</span><strong>${escapeHtml(action)}</strong></button>`;
    }).join("")
    : "";
  elements.bookingDetailsBody.innerHTML = `
    <div><span>状态</span><strong>${escapeHtml(getBookingStatusLabel({ status: slot.status, past, cancelled }))}</strong></div>
    <div><span>学生</span><strong>${escapeHtml(student.name || "学生")}</strong></div>
    <div><span>Email</span><strong>${escapeHtml(student.email || "暂无 email")}</strong></div>
    ${locationChanged
      ? `<div><span>授课地点</span><strong>该时段开放冰场：${escapeHtml(availabilityLocation)} → 实际授课地点：${escapeHtml(actualLocation)}</strong></div>`
      : `<div><span>场馆</span><strong>${escapeHtml(actualLocation)}</strong></div>`}
    <div><span>课程</span><strong>${escapeHtml(slot.lessonName || "私教课")}${duration ? ` · ${escapeHtml(duration)} 分钟` : ""}${hasPrice ? ` · $${escapeHtml(slot.lessonPrice)}` : ""}</strong></div>
    <div><span>学生备注</span><strong>${escapeHtml(student.note || "暂无备注")}</strong></div>
    <div><span>排课备注</span><strong>${escapeHtml(slot.note || "暂无排课备注")}</strong></div>
    ${cancellationNotice}
    ${cancellationAudit}
    ${demoEvent ? `<div><span>Demo 事件</span><strong>${escapeHtml(demoEvent.message || "已记录本地提示，未发送真实通知。")}</strong></div>` : ""}
    ${relatedRequests ? `<div><span>修改请求</span><strong class="coach-booking-related-requests">${relatedRequests}</strong></div>` : ""}
  `;
  elements.bookingDetailsDialog.showModal();
}

export function closeBookingDetails() {
  elements.bookingDetailsDialog.close();
}

export function getBookingDetailsSlotId() {
  return elements.removeBookingDetails.dataset.id || "";
}

