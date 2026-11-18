import { loadStudentCalendarWindow, refreshStudentCalendar, refreshStudentPage } from "./calendar-controller.js";
import { isStudentService } from "./service-data.js";
import { mountStudentService } from "./service-app.js";
import {
  applyStudentFilterPanel, handleStudentAction,
  handleStudentDateDraftChange, handleStudentDateOutsideClick,
} from "./actions.js";
import { confirmBooking, removeStudentBookingFromDetails, syncBookingForSelf } from "./booking-actions.js";
import { activeStudentPanelStorageKey } from "../core/config.js";
import { studentBookingElements } from "../dom/student-booking-elements.js";
import { bookingDetailsElements } from "../dom/booking-details-elements.js";
import { studentElements } from "../dom/student-elements.js";
import { activateStudentPanel, switchStudentPanel } from "./navigation.js";
import { renderStudentPage, renderStudentSlots } from "./render.js";
import { selectStudentDate } from "./view-state.js";
import { storageGetItem } from "../core/storage-adapter.js";
import { handleStudentUndoKeydown } from "./undo.js";
import { applyStudentBookingPreferences, renderStudentFilterControls, selectStudentLessonDuration, handleStudentFilterChange, handleStudentFilterOutsideClick, handleStudentFilterSearch, openStudentFilterPanel } from "./filter-controls.js";
import { createControlScope } from "../ui/control-lifecycle.js";
import { nextWeekdayIso } from "../core/utils-data.js";

const elements = studentElements;

function bindStudentEvents(scope) {
  const listen = (target, type, handler) => { if (target) scope.listen(target, type, handler); };
  elements.studentTabs.forEach((button) => listen(button, "click", switchStudentPanel));
  listen(elements.studentCoachFilterGroup, "change", handleStudentFilterChange);
  listen(elements.studentRinkFilterGroup, "change", handleStudentFilterChange);
  listen(elements.studentControls, "click", handleStudentAction);
  elements.studentFilterToggles.forEach((button) => listen(button, "click", applyStudentFilterPanel));
  listen(elements.studentCoachSearch, "focus", openStudentFilterPanel);
  listen(elements.studentCoachSearch, "click", openStudentFilterPanel);
  listen(elements.studentCoachSearch, "input", handleStudentFilterSearch);
  listen(elements.studentRinkSearch, "focus", openStudentFilterPanel);
  listen(elements.studentRinkSearch, "click", openStudentFilterPanel);
  listen(elements.studentRinkSearch, "input", handleStudentFilterSearch);
  listen(elements.studentDateFilter, "change", handleStudentDateDraftChange);
  listen(elements.studentLessonDurationFilter, "change", (event) => { selectStudentLessonDuration(event.target.value); refreshStudentCalendar(); });
  listen(elements.studentSlots, "click", handleStudentAction);
  listen(elements.studentDayAvailability, "click", handleStudentAction);
  listen(elements.studentSlotOptionsList, "click", handleStudentAction);
  listen(elements.studentOwnBookings, "click", handleStudentAction);
  listen(studentBookingElements.bookingForm, "submit", confirmBooking);
  listen(studentBookingElements.bookingForSelf, "change", syncBookingForSelf);
  listen(studentBookingElements.closeDialog, "click", () => studentBookingElements.bookingDialog.close());
  listen(elements.closeStudentSlotOptions, "click", () => elements.studentSlotOptionsDialog.close());
  listen(bookingDetailsElements.closeBookingDetails, "click", () => bookingDetailsElements.bookingDetailsDialog.close());
  listen(bookingDetailsElements.removeBookingDetails, "click", removeStudentBookingFromDetails);
  listen(document, "keydown", handleStudentUndoKeydown);
  listen(document, "click", handleStudentFilterOutsideClick);
  listen(document, "click", handleStudentDateOutsideClick);
}

let mounted = null;
let initialized = false;

// Mount owns subscriptions, not the student's selections or in-progress forms.
// Rebuilding subscriptions must not refresh/apply filters or discard date drafts.
export function initializeStudentApp() {
  if (mounted) return mounted;
  const scope = createControlScope();
  const controller = {
    destroy() {
      scope.destroy();
      if (mounted === controller) mounted = null;
    },
  };
  mounted = controller;
  bindStudentEvents(scope);
  if (isStudentService()) mountStudentService(scope, { renderPage: renderStudentPage, renderSlots: renderStudentSlots });
  if (initialized && isStudentService()) { void loadStudentCalendarWindow(); renderStudentPage(); }
  if (!initialized) {
    renderStudentFilterControls();
    if (isStudentService()) applyStudentBookingPreferences();
    const initialDate = nextWeekdayIso();
    elements.studentDateFilter.value = initialDate;
    selectStudentDate(initialDate);
    activateStudentPanel(storageGetItem(activeStudentPanelStorageKey) || "studentBookPanel", false);
    void loadStudentCalendarWindow();
    refreshStudentPage();
    initialized = true;
  }
  return controller;
}
