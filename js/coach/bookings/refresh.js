import { renderAvailabilityData } from "../availability/render.js";
import { renderExceptionCalendarAvailability } from "./calendar-render.js";
import { renderCoachSlots } from "./render.js?v=coach-booking-card-1";

export function renderCoachBookingChanges() {
  renderCoachSlots();
  renderAvailabilityData();
  renderExceptionCalendarAvailability();
}
