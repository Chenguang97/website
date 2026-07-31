function bindEvents() {
  elements.modeButtons.forEach((button) => button.addEventListener("click", switchView));
  elements.coachTabs.forEach((button) => button.addEventListener("click", switchCoachPanel));
  elements.methodButtons.forEach((button) => button.addEventListener("click", switchMethod));
  elements.availabilitySubtabs.forEach((button) => button.addEventListener("click", switchAvailabilitySection));
  elements.bookingSubtabs.forEach((button) => button.addEventListener("click", switchBookingSection));
  elements.studentTabs.forEach((button) => button.addEventListener("click", switchStudentPanel));
  elements.coachProfileForm.addEventListener("submit", saveCoachProfile);
  elements.coachPhotoForm.addEventListener("submit", saveCoachPhoto);
  elements.coachPhotoFile.addEventListener("change", handlePhotoFileChange);
  elements.coachPhotoUrl.addEventListener("input", () => {
    pendingPhotoDataUrl = "";
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
  elements.studentDateFilter.addEventListener("change", renderStudentSlots);
  elements.calendarWeekStart.addEventListener("change", () => {
    renderWeeklyAvailabilityViews();
  });
  elements.exceptionCalendarWeekStart.addEventListener("change", renderExceptionDragCalendar);
  elements.coachSlots.addEventListener("click", handleSlotAction);
  elements.dropdownOpenSlots.addEventListener("click", handleSlotAction);
  elements.studentSlots.addEventListener("click", handleSlotAction);
  elements.studentSlotOptionsList?.addEventListener("click", handleSlotAction);
  elements.studentOwnBookings?.addEventListener("click", handleSlotAction);
  elements.saveAvailability.addEventListener("click", saveAvailabilityChanges);
  elements.exceptionDragCalendar.addEventListener("click", handleScheduleCalendarClick);
  elements.dragCalendar.addEventListener("pointerdown", startCalendarDrag);
  elements.dragCalendar.addEventListener("pointermove", moveCalendarDrag);
  elements.dragCalendar.addEventListener("pointerup", finishCalendarDrag);
  elements.dragCalendar.addEventListener("pointercancel", () => {
    dragState = null;
    clearDragSelection();
  });
  elements.bookingForm.addEventListener("submit", confirmBooking);
  elements.bookingNewSlot?.addEventListener("change", handleBookingNewSlotChange);
  elements.bookingForSelf?.addEventListener("change", syncBookingForSelf);
  elements.closeDialog.addEventListener("click", () => elements.bookingDialog.close());
  elements.closeStudentSlotOptions?.addEventListener("click", () => elements.studentSlotOptionsDialog.close());
  elements.closeBookingDetails.addEventListener("click", () => elements.bookingDetailsDialog.close());
  elements.removeBookingDetails.addEventListener("click", removeBookingFromDetails);
  elements.resetDemo.addEventListener("click", resetDemoData);
  document.addEventListener("keydown", handleGlobalKeydown);
  document.addEventListener("click", handleStudentFilterOutsideClick);
  window.addEventListener("beforeunload", (event) => {
    if (!hasUnsavedProfileChanges) return;
    event.preventDefault();
    event.returnValue = "";
  });
}

function init() {
  populateCoachSelects();
  populateTimeSelects();
  const initialDate = nextWeekdayIso();
  elements.slotDate.value = initialDate;
  elements.blockDialogDate.value = initialDate;
  elements.studentDateFilter.value = initialDate;
  elements.calendarWeekStart.value = startOfWeekIso(initialDate);
  elements.exceptionCalendarWeekStart.value = startOfWeekIso(initialDate);
  bindEvents();
  activateCoachPanel(localStorage.getItem(activeCoachPanelStorageKey) || "profilePanel", false);
  activateStudentPanel(storageGetItem(activeStudentPanelStorageKey) || "studentBookPanel", false);
  renderDragCalendar();
  renderExceptionDragCalendar();
  render();
}

init();
