import { renderAvailabilityData } from "../availability/render.js";
import { renderExceptionCalendarAvailability } from "./calendar-render.js";
import { renderCoachSlots } from "./render.js?v=coach-booking-row-effect-1";
import { synchronizeBookingRequestConflicts, synchronizeExpiredBookingRequests } from "../../core/booking-requests.js";
import { renderCoachBookingRequests } from "./request-render.js?v=coach-booking-row-effect-1";

export function renderCoachBookingChanges() {
  synchronizeExpiredBookingRequests();
  synchronizeBookingRequestConflicts();
  renderCoachSlots();
  renderCoachBookingRequests();
  renderAvailabilityData();
  renderExceptionCalendarAvailability();
}
