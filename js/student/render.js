import { studentHasFullAccess } from "../core/config.js";
import { studentElements as elements } from "../dom/student-elements.js";
import { addDaysIso, nextWeekdayIso, startOfWeekIso } from "../core/utils-data.js";
import { getStudentSelectedDate, getStudentViewMode } from "./view-state.js";
import { readAppliedStudentFilters, readDraftStudentFilters } from "./filter-controls.js";
import { getStudentAvailability, getPublicAvailabilityWindows } from "./queries.js";
import { renderStudentOwnBookings } from "./history-render.js";
import { renderStudentAccessState, renderStudentViewModeButtons, renderStudentDayAvailability, renderPublicStudentCalendar, renderStudentDatePendingState, renderStudentViewDateRange, renderFullStudentCalendar } from "./calendar-render.js";

export function renderStudentPage() {
  renderStudentSlots();
  renderStudentOwnBookings();
}

export function renderStudentSlots() {
  renderStudentAccessState();
  renderStudentViewModeButtons();
  if (!studentHasFullAccess) {
    renderStudentDayAvailability([]);
    renderPublicStudentCalendar(getPublicAvailabilityWindows());
    return;
  }
  const filters = readAppliedStudentFilters() || readDraftStudentFilters();
  const selectedDate = getStudentSelectedDate() || nextWeekdayIso();
  const weekStart = startOfWeekIso(selectedDate);
  const { week, day, status, loaded } = getStudentAvailability({ ...filters, date: selectedDate, from: weekStart, until: addDaysIso(weekStart, 7), last: addDaysIso(weekStart, 6) });
  if (elements.studentQueryMessage) elements.studentQueryMessage.textContent = status || "";
  renderStudentDatePendingState();
  renderStudentViewDateRange(selectedDate, weekStart);
  renderStudentDayAvailability(day, selectedDate, { unloaded: loaded === false });
  if (getStudentViewMode() === "day") {
    elements.studentSlots.innerHTML = "";
    return;
  }
  if (elements.studentDayAvailability) {
    elements.studentDayAvailability.innerHTML = "";
    elements.studentDayAvailability.classList.add("is-hidden");
  }
  renderFullStudentCalendar(weekStart, week, { unloaded: loaded === false });
}
