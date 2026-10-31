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
  handleLessonOptionChange,
  handleLessonOptionClick,
  previewServedRinksChange,
  saveCoachPhoto,
  saveCoachProfile,
  setProfileDirty,
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
  handlePhotoFileChange,
  populateCoachSelects,
  populateTimeSelects,
  render,
  renderDragCalendar,
  renderDropdownOpenSlots,
  renderExceptionDragCalendar,
  renderStudentSlots,
  setCoachPhotoPreview,
  syncEndTimeOptions,
} from "./render.js";
import { state } from "./state.js";
import { storageGetItem } from "./storage-adapter.js";
import { handleGlobalKeydown } from "./undo.js";
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
  elements.coachPhotoForm.addEventListener("submit", saveCoachPhoto);
  elements.coachPhotoFile.addEventListener("change", handlePhotoFileChange);
  elements.coachPhotoUrl.addEventListener("input", () => {
    state.pendingPhotoDataUrl = "";
    elements.coachPhotoFile.value = "";
    setCoachPhotoPreview(elements.coachPhotoUrl.value.trim());
  });
  elements.addLessonOption.addEventListener("click", addLessonOption);
  elements.lessonOptionsList.addEventListener("change", handleLessonOptionChange);
  elements.lessonOptionsList.addEventListener("click", handleLessonOptionClick);
  elements.coachRate.addEventListener("input", () => setProfileDirty(true, "有未保存的更改。"));
  elements.travelFee.addEventListener("input", () => setProfileDirty(true, "有未保存的更改。"));
  elements.servedRinkInputs.forEach((input) => input.addEventListener("change", previewServedRinksChange));
  elements.travelsToOtherRinks.addEventListener("change", () => {
    elements.travelFeeLabel.classList.toggle("is-hidden", elements.travelsToOtherRinks.value !== "yes");
    setProfileDirty(true, "有未保存的更改。");
  });
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

function initializeApp() {
  const page = document.body.dataset.page;
  if (page === "coach") initializeCoachApp();
  else if (page === "student") initializeStudentApp();
  else if (page === "admin") initializeAdminApp();
}
