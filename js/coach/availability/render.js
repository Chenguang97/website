import { coachAuthorizedRinks } from "../profile/rink-directory.js";
import {
  readAvailabilityChanges,
  readProfileState,
  getSchedulingConfig,
  readScheduleState,
} from "../../core/state.js";
import { getCoachUnderlyingAvailability } from "../../core/scheduling-rules.js";
import { renderOpenAvailabilityBlocks } from "./open-block-render.js";
import { availabilityShowsFullDay } from "./view-state.js";
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
import { getAvailabilityLocation, isCancelledBooking, isActiveBooking } from "../../domain/scheduling.mjs";
import { coachElements as elements } from "../../dom/coach-elements.js";
import { renderCalendarLocationWatermarks, renderWeekCalendarGrid, setCalendarCellLocation } from "../../ui/calendar-grid.js";
import { formatLocationLabel } from "../../ui/display.js";
import { escapeHtml } from "../../ui/safe-html.mjs";
import { renderCoachBookingBlocks } from "../calendar-bookings.js";
import { getBookedRinkColor, getRinkColor } from "../calendar-colors.js";
import { renderWorkTimetable, renderPlanningCalendarBlocks } from "./planner-render.js";

function rinkOptionsForCoach(coachId) {
  const profileState = readProfileState(coachId);
  const profile = profileState.draft || profileState.saved;
  const servedRinks = profile.servedRinks && profile.servedRinks.length ? profile.servedRinks : [profile.homeRink || rinks[0]];
  return [
    `<option value="Any served rink">${formatLocationLabel("Any served rink")}</option>`,
    ...servedRinks.map((rink) => `<option value="${rink}">${formatLocationLabel(rink)}</option>`),
    `<option value="Zoom">Zoom</option>`,
  ].join("");
}

export function renderAvailabilityStats() {
  const snapshot = readScheduleState();
  const weekStart = startOfWeekIso(todayIso());
  const weekEnd = addDaysIso(weekStart, 7);
  const weeklySlots = snapshot.slots.filter((slot) => slot.coachId === currentCoachId && slot.date >= weekStart && slot.date < weekEnd);
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


  elements.blockDialogStart.innerHTML = startOptions.join("");
  elements.blockDialogStart.value = defaultStart;
  syncEndTimeOptions(elements.blockDialogStart, elements.blockDialogEnd, "12:00");
}

export function syncEndTimeOptions(startSelect, endSelect, preferredEnd = endSelect.value) {
  const step = calendarStep;
  const minimumEnd = minutesFromTime(startSelect.value) + step;
  const options = [];

  for (let minutes = minimumEnd; minutes <= minutesFromTime(fullDayEnd); minutes += step) {
    options.push(`<option value="${timeFromMinutes(minutes)}">${timeFromMinutes(minutes)}</option>`);
  }

  endSelect.innerHTML = options.join("");
  endSelect.value = minutesFromTime(preferredEnd) >= minimumEnd ? preferredEnd : timeFromMinutes(minimumEnd);
}

export function syncLocationOptions() {
  const calendarLocation = elements.calendarLocationType.value;
  elements.calendarLocationType.innerHTML = `<option value="">选择时间范围</option>${rinkOptionsForCoach(currentCoachId)}<option value="${unavailableSelection}">不可预约</option>`;
  elements.calendarLocationType.value = calendarLocation;
  renderCalendarRinkOptions();
  renderScheduleLegend();
}

export function renderCalendarRinkOptions() {
  const profileState = readProfileState(currentCoachId);
  const profile = profileState.draft || profileState.saved;
  const servedRinks = profile.servedRinks && profile.servedRinks.length ? profile.servedRinks : [profile.homeRink || rinks[0]];
  const authorizedRinks = coachAuthorizedRinks(servedRinks);
  const options = [
    ...(authorizedRinks.length ? [["Any served rink", formatLocationLabel("Any served rink")]] : []),
    ...authorizedRinks.map((rink) => [rink, formatLocationLabel(rink)]),
    ["Zoom", "Zoom"],
  ];

  elements.calendarRinkOptions.innerHTML = options
    .map(([value, label]) => {
      const isActive = elements.calendarLocationType.value === value;
      return `
        <button class="rink-option coach-availability-paint-option ${isActive ? "active" : ""}" type="button" data-rink="${escapeHtml(value)}" aria-pressed="${isActive}" style="--rink-option-color:${getRinkColor(value)}">
          <i class="legend-dot" aria-hidden="true"></i>
          <span>${escapeHtml(label)}</span>
        </button>
      `;
    })
    .join("");
  const unavailable = elements.calendarLocationType.value === unavailableSelection;
  elements.calendarUnavailableTool.classList.toggle("active", unavailable);
  elements.calendarUnavailableTool.setAttribute("aria-pressed", String(unavailable));
  const location = elements.calendarLocationType.value;
  elements.calendarPaintHint.textContent = unavailable ? "点击或拖选目标范围，设为不可预约；已有预约不变。" : location ? `点击或拖选目标范围，设为 ${formatLocationLabel(location)} 开放；已有预约不变。` : "";
}

function getScheduleLegendItems() {
  const profileState = readProfileState(currentCoachId);
  const profile = profileState.draft || profileState.saved;
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
          <strong>${escapeHtml(label)}</strong>
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


export function renderDragCalendar() {
  const weekStart = startOfWeekIso(elements.calendarWeekStart.value || todayIso());
  const weekEnd = addDaysIso(weekStart, 6);
  const [year, month, day] = weekStart.split("-").map(Number);
  const [endYear, endMonth, endDay] = weekEnd.split("-").map(Number);
  const rangeLabel = `${year}年${month}月${day}日—${endYear !== year ? `${endYear}年` : ""}${endMonth}月${endDay}日`;
  elements.availabilityWeekRange.textContent = rangeLabel;
  elements.availabilityWeekTrigger.setAttribute("aria-label", `选择开放时间周：${rangeLabel}`);
  const displayStart = availabilityShowsFullDay() ? fullDayStart : coreDayStart;
  const displayEnd = availabilityShowsFullDay() ? fullDayEnd : coreDayEnd;

  renderWeekCalendarGrid(elements.dragCalendar, weekStart, displayStart, displayEnd, getSchedulingConfig().enabled ? 15 : calendarStep);
  renderCalendarAvailability();
}

// Partial cells retain the original calendar appearance, with minute-exact color boundaries.
function paintPreciseAvailabilityCell(cell, start, daySlots, changes) {
  const end = start + Number(cell.dataset.duration || calendarStep);
  const ranges = daySlots.filter((slot) => !isCancelledBooking(slot) && minutesFromTime(slot.start) < end && minutesFromTime(slot.end) > start);
  const points = [...new Set([start, end, ...ranges.flatMap((slot) => [Math.max(start, minutesFromTime(slot.start)), Math.min(end, minutesFromTime(slot.end))])])].sort((a, b) => a - b);
  const stops = points.slice(0, -1).map((point, index) => {
    const slot = ranges.find((range) => minutesFromTime(range.start) <= point && minutesFromTime(range.end) > point);
    const color = slot ? `color-mix(in srgb, ${getRinkColor(getAvailabilityLocation(slot))} ${changes.addedSlotIds.includes(slot.id) ? 62 : 50}%, white)` : '#efede9';
    return `${color} ${(point - start) / (end - start) * 100}% ${(points[index + 1] - start) / (end - start) * 100}%`;
  });
  cell.dataset.preciseAvailability = '';
  cell.style.setProperty('--precise-cell-background', `linear-gradient(to bottom, ${stops.join(', ')})`);
}

export function renderCalendarAvailability() {
  const snapshot = readScheduleState();
  const changes = readAvailabilityChanges();
  if (!elements.dragCalendar || !elements.dragCalendar.children.length) return;

  const weekStart = elements.calendarWeekStart.value;
  const selectedCoach = currentCoachId;
  const cells = elements.dragCalendar.querySelectorAll(".calendar-cell");
  const byDate = new Map();
  getCoachUnderlyingAvailability(selectedCoach, weekStart, addDaysIso(weekStart, 6)).map((range) => ({ ...range, id: range.slotIds[0] })).forEach((slot) => { if (!byDate.has(slot.date)) byDate.set(slot.date, []); byDate.get(slot.date).push(slot); });
  cells.forEach((cell) => {
    const date = addDaysIso(weekStart, Number(cell.dataset.dayIndex));
    const minutes = Number(cell.dataset.minutes);
    const slot = (byDate.get(date) || []).find((range) => minutesFromTime(range.start) <= minutes && minutesFromTime(range.end) > minutes);
    const booking = snapshot.slots.find((item) => item.coachId === selectedCoach && item.date === date && isActiveBooking(item) && minutesFromTime(item.start) < minutes + Number(cell.dataset.duration || calendarStep) && minutesFromTime(item.end) > minutes);
    const isUnsavedOpen = Boolean(slot && changes.addedSlotIds.includes(slot.id));
    const isUnsavedBlock = !slot && changes.blockedCellKeys.includes(cellKey(date, minutes));
    const isRecurringEdit = changes.recurringCellKeys.includes(cellKey(date, minutes));
    const isPast = isPastCalendarCell(date, minutes);

    cell.style.removeProperty("--rink-color");
    if (slot) {
      cell.style.setProperty("--rink-color", getRinkColor(getAvailabilityLocation(slot)));
    }
    setCalendarCellLocation(cell, slot ? getAvailabilityLocation(slot) : "");
    cell.classList.toggle("has-slot", Boolean(slot));
    cell.classList.toggle("has-booking", Boolean(booking));
    cell.classList.toggle("has-blocked", !slot);
    cell.classList.toggle("is-editing", !slot?.booked && (isUnsavedOpen || isUnsavedBlock || isRecurringEdit));
    cell.classList.toggle("is-past", isPast);
    cell.title = slot
      ? `${slot.start}-${slot.end} ${formatLocationLabel(getAvailabilityLocation(slot))}${slot.booked ? ` · 已预约 · ${formatLocationLabel(slot.location)}` : " · 可预约"}${isPast ? " · 已过去" : ""}`
      : `不可预约${isPast ? " · 已过去" : ""}`;
    cell.setAttribute("aria-label", cell.title);
    paintPreciseAvailabilityCell(cell, minutes, byDate.get(date) || [], changes);
  });
  renderCalendarLocationWatermarks(elements.dragCalendar);
  renderCoachBookingBlocks({
    calendar: elements.dragCalendar,
    weekStart,
    showsFullDay: availabilityShowsFullDay(),
  });
  renderPlanningCalendarBlocks();
  renderOpenAvailabilityBlocks();
}

export function renderAvailabilityData() {
  renderWorkTimetable();
  renderAvailabilityStats();
  renderCalendarAvailability();
}


