import { receiveCoachBookingChanges } from "./bookings/refresh.js";
import { initializeCoachServiceController, coachUsesService, coachCanManage, refreshCoachService } from "./service-controller.js";
import { undoRemoteCoachBooking, updateRemoteUndoButton } from "./bookings/service-commands.js";
import { renderCoachRinkDirectory } from "./profile/rink-directory.js";
import { renderCoachHeaderSave } from "./header-status.js";
import { createControlScope } from "../ui/control-lifecycle.js";
import { readAvailabilityChanges, readProfileState } from "../core/state.js";
import { synchronizeCoachBookingRequests } from "./bookings/request-sync.js";
import { clearCalendarFeedback } from "./availability/status.js";
import { initializeTimePickers } from "../ui/time-picker.js";
import { initializeAvailabilityWeekPicker } from "./availability/week-navigation.js";
import { initializeCoachWelcome } from "./welcome.js";
import { initializeOpenCalendarOperations, cancelOpenCalendarInteraction } from "./availability/calendar-operations.js";
import { initializeBookingViewMotion } from "./bookings/view-motion.js";
import { initializeBookingPeriodMotion } from "./bookings/period-motion.js";
import { initializeAvailabilityMethodMotion } from "./availability/method-motion.js";
import { initializeCoachTabMotion } from "./tab-motion.js";
import {
  goToCurrentCalendarWeek, handleAvailabilityWeekInput,
  renderWeeklyAvailabilityViews, saveAvailabilityChanges,
  shiftCalendarWeek, toggleCalendarHours,
} from "./availability/actions.js";
import {
  addBlockException, clearBlockTimeDialogErrors, closeBlockTimeDialog, goToCurrentScheduleWeek,
  handleCoachBookingAction, openBlockTimeDialog, shiftScheduleWeek,
  toggleScheduleCalendarHours,
} from "./bookings/actions.js";
import { handleAvailabilityUndoKeydown } from "./availability/undo.js";
import { handleScheduleCalendarClick, removeCoachBookingFromDetails } from "./bookings/details-actions.js";
import { handleCoachBookingUndoKeydown } from "./bookings/undo.js";
import {
  handleCoachBookingFilterAction, handleCoachBookingStudentKeydown,
  handleCoachBookingStudentOutsideClick, openCoachBookingStudentSearch,
  searchCoachBookingStudents, switchCoachBookingPeriod, repositionCoachBookingStudentPicker,
} from "./bookings/controls.js";
import { initializeCoachScheduleDatePicker } from "./bookings/date-picker.js";
import {
  acceptCurrentCoachRequest, cancelCoachRequestProposal,
  counterCurrentCoachRequest, endCurrentCoachRequest, extendCurrentCoachRequest, filterCoachRequests,
  handleCoachRequestRecordClick, openCoachRequestOriginalBooking, openCoachRequestProposal, openCoachRequestSection, openCoachRequestWorkspace, returnToCurrentCoachRequests, sendCoachRequestReply,
} from "./bookings/request-actions.js";
import { addLessonOption, closeLessonOptionEditor, handleLessonOptionChange, handleLessonOptionClick,
  handleBasePriceInput, handleNewLessonDurationInput, handleNewLessonPriceInput, openLessonOptionEditor } from "./profile/lesson-controller.js";
import { initializeCoachPhotoController, closeCoachPhotoDialog, confirmCoachPhoto, handleCoachPhotoDialogCancel,
  handleCoachPhotoFileChange, openCoachPhotoDialog } from "./profile/photo-controller.js";
import { refreshCoachProfileFromService, addCustomSpecialty, closeCustomSpecialtyEditor, handleCoachBioInput, handleCoachTeachingDisciplinesChange,
  handleCoachSpecialtiesChange, handleCustomSpecialtyChange, handleCustomSpecialtyDelete, handleCustomSpecialtyKeydown,
  handleTravelConditionsInput, handleTravelPreferenceChange, previewServedRinksChange, toggleCustomSpecialtyEditor } from "./profile/fields-controller.js";
import { saveCoachProfile } from "./profile/save-controller.js";
import { handleProfileUndoKeydown, undoProfileChange } from "./profile/undo.js";
import { activeCoachPanelStorageKey } from "../core/config.js";
import { bookingDetailsElements } from "../dom/booking-details-elements.js";
import { coachElements } from "../dom/coach-elements.js";
import {
  activateCoachPanel, openCoachBookingRecords, selectCalendarRink, switchAvailabilitySection,
  switchBookingSection, switchCoachPanel, switchMethod,
} from "./navigation.js";
import {
  populateTimeSelects, renderDragCalendar, syncEndTimeOptions,
} from "./availability/render.js";
import { renderExceptionDragCalendar } from "./bookings/calendar-render.js";
import { renderCoachPage } from "./render.js";
import { receiveCoachBookingRequests } from "./bookings/request-editor.js";
import { storageGetItem } from "../core/storage-adapter.js";
import { nextWeekdayIso, startOfWeekIso } from "../core/utils-data.js";
import { initializeInputModality } from "../ui/input-modality.js";
import { previewCoachSavedProfile, saveCoachHeaderChanges } from "./header-actions.js";
import { initializeCoachSaveToolbarLayout } from "./save-toolbar-layout.js";
import { initializeCoachBookingListLayout } from "./bookings/list-layout.js";
import { initializeSchedulingPlanner } from "./availability/planner-actions.js";


const elements = coachElements;

function bindCoachEvents(scope) {
  scope.listen(elements.saveProfileChanges, "click", saveCoachHeaderChanges);
  scope.listen(elements.previewCoachProfile, "click", previewCoachSavedProfile);
  elements.coachTabs.forEach((button) => scope.listen(button, "click", (event) => { cancelOpenCalendarInteraction(); switchCoachPanel(event); }));
  elements.methodButtons.forEach((button) => scope.listen(button, "click", (event) => { cancelOpenCalendarInteraction(); switchMethod(event); }));
  elements.availabilitySubtabs.forEach((button) => scope.listen(button, "click", switchAvailabilitySection));
  elements.bookingSubtabs.forEach((button) => scope.listen(button, "click", switchBookingSection));
  scope.listen(elements.coachRequestSectionTrigger, "click", openCoachRequestSection);
  scope.listen(elements.coachBookingRecordsTrigger, "click", openCoachBookingRecords);
  scope.listen(elements.coachBookingStudentTrigger, "click", openCoachBookingStudentSearch);
  scope.listen(elements.coachBookingStudentSearch, "input", searchCoachBookingStudents);
  scope.listen(elements.coachBookingPanel, "click", handleCoachBookingFilterAction);
  scope.listen(document, "keydown", handleCoachBookingStudentKeydown);
  scope.listen(document, "click", handleCoachBookingStudentOutsideClick);
  scope.listen(window, "resize", repositionCoachBookingStudentPicker);
  scope.listen(document, "scroll", repositionCoachBookingStudentPicker, { capture: true, passive: true });
  elements.coachBookingPeriods.forEach((button) => scope.listen(button, "click", switchCoachBookingPeriod));
  scope.listen(elements.coachPendingTrigger, "click", () => openCoachRequestWorkspace());
  elements.coachRequestFilters.forEach((button) => scope.listen(button, "click", filterCoachRequests));
  scope.listen(elements.coachRequestReturnCurrent, "click", returnToCurrentCoachRequests);
  scope.listen(elements.coachRequestRecords, "click", handleCoachRequestRecordClick);
  scope.listen(elements.coachRequestSummary, "click", openCoachRequestOriginalBooking);
  scope.listen(bookingDetailsElements.bookingDetailsBody, "click", handleCoachRequestRecordClick);
  scope.listen(elements.openCoachRequestProposal, "click", openCoachRequestProposal);
  scope.listen(elements.cancelCoachRequestProposal, "click", cancelCoachRequestProposal);
  scope.listen(elements.sendCoachRequestReply, "click", sendCoachRequestReply);
  scope.listen(elements.coachRequestReply, "keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    sendCoachRequestReply();
  });
  scope.listen(elements.extendCoachRequest, "click", extendCurrentCoachRequest);
  scope.listen(elements.endCoachRequest, "click", endCurrentCoachRequest);
  scope.listen(elements.counterCoachRequest, "click", counterCurrentCoachRequest);
  scope.listen(elements.acceptCoachRequest, "click", acceptCurrentCoachRequest);
  scope.listen(elements.coachRequestForm, "submit", (event) => event.preventDefault());
  scope.listen(elements.coachProfileForm, "submit", saveCoachProfile);
  scope.listen(elements.coachBio, "input", handleCoachBioInput);
  scope.listen(elements.coachTeachingDisciplines, "change", handleCoachTeachingDisciplinesChange);
  scope.listen(elements.coachSpecialtyOptions, "change", handleCoachSpecialtiesChange);
  scope.listen(elements.toggleCustomSpecialty, "click", toggleCustomSpecialtyEditor);
  scope.listen(elements.addCustomSpecialty, "click", addCustomSpecialty);
  scope.listen(elements.cancelCustomSpecialty, "click", closeCustomSpecialtyEditor);
  scope.listen(elements.customSpecialtyInput, "keydown", handleCustomSpecialtyKeydown);
  scope.listen(elements.coachCustomSpecialties, "change", handleCustomSpecialtyChange);
  scope.listen(elements.coachCustomSpecialties, "click", handleCustomSpecialtyDelete);
  scope.listen(elements.openCoachPhotoDialog, "click", openCoachPhotoDialog);
  scope.listen(elements.closeCoachPhotoDialog, "click", closeCoachPhotoDialog);
  scope.listen(elements.cancelCoachPhotoDialog, "click", closeCoachPhotoDialog);
  scope.listen(elements.coachPhotoDialogForm, "submit", (event) => event.preventDefault());
  scope.listen(elements.coachPhotoDialog, "cancel", handleCoachPhotoDialogCancel);
  scope.listen(elements.chooseCoachPhoto, "click", () => {
    elements.coachPhotoFile.value = "";
    elements.coachPhotoFile.click();
  });
  scope.listen(elements.coachPhotoFile, "change", handleCoachPhotoFileChange);
  scope.listen(elements.confirmCoachPhoto, "click", confirmCoachPhoto);
  scope.listen(elements.openLessonOptionEditor, "click", openLessonOptionEditor);
  scope.listen(elements.addLessonOption, "click", addLessonOption);
  scope.listen(elements.cancelLessonOption, "click", closeLessonOptionEditor);
  scope.listen(elements.lessonDuration, "input", handleNewLessonDurationInput);
  scope.listen(elements.lessonPrice, "input", handleNewLessonPriceInput);
  scope.listen(elements.lessonOptionsList, "change", handleLessonOptionChange);
  scope.listen(elements.lessonOptionsList, "click", handleLessonOptionClick);
  scope.listen(elements.undoProfileChange, "click", undoProfileChange);
  scope.listen(elements.coachRate, "input", handleBasePriceInput);
  scope.listen(elements.travelConditions, "input", handleTravelConditionsInput);
  scope.listen(document.getElementById("servedRinks"), "change", previewServedRinksChange);
  scope.listen(elements.travelsToOtherRinks, "change", handleTravelPreferenceChange);
  scope.listen(elements.openBlockDialog, "click", openBlockTimeDialog);
  scope.listen(elements.blockDialogForm, "submit", addBlockException);
  scope.listen(elements.closeBlockDialog, "click", closeBlockTimeDialog);
  scope.listen(elements.cancelBlockDialog, "click", closeBlockTimeDialog);
  scope.listen(elements.calendarRinkOptions, "click", selectCalendarRink);
  scope.listen(elements.calendarUnavailableTool, "click", selectCalendarRink);
  scope.listen(elements.blockDialogStart, "change", () => syncEndTimeOptions(elements.blockDialogStart, elements.blockDialogEnd));
  [elements.blockDialogDate, elements.blockDialogStart, elements.blockDialogEnd].forEach((field) => {
    scope.listen(field, "input", clearBlockTimeDialogErrors);
    scope.listen(field, "change", clearBlockTimeDialogErrors);
  });
  scope.listen(elements.toggleCalendarHours, "click", toggleCalendarHours);
  scope.listen(elements.toggleExceptionCalendarHours, "click", toggleScheduleCalendarHours);
  scope.listen(elements.previousCalendarWeek, "click", () => shiftCalendarWeek(-1));
  scope.listen(elements.nextCalendarWeek, "click", () => shiftCalendarWeek(1));
  scope.listen(elements.todayCalendarWeek, "click", goToCurrentCalendarWeek);
  scope.listen(elements.previousScheduleWeek, "click", () => shiftScheduleWeek(-1));
  scope.listen(elements.nextScheduleWeek, "click", () => shiftScheduleWeek(1));
  scope.listen(elements.todayScheduleWeek, "click", goToCurrentScheduleWeek);
  scope.listen(elements.calendarWeekStart, "change", handleAvailabilityWeekInput);
  scope.listen(elements.coachSlots, "click", handleCoachBookingAction);
  scope.listen(elements.saveAvailability, "click", saveAvailabilityChanges);
  scope.listen(elements.exceptionDragCalendar, "click", handleScheduleCalendarClick);
  scope.listen(bookingDetailsElements.closeBookingDetails, "click", () => bookingDetailsElements.bookingDetailsDialog.close());
  scope.listen(bookingDetailsElements.removeBookingDetails, "click", removeCoachBookingFromDetails);
  scope.listen(document, "keydown", handleCoachUndoKeydown);
  scope.listen(window, "beforeunload", (event) => {
    if (!readProfileState().dirty && !readAvailabilityChanges().dirty) return;
    event.preventDefault();
    event.returnValue = "";
  });
  scope.listen(window, "focus", refreshCoachRequestState);
  scope.listen(document, "visibilitychange", () => {
    if (document.visibilityState === "visible") refreshCoachRequestState();
  });
}

function refreshCoachRequestState() {
  if (coachUsesService()) return refreshCoachService();
  synchronizeCoachBookingRequests();
  receiveCoachBookingRequests();
}

function handleCoachUndoKeydown(event) {
  if (document.documentElement.dataset.activeCoachPanel === "profilePanel") handleProfileUndoKeydown(event);
  else if (document.documentElement.dataset.activeCoachPanel === "bookingsPanel") handleCoachBookingUndoKeydown(event);
  else handleAvailabilityUndoKeydown(event);
}

// Mounted views receive confirmed owner facts, never retired operation callbacks.
function receiveCoachServiceFacts() {
  receiveCoachBookingChanges();
  refreshCoachProfileFromService();
  initializeCoachWelcome().refresh();
  renderCoachHeaderSave();
  updateRemoteUndoButton();
}

let appController = null;
let inputsInitialized = false;

export function initializeCoachApp() {
  if (appController) return appController;
  const scope = createControlScope();
  let destroyed = false;
  function own(controller) {
    if (controller?.destroy) scope.add(() => controller.destroy());
    return controller;
  }
  const initialMount = !inputsInitialized;
  own(initializeCoachServiceController(receiveCoachServiceFacts));
  scope.listen(document.getElementById('coachRemoteUndo'), 'click', undoRemoteCoachBooking);
  if (initialMount) renderCoachRinkDirectory();
  if (!coachCanManage()) {
    elements.coachTabs.forEach(button => { if (button.dataset.coachPanel !== 'profilePanel') { button.disabled = true; button.setAttribute('aria-disabled', 'true'); } });
    elements.coachPendingTrigger.hidden = true;
    const status = document.getElementById('coachServiceMessage');
    if (status) status.textContent = '申请待审核 · 目前仅可完善本人资料。审核状态变化后请刷新并重新载入。';
  }
  own(initializeTimePickers());
  own(initializeCoachWelcome());
  own(initializeInputModality());
  synchronizeCoachBookingRequests();
  if (!inputsInitialized) populateTimeSelects();
  const initialDate = nextWeekdayIso();
  if (!inputsInitialized) elements.blockDialogDate.value = initialDate;
  if (!inputsInitialized) elements.calendarWeekStart.value = startOfWeekIso(initialDate);
  if (!inputsInitialized) elements.exceptionCalendarWeekStart.value = startOfWeekIso(initialDate);
  own(initializeBookingViewMotion(elements.bookingSubtabs));
  own(initializeBookingPeriodMotion(elements.coachBookingPeriods));
  own(initializeAvailabilityMethodMotion(elements.methodButtons));
  own(initializeCoachTabMotion(elements.coachTabs));
  own(initializeCoachPhotoController());
  bindCoachEvents(scope);
  own(initializeSchedulingPlanner());
  own(initializeOpenCalendarOperations());
  own(initializeCoachScheduleDatePicker());
  own(initializeAvailabilityWeekPicker(renderWeeklyAvailabilityViews));
  if (initialMount) {
    activateCoachPanel(storageGetItem(activeCoachPanelStorageKey) || "profilePanel", false);
    receiveCoachBookingRequests();
    renderCoachPage({ buildCalendars: true });
  }
  own(initializeCoachSaveToolbarLayout());
  own(initializeCoachBookingListLayout());
  if (!initialMount && coachUsesService()) receiveCoachServiceFacts();
  inputsInitialized = true;
  appController = {
    destroy() {
      if (destroyed) return;
      destroyed = true;
      scope.destroy();
      // Native modal surfaces close at teardown; their unsubmitted values remain
      // in the same DOM and no business action is submitted by closing them.
      for (const dialog of [elements.blockDialog, bookingDetailsElements.bookingDetailsDialog]) {
        if (dialog?.open) dialog.close();
      }
      clearCalendarFeedback();
      appController = null;
    },
  };
  return appController;
}
