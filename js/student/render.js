import {
  calendarStep,
  coaches,
  coreDayEnd,
  coreDayStart,
  dayLabels,
  publicStudentPreviewHours,
  rinks,
  studentHasFullAccess,
} from "../core/config.js";
import { createDefaultLessonOptions } from "../core/demo-data.js";
import { slotSort } from "../domain/scheduling.mjs";
import { studentElements as elements } from "../dom/student-elements.js";
import { getProfile, state } from "../core/state.js";
import {
  canFitLessonFromSlot,
  isPastStudentBooking,
  slotOverlapsBlockedException,
} from "../core/scheduling-rules.js";
import { formatLocationLabel } from "../ui/display.js";
import { escapeAttribute, escapeHtml } from "../ui/safe-html.mjs";
import {
  addDaysIso,
  formatDate,
  getCoach,
  minutesFromTime,
  nextWeekdayIso,
  startOfWeekIso,
  timeFromMinutes,
} from "../core/utils-data.js";

export function renderStudentPage() {
  renderStudentSlots();
  renderStudentOwnBookings();
}

export function concreteLocationOptionsForCoach(coachId) {
  const profile = getProfile(coachId);
  const servedRinks = profile.servedRinks && profile.servedRinks.length ? profile.servedRinks : [profile.homeRink || rinks[0]];
  return [...servedRinks, "Zoom"].map((location) => `<option value="${location}">${formatLocationLabel(location)}</option>`).join("");
}

export function populateCoachSelects() {
  if (elements.studentCoachFilterGroup) {
    elements.studentCoachFilterGroup.innerHTML = [
      `<label><input type="checkbox" name="studentCoachFilter" value="all" checked /> 全部教练</label>`,
      ...coaches.map((coach) => `<label><input type="checkbox" name="studentCoachFilter" value="${coach.id}" checked /> ${coach.name}</label>`),
    ].join("");
  }

  if (elements.studentRinkFilterGroup) {
    elements.studentRinkFilterGroup.innerHTML = [
      `<label><input type="checkbox" name="studentRinkFilter" value="all" checked /> 全部冰场</label>`,
      ...rinks.map((rink) => `<label><input type="checkbox" name="studentRinkFilter" value="${rink}" checked /> ${rink}</label>`),
      `<label><input type="checkbox" name="studentRinkFilter" value="Zoom" checked /> Zoom</label>`,
    ].join("");
  }
  if (elements.multiCoachRequestTargets) {
    elements.multiCoachRequestTargets.innerHTML = coaches
      .map((coach) => `<option value="${escapeAttribute(coach.id)}">${escapeHtml(coach.name)}</option>`)
      .join("");
  }
  updateStudentFilterSummaries();
  renderStudentFilterChips();
}

export function renderStudentSlots() {
  renderStudentAccessState();
  renderStudentViewModeButtons();
  if (!studentHasFullAccess) {
    renderStudentDayAvailability([]);
    renderPublicStudentCalendar();
    return;
  }

  const selectedCoaches = getSelectedStudentFilterValues("studentCoachFilter", coaches.map((coach) => coach.id));
  const selectedRinks = getSelectedStudentFilterValues("studentRinkFilter", [...rinks, "Zoom"]);
  renderStudentLessonDurationFilter(selectedCoaches);
  const selectedDuration = getSelectedStudentLessonDuration();
  const selectedDate = state.studentSelectedDate || elements.studentDateFilter.value || nextWeekdayIso();
  const weekStart = startOfWeekIso(selectedDate);
  const weekEnd = addDaysIso(weekStart, 7);
  const available = state.slots.filter((slot) => {
    const coachMatches = selectedCoaches.has(slot.coachId);
    const rinkMatches = studentRinkMatches(slot, selectedRinks);
    const dateMatches = slot.date >= weekStart && slot.date < weekEnd;
    return !slot.booked && !slotOverlapsBlockedException(slot) && coachMatches && rinkMatches && dateMatches && getFittingLessonOptionsForStart(slot, selectedDuration).length > 0;
  });

  elements.studentDateFilter.value = selectedDate;
  renderStudentDatePendingState();
  renderStudentViewDateRange(selectedDate, weekStart);
  renderStudentDayAvailability(getStudentAvailableSlotsForDate(selectedDate, selectedCoaches, selectedRinks, selectedDuration));
  if (state.studentViewMode === "day") {
    elements.studentSlots.innerHTML = "";
    return;
  }
  if (elements.studentDayAvailability) {
    elements.studentDayAvailability.innerHTML = "";
    elements.studentDayAvailability.classList.add("is-hidden");
  }
  renderFullStudentCalendar(weekStart, available);
}

function getStudentAvailableSlotsForDate(date, selectedCoaches, selectedRinks, selectedDuration = getSelectedStudentLessonDuration()) {
  return state.slots
    .filter((slot) => {
      const coachMatches = selectedCoaches.has(slot.coachId);
      const rinkMatches = studentRinkMatches(slot, selectedRinks);
      return slot.date === date && !slot.booked && !slotOverlapsBlockedException(slot) && coachMatches && rinkMatches && getFittingLessonOptionsForStart(slot, selectedDuration).length > 0;
    })
    .sort(slotSort);
}

function renderStudentLessonDurationFilter(selectedCoaches) {
  if (!elements.studentLessonDurationFilter) return;
  const previousValue = elements.studentLessonDurationFilter.value || "all";
  const durations = [...selectedCoaches]
    .flatMap((coachId) => getStudentLessonOptionsForCoach(coachId).map((lesson) => Number(lesson.duration)))
    .filter((duration) => Number.isFinite(duration) && duration > 0);
  const uniqueDurations = [...new Set(durations)].sort((a, b) => a - b);
  elements.studentLessonDurationFilter.innerHTML = [
    `<option value="all">全部时长</option>`,
    ...uniqueDurations.map((duration) => `<option value="${duration}">${duration} 分钟</option>`),
  ].join("");
  elements.studentLessonDurationFilter.value = uniqueDurations.includes(Number(previousValue)) ? previousValue : "all";
}

export function getSelectedStudentLessonDuration() {
  const value = elements.studentLessonDurationFilter?.value || "all";
  return value === "all" ? null : Number(value);
}

export function getStudentLessonOptionsForCoach(coachId) {
  const profile = getProfile(coachId);
  return (Array.isArray(profile.lessonOptions) && profile.lessonOptions.length ? profile.lessonOptions : createDefaultLessonOptions(Number(profile.rate || 0)))
    .filter((lesson) => Number(lesson.duration) > 0)
    .sort((a, b) => Number(a.duration) - Number(b.duration));
}

export function getFittingLessonOptionsForStart(slot, selectedDuration = null) {
  return getStudentLessonOptionsForCoach(slot.coachId).filter((lesson) => {
    const duration = Number(lesson.duration);
    return (!selectedDuration || duration === selectedDuration) && canFitLessonFromSlot(slot, duration);
  });
}

function renderStudentDayAvailability(daySlots) {
  if (!elements.studentDayAvailability) return;

  renderStudentViewModeButtons();
  elements.studentDayAvailability.classList.toggle("is-hidden", !studentHasFullAccess || state.studentViewMode !== "day");

  if (!studentHasFullAccess || state.studentViewMode !== "day") {
    elements.studentDayAvailability.innerHTML = "";
    return;
  }

  const selectedDate = elements.studentDateFilter.value || nextWeekdayIso();
  const slotsByCell = daySlots.reduce((groups, slot) => {
    const key = minutesFromTime(slot.start);
    groups[key] = groups[key] || [];
    groups[key].push(slot);
    return groups;
  }, {});
  const rows = [];

  for (let minutes = minutesFromTime(coreDayStart); minutes < minutesFromTime(coreDayEnd); minutes += calendarStep) {
    const cellSlots = slotsByCell[minutes] || [];
    rows.push(`<div class="calendar-time">${timeFromMinutes(minutes)}</div>`);
    rows.push(renderStudentDayAvailabilityCell(selectedDate, minutes, cellSlots));
  }

  elements.studentDayAvailability.innerHTML = `
    <section class="student-day-availability-card calendar-panel">
      <div class="student-day-availability-heading">
        <div>
          <p class="eyebrow">所选日期 availability</p>
          <h3>${formatDate(selectedDate)}</h3>
        </div>
        <span>${daySlots.length} 个可预约时段</span>
      </div>
      <div class="calendar-legend student-calendar-legend" aria-label="所选日期预约日历图例">
        <span><i class="student-availability-swatch low"></i>可约教练少</span>
        <span><i class="student-availability-swatch medium"></i>可约教练中等</span>
        <span><i class="student-availability-swatch high"></i>可约教练多</span>
        <span><i class="legend-dot blocked"></i>未开放</span>
      </div>
      <div class="student-day-calendar drag-calendar" aria-label="${formatDate(selectedDate)} 可预约时间">
        <div class="calendar-corner"></div>
        <div class="calendar-day">Availability</div>
        ${rows.join("")}
      </div>
      ${
        daySlots.length
          ? ""
          : `<p class="empty-state compact-empty">当前选择的教练和冰场在这一天没有可预约时段。</p>`
      }
    </section>
  `;
}

function renderStudentViewModeButtons() {
  elements.studentViewModeButtons?.forEach((button) => {
    const isActive = button.dataset.viewMode === state.studentViewMode;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

function renderStudentViewDateRange(selectedDate, weekStart = startOfWeekIso(selectedDate)) {
  if (!elements.studentViewDateRange) return;
  const text = state.studentViewMode === "week"
    ? `${formatDate(weekStart)} - ${formatDate(addDaysIso(weekStart, 6))}`
    : formatDate(selectedDate);
  elements.studentViewDateRange.textContent = text;
}

export function renderStudentDatePendingState() {
  if (!elements.studentDateFilter) return;
  const hasPendingDate = Boolean(state.studentSelectedDate && elements.studentDateFilter.value && elements.studentDateFilter.value !== state.studentSelectedDate);
  elements.studentPendingDateMessage?.classList.toggle("is-hidden", !hasPendingDate);
  elements.studentDateActions?.classList.toggle("is-hidden", !hasPendingDate);
}

function renderStudentDayAvailabilityCell(date, minutes, cellSlots) {
  if (!cellSlots.length) {
    return `<div class="calendar-cell student-calendar-cell has-blocked" aria-label="${formatDate(date)} ${timeFromMinutes(minutes)} 未开放"></div>`;
  }

  const slotIds = cellSlots.map((slot) => slot.id).join(",");
  const availabilityLevel = getStudentAvailabilityLevel(cellSlots.length);
  const visibleCoachNames = getStudentDayAvailabilityCoachNames(cellSlots);
  const extraCount = cellSlots.length - visibleCoachNames.length;
  const coachCountLabel = `${cellSlots.length} coach${cellSlots.length === 1 ? "" : "es"} available`;
  return `
    <div class="calendar-cell student-calendar-cell has-slot availability-${availabilityLevel}">
      <button class="student-time-option" type="button" data-action="choose-time" data-ids="${slotIds}" title="${cellSlots.length} 位教练可预约">
        <span class="student-day-calendar-summary">
          <strong>${coachCountLabel}</strong>
          <small>· ${visibleCoachNames.join(" · ")}${extraCount > 0 ? ` · +${extraCount} more` : ""}</small>
        </span>
      </button>
    </div>
  `;
}

function getStudentDayAvailabilityCoachNames(cellSlots) {
  return cellSlots.slice(0, 3).map((slot) => getCoach(slot.coachId).name);
}

function getSelectedStudentFilterValues(name, fallbackValues) {
  const checked = [...document.querySelectorAll(`input[name="${name}"]:checked`)].map((input) => input.value);
  if (!checked.length || checked.includes("all")) return new Set(fallbackValues);
  return new Set(checked);
}

export function updateStudentFilterSummaries() {
  updateStudentFilterSummary("studentCoachFilter", elements.studentCoachFilterSummary, "位教练", coaches.length);
  updateStudentFilterSummary("studentRinkFilter", elements.studentRinkFilterSummary, "个冰场", rinks.length + 1);
  renderStudentFilterChips();
}

function updateStudentFilterSummary(name, summaryElement, unit, totalCount) {
  if (!summaryElement) return;
  const checked = [...document.querySelectorAll(`input[name="${name}"]:checked`)].map((input) => input.value);
  const selectedCount = !checked.length || checked.includes("all") ? totalCount : checked.length;
  summaryElement.textContent = `已选 ${selectedCount} ${unit}`;
}

export function renderStudentFilterChips() {
  renderStudentFilterChipGroup("studentCoachFilter", elements.studentCoachChips, coaches.length, "全部教练");
  renderStudentFilterChipGroup("studentRinkFilter", elements.studentRinkChips, rinks.length + 1, "全部冰场");
}

function renderStudentFilterChipGroup(name, container, totalCount, allLabel) {
  if (!container) return;
  const checked = [...document.querySelectorAll(`input[name="${name}"]:checked`)];
  const isAll = !checked.length || checked.some((input) => input.value === "all") || checked.filter((input) => input.value !== "all").length === totalCount;
  const selectedInputs = isAll ? [] : checked.filter((input) => input.value !== "all");
  const chips = isAll
    ? `<span class="student-filter-chip is-all">${allLabel}</span>`
    : selectedInputs
        .map((input) => `<button class="student-filter-chip" type="button" data-action="remove-student-filter" data-filter-name="${escapeAttribute(name)}" data-filter-value="${escapeAttribute(input.value)}">${escapeHtml(input.closest("label")?.textContent.trim())} <span aria-hidden="true">×</span></button>`)
        .join("");
  container.innerHTML = chips;
}

function studentRinkMatches(slot, selectedRinks) {
  if (slot.location === "Any served rink") {
    const profile = getProfile(slot.coachId);
    const servedRinks = profile.servedRinks && profile.servedRinks.length ? profile.servedRinks : [profile.homeRink || rinks[0]];
    return servedRinks.some((rink) => selectedRinks.has(rink));
  }
  return selectedRinks.has(slot.location);
}

function renderStudentAccessState() {
  if (elements.studentControls) {
    elements.studentControls.classList.toggle("is-hidden", !studentHasFullAccess);
  }
  if (elements.studentLoginPrompt) {
    elements.studentLoginPrompt.classList.toggle("is-hidden", studentHasFullAccess);
  }
  if (elements.studentAccessMessage) {
    elements.studentAccessMessage.textContent = studentHasFullAccess
      ? "已登录：可查看完整教练、场馆、价格和预约信息。"
      : `未登录预览：只显示未来 ${publicStudentPreviewHours} 小时内是否有可预约时间，不显示教练、场馆和价格。`;
  }
}

export function renderStudentOwnBookings() {
  if (!elements.studentOwnBookings) return;

  if (!studentHasFullAccess) {
    elements.studentOwnBookings.innerHTML = `
      <p class="empty-state">登录 / 注册后可以查看自己的预约记录。</p>
      <a class="primary-button public-login-link" href="login/index.html">登录 / 注册</a>
    `;
    return;
  }

  const bookings = state.slots
    .filter((slot) => slot.booked && slot.student)
    .slice()
    .sort(slotSort);

  const upcoming = bookings.filter((slot) => !isPastStudentBooking(slot));
  const completed = bookings.filter(isPastStudentBooking).sort((a, b) => slotSort(b, a));

  elements.studentOwnBookings.innerHTML = bookings.length
    ? `
      ${renderStudentBookingSection("还没有进行的课", upcoming, "暂无未进行的预约。")}
      ${renderStudentBookingSection("已经上完的课", completed, "暂无已完成课程。")}
    `
    : `<p class="empty-state">还没有预约记录。</p>`;
}

function renderStudentBookingSection(title, bookingSlots, emptyText) {
  return `
    <section class="student-booking-section">
      <div class="student-booking-section-heading">
        <h4>${title}</h4>
        <span>${bookingSlots.length} 节</span>
      </div>
      <div class="student-mini-list-group">
        ${
          bookingSlots.length
            ? bookingSlots.map(renderStudentMiniBooking).join("")
            : `<p class="empty-state compact-empty">${emptyText}</p>`
        }
      </div>
    </section>
  `;
}

function renderStudentMiniBooking(slot) {
  const coach = getCoach(slot.coachId);
  const isCompleted = isPastStudentBooking(slot);
  return `
    <article class="student-mini-booking ${isCompleted ? "is-completed" : ""}">
      <div>
        <strong>${escapeHtml(formatDate(slot.date))} · ${escapeHtml(slot.start)}-${escapeHtml(slot.end)}</strong>
        <span>${escapeHtml(slot.student?.name || "本人")} · ${escapeHtml(coach.name)} · ${escapeHtml(formatLocationLabel(slot.location))} · ${escapeHtml(slot.status || "Confirmed")}</span>
      </div>
      <div class="student-mini-booking-actions">
        <small>$${slot.lessonPrice}</small>
        ${
          isCompleted
            ? ""
            : `
              <button class="ghost-button" type="button" data-action="modify-student-booking" data-id="${escapeAttribute(slot.id)}">修改</button>
              <button class="danger-button" type="button" data-action="cancel-student-booking" data-id="${escapeAttribute(slot.id)}">取消</button>
            `
        }
      </div>
    </article>
  `;
}

function localIsoFromDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function timeFromDate(date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function renderPublicStudentCalendar() {
  const windows = getPublicAvailabilityWindows();
  const rows = windows.map(renderPublicStudentCalendarRow).join("");
  const emptyText = windows.some((window) => window.hasOpenSlot)
    ? ""
    : `<p class="public-calendar-note">未来 ${publicStudentPreviewHours} 小时内暂无公开可预约时间。登录后可以查看完整未来课表。</p>`;

  elements.studentSlots.innerHTML = `
    <section class="public-calendar-card" aria-label="公开可预约时间预览">
      <div class="public-calendar-header">
        <div>
          <p class="eyebrow">公开预览</p>
          <h3>未来 ${publicStudentPreviewHours} 小时</h3>
        </div>
        <span>弱化数据</span>
      </div>
      <div class="public-calendar-grid">
        <div class="public-calendar-time public-calendar-head">时间</div>
        <div class="public-calendar-status public-calendar-head">状态</div>
        ${rows}
      </div>
      ${emptyText}
      <a class="ghost-button public-login-link" href="login/index.html">登录 / 注册查看完整时间表</a>
    </section>
  `;
}

function getPublicAvailabilityWindows() {
  const now = new Date();
  const startMinutes = now.getHours() * 60 + now.getMinutes();
  const roundedStartMinutes = Math.ceil(startMinutes / calendarStep) * calendarStep;
  const cursorStart = new Date(now);
  cursorStart.setHours(Math.floor(roundedStartMinutes / 60), roundedStartMinutes % 60, 0, 0);
  const end = new Date(now.getTime() + publicStudentPreviewHours * 60 * 60 * 1000);
  const windows = [];

  for (let cursor = cursorStart; cursor < end; cursor = new Date(cursor.getTime() + calendarStep * 60 * 1000)) {
    const windowEnd = new Date(cursor.getTime() + calendarStep * 60 * 1000);
    const hasOpenSlot = state.slots.some((slot) => {
      const slotStart = new Date(`${slot.date}T${slot.start}`);
      const slotEnd = new Date(`${slot.date}T${slot.end}`);
      return !slot.booked && !slotOverlapsBlockedException(slot) && slotStart < windowEnd && slotEnd > cursor;
    });

    windows.push({
      date: localIsoFromDate(cursor),
      start: timeFromDate(cursor),
      end: timeFromDate(windowEnd),
      hasOpenSlot,
    });
  }

  return windows;
}

function renderPublicStudentCalendarRow(window) {
  return `
    <div class="public-calendar-time">
      <strong>${window.start} - ${window.end}</strong>
      <span>${formatDate(window.date)}</span>
    </div>
    <div class="public-calendar-status ${window.hasOpenSlot ? "has-public-availability" : "no-public-availability"}">
      <span>${window.hasOpenSlot ? "有可预约时间" : "暂无可预约时间"}</span>
    </div>
  `;
}

function renderFullStudentCalendar(weekStart, availableSlots) {
  const slotsByCell = availableSlots.reduce((groups, slot) => {
    const key = `${slot.date}|${minutesFromTime(slot.start)}`;
    groups[key] = groups[key] || [];
    groups[key].push(slot);
    return groups;
  }, {});
  const weekEnd = addDaysIso(weekStart, 6);
  const rows = [];

  for (let minutes = minutesFromTime(coreDayStart); minutes < minutesFromTime(coreDayEnd); minutes += calendarStep) {
    rows.push(`<div class="calendar-time">${timeFromMinutes(minutes)}</div>`);
    for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
      const date = addDaysIso(weekStart, dayIndex);
      const cellSlots = slotsByCell[`${date}|${minutes}`] || [];
      rows.push(renderStudentCalendarCell(date, minutes, cellSlots));
    }
  }

  const hasOpenSlots = availableSlots.length > 0;
  elements.studentSlots.innerHTML = `
    <section class="student-calendar-card calendar-panel" aria-label="学生可预约周历">
      <div class="panel-heading compact-heading student-calendar-header">
        <div>
          <p class="eyebrow">预约日历</p>
          <h3>${formatDate(weekStart)} - ${formatDate(weekEnd)}</h3>
        </div>
      </div>
      <div class="calendar-legend student-calendar-legend" aria-label="学生预约日历图例">
        <span><i class="student-availability-swatch low"></i>空档少</span>
        <span><i class="student-availability-swatch medium"></i>空档中等</span>
        <span><i class="student-availability-swatch high"></i>空档多</span>
        <span><i class="legend-dot blocked"></i>未开放</span>
      </div>
      <div class="calendar-week-frame">
        <button class="calendar-side-arrow" type="button" data-action="student-week" data-offset="-7" aria-label="上一周">‹</button>
        <div class="student-booking-calendar drag-calendar">
          <div class="calendar-corner"></div>
          ${dayLabels
            .map((label, index) => {
              const date = addDaysIso(weekStart, index);
              return `<div class="calendar-day">${label}<span>${formatDate(date)}</span></div>`;
            })
            .join("")}
          ${rows.join("")}
        </div>
        <button class="calendar-side-arrow" type="button" data-action="student-week" data-offset="7" aria-label="下一周">›</button>
      </div>
      ${
        hasOpenSlots
          ? ""
          : `<p class="empty-state">当前筛选条件下没有可预约滑冰时间。可以换一周或选择全部教练。</p>`
      }
    </section>
  `;
}

function renderStudentCalendarCell(date, minutes, cellSlots) {
  if (!cellSlots.length) {
    return `<div class="calendar-cell student-calendar-cell has-blocked" aria-label="${formatDate(date)} ${timeFromMinutes(minutes)} 未开放"></div>`;
  }

  const slotIds = cellSlots.map((slot) => slot.id).join(",");
  const availabilityLevel = getStudentAvailabilityLevel(cellSlots.length);
  return `
    <div class="calendar-cell student-calendar-cell has-slot availability-${availabilityLevel}">
      <button class="student-time-option" type="button" data-action="choose-time" data-ids="${slotIds}" title="${cellSlots.length} 位教练可预约">
        <span class="visually-hidden">${cellSlots.length} 位教练可预约</span>
      </button>
    </div>
  `;
}

function getStudentAvailabilityLevel(count) {
  if (count >= 3) return "high";
  if (count === 2) return "medium";
  return "low";
}

function renderStudentSlotCard(slot) {
  const coach = getCoach(slot.coachId);
  const profile = getProfile(slot.coachId);
  const travelText = profile.travelsToOtherRinks
    ? "其他冰场授课可协商"
    : `可授课冰场：${(profile.servedRinks || [profile.homeRink]).map(formatLocationLabel).join(", ")} 或 Zoom`;

  return `
    <article class="slot-card">
      <div class="slot-top">
        <div>
          <div class="slot-time">${escapeHtml(slot.start)} - ${escapeHtml(slot.end)}</div>
          <div class="slot-meta">${escapeHtml(formatDate(slot.date))} · ${escapeHtml(slot.location)}</div>
        </div>
        <span class="pill">$${slot.lessonPrice}</span>
      </div>
      <p class="slot-note"><strong>${escapeHtml(coach.name)}</strong> · ${escapeHtml(coach.subject)}<br>${escapeHtml(slot.lessonName || "私教课")} · ${escapeHtml(slot.lessonDuration || "")} 分钟<br>${escapeHtml(travelText)}<br>${escapeHtml(slot.note || "可预约一节滑冰私教课。")}</p>
      <button class="primary-button" type="button" data-action="book" data-id="${escapeAttribute(slot.id)}">Book this time</button>
    </article>
  `;
}



