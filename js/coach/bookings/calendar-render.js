import { captureCoachBookingReadModel } from "./read-model.js";
import { readAvailabilityChanges } from "../../core/state.js";
import { scheduleShowsFullDay } from "./view-state.js";
import { coreDayEnd, coreDayStart, fullDayEnd, fullDayStart } from "../../core/config.js";
import { addDaysIso, startOfWeekIso, todayIso } from "../../core/utils-data.js";
import { coachElements as elements } from "../../dom/coach-elements.js";
import { renderCalendarLocationWatermarks, renderWeekCalendarGrid, setCalendarCellLocation } from "../../ui/calendar-grid.js";
import { formatLocationLabel } from "../../ui/display.js";
import { getAvailabilityLocation } from "../../domain/scheduling.mjs";
import { getCoachCalendarBookingLabel, renderCoachBookingBlocks } from "../calendar-bookings.js";
import { getBookedRinkColor, getRinkColor } from "../calendar-colors.js";
import { renderCoachCalendarFilterSummary } from "./render.js";

export function renderExceptionDragCalendar() {
  const weekStart = startOfWeekIso(elements.exceptionCalendarWeekStart.value || elements.calendarWeekStart.value || todayIso());
  const weekEnd = addDaysIso(weekStart, 6);
  const [startYear, startMonth, startDay] = weekStart.split("-").map(Number);
  const [endYear, endMonth, endDay] = weekEnd.split("-").map(Number);
  if (elements.coachScheduleWeekRange) {
    elements.coachScheduleWeekRange.innerHTML = `<span>${startYear}年${startMonth}月${startDay}日</span><wbr>—<wbr><span>${endYear !== startYear ? `${endYear}年` : ""}${endMonth}月${endDay}日</span>`;
  }
  const displayStart = scheduleShowsFullDay() ? fullDayStart : coreDayStart;
  const displayEnd = scheduleShowsFullDay() ? fullDayEnd : coreDayEnd;

  renderWeekCalendarGrid(elements.exceptionDragCalendar, weekStart, displayStart, displayEnd);
  renderExceptionCalendarAvailability();
}

export function renderExceptionCalendarAvailability(model = captureCoachBookingReadModel()) {
  const changes = readAvailabilityChanges();
  if (!elements.exceptionDragCalendar || !elements.exceptionDragCalendar.children.length) return;

  const weekStart = elements.exceptionCalendarWeekStart.value;
  const cells = elements.exceptionDragCalendar.querySelectorAll(".calendar-cell");
  cells.forEach((cell) => {
    const date = addDaysIso(weekStart, Number(cell.dataset.dayIndex));
    const minutes = Number(cell.dataset.minutes);
    const slot = model.slotAt(date, minutes);
    const block = model.blockAt(date, minutes);
    const isUnsavedBlock = Boolean(block && changes.blockExceptionIds.includes(block.id));
    const isFilteredBooking = Boolean(slot && slot.booked && !model.matchesStudent(slot));
    const availabilityLocation = slot ? getAvailabilityLocation(slot) : "";

    cell.textContent = "";
    delete cell.dataset.slotId;
    cell.style.removeProperty("--rink-color");
    cell.style.removeProperty("--booked-rink-color");
    setCalendarCellLocation(cell, slot && !block ? availabilityLocation : "");
    if (slot && !block) {
      cell.style.setProperty("--rink-color", getRinkColor(availabilityLocation));
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
    cell.title = block
      ? `${block.start}–${block.end} 不可预约`
      : isFilteredBooking
        ? `${slot.start}–${slot.end} 已占用（其他学生预约）`
        : slot?.booked
          ? getCoachCalendarBookingLabel(slot, studentName || "学生")
          : slot
            ? `${slot.start}–${slot.end} ${formatLocationLabel(availabilityLocation)}`
            : "不可预约";
    cell.setAttribute("aria-label", cell.title);
  });
  renderCalendarLocationWatermarks(elements.exceptionDragCalendar);
  renderCoachBookingBlocks({
    calendar: elements.exceptionDragCalendar,
    weekStart,
    showsFullDay: scheduleShowsFullDay(),
    filtersStudents: true,
    enablesDetails: true,
    readModel: model,
  });
  renderCoachCalendarFilterSummary(model);
}




