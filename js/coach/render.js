import { state } from "../core/state.js";
import { slotSort } from "../domain/scheduling.mjs";
import {
  renderAvailabilityStats,
  renderCalendarAvailability,
  renderDropdownOpenSlots,
  renderDropdownWeekSlots,
  syncLocationOptions,
} from "./availability/render.js";
import { renderExceptionCalendarAvailability } from "./bookings/calendar-render.js";
import { renderCoachSlots } from "./bookings/render.js";
import { renderCoachProfile } from "./profile/render.js";

export function renderCoachPage() {
  state.slots.sort(slotSort);
  renderCoachProfile();
  syncLocationOptions();
  renderCoachSlots();
  renderAvailabilityStats();
  renderDropdownOpenSlots();
  renderDropdownWeekSlots();
  renderCalendarAvailability();
  renderExceptionCalendarAvailability();
}
