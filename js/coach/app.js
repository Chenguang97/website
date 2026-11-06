import {
  addAvailability, cancelAvailabilityConflict, clearDragSelection,
  confirmAvailabilityConflictOverride, finishCalendarDrag,
  goToCurrentCalendarWeek, handleAvailabilitySlotAction, moveCalendarDrag,
  renderWeeklyAvailabilityViews, saveAvailabilityChanges,
  shiftCalendarWeek, startCalendarDrag, toggleCalendarHours,
} from "./availability/actions.js";
import {
  addBlockException, closeBlockTimeDialog, goToCurrentScheduleWeek,
  handleCoachBookingAction, openBlockTimeDialog, shiftScheduleWeek,
  toggleScheduleCalendarHours,
} from "./bookings/actions.js";
import { handleAvailabilityUndoKeydown } from "./availability/undo.js";
import { handleScheduleCalendarClick, removeCoachBookingFromDetails } from "./bookings/details-actions.js";
import { handleCoachBookingUndoKeydown } from "./bookings/undo.js";
import {
  handleCoachBookingFilterAction, handleCoachBookingStudentKeydown,
  handleCoachBookingStudentOutsideClick, openCoachBookingStudentSearch,
  searchCoachBookingStudents, switchCoachBookingPeriod,
} from "./bookings/controls.js";
import { initializeCoachScheduleDatePicker } from "./bookings/date-picker.js";
import {
  addLessonOption, addCustomSpecialty, closeCoachPhotoDialog, closeCustomSpecialtyEditor,
  closeLessonOptionEditor, confirmCoachPhoto, handleCoachPhotoDialogCancel,
  handleCoachPhotoFileChange, handleCoachBioInput, handleCoachTeachingDisciplinesChange,
  handleCoachSpecialtiesChange, handleCustomSpecialtyChange, handleCustomSpecialtyDelete,
  handleCustomSpecialtyKeydown, handleBasePriceInput, handleLessonOptionChange,
  handleLessonOptionClick, handleNewLessonDurationInput, handleNewLessonPriceInput,
  handleTravelConditionsInput, handleTravelPreferenceChange, previewServedRinksChange,
  saveCoachProfile, openCoachPhotoDialog, openLessonOptionEditor, toggleCustomSpecialtyEditor,
} from "./profile/actions.js";
import { handleProfileUndoKeydown, undoProfileChange } from "./profile/undo.js";
import { activeCoachPanelStorageKey } from "../core/config.js";
import { bookingDialogElements } from "../dom/booking-dialog-elements.js";
import { coachElements } from "../dom/coach-elements.js";
import {
  activateCoachPanel, selectCalendarRink, switchAvailabilitySection,
  switchBookingSection, switchCoachPanel, switchMethod,
} from "./navigation.js";
import {
  populateTimeSelects, renderDragCalendar, renderDropdownOpenSlots, syncEndTimeOptions,
} from "./availability/render.js";
import { renderExceptionDragCalendar } from "./bookings/calendar-render.js";
import { renderCoachPage } from "./render.js";
import { state } from "../core/state.js";
import { storageGetItem } from "../core/storage-adapter.js";
import { nextWeekdayIso, startOfWeekIso } from "../core/utils-data.js";

const elements = { ...coachElements, ...bookingDialogElements };

function bindCoachEvents() {
  elements.coachTabs.forEach((button) => button.addEventListener("click", switchCoachPanel));
  elements.methodButtons.forEach((button) => button.addEventListener("click", switchMethod));
  elements.availabilitySubtabs.forEach((button) => button.addEventListener("click", switchAvailabilitySection));
  elements.bookingSubtabs.forEach((button) => button.addEventListener("click", switchBookingSection));
  elements.coachBookingStudentTrigger.addEventListener("click", openCoachBookingStudentSearch);
  elements.coachBookingStudentSearch.addEventListener("input", searchCoachBookingStudents);
  elements.coachBookingPanel.addEventListener("click", handleCoachBookingFilterAction);
  document.addEventListener("keydown", handleCoachBookingStudentKeydown);
  document.addEventListener("click", handleCoachBookingStudentOutsideClick);
  elements.coachBookingPeriods.forEach((button) => button.addEventListener("click", switchCoachBookingPeriod));
  elements.coachProfileForm.addEventListener("submit", saveCoachProfile);
  elements.coachBio.addEventListener("input", handleCoachBioInput);
  elements.coachTeachingDisciplines.addEventListener("change", handleCoachTeachingDisciplinesChange);
  elements.coachSpecialtyOptions.addEventListener("change", handleCoachSpecialtiesChange);
  elements.toggleCustomSpecialty.addEventListener("click", toggleCustomSpecialtyEditor);
  elements.addCustomSpecialty.addEventListener("click", addCustomSpecialty);
  elements.cancelCustomSpecialty.addEventListener("click", closeCustomSpecialtyEditor);
  elements.customSpecialtyInput.addEventListener("keydown", handleCustomSpecialtyKeydown);
  elements.coachCustomSpecialties.addEventListener("change", handleCustomSpecialtyChange);
  elements.coachCustomSpecialties.addEventListener("click", handleCustomSpecialtyDelete);
  elements.openCoachPhotoDialog.addEventListener("click", openCoachPhotoDialog);
  elements.closeCoachPhotoDialog.addEventListener("click", closeCoachPhotoDialog);
  elements.cancelCoachPhotoDialog.addEventListener("click", closeCoachPhotoDialog);
  elements.coachPhotoDialogForm.addEventListener("submit", (event) => event.preventDefault());
  elements.coachPhotoDialog.addEventListener("cancel", handleCoachPhotoDialogCancel);
  elements.chooseCoachPhoto.addEventListener("click", () => {
    elements.coachPhotoFile.value = "";
    elements.coachPhotoFile.click();
  });
  elements.coachPhotoFile.addEventListener("change", handleCoachPhotoFileChange);
  elements.confirmCoachPhoto.addEventListener("click", confirmCoachPhoto);
  elements.openLessonOptionEditor.addEventListener("click", openLessonOptionEditor);
  elements.addLessonOption.addEventListener("click", addLessonOption);
  elements.cancelLessonOption.addEventListener("click", closeLessonOptionEditor);
  elements.lessonDuration.addEventListener("input", handleNewLessonDurationInput);
  elements.lessonPrice.addEventListener("input", handleNewLessonPriceInput);
  elements.lessonOptionsList.addEventListener("change", handleLessonOptionChange);
  elements.lessonOptionsList.addEventListener("click", handleLessonOptionClick);
  elements.undoProfileChange.addEventListener("click", undoProfileChange);
  elements.coachRate.addEventListener("input", handleBasePriceInput);
  elements.travelConditions.addEventListener("input", handleTravelConditionsInput);
  elements.servedRinkInputs.forEach((input) => input.addEventListener("change", previewServedRinksChange));
  elements.travelsToOtherRinks.addEventListener("change", handleTravelPreferenceChange);
  elements.availabilityForm.addEventListener("submit", addAvailability);
  elements.openBlockDialog.addEventListener("click", openBlockTimeDialog);
  elements.blockDialogForm.addEventListener("submit", addBlockException);
  elements.closeBlockDialog.addEventListener("click", closeBlockTimeDialog);
  elements.cancelBlockDialog.addEventListener("click", closeBlockTimeDialog);
  elements.cancelConflictOverride.addEventListener("click", cancelAvailabilityConflict);
  elements.confirmConflictOverride.addEventListener("click", confirmAvailabilityConflictOverride);
  elements.calendarRinkOptions.addEventListener("click", selectCalendarRink);
  elements.startTime.addEventListener("change", () => syncEndTimeOptions(elements.startTime, elements.endTime));
  elements.blockDialogStart.addEventListener("change", () => syncEndTimeOptions(elements.blockDialogStart, elements.blockDialogEnd));
  elements.toggleCalendarHours.addEventListener("click", toggleCalendarHours);
  elements.toggleExceptionCalendarHours.addEventListener("click", toggleScheduleCalendarHours);
  elements.previousCalendarWeek.addEventListener("click", () => shiftCalendarWeek(-1));
  elements.nextCalendarWeek.addEventListener("click", () => shiftCalendarWeek(1));
  elements.todayCalendarWeek.addEventListener("click", goToCurrentCalendarWeek);
  elements.previousScheduleWeek.addEventListener("click", () => shiftScheduleWeek(-1));
  elements.nextScheduleWeek.addEventListener("click", () => shiftScheduleWeek(1));
  elements.todayScheduleWeek.addEventListener("click", goToCurrentScheduleWeek);
  elements.slotDate.addEventListener("change", () => {
    elements.calendarWeekStart.value = startOfWeekIso(elements.slotDate.value);
    renderWeeklyAvailabilityViews();
    renderDropdownOpenSlots();
  });
  elements.calendarWeekStart.addEventListener("change", renderWeeklyAvailabilityViews);
  elements.coachSlots.addEventListener("click", handleCoachBookingAction);
  elements.dropdownOpenSlots.addEventListener("click", handleAvailabilitySlotAction);
  elements.saveAvailability.addEventListener("click", saveAvailabilityChanges);
  elements.exceptionDragCalendar.addEventListener("click", handleScheduleCalendarClick);
  elements.dragCalendar.addEventListener("pointerdown", startCalendarDrag);
  elements.dragCalendar.addEventListener("pointermove", moveCalendarDrag);
  elements.dragCalendar.addEventListener("pointerup", finishCalendarDrag);
  elements.dragCalendar.addEventListener("pointercancel", () => {
    state.dragState = null;
    clearDragSelection();
  });
  elements.closeBookingDetails.addEventListener("click", () => elements.bookingDetailsDialog.close());
  elements.removeBookingDetails.addEventListener("click", removeCoachBookingFromDetails);
  document.addEventListener("keydown", handleCoachUndoKeydown);
  window.addEventListener("beforeunload", (event) => {
    if (!state.hasUnsavedProfileChanges) return;
    event.preventDefault();
    event.returnValue = "";
  });
}

function handleCoachUndoKeydown(event) {
  if (document.documentElement.dataset.activeCoachPanel === "profilePanel") handleProfileUndoKeydown(event);
  else if (document.documentElement.dataset.activeCoachPanel === "bookingsPanel") handleCoachBookingUndoKeydown(event);
  else handleAvailabilityUndoKeydown(event);
}

export function initializeCoachApp() {
  populateTimeSelects();
  const initialDate = nextWeekdayIso();
  elements.slotDate.value = initialDate;
  elements.blockDialogDate.value = initialDate;
  elements.calendarWeekStart.value = startOfWeekIso(initialDate);
  elements.exceptionCalendarWeekStart.value = startOfWeekIso(initialDate);
  bindCoachEvents();
  initializeCoachScheduleDatePicker();
  activateCoachPanel(storageGetItem(activeCoachPanelStorageKey) || "profilePanel", false);
  renderDragCalendar();
  renderExceptionDragCalendar();
  renderCoachPage();
}

