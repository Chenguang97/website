import { bookingDialogElements as elements } from "../dom/booking-dialog-elements.js";
import { state } from "../core/state.js";
import { formatLocationLabel } from "./display.js";
import { escapeHtml } from "./safe-html.mjs";
import { formatDate } from "../core/utils-data.js";

export function openBookingDetails(slotId) {
  const slot = state.slots.find((item) => item.id === slotId);
  if (!slot || !slot.booked) return;
  const student = slot.student || {};
  elements.bookingDetailsTitle.textContent = `${formatDate(slot.date)} ${slot.start} - ${slot.end}`;
  elements.removeBookingDetails.dataset.id = slot.id;
  elements.bookingDetailsBody.innerHTML = `
    <div><span>学生</span><strong>${escapeHtml(student.name || "学生")}</strong></div>
    <div><span>Email</span><strong>${escapeHtml(student.email || "暂无 email")}</strong></div>
    <div><span>场馆</span><strong>${escapeHtml(formatLocationLabel(slot.location))}</strong></div>
    <div><span>课程</span><strong>${escapeHtml(slot.lessonName || "私教课")} · ${escapeHtml(slot.lessonDuration || "")} 分钟 · $${escapeHtml(slot.lessonPrice)}</strong></div>
    <div><span>备注</span><strong>${escapeHtml(student.note || "暂无备注")}</strong></div>
  `;
  elements.bookingDetailsDialog.showModal();
}

export function closeBookingDetails() {
  elements.bookingDetailsDialog.close();
}

export function getBookingDetailsSlotId() {
  return elements.removeBookingDetails.dataset.id || "";
}

