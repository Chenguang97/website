import { adminElements } from "../dom/admin-elements.js";
import { readScheduleState } from "../core/state.js";
import { coaches, rinks } from "../core/config.js";

export function renderAdminDashboard() {
  const slots = readScheduleState().slots;
  const booked = slots.filter(slot => slot.booked && !/cancel/i.test(String(slot.status || ""))).length;
  for (const [name, value] of Object.entries({ adminBookedCount: booked, bookedCount: booked,
    availableCount: slots.filter(slot => !slot.booked).length, adminCoachCount: coaches.length, adminRinkCount: rinks.length })) {
    if (adminElements[name]) adminElements[name].textContent = value;
  }
}
