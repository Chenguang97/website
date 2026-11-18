import { captureCoachBookingReadModel } from "./read-model.js";
import { renderCoachBookingStudentPicker } from "./student-picker.js";
import { coachElements as elements } from "../../dom/coach-elements.js";
import { formatLocationLabel } from "../../ui/display.js";
import { escapeHtml } from "../../ui/safe-html.mjs";
import { minutesFromTime } from "../../core/utils-data.js";
function renderCoachSlots(model = captureCoachBookingReadModel()) {
  renderCoachBookingStudentPicker(model.students);
  const isHistory = model.period === "past";
  elements.coachAppointmentsListContent.hidden = false;
  elements.coachAppointmentRecordsHeading.hidden = !isHistory;
  const visible = model.bookings;
  elements.coachBookingPeriods.forEach((button) => {
    const active = button.dataset.coachBookingPeriod === model.period;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  if (elements.coachBookingListSummary) {
    elements.coachBookingListSummary.textContent = `共 ${visible.length} 节预约`;
  }
  if (elements.coachBookingListSort) elements.coachBookingListSort.textContent = isHistory ? "按上课时间从新到旧" : "按上课时间由近到远";
  if (!visible.length) {
    elements.coachSlots.innerHTML = `<div class="empty-state coach-booking-empty"><strong>${model.hasStudentFilter ? "所选学生暂无" : "暂无"}${isHistory ? "课程历史记录" : "即将上课的预约"}</strong><p>可切换预约列表分类，或调整上方学生筛选。列表包含所有周的预约。</p></div>`;
    return;
  }
  elements.coachSlots.innerHTML = model.groups.map(group => renderCoachBookingDateGroup(group, model)).join("");
}

function renderCoachBookingDateGroup(group, model) {
  const text = escapeHtml;
  const day = new Date(`${group.date}T00:00:00`);
  const date = new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric" }).format(day);
  const weekday = new Intl.DateTimeFormat("zh-CN", { weekday: "short" }).format(day);
  return `
    <section class="coach-booking-date-group" data-booking-date="${text(group.date)}">
      <div class="coach-booking-date-heading"><time datetime="${text(group.date)}">${text(date)} · ${text(weekday)}</time><span>${group.slots.length} 节</span></div>
      <div class="coach-booking-date-list">${group.slots.map(slot => renderCoachBookingCard(slot, model)).join("")}</div>
    </section>`;
}
function renderBookingLocationIcon(location) {
  if (String(location).trim().toLocaleLowerCase() === "zoom") {
    return `<svg class="coach-booking-location-icon coach-booking-location-icon--video" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3.5" y="6" width="11.5" height="12" rx="2.5" stroke="currentColor" stroke-width="1.8"/><path d="m15 10 5-2.5v9L15 14" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`;
  }
  return `<svg class="coach-booking-location-icon coach-booking-location-icon--pin" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 21s6-5.1 6-11a6 6 0 1 0-12 0c0 5.9 6 11 6 11Z" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="10" r="2.2" stroke="currentColor" stroke-width="1.8"/></svg>`;
}
function formatCoachBookingLesson(slot, duration) {
  const lessonName = String(slot.lessonName || "私教课").trim();
  const normalizedName = lessonName.toLocaleLowerCase();
  const includesDuration = normalizedName.includes(`${duration} min`)
    || normalizedName.includes(`${duration}分钟`)
    || normalizedName.includes(`${duration} 分钟`);
  return includesDuration ? lessonName : `${lessonName} · ${duration} 分钟`;
}
function getBookingChangeRequestLabel(slot, request) {
  const proposal = request?.proposal || {};
  if (proposal.date !== slot.date || proposal.start !== slot.start || proposal.end !== slot.end) return "改期商议中";
  if (proposal.location !== slot.location) return "地点修改商议中";
  if (Number(proposal.price) !== Number(slot.lessonPrice)) return "价格商议中";
  return "修改商议中";
}
function renderCoachBookingCard(slot, model) {
  const text = escapeHtml;
  const student = slot.student || {};
  const duration = Number(slot.lessonDuration) || minutesFromTime(slot.end) - minutesFromTime(slot.start);
  const hasPrice = slot.lessonPrice !== null && slot.lessonPrice !== void 0 && slot.lessonPrice !== "" && Number.isFinite(Number(slot.lessonPrice));
  const price = hasPrice ? `$${Number(slot.lessonPrice).toLocaleString("en-US", { maximumFractionDigits: 2 })}` : "价格暂未提供";
  const facts = model.booking(slot);
  const status = facts.status;
  const cancellation = facts.cancellation;
  const lesson = formatCoachBookingLesson(slot, duration);
  const changeRequest = model.activeChange(slot.id);
  const statusTone = facts.cancelled ? "cancelled" : facts.past ? "ended" : "success";
  return `
    <article class="coach-booking-card" data-slot-id="${text(slot.id)}">
      <div class="coach-booking-time-block">
        <time class="coach-booking-start-time" datetime="${text(`${slot.date}T${slot.start}`)}">${text(slot.start)}</time>
        <span class="coach-booking-end-time">至 <time datetime="${text(`${slot.date}T${slot.end}`)}">${text(slot.end)}</time></span>
      </div>
      <div class="coach-booking-info">
        <div class="coach-booking-student-line">
          <h4>${text(student.name || "学生（未填写姓名）")}</h4>
          <span class="coach-booking-status coach-booking-status--${statusTone}">${text(status)}</span>
          ${changeRequest ? `<span class="coach-booking-request-status">${text(getBookingChangeRequestLabel(slot, changeRequest))}</span>` : ""}
          ${changeRequest?.waitingFor === "coach" ? `<span class="coach-booking-request-action">等你回应</span>` : ""}
        </div>
        <p class="coach-booking-location">${renderBookingLocationIcon(slot.location)}<span>${text(formatLocationLabel(slot.location))}</span></p>
        <p class="coach-booking-course coach-booking-meta"><span>课程</span>${text(lesson)}</p>
        ${student.note ? `<p class="coach-booking-note"><span>学生备注：</span>${text(student.note)}</p>` : ""}
      </div>
      <div class="coach-booking-side">
        <span class="coach-booking-price">${text(price)}</span>
        <button class="coach-booking-text-action coach-booking-details-action" type="button" data-action="coach-booking-details" data-id="${text(slot.id)}">查看详情</button>
        ${cancellation.allowed ? `<button class="coach-booking-text-action coach-booking-cancel-action" type="button" data-action="coach-cancel-booking" data-id="${text(slot.id)}">取消预约</button>` : ""}
        ${cancellation.reason === "inside-policy-window" ? `<span class="coach-cancellation-contact-note">取消请联系对方</span>` : ""}
      </div>
    </article>`;
}
function renderCoachCalendarFilterSummary(model = captureCoachBookingReadModel()) {
  if (!elements.coachCalendarFilterSummary) return;
  const count = model.weekCount;
  const selectedStudents = model.selectedStudents;
  const selectedLabel = selectedStudents.length === 1 ? selectedStudents[0].name : selectedStudents.length > 1 ? `${selectedStudents.length}位学生` : "全部学生";
  elements.coachCalendarFilterSummary.classList.toggle("is-empty", count === 0);
  elements.coachCalendarFilterSummary.textContent = count
    ? `正在查看${selectedLabel}的预约 · 本周 ${count} 条`
    : `正在查看${selectedLabel}的预约 · 本周暂无预约`;
  renderCoachBookingStudentPicker(model.students);
}
export { renderCoachCalendarFilterSummary, renderCoachSlots };
