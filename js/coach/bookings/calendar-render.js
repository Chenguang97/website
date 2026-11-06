import { coreDayEnd, coreDayStart, currentCoachId, fullDayEnd, fullDayStart } from "../../core/config.js";
import { state } from "../../core/state.js";
import { findSlotAt } from "../../core/scheduling-rules.js";
import { addDaysIso, minutesFromTime, startOfWeekIso, todayIso } from "../../core/utils-data.js";
import { coachElements as elements } from "../../dom/coach-elements.js";
import { renderWeekCalendarGrid } from "../../ui/calendar-grid.js";
import { formatLocationLabel } from "../../ui/display.js";
import { renderCoachBookingBlocks } from "../calendar-bookings.js";
import { getBookedRinkColor, getRinkColor } from "../calendar-colors.js";
import { coachBookingMatchesStudent, renderCoachCalendarFilterSummary } from "./render.js";

export function renderExceptionDragCalendar() {
  const weekStart = startOfWeekIso(elements.exceptionCalendarWeekStart.value || elements.calendarWeekStart.value || todayIso());
  elements.exceptionCalendarWeekStart.value = weekStart;
  const weekEnd = addDaysIso(weekStart, 6);
  const [startYear, startMonth, startDay] = weekStart.split("-").map(Number);
  const [endYear, endMonth, endDay] = weekEnd.split("-").map(Number);
  if (elements.coachScheduleWeekRange) {
    elements.coachScheduleWeekRange.innerHTML = `<span>${startYear}年${startMonth}月${startDay}日</span><wbr>—<wbr><span>${endYear !== startYear ? `${endYear}年` : ""}${endMonth}月${endDay}日</span>`;
  }
  const displayStart = state.exceptionCalendarShowsFullDay ? fullDayStart : coreDayStart;
  const displayEnd = state.exceptionCalendarShowsFullDay ? fullDayEnd : coreDayEnd;

  renderWeekCalendarGrid(elements.exceptionDragCalendar, weekStart, displayStart, displayEnd);
  renderExceptionCalendarAvailability();
}

function findBlockAt(date, minutes) {
  return state.blockedExceptions.find((block) => {
    return block.coachId === currentCoachId && block.date === date && minutes >= minutesFromTime(block.start) && minutes < minutesFromTime(block.end);
  });
}
export function renderExceptionCalendarAvailability() {
  if (!elements.exceptionDragCalendar || !elements.exceptionDragCalendar.children.length) return;

  const weekStart = elements.exceptionCalendarWeekStart.value;
  const cells = elements.exceptionDragCalendar.querySelectorAll(".calendar-cell");
  cells.forEach((cell) => {
    const date = addDaysIso(weekStart, Number(cell.dataset.dayIndex));
    const minutes = Number(cell.dataset.minutes);
    const slot = findSlotAt(currentCoachId, date, minutes);
    const block = findBlockAt(date, minutes);
    const isUnsavedBlock = Boolean(block && state.unsavedBlockExceptionIds.has(block.id));
    const isFilteredBooking = Boolean(slot && slot.booked && !coachBookingMatchesStudent(slot));

    cell.textContent = "";
    delete cell.dataset.slotId;
    cell.style.removeProperty("--rink-color");
    cell.style.removeProperty("--booked-rink-color");
    if (slot && !block) {
      cell.style.setProperty("--rink-color", getRinkColor(slot.location));
      cell.style.setProperty("--booked-rink-color", getBookedRinkColor(slot.location));
    }
    cell.classList.toggle("has-slot", Boolean(slot && !block));
    cell.classList.toggle("has-booking", Boolean(slot && slot.booked));
    cell.classList.toggle("is-filtered-booking", isFilteredBooking);
    if (slot && slot.booked && !block && !isFilteredBooking) {
      cell.dataset.slotId = slot.id;
    }
    cell.classList.toggle("has-blocked", !slot || Boolean(block));
    cell.classList.toggle("is-editing", isUnsavedBlock);
    const studentName = slot?.student?.name || "";
    cell.title = block ? `${block.start}-${block.end} 不可预约` : isFilteredBooking ? `${slot.start}-${slot.end} 已占用（其他学生预约）` : slot ? `${slot.start}-${slot.end} ${formatLocationLabel(slot.location)}${studentName ? ` · ${studentName}` : ""}` : "不可预约";
    cell.setAttribute("aria-label", cell.title);
  });
  renderCoachBookingBlocks({
    calendar: elements.exceptionDragCalendar,
    weekStart,
    showsFullDay: state.exceptionCalendarShowsFullDay,
    filtersStudents: true,
    enablesDetails: true,
  });
  renderCoachCalendarFilterSummary();
}




