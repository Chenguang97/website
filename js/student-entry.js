import { initializeStudentApp } from "./app-init.js";
import { activateStudentPanel } from "./navigation.js";
import { applyPublicProfileBookingContext } from "./profile-booking-context.js";
import { renderStudentFilterChips, renderStudentSlots, updateStudentFilterSummaries } from "./render.js";

initializeStudentApp();
applyPublicProfileBookingContext({
  activateStudentPanel,
  renderStudentFilterChips,
  renderStudentSlots,
  updateStudentFilterSummaries,
});
