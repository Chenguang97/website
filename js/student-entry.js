import { initializeStudentApp } from "./student/app.js";
import { activateStudentPanel } from "./student/navigation.js";
import { applyPublicProfileBookingContext } from "./profile-booking-context.js";
import { renderStudentFilterChips, renderStudentSlots, updateStudentFilterSummaries } from "./student/render.js";

initializeStudentApp();
applyPublicProfileBookingContext({
  activateStudentPanel,
  renderStudentFilterChips,
  renderStudentSlots,
  updateStudentFilterSummaries,
});
