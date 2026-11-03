import { currentCoachId } from "./config.js";
import { isPastBooking, slotSort } from "./domain/scheduling.mjs";
import { elements } from "./elements.js";
import { state } from "./state.js";
import { formatLocationLabel } from "./ui/display.js";
import { escapeHtml } from "./ui/safe-html.mjs";
import { addDaysIso, minutesFromTime } from "./utils-data.js";
function getCoachBookingStudentKey(slot) {
  return JSON.stringify([
    String(slot.student?.name || "学生（未填写姓名）").trim().toLowerCase(),
    String(slot.student?.email || "").trim().toLowerCase()
  ]);
}
function coachBookingMatchesStudent(slot) {
  return !state.coachBookingStudentKey || getCoachBookingStudentKey(slot) === state.coachBookingStudentKey;
}
function getCoachBookingStudents() {
  const students = /* @__PURE__ */ new Map();
  for (const slot of state.slots) {
    if (!slot.booked || slot.coachId !== currentCoachId) continue;
    const key = getCoachBookingStudentKey(slot);
    students.set(key, { key, name: slot.student?.name || "学生（未填写姓名）", email: slot.student?.email || "" });
  }
  if (state.coachBookingSelectedStudent && !students.has(state.coachBookingSelectedStudent.key)) {
    students.set(state.coachBookingSelectedStudent.key, state.coachBookingSelectedStudent);
  }
  return [...students.values()].sort((a, b) => `${a.name}${a.email}`.localeCompare(`${b.name}${b.email}`, "zh-CN"));
}
function renderCoachBookingStudentFilter() {
  const select = elements.coachBookingStudentFilter;
  if (!select) return;
  const query = state.coachBookingStudentSearch.trim().toLocaleLowerCase();
  const students = getCoachBookingStudents();
  const matches = students.filter((student) => `${student.name} ${student.email}`.toLocaleLowerCase().includes(query));
  const selected = students.find((student) => student.key === state.coachBookingStudentKey);
  if (selected) state.coachBookingSelectedStudent = selected;
  select.replaceChildren();
  const addOption = (value, label, disabled = false) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    option.disabled = disabled;
    select.append(option);
  };
  addOption("", "全部学生");
  const visible = selected && !matches.some((student) => student.key === selected.key) ? [selected, ...matches] : matches;
  for (const student of visible) addOption(student.key, `${student.name}${student.email ? ` · ${student.email}` : ""}`);
  if (!matches.length && query) addOption("no-results", "未找到匹配的学生", true);
  select.value = state.coachBookingStudentKey;
  elements.clearCoachBookingStudent.disabled = !state.coachBookingStudentKey && !state.coachBookingStudentSearch;
  elements.coachBookingFilterHint.textContent = query ? `找到 ${matches.length} 位匹配学生。${selected ? `当前筛选：${selected.name}。` : "当前仍显示全部学生，请从列表选择。"}` : selected ? `当前筛选：${selected.name}。日历与预约列表共用此筛选。` : "默认显示全部学生。搜索后，从学生列表中选择一位。";
}
function renderCoachSlots() {
  renderCoachBookingStudentFilter();
  const isHistory = state.coachBookingListPeriod === "past";
  const visible = state.slots.filter((slot) => slot.booked && slot.coachId === currentCoachId && coachBookingMatchesStudent(slot) && isPastBooking(slot) === isHistory).slice().sort((a, b) => (isHistory ? -1 : 1) * (slotSort(a, b) || String(a.id).localeCompare(String(b.id))));
  elements.coachBookingPeriods.forEach((button) => {
    const active = button.dataset.coachBookingPeriod === state.coachBookingListPeriod;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  if (elements.coachBookingListSummary) elements.coachBookingListSummary.textContent = `全部日期 · ${visible.length} 条${isHistory ? "历史预约 · 最近在前" : "即将上课 · 时间由近到远"}`;
  if (!visible.length) {
    elements.coachSlots.innerHTML = `<div class="empty-state coach-booking-empty"><strong>${state.coachBookingStudentKey ? "该学生暂无" : "暂无"}${isHistory ? "历史预约" : "即将上课的预约"}</strong><p>可切换预约时间范围，或调整上方学生筛选。列表包含所有周的预约。</p>${state.coachBookingStudentKey || state.coachBookingStudentSearch ? '<button class="ghost-button" type="button" data-action="clear-coach-booking-student">清除学生筛选</button>' : ""}</div>`;
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
  const selected = Boolean(state.coachBookingStudentKey);
  elements.coachCalendarFilterSummary.classList.toggle("is-empty", count === 0);
  elements.coachCalendarFilterSummary.textContent = count ? `本周 ${count} 条${selected ? "该学生的" : "学生"}预约。${selected ? "其他学生的预约仍标为已占用；空闲与不可预约时间不受筛选影响。" : "点击预约可查看详情与操作。"}` : `本周暂无${selected ? "该学生的" : "学生"}预约。可切换周${selected ? "、调整或清除学生筛选" : "，或在预约列表跨周查看"}；已有占用与不可预约状态仍保留。`;
}
export {
  coachBookingMatchesStudent,
  getCoachBookingStudentKey,
  getCoachBookingStudents,
  renderCoachBookingStudentFilter,
  renderCoachCalendarFilterSummary,
  renderCoachSlots
};
