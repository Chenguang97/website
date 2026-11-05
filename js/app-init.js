import {
  addAvailability,
  addBlockException,
  applyStudentFilterPanel,
  cancelAvailabilityConflict,
  clearDragSelection,
  closeBlockTimeDialog,
  confirmAvailabilityConflictOverride,
  finishCalendarDrag,
  goToCurrentCalendarWeek,
  goToCurrentScheduleWeek,
  handleBookingNewSlotChange,
  handleSlotAction,
  handleStudentDateDraftChange,
  handleStudentDateOutsideClick,
  handleStudentFilterChange,
  handleStudentFilterOutsideClick,
  handleStudentFilterSearch,
  moveCalendarDrag,
  openBlockTimeDialog,
  openStudentFilterPanel,
  renderWeeklyAvailabilityViews,
  saveAvailabilityChanges,
  shiftCalendarWeek,
  shiftScheduleWeek,
  startCalendarDrag,
  toggleCalendarHours,
  toggleExceptionCalendarHours,
} from "./actions.js";
import { confirmBooking, handleScheduleCalendarClick, removeBookingFromDetails, syncBookingForSelf } from "./booking-actions.js";
import {
  addLessonOption,
  addCustomSpecialty,
  closeCoachPhotoDialog,
  closeCustomSpecialtyEditor,
  closeLessonOptionEditor,
  confirmCoachPhoto,
  handleCoachPhotoDialogCancel,
  handleCoachPhotoFileChange,
  handleCoachBioInput,
  handleCoachTeachingDisciplinesChange,
  handleCoachSpecialtiesChange,
  handleCustomSpecialtyChange,
  handleCustomSpecialtyDelete,
  handleCustomSpecialtyKeydown,
  handleBasePriceInput,
  handleLessonOptionChange,
  handleLessonOptionClick,
  handleNewLessonDurationInput,
  handleNewLessonPriceInput,
  handleTravelConditionsInput,
  handleTravelPreferenceChange,
  previewServedRinksChange,
  saveCoachProfile,
  openCoachPhotoDialog,
  openLessonOptionEditor,
  toggleCustomSpecialtyEditor,
} from "./coach-profile-actions.js";
import { activeCoachPanelStorageKey, activeStudentPanelStorageKey } from "./config.js";
import { elements } from "./elements.js";
import {
  activateCoachPanel,
  activateStudentPanel,
  handleCoachBookingFilterAction,
  resetDemoData,
  searchCoachBookingStudents,
  selectCalendarRink,
  selectCoachBookingStudent,
  switchAvailabilitySection,
  switchBookingSection,
  switchCoachBookingPeriod,
  switchCoachPanel,
  switchMethod,
  switchStudentPanel,
} from "./navigation.js";
import {
  populateCoachSelects,
  populateTimeSelects,
  render,
  renderDragCalendar,
  renderDropdownOpenSlots,
  renderExceptionDragCalendar,
  renderStudentSlots,
  syncEndTimeOptions,
} from "./render.js";
import { state } from "./state.js";
import { storageGetItem } from "./storage-adapter.js";
import { handleGlobalKeydown, undoLastChange } from "./undo.js";
import { nextWeekdayIso, startOfWeekIso } from "./utils-data.js";

function bindCoachEvents() {
  elements.coachTabs.forEach((button) => button.addEventListener("click", switchCoachPanel));
  elements.methodButtons.forEach((button) => button.addEventListener("click", switchMethod));
  elements.availabilitySubtabs.forEach((button) => button.addEventListener("click", switchAvailabilitySection));
  elements.bookingSubtabs.forEach((button) => button.addEventListener("click", switchBookingSection));
  elements.coachBookingStudentSearch?.addEventListener("input", searchCoachBookingStudents);
  elements.coachBookingStudentFilter?.addEventListener("change", selectCoachBookingStudent);
  elements.coachBookingPanel?.addEventListener("click", handleCoachBookingFilterAction);
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
  elements.undoProfileChange.addEventListener("click", undoLastChange);
  elements.coachRate.addEventListener("input", handleBasePriceInput);
  elements.travelConditions.addEventListener("input", handleTravelConditionsInput);
  elements.servedRinkInputs.forEach((input) => input.addEventListener("change", previewServedRinksChange));
  elements.travelsToOtherRinks.addEventListener("change", handleTravelPreferenceChange);
  elements.availabilityForm.addEventListener("submit", addAvailability);
  elements.openBlockDialog.addEventListener("click", openBlockTimeDialog);
  elements.blockDialogForm.addEventListener("submit", addBlockException);
  elements.closeBlockDialog.addEventListener("click", closeBlockTimeDialog);
  elements.cancelBlockDialog.addEventListener("click", closeBlockTimeDialog);
  elements.cancelConflictOverride?.addEventListener("click", cancelAvailabilityConflict);
  elements.confirmConflictOverride?.addEventListener("click", confirmAvailabilityConflictOverride);
  elements.calendarRinkOptions.addEventListener("click", selectCalendarRink);
  elements.startTime.addEventListener("change", () => syncEndTimeOptions(elements.startTime, elements.endTime));
  elements.blockDialogStart.addEventListener("change", () => syncEndTimeOptions(elements.blockDialogStart, elements.blockDialogEnd));
  elements.toggleCalendarHours.addEventListener("click", toggleCalendarHours);
  elements.toggleExceptionCalendarHours.addEventListener("click", toggleExceptionCalendarHours);
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
  elements.exceptionCalendarWeekStart.addEventListener("change", renderExceptionDragCalendar);
  elements.coachSlots.addEventListener("click", handleSlotAction);
  elements.dropdownOpenSlots.addEventListener("click", handleSlotAction);
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
  elements.removeBookingDetails.addEventListener("click", removeBookingFromDetails);
  document.addEventListener("keydown", handleGlobalKeydown);
  window.addEventListener("beforeunload", (event) => {
    if (!state.hasUnsavedProfileChanges) return;
    event.preventDefault();
    event.returnValue = "";
  });
}

function bindStudentEvents() {
  elements.studentTabs.forEach((button) => button.addEventListener("click", switchStudentPanel));
  elements.studentCoachFilterGroup?.addEventListener("change", handleStudentFilterChange);
  elements.studentRinkFilterGroup?.addEventListener("change", handleStudentFilterChange);
  elements.studentControls?.addEventListener("click", handleSlotAction);
  elements.studentFilterToggles.forEach((button) => button.addEventListener("click", applyStudentFilterPanel));
  elements.studentCoachSearch?.addEventListener("focus", openStudentFilterPanel);
  elements.studentCoachSearch?.addEventListener("click", openStudentFilterPanel);
  elements.studentCoachSearch?.addEventListener("input", handleStudentFilterSearch);
  elements.studentRinkSearch?.addEventListener("focus", openStudentFilterPanel);
  elements.studentRinkSearch?.addEventListener("click", openStudentFilterPanel);
  elements.studentRinkSearch?.addEventListener("input", handleStudentFilterSearch);
  elements.studentDateFilter.addEventListener("change", handleStudentDateDraftChange);
  elements.studentLessonDurationFilter?.addEventListener("change", renderStudentSlots);
  elements.studentSlots.addEventListener("click", handleSlotAction);
  elements.studentDayAvailability?.addEventListener("click", handleSlotAction);
  elements.studentSlotOptionsList?.addEventListener("click", handleSlotAction);
  elements.studentOwnBookings?.addEventListener("click", handleSlotAction);
  elements.bookingForm.addEventListener("submit", confirmBooking);
  elements.bookingNewSlot?.addEventListener("change", handleBookingNewSlotChange);
  elements.bookingForSelf?.addEventListener("change", syncBookingForSelf);
  elements.closeDialog.addEventListener("click", () => elements.bookingDialog.close());
  elements.closeStudentSlotOptions?.addEventListener("click", () => elements.studentSlotOptionsDialog.close());
  elements.closeBookingDetails.addEventListener("click", () => elements.bookingDetailsDialog.close());
  elements.removeBookingDetails.addEventListener("click", removeBookingFromDetails);
  document.addEventListener("keydown", handleGlobalKeydown);
  document.addEventListener("click", handleStudentFilterOutsideClick);
  document.addEventListener("click", handleStudentDateOutsideClick);
}

function bindAdminEvents() {
  elements.resetDemo.addEventListener("click", resetDemoData);
}

export function initializeCoachApp() {
  populateTimeSelects();
  const initialDate = nextWeekdayIso();
  elements.slotDate.value = initialDate;
  elements.blockDialogDate.value = initialDate;
  elements.calendarWeekStart.value = startOfWeekIso(initialDate);
  elements.exceptionCalendarWeekStart.value = startOfWeekIso(initialDate);
  bindCoachEvents();
  activateCoachPanel(storageGetItem(activeCoachPanelStorageKey) || "profilePanel", false);
  renderDragCalendar();
  renderExceptionDragCalendar();
  render();
}

export function initializeStudentApp() {
  populateCoachSelects();
  const initialDate = nextWeekdayIso();
  elements.studentDateFilter.value = initialDate;
  state.studentSelectedDate = initialDate;
  bindStudentEvents();
  activateStudentPanel(storageGetItem(activeStudentPanelStorageKey) || "studentBookPanel", false);
  render();
}

export function initializeAdminApp() {
  bindAdminEvents();
  render();
}
