import {
  calendarStep,
  coreDayEnd,
  coreDayStart,
  currentCoachId,
  dayLabels,
  defaultStart,
  fullDayEnd,
  fullDayStart,
  rinks,
  unavailableSelection,
} from "../../core/config.js";
import { getProfile, state } from "../../core/state.js";
import { findSlotAt, slotOverlapsBlockedException } from "../../core/scheduling-rules.js";
import {
  addDaysIso,
  cellKey,
  formatWeekday,
  isPastCalendarCell,
  minutesFromTime,
  nextWeekdayIso,
  startOfWeekIso,
  timeFromMinutes,
  todayIso,
} from "../../core/utils-data.js";
import { getAvailabilityLocation, isActiveBooking, slotSort } from "../../domain/scheduling.mjs";
import { coachElements as elements } from "../../dom/coach-elements.js";
import { renderCalendarLocationWatermarks, renderWeekCalendarGrid, setCalendarCellLocation } from "../../ui/calendar-grid.js";
import { formatLocationLabel } from "../../ui/display.js";
import { escapeHtml } from "../../ui/safe-html.mjs";
import { renderCoachBookingBlocks } from "../calendar-bookings.js";
import { getBookedRinkColor, getRinkColor } from "../calendar-colors.js";

function rinkOptionsForCoach(coachId) {
  const profile = getProfile(coachId);
  const servedRinks = profile.servedRinks && profile.servedRinks.length ? profile.servedRinks : [profile.homeRink || rinks[0]];
  return [
    `<option value="Any served rink">${formatLocationLabel("Any served rink")}</option>`,
    ...servedRinks.map((rink) => `<option value="${rink}">${formatLocationLabel(rink)}</option>`),
    `<option value="Zoom">Zoom</option>`,
  ].join("");
}

export function renderAvailabilityStats() {
  const weekStart = startOfWeekIso(todayIso());
  const weekEnd = addDaysIso(weekStart, 7);
  const weeklySlots = state.slots.filter((slot) => slot.coachId === currentCoachId && slot.date >= weekStart && slot.date < weekEnd);
  const availableHours = weeklySlots
    .filter((slot) => !slot.booked && !slotOverlapsBlockedException(slot))
    .reduce((total, slot) => total + (minutesFromTime(slot.end) - minutesFromTime(slot.start)) / 60, 0);
  if (elements.availableCount) elements.availableCount.textContent = Number.isInteger(availableHours) ? String(availableHours) : availableHours.toFixed(1);
  if (elements.bookedCount) elements.bookedCount.textContent = weeklySlots.filter(isActiveBooking).length;
}

export function populateTimeSelects() {
  const startMinutes = minutesFromTime(fullDayStart);
  const endMinutes = minutesFromTime(fullDayEnd);
  const startOptions = [];

  for (let minutes = startMinutes; minutes < endMinutes; minutes += calendarStep) {
    startOptions.push(`<option value="${timeFromMinutes(minutes)}">${timeFromMinutes(minutes)}</option>`);
  }

  elements.startTime.innerHTML = startOptions.join("");
  elements.blockDialogStart.innerHTML = startOptions.join("");
  elements.startTime.value = defaultStart;
  elements.blockDialogStart.value = defaultStart;
  syncEndTimeOptions(elements.startTime, elements.endTime, "12:00");
  syncEndTimeOptions(elements.blockDialogStart, elements.blockDialogEnd, "12:00");
}

export function syncEndTimeOptions(startSelect, endSelect, preferredEnd = endSelect.value) {
  const minimumEnd = minutesFromTime(startSelect.value) + calendarStep;
  const options = [];

  for (let minutes = minimumEnd; minutes <= minutesFromTime(fullDayEnd); minutes += calendarStep) {
    options.push(`<option value="${timeFromMinutes(minutes)}">${timeFromMinutes(minutes)}</option>`);
  }

  endSelect.innerHTML = options.join("");
  endSelect.value = minutesFromTime(preferredEnd) >= minimumEnd ? preferredEnd : timeFromMinutes(minimumEnd);
}

export function syncLocationOptions() {
  const dropdownLocation = elements.locationType.value || "Any served rink";
  const calendarLocation = elements.calendarLocationType.value || "Any served rink";
  elements.locationType.innerHTML = rinkOptionsForCoach(currentCoachId);
  elements.calendarLocationType.innerHTML = `${rinkOptionsForCoach(currentCoachId)}<option value="${unavailableSelection}">不可预约</option>`;
  elements.locationType.value = dropdownLocation;
  elements.calendarLocationType.value = calendarLocation;
  if (!elements.locationType.value) elements.locationType.value = "Any served rink";
  if (!elements.calendarLocationType.value) elements.calendarLocationType.value = "Any served rink";
  renderCalendarRinkOptions();
  renderScheduleLegend();
}

export function renderCalendarRinkOptions() {
  const profile = getProfile(currentCoachId);
  const servedRinks = profile.servedRinks && profile.servedRinks.length ? profile.servedRinks : [profile.homeRink || rinks[0]];
  const options = [
    ["Any served rink", formatLocationLabel("Any served rink")],
    ...servedRinks.map((rink) => [rink, formatLocationLabel(rink)]),
    ["Zoom", "Zoom"],
  ];

  elements.calendarRinkOptions.innerHTML = options
    .map(([value, label]) => {
      const isActive = elements.calendarLocationType.value === value;
      return `
        <button class="rink-option ${isActive ? "active" : ""}" type="button" data-rink="${escapeHtml(value)}" aria-pressed="${isActive}" style="--rink-option-color:${getRinkColor(value)}">
          <i class="legend-dot" aria-hidden="true"></i>
          <span>${escapeHtml(label)}</span>
        </button>
      `;
    })
    .join("");
  const location = elements.calendarLocationType.value;
  const unavailable = location === unavailableSelection;
  elements.calendarUnavailableTool.classList.toggle("active", unavailable);
  elements.calendarUnavailableTool.setAttribute("aria-pressed", String(unavailable));
  elements.calendarPaintHint.textContent = unavailable
    ? "在下方日历拖选，即可将对应开放时段设为不可预约；已有预约不受影响。"
    : location === "Any served rink"
      ? "在下方日历拖选，即可设置为不限冰场的开放时段。"
      : `在下方日历拖选，即可设置为在 ${formatLocationLabel(location)} 授课的开放时段。`;
}

function getScheduleLegendItems() {
  const profile = getProfile(currentCoachId);
  const servedRinks = profile.servedRinks && profile.servedRinks.length ? profile.servedRinks : [profile.homeRink || rinks[0]];
  return [
    ["Any served rink", formatLocationLabel("Any served rink")],
    ...servedRinks.map((rink) => [rink, formatLocationLabel(rink)]),
    ["Zoom", "Zoom"],
  ];
}

function renderScheduleLegend() {
  const markup = [
    ...getScheduleLegendItems().map(([value, label]) => {
      return `
        <div class="schedule-legend-row">
          <strong>${label}</strong>
          <div class="schedule-legend-states">
            <span><i class="legend-dot" style="background:${getRinkColor(value)}"></i>可预约</span>
            <span><i class="legend-dot" style="background:${getBookedRinkColor(value)}"></i>已预约</span>
          </div>
        </div>
      `;
    }),
    `<div class="schedule-legend-row compact"><strong>不可预约</strong><div class="schedule-legend-states"><span><i class="legend-dot blocked"></i>不可预约</span></div></div>`,
    `<p class="schedule-request-note">商议中的特殊请求不会在日历中占用或锁定时段。</p>`,
  ].join("");
  elements.scheduleLegend.innerHTML = markup;
}

function getSlotsForDate(date) {
  return state.slots.filter((slot) => slot.coachId === currentCoachId && slot.date === date).sort(slotSort);
}

function groupSlotsForDisplay(daySlots, options = {}) {
  const ignoreBooked = Boolean(options.ignoreBooked);
  return daySlots.reduce((groups, slot) => {
    if (slot.booked && !ignoreBooked) {
      groups.push({
        type: "booked",
        ids: [slot.id],
        start: slot.start,
        end: slot.end,
        lessonName: slot.lessonName,
        lessonPrice: slot.lessonPrice,
        location: slot.location,
      });
      return groups;
    }

    const previous = groups[groups.length - 1];
    const canMerge =
      previous &&
      previous.type === "open" &&
      previous.end === slot.start &&
      previous.lessonName === slot.lessonName &&
      previous.lessonPrice === slot.lessonPrice &&
      previous.location === slot.location;

    if (canMerge) {
      previous.end = slot.end;
      previous.ids.push(slot.id);
      return groups;
    }

    groups.push({
      type: "open",
      ids: [slot.id],
      start: slot.start,
      end: slot.end,
      lessonName: slot.lessonName,
      lessonPrice: slot.lessonPrice,
      location: slot.location,
    });
    return groups;
  }, []);
}

export function renderDropdownOpenSlots() {
  const selectedDate = elements.slotDate.value || todayIso();
  const visible = groupSlotsForDisplay(getSlotsForDate(selectedDate), { ignoreBooked: true });

  elements.selectedDateMeta.textContent = `${selectedDate} · ${formatWeekday(selectedDate)}`;

  if (!visible.length) {
    elements.dropdownOpenSlots.innerHTML = `<p class="empty-state">这一天暂无开放时间。可在上方添加，或切到日历拖选。</p>`;
    return;
  }

  elements.dropdownOpenSlots.innerHTML = visible
    .map((group) => {
      return `
        <article class="open-slot-row ${group.type === "booked" ? "booked" : ""}">
          <div>
            <strong>${group.start} - ${group.end}</strong>
            <span>${group.type === "booked" ? "已预约" : "可预约"}</span>
          </div>
          <div>
            <strong>${formatLocationLabel(group.location)}</strong>
            <span>开放给学生预约</span>
          </div>
          ${
            group.type === "booked"
              ? `<span class="pill booked">已预约</span>`
              : `<button class="danger-button" type="button" data-action="delete-many" data-ids="${group.ids.join(",")}" data-date="${selectedDate}" data-start="${group.start}" data-end="${group.end}">删除</button>`
          }
        </article>
      `;
    })
    .join("");
}

export function renderDropdownWeekSlots() {
  const weekStart = startOfWeekIso(elements.slotDate.value || todayIso());
  const cards = dayLabels.map((_, index) => {
    const date = addDaysIso(weekStart, index);
    const daySlots = groupSlotsForDisplay(getSlotsForDate(date), { ignoreBooked: true }).filter((group) => group.type === "open");
    const chips = daySlots.length
      ? daySlots
          .map((group) => `<span class="time-chip" style="background:${getRinkColor(group.location)}">${group.start}-${group.end}<small>${formatLocationLabel(group.location)}</small></span>`)
          .join("")
      : `<span>暂无开放时间</span>`;

    return `
      <article class="week-day-card">
        <strong>${formatWeekday(date).replace("星期", "周")}</strong>
        <span><time datetime="${date}">${date.slice(5).replace("-", "/")}</time></span>
        <div>${chips}</div>
      </article>
    `;
  });

  elements.dropdownWeekSlots.innerHTML = cards.join("");
}

export function renderDragCalendar() {
  const weekStart = startOfWeekIso(elements.calendarWeekStart.value || todayIso());
  elements.calendarWeekStart.value = weekStart;
  const weekEnd = addDaysIso(weekStart, 6);
  const [year, month, day] = weekStart.split("-").map(Number);
  const [endYear, endMonth, endDay] = weekEnd.split("-").map(Number);
  const rangeLabel = `${year}年${month}月${day}日—${endYear !== year ? `${endYear}年` : ""}${endMonth}月${endDay}日`;
  elements.availabilityWeekRange.textContent = rangeLabel;
  elements.calendarWeekStart.setAttribute("aria-label", `选择开放时间周：${rangeLabel}`);
  const displayStart = state.calendarShowsFullDay ? fullDayStart : coreDayStart;
  const displayEnd = state.calendarShowsFullDay ? fullDayEnd : coreDayEnd;

  renderWeekCalendarGrid(elements.dragCalendar, weekStart, displayStart, displayEnd);
  renderCalendarAvailability();
}

export function renderCalendarAvailability() {
  if (!elements.dragCalendar || !elements.dragCalendar.children.length) return;

  const weekStart = elements.calendarWeekStart.value;
  const selectedCoach = currentCoachId;
  const cells = elements.dragCalendar.querySelectorAll(".calendar-cell");
  cells.forEach((cell) => {
    const date = addDaysIso(weekStart, Number(cell.dataset.dayIndex));
    const minutes = Number(cell.dataset.minutes);
    const slot = findSlotAt(selectedCoach, date, minutes);
    const isUnsavedOpen = Boolean(slot && state.unsavedAddedSlotIds.has(slot.id));
    const isUnsavedBlock = !slot && state.unsavedBlockedCellKeys.has(cellKey(date, minutes));
    const isRecurringEdit = state.unsavedRecurringCellKeys.has(cellKey(date, minutes));
    const isPast = isPastCalendarCell(date, minutes);

    cell.style.removeProperty("--rink-color");
    if (slot) {
      cell.style.setProperty("--rink-color", getRinkColor(getAvailabilityLocation(slot)));
    }
    setCalendarCellLocation(cell, slot ? getAvailabilityLocation(slot) : "");
    cell.classList.toggle("has-slot", Boolean(slot));
    cell.classList.toggle("has-booking", Boolean(slot && slot.booked));
    cell.classList.toggle("has-blocked", !slot);
    cell.classList.toggle("is-editing", !slot?.booked && (isUnsavedOpen || isUnsavedBlock || isRecurringEdit));
    cell.classList.toggle("is-past", isPast);
    cell.title = slot
      ? `${slot.start}-${slot.end} ${formatLocationLabel(getAvailabilityLocation(slot))}${slot.booked ? ` · 已预约 · ${formatLocationLabel(slot.location)}` : " · 可预约"}${isPast ? " · 已过去" : ""}`
      : `不可预约${isPast ? " · 已过去" : ""}`;
    cell.setAttribute("aria-label", cell.title);
  });
  renderCalendarLocationWatermarks(elements.dragCalendar);
  renderCoachBookingBlocks({
    calendar: elements.dragCalendar,
    weekStart,
    showsFullDay: state.calendarShowsFullDay,
  });
}

export function renderAvailabilityData() {
  renderAvailabilityStats();
  renderDropdownOpenSlots();
  renderDropdownWeekSlots();
  renderCalendarAvailability();
}


