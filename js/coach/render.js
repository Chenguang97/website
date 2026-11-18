import { renderWorkTimetable } from "./availability/planner-render.js";
import {
  renderAvailabilityStats,
  renderCalendarAvailability, renderDragCalendar,
  syncLocationOptions,
} from "./availability/render.js";
import { renderExceptionCalendarAvailability, renderExceptionDragCalendar } from "./bookings/calendar-render.js";
import { renderCoachSlots } from "./bookings/render.js";
import { renderCoachBookingRequests } from "./bookings/request-render.js";
import { renderCoachProfile } from "./profile/render.js";

export function renderCoachPage({ buildCalendars = false } = {}) {
  renderCoachProfile();
  syncLocationOptions();
  renderCoachSlots();
  renderCoachBookingRequests();
  renderAvailabilityStats();
  renderWorkTimetable();
  if (buildCalendars) renderDragCalendar();
  else renderCalendarAvailability();
  if (buildCalendars) renderExceptionDragCalendar();
  else renderExceptionCalendarAvailability();
}
