import { adminElements } from "../dom/admin-elements.js";
import { state } from "../core/state.js";

export function renderAdminDashboard() {
  if (adminElements.adminBookedCount) {
    adminElements.adminBookedCount.textContent = state.slots.filter((slot) => slot.booked).length;
  }
}
