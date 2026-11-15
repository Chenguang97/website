import { initializeBookingViewMotion } from "./bookings/view-motion.js?v=booking-liquid-restored-1";
import { initializeBookingPeriodMotion } from "./bookings/period-motion.js?v=booking-period-liquid-1";
import { initializeAvailabilityMethodMotion } from "./availability/method-motion.js?v=confirmed-liquid-switch-1";
import { initializeCoachTabMotion } from "./tab-motion.js?v=coach-top-liquid-2";
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
} from "./bookings/actions.js?v=coach-booking-row-effect-1";
import { handleAvailabilityUndoKeydown } from "./availability/undo.js";
import { handleScheduleCalendarClick, removeCoachBookingFromDetails } from "./bookings/details-actions.js?v=coach-booking-row-effect-1";
import { handleCoachBookingUndoKeydown } from "./bookings/undo.js";
import {
  handleCoachBookingFilterAction, handleCoachBookingStudentKeydown,
  handleCoachBookingStudentOutsideClick, openCoachBookingStudentSearch,
  searchCoachBookingStudents, switchCoachBookingPeriod,
} from "./bookings/controls.js?v=coach-booking-row-effect-1";
import { initializeCoachScheduleDatePicker } from "./bookings/date-picker.js";
import {
  acceptCurrentCoachRequest, cancelCoachRequestProposal,
  counterCurrentCoachRequest, endCurrentCoachRequest, extendCurrentCoachRequest, filterCoachRequests,
  handleCoachRequestRecordClick, openCoachRequestProposal, openCoachRequestSection, openCoachRequestWorkspace, sendCoachRequestReply,
} from "./bookings/request-actions.js?v=coach-booking-row-effect-1";
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
} from "./navigation.js?v=confirmed-liquid-switch-1";
import {
  populateTimeSelects, renderDragCalendar, renderDropdownOpenSlots, syncEndTimeOptions,
} from "./availability/render.js";
import { renderExceptionDragCalendar } from "./bookings/calendar-render.js";
import { renderCoachPage } from "./render.js?v=coach-booking-row-effect-1";
import { state } from "../core/state.js";
import { synchronizeBookingRequestConflicts, synchronizeExpiredBookingRequests } from "../core/booking-requests.js";
import { refreshOpenCoachBookingRequest, renderCoachBookingRequests } from "./bookings/request-render.js?v=coach-booking-row-effect-1";
import { storageGetItem } from "../core/storage-adapter.js";
import { nextWeekdayIso, startOfWeekIso } from "../core/utils-data.js";
import { initializeInputModality } from "../ui/input-modality.js";

const elements = { ...coachElements, ...bookingDialogElements };

function bindCoachEvents() {
  elements.coachTabs.forEach((button) => button.addEventListener("click", switchCoachPanel));
  elements.methodButtons.forEach((button) => button.addEventListener("click", switchMethod));
  elements.availabilitySubtabs.forEach((button) => button.addEventListener("click", switchAvailabilitySection));
  elements.bookingSubtabs.forEach((button) => button.addEventListener("click", switchBookingSection));
  elements.coachRequestSectionTrigger.addEventListener("click", openCoachRequestSection);
  elements.coachBookingStudentTrigger.addEventListener("click", openCoachBookingStudentSearch);
  elements.coachBookingStudentSearch.addEventListener("input", searchCoachBookingStudents);
  elements.coachBookingPanel.addEventListener("click", handleCoachBookingFilterAction);
  document.addEventListener("keydown", handleCoachBookingStudentKeydown);
  document.addEventListener("click", handleCoachBookingStudentOutsideClick);
  elements.coachBookingPeriods.forEach((button) => button.addEventListener("click", switchCoachBookingPeriod));
  elements.coachPendingTrigger.addEventListener("click", () => openCoachRequestWorkspace());
  elements.coachRequestFilters.forEach((button) => button.addEventListener("click", filterCoachRequests));
  elements.coachRequestRecords.addEventListener("click", handleCoachRequestRecordClick);
  elements.bookingDetailsBody.addEventListener("click", handleCoachRequestRecordClick);
  elements.openCoachRequestProposal.addEventListener("click", openCoachRequestProposal);
  elements.cancelCoachRequestProposal.addEventListener("click", cancelCoachRequestProposal);
  elements.sendCoachRequestReply.addEventListener("click", sendCoachRequestReply);
  elements.coachRequestReply.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    sendCoachRequestReply();
  });
  elements.extendCoachRequest.addEventListener("click", extendCurrentCoachRequest);
  elements.endCoachRequest.addEventListener("click", endCurrentCoachRequest);
  elements.counterCoachRequest.addEventListener("click", counterCurrentCoachRequest);
  elements.acceptCoachRequest.addEventListener("click", acceptCurrentCoachRequest);
  elements.coachRequestForm.addEventListener("submit", (event) => event.preventDefault());
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
  window.addEventListener("focus", refreshCoachRequestState);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refreshCoachRequestState();
  });
}

function refreshCoachRequestState() {
  synchronizeExpiredBookingRequests();
  synchronizeBookingRequestConflicts();
  renderCoachBookingRequests();
  refreshOpenCoachBookingRequest();
}

function handleCoachUndoKeydown(event) {
  if (document.documentElement.dataset.activeCoachPanel === "profilePanel") handleProfileUndoKeydown(event);
  else if (document.documentElement.dataset.activeCoachPanel === "bookingsPanel") handleCoachBookingUndoKeydown(event);
  else handleAvailabilityUndoKeydown(event);
}

export function initializeCoachApp() {
  initializeInputModality();
  synchronizeExpiredBookingRequests();
  synchronizeBookingRequestConflicts();
  populateTimeSelects();
  const initialDate = nextWeekdayIso();
  elements.slotDate.value = initialDate;
  elements.blockDialogDate.value = initialDate;
  elements.calendarWeekStart.value = startOfWeekIso(initialDate);
  elements.exceptionCalendarWeekStart.value = startOfWeekIso(initialDate);
  initializeBookingViewMotion(elements.bookingSubtabs);
  initializeBookingPeriodMotion(elements.coachBookingPeriods);
  initializeAvailabilityMethodMotion(elements.methodButtons);
  initializeCoachTabMotion(elements.coachTabs);
  bindCoachEvents();
  initializeCoachScheduleDatePicker();
  activateCoachPanel(storageGetItem(activeCoachPanelStorageKey) || "profilePanel", false);
  renderDragCalendar();
  renderExceptionDragCalendar();
  renderCoachPage();
}

