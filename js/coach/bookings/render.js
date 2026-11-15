import { currentCoachId } from "../../core/config.js";
import { getAppliedCoachBookingStudentKeys, hasAppliedCoachBookingStudentFilter } from "./filter-state.js";
import { renderCoachBookingStudentPicker } from "./student-picker.js";
import { isCancelledBooking, isPastBooking, slotSort } from "../../domain/scheduling.mjs";
import { getBookingCancellationEligibility } from "../../core/scheduling-rules.js";
import { coachElements as elements } from "../../dom/coach-elements.js";
import { state } from "../../core/state.js";
import { formatLocationLabel } from "../../ui/display.js";
import { escapeHtml } from "../../ui/safe-html.mjs";
import { addDaysIso, minutesFromTime } from "../../core/utils-data.js";
import { getBookingStatusLabel } from "../../ui/booking-status.js";
import { getBookingRequestStatus } from "../../domain/booking-requests.mjs";
import { getCoachBookingStudentKey } from "./student-identity.js";
function coachBookingMatchesStudent(slot) {
  const appliedKeys = getAppliedCoachBookingStudentKeys();
  return !appliedKeys.length || appliedKeys.includes(getCoachBookingStudentKey(slot));
}
function getCoachBookingStudents() {
  const students = /* @__PURE__ */ new Map();
  for (const slot of state.slots) {
    if (!slot.booked || slot.coachId !== currentCoachId) continue;
    const key = getCoachBookingStudentKey(slot);
    students.set(key, { key, id: slot.student?.id || key, name: slot.student?.name || "学生（未填写姓名）", email: slot.student?.email || "" });
  }
  for (const request of state.bookingRequests) {
    if (request.coachId !== currentCoachId || !request.student) continue;
    const key = getCoachBookingStudentKey(request);
    students.set(key, { key, id: request.student.id || key, name: request.student.name || "学生（未填写姓名）", email: request.student.email || "" });
  }
  const weekStart = elements.exceptionCalendarWeekStart?.value;
  const weekEnd = weekStart ? addDaysIso(weekStart, 7) : "";
  return [...students.values()]
    .map((student) => ({
      ...student,
      weekCount: weekStart ? state.slots.filter((slot) => slot.booked
        && !isCancelledBooking(slot)
        && slot.coachId === currentCoachId
        && slot.date >= weekStart
        && slot.date < weekEnd
        && getCoachBookingStudentKey(slot) === student.key).length : 0,
    }))
    .sort((a, b) => `${a.name}${a.email}`.localeCompare(`${b.name}${b.email}`, "zh-CN"));
}
function renderCoachSlots() {
  const students = getCoachBookingStudents();
  const appliedKeys = getAppliedCoachBookingStudentKeys();
  const selectedStudents = students.filter((student) => appliedKeys.includes(student.key));
  renderCoachBookingStudentPicker(students);
  const isHistory = state.coachBookingListPeriod === "past";
  elements.coachAppointmentsListContent.hidden = false;
  elements.coachAppointmentRecordsHeading.hidden = !isHistory;
  const visible = state.slots.filter((slot) => slot.booked
    && slot.coachId === currentCoachId
    && coachBookingMatchesStudent(slot)
    && (isCancelledBooking(slot) || isPastBooking(slot)) === isHistory).slice().sort((a, b) => (isHistory ? -1 : 1) * (slotSort(a, b) || String(a.id).localeCompare(String(b.id))));
  elements.coachBookingPeriods.forEach((button) => {
    const active = button.dataset.coachBookingPeriod === state.coachBookingListPeriod;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  if (elements.coachBookingListSummary) {
    const selectedLabel = selectedStudents.length === 1 ? selectedStudents[0].name : selectedStudents.length > 1 ? `已选 ${selectedStudents.length} 位学生` : "全部学生";
    elements.coachBookingListSummary.textContent = `${selectedLabel} · ${isHistory ? "历史记录 · 课程" : "即将上课"} ${visible.length} 条 · ${isHistory ? "最近在前" : "时间由近到远"}`;
  }
  if (!visible.length) {
    elements.coachSlots.innerHTML = `<div class="empty-state coach-booking-empty"><strong>${hasAppliedCoachBookingStudentFilter() ? "所选学生暂无" : "暂无"}${isHistory ? "课程历史记录" : "即将上课的预约"}</strong><p>可切换预约列表分类，或调整上方学生筛选。列表包含所有周的预约。</p></div>`;
    return;
  }
  const groups = visible.reduce((result, slot) => {
    const current = result.at(-1);
    if (current?.date === slot.date) current.slots.push(slot);
    else result.push({ date: slot.date, slots: [slot] });
    return result;
  }, []);
  elements.coachSlots.innerHTML = groups.map(renderCoachBookingDateGroup).join("");
}
function renderCoachBookingDateGroup(group) {
  const text = escapeHtml;
  const date = new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" }).format(/* @__PURE__ */ new Date(`${group.date}T00:00:00`));
  return `
    <section class="coach-booking-date-group" data-booking-date="${text(group.date)}">
      <div class="coach-booking-date-heading"><time datetime="${text(group.date)}">${text(date)}</time><span>${group.slots.length} 节</span></div>
      <div class="coach-booking-date-list">${group.slots.map(renderCoachBookingCard).join("")}</div>
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
function getActiveBookingChangeRequest(slot) {
  return state.bookingRequests
    .filter((request) => request.type === "booking-change"
      && request.bookingId === slot.id
      && getBookingRequestStatus(request) === "negotiating")
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))[0] || null;
}
function getBookingChangeRequestLabel(slot, request) {
  const proposal = request?.proposal || {};
  if (proposal.date !== slot.date || proposal.start !== slot.start || proposal.end !== slot.end) return "改期商议中";
  if (proposal.location !== slot.location) return "地点修改商议中";
  if (Number(proposal.price) !== Number(slot.lessonPrice)) return "价格商议中";
  return "修改商议中";
}
function renderCoachBookingCard(slot) {
  const text = escapeHtml;
  const student = slot.student || {};
  const duration = Number(slot.lessonDuration) || minutesFromTime(slot.end) - minutesFromTime(slot.start);
  const hasPrice = slot.lessonPrice !== null && slot.lessonPrice !== void 0 && slot.lessonPrice !== "" && Number.isFinite(Number(slot.lessonPrice));
  const price = hasPrice ? `$${Number(slot.lessonPrice).toLocaleString("en-US", { maximumFractionDigits: 2 })}` : "价格暂未提供";
  const status = getBookingStatusLabel(slot);
  const cancellation = getBookingCancellationEligibility(slot);
  const lesson = formatCoachBookingLesson(slot, duration);
  const changeRequest = getActiveBookingChangeRequest(slot);
  const statusTone = isCancelledBooking(slot) ? "cancelled" : isPastBooking(slot) ? "ended" : "success";
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
function renderCoachCalendarFilterSummary() {
  if (!elements.coachCalendarFilterSummary) return;
  const weekStart = elements.exceptionCalendarWeekStart.value;
  const weekEnd = addDaysIso(weekStart, 7);
  const count = state.slots.filter((slot) => slot.booked && !isCancelledBooking(slot) && slot.coachId === currentCoachId && slot.date >= weekStart && slot.date < weekEnd && coachBookingMatchesStudent(slot)).length;
  const appliedKeys = getAppliedCoachBookingStudentKeys();
  const selectedStudents = getCoachBookingStudents().filter((student) => appliedKeys.includes(student.key));
  const selectedLabel = selectedStudents.length === 1 ? selectedStudents[0].name : selectedStudents.length > 1 ? `${selectedStudents.length}位学生` : "全部学生";
  elements.coachCalendarFilterSummary.classList.toggle("is-empty", count === 0);
  elements.coachCalendarFilterSummary.textContent = count
    ? `正在查看${selectedLabel}的预约 · 本周 ${count} 条`
    : `正在查看${selectedLabel}的预约 · 本周暂无预约`;
  renderCoachBookingStudentPicker(getCoachBookingStudents());
}
export {
  coachBookingMatchesStudent,
  getCoachBookingStudentKey,
  getCoachBookingStudents,
  renderCoachCalendarFilterSummary,
  renderCoachSlots
};

