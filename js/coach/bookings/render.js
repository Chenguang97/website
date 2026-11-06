import { currentCoachId } from "../../core/config.js";
import { getAppliedCoachBookingStudentKeys, hasAppliedCoachBookingStudentFilter } from "./filter-state.js";
import { renderCoachBookingStudentPicker } from "./student-picker.js";
import { isPastBooking, slotSort } from "../../domain/scheduling.mjs";
import { coachElements as elements } from "../../dom/coach-elements.js";
import { state } from "../../core/state.js";
import { formatLocationLabel } from "../../ui/display.js";
import { escapeHtml } from "../../ui/safe-html.mjs";
import { addDaysIso, minutesFromTime } from "../../core/utils-data.js";
function getCoachBookingStudentKey(slot) {
  const studentId = String(slot.student?.id || "").trim();
  if (studentId) return `id:${studentId}`;
  const email = String(slot.student?.email || "").trim().toLocaleLowerCase();
  if (email) return `email:${email}`;
  return `legacy:${String(slot.student?.name || "学生（未填写姓名）").trim().toLocaleLowerCase()}`;
}
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
  const weekStart = elements.exceptionCalendarWeekStart?.value;
  const weekEnd = weekStart ? addDaysIso(weekStart, 7) : "";
  return [...students.values()]
    .map((student) => ({
      ...student,
      weekCount: weekStart ? state.slots.filter((slot) => slot.booked
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
  const visible = state.slots.filter((slot) => slot.booked && slot.coachId === currentCoachId && coachBookingMatchesStudent(slot) && isPastBooking(slot) === isHistory).slice().sort((a, b) => (isHistory ? -1 : 1) * (slotSort(a, b) || String(a.id).localeCompare(String(b.id))));
  elements.coachBookingPeriods.forEach((button) => {
    const active = button.dataset.coachBookingPeriod === state.coachBookingListPeriod;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  if (elements.coachBookingListSummary) {
    const selectedLabel = selectedStudents.length === 1 ? selectedStudents[0].name : selectedStudents.length > 1 ? `已选 ${selectedStudents.length} 位学生` : "全部学生";
    elements.coachBookingListSummary.textContent = `${selectedLabel} · ${visible.length} 条${isHistory ? "历史预约 · 最近在前" : "即将上课 · 时间由近到远"}`;
  }
  if (!visible.length) {
    elements.coachSlots.innerHTML = `<div class="empty-state coach-booking-empty"><strong>${hasAppliedCoachBookingStudentFilter() ? "所选学生暂无" : "暂无"}${isHistory ? "历史预约" : "即将上课的预约"}</strong><p>可切换预约时间范围，或调整上方学生筛选。列表包含所有周的预约。</p></div>`;
    return;
  }
  elements.coachSlots.innerHTML = visible.map(renderCoachBookingCard).join("");
}
function renderCoachBookingCard(slot) {
  const text = escapeHtml;
  const student = slot.student || {};
  const date = new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" }).format(/* @__PURE__ */ new Date(`${slot.date}T00:00:00`));
  const duration = Number(slot.lessonDuration) || minutesFromTime(slot.end) - minutesFromTime(slot.start);
  const hasPrice = slot.lessonPrice !== null && slot.lessonPrice !== void 0 && slot.lessonPrice !== "" && Number.isFinite(Number(slot.lessonPrice));
  const price = hasPrice ? `$${Number(slot.lessonPrice).toLocaleString("en-US", { maximumFractionDigits: 2 })}` : "价格暂未提供";
  const statuses = { Confirmed: "已确认", confirmed: "已确认", Pending: "待确认", pending: "待确认", Cancelled: "已取消", cancelled: "已取消" };
  const status = slot.status ? statuses[slot.status] || slot.status : "已确认";
  const ended = isPastBooking(slot);
  const inProgress = !ended && /* @__PURE__ */ new Date(`${slot.date}T${slot.start}`) <= /* @__PURE__ */ new Date();
  return `
    <article class="coach-booking-card" data-slot-id="${text(slot.id)}">
      <div class="coach-booking-time"><time datetime="${text(slot.date)}">${text(date)}</time><strong>${text(slot.start)}–${text(slot.end)}</strong></div>
      <div class="coach-booking-info">
        <h4>${text(student.name || "学生（未填写姓名）")}</h4>
        ${student.email ? `<p class="coach-booking-contact">${text(student.email)}</p>` : ""}
        <p>${text(formatLocationLabel(slot.location))} · ${text(slot.lessonName || "私教课")} · ${text(duration)} 分钟</p>
        ${student.note ? `<p class="coach-booking-note"><span>学生备注：</span>${text(student.note)}</p>` : ""}
        ${slot.note && slot.note !== student.note ? `<p class="coach-booking-note"><span>课时备注：</span>${text(slot.note)}</p>` : ""}
      </div>
      <div class="coach-booking-status"><strong>${text(price)}</strong><span class="pill">${text(status)}</span>${ended || inProgress ? `<small>${ended ? "已结束" : "进行中"}</small>` : ""}</div>
      <div class="coach-booking-actions">
        <button class="ghost-button" type="button" data-action="coach-booking-details" data-id="${text(slot.id)}">查看详情</button>
        <button class="danger-button" type="button" data-action="coach-cancel-booking" data-id="${text(slot.id)}">取消预约</button>
      </div>
    </article>`;
}
function renderCoachCalendarFilterSummary() {
  if (!elements.coachCalendarFilterSummary) return;
  const weekStart = elements.exceptionCalendarWeekStart.value;
  const weekEnd = addDaysIso(weekStart, 7);
  const count = state.slots.filter((slot) => slot.booked && slot.coachId === currentCoachId && slot.date >= weekStart && slot.date < weekEnd && coachBookingMatchesStudent(slot)).length;
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

