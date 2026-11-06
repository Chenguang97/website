import { renderAvailabilityData } from "../availability/render.js";
import { renderExceptionCalendarAvailability } from "./calendar-render.js";
import { renderCoachSlots } from "./render.js";

export function renderCoachBookingChanges() {
  renderCoachSlots();
  renderAvailabilityData();
  renderExceptionCalendarAvailability();
}
