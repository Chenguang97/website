import {
  applyStudentFilterPanel, handleBookingNewSlotChange, handleStudentAction,
  handleStudentDateDraftChange, handleStudentDateOutsideClick, handleStudentFilterChange,
  handleStudentFilterOutsideClick, handleStudentFilterSearch, openStudentFilterPanel,
} from "./actions.js";
import { confirmBooking, removeStudentBookingFromDetails, syncBookingForSelf } from "./booking-actions.js";
import { activeStudentPanelStorageKey } from "../core/config.js";
import { bookingDialogElements } from "../dom/booking-dialog-elements.js";
import { studentElements } from "../dom/student-elements.js";
import { activateStudentPanel, switchStudentPanel } from "./navigation.js";
import { populateCoachSelects, renderStudentPage, renderStudentSlots } from "./render.js";
import { state } from "../core/state.js";
import { storageGetItem } from "../core/storage-adapter.js";
import { handleStudentUndoKeydown } from "./undo.js";
import { nextWeekdayIso } from "../core/utils-data.js";

const elements = { ...studentElements, ...bookingDialogElements };

function bindStudentEvents() {
  elements.studentTabs.forEach((button) => button.addEventListener("click", switchStudentPanel));
  elements.studentCoachFilterGroup?.addEventListener("change", handleStudentFilterChange);
  elements.studentRinkFilterGroup?.addEventListener("change", handleStudentFilterChange);
  elements.studentControls?.addEventListener("click", handleStudentAction);
  elements.studentFilterToggles.forEach((button) => button.addEventListener("click", applyStudentFilterPanel));
  elements.studentCoachSearch?.addEventListener("focus", openStudentFilterPanel);
  elements.studentCoachSearch?.addEventListener("click", openStudentFilterPanel);
  elements.studentCoachSearch?.addEventListener("input", handleStudentFilterSearch);
  elements.studentRinkSearch?.addEventListener("focus", openStudentFilterPanel);
  elements.studentRinkSearch?.addEventListener("click", openStudentFilterPanel);
  elements.studentRinkSearch?.addEventListener("input", handleStudentFilterSearch);
  elements.studentDateFilter.addEventListener("change", handleStudentDateDraftChange);
  elements.studentLessonDurationFilter?.addEventListener("change", renderStudentSlots);
  elements.studentSlots.addEventListener("click", handleStudentAction);
  elements.studentDayAvailability?.addEventListener("click", handleStudentAction);
  elements.studentSlotOptionsList?.addEventListener("click", handleStudentAction);
  elements.studentOwnBookings?.addEventListener("click", handleStudentAction);
  elements.bookingForm.addEventListener("submit", confirmBooking);
  elements.bookingNewSlot?.addEventListener("change", handleBookingNewSlotChange);
  elements.bookingForSelf?.addEventListener("change", syncBookingForSelf);
  elements.closeDialog.addEventListener("click", () => elements.bookingDialog.close());
  elements.closeStudentSlotOptions?.addEventListener("click", () => elements.studentSlotOptionsDialog.close());
  elements.closeBookingDetails.addEventListener("click", () => elements.bookingDetailsDialog.close());
  elements.removeBookingDetails.addEventListener("click", removeStudentBookingFromDetails);
  document.addEventListener("keydown", handleStudentUndoKeydown);
  document.addEventListener("click", handleStudentFilterOutsideClick);
  document.addEventListener("click", handleStudentDateOutsideClick);
}

export function initializeStudentApp() {
  populateCoachSelects();
  const initialDate = nextWeekdayIso();
  elements.studentDateFilter.value = initialDate;
  state.studentSelectedDate = initialDate;
  bindStudentEvents();
  activateStudentPanel(storageGetItem(activeStudentPanelStorageKey) || "studentBookPanel", false);
  renderStudentPage();
}

