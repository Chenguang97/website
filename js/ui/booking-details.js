import { bookingDialogElements as elements } from "../dom/booking-dialog-elements.js";
import { state } from "../core/state.js";
import { formatLocationLabel } from "./display.js";
import { escapeHtml } from "./safe-html.mjs";
import { formatDate } from "../core/utils-data.js";
import { canCancelBooking } from "../domain/scheduling.mjs";
import { getBookingStatusLabel } from "./booking-status.js";

export function openBookingDetails(slotId) {
  const slot = state.slots.find((item) => item.id === slotId);
  if (!slot || !slot.booked) return;
  const student = slot.student || {};
  const duration = Number(slot.lessonDuration) || "";
  const hasPrice = slot.lessonPrice !== null && slot.lessonPrice !== undefined && slot.lessonPrice !== "";
  elements.bookingDetailsTitle.textContent = `${formatDate(slot.date)} ${slot.start} - ${slot.end}`;
  elements.removeBookingDetails.dataset.id = slot.id;
  elements.removeBookingDetails.hidden = !canCancelBooking(slot);
  elements.removeBookingDetails.disabled = !canCancelBooking(slot);
  elements.bookingDetailsBody.innerHTML = `
    <div><span>状态</span><strong>${escapeHtml(getBookingStatusLabel(slot))}</strong></div>
    <div><span>学生</span><strong>${escapeHtml(student.name || "学生")}</strong></div>
    <div><span>Email</span><strong>${escapeHtml(student.email || "暂无 email")}</strong></div>
    <div><span>场馆</span><strong>${escapeHtml(formatLocationLabel(slot.location))}</strong></div>
    <div><span>课程</span><strong>${escapeHtml(slot.lessonName || "私教课")}${duration ? ` · ${escapeHtml(duration)} 分钟` : ""}${hasPrice ? ` · $${escapeHtml(slot.lessonPrice)}` : ""}</strong></div>
    <div><span>学生备注</span><strong>${escapeHtml(student.note || "暂无备注")}</strong></div>
    <div><span>排课备注</span><strong>${escapeHtml(slot.note || "暂无排课备注")}</strong></div>
  `;
  elements.bookingDetailsDialog.showModal();
}

export function closeBookingDetails() {
  elements.bookingDetailsDialog.close();
}

export function getBookingDetailsSlotId() {
  return elements.removeBookingDetails.dataset.id || "";
}

