function addAvailability(event) {
  event.preventDefault();
  const startMinutes = minutesFromTime(elements.startTime.value);
  const endMinutes = minutesFromTime(elements.endTime.value);
  const lesson = getAvailabilityLesson();

  if (endMinutes <= startMinutes) {
    showFormMessage("结束时间需要晚于开始时间。", true);
    return;
  }

  if (endMinutes - startMinutes < calendarStep) {
    showFormMessage(`这个时间范围少于 ${calendarStep} 分钟，无法生成可预约时间。`, true);
    return;
  }

  const undoSnapshot = captureUndoState();
  const { newSlots, overwritten, bookedTemplateUpdates } = replaceRecurringAvailabilityRange(
    currentCoachId,
    elements.slotDate.value,
    startMinutes,
    endMinutes,
    lesson,
    elements.locationType.value,
    elements.coachNote.value.trim()
  );

  if (!newSlots.length && !overwritten.length && !bookedTemplateUpdates.length) {
    showFormMessage("这段时间没有可覆盖的开放时间，可能已经被预约。");
    return;
  }

  pushUndoState(undoSnapshot);
  elements.coachNote.value = "";
  refreshAvailabilityDirty();
  showFormMessage(`已同步每周可预约时间：${newSlots.length} 个新时间，${overwritten.length} 个开放时间，${bookedTemplateUpdates.length} 个已预约时间底色。`);
  render();
}

function toggleCalendarHours() {
  calendarShowsFullDay = !calendarShowsFullDay;
  elements.toggleCalendarHours.textContent = calendarShowsFullDay ? "收起全天" : "显示全天";
  renderDragCalendar();
}

function toggleExceptionCalendarHours() {
  exceptionCalendarShowsFullDay = !exceptionCalendarShowsFullDay;
  elements.toggleExceptionCalendarHours.textContent = exceptionCalendarShowsFullDay ? "收起全天" : "显示全天";
  renderExceptionDragCalendar();
}

function renderWeeklyAvailabilityViews() {
  renderDragCalendar();
  renderDropdownWeekSlots();
}

function shiftCalendarWeek(direction) {
  const currentWeek = startOfWeekIso(elements.calendarWeekStart.value || nextWeekdayIso());
  elements.calendarWeekStart.value = addDaysIso(currentWeek, direction * 7);
  renderWeeklyAvailabilityViews();
}

function goToCurrentCalendarWeek() {
  elements.calendarWeekStart.value = startOfWeekIso(todayIso());
  renderWeeklyAvailabilityViews();
}

function shiftScheduleWeek(direction) {
  const currentWeek = startOfWeekIso(elements.exceptionCalendarWeekStart.value || todayIso());
  elements.exceptionCalendarWeekStart.value = addDaysIso(currentWeek, direction * 7);
  renderExceptionDragCalendar();
}

function goToCurrentScheduleWeek() {
  elements.exceptionCalendarWeekStart.value = startOfWeekIso(todayIso());
  renderExceptionDragCalendar();
}

function openBlockTimeDialog() {
  elements.blockDialogDate.value = elements.exceptionCalendarWeekStart.value || elements.slotDate.value || nextWeekdayIso();
  elements.blockDialogStart.value = defaultStart;
  syncEndTimeOptions(elements.blockDialogStart, elements.blockDialogEnd, "12:00");
  elements.blockRepeatWeekly.checked = false;
  elements.blockDialog.showModal();
}

function closeBlockTimeDialog() {
  elements.blockDialog.close();
}

function addBlockException(event) {
  event.preventDefault();
  const start = elements.blockDialogStart.value;
  const end = elements.blockDialogEnd.value;
  const date = elements.blockDialogDate.value;

  if (minutesFromTime(end) <= minutesFromTime(start)) {
    showFormMessage("结束时间需要晚于开始时间。", true);
    return;
  }

  const repeatCount = elements.blockRepeatWeekly.checked ? 12 : 1;
  const undoSnapshot = captureUndoState();
  for (let index = 0; index < repeatCount; index += 1) {
    addBlockExceptionRange(addDaysIso(date, index * 7), minutesFromTime(start), minutesFromTime(end));
  }

  pushUndoState(undoSnapshot);
  elements.blockDialog.close();
  showFormMessage(elements.blockRepeatWeekly.checked ? "已添加每周重复不可预约时间，记得保存可预约时间。" : "已添加不可预约时间，记得保存可预约时间。");
  render();
}

function addBlockExceptionRange(date, start, end, reason = "不可预约时间") {
  const block = {
    id: createId(),
    coachId: currentCoachId,
    date,
    start: timeFromMinutes(start),
    end: timeFromMinutes(end),
    reason,
  };
  blockedExceptions.push(block);
  unsavedBlockExceptionIds.add(block.id);
  for (let minutes = start; minutes < end; minutes += calendarStep) {
    unsavedBlockedCellKeys.add(cellKey(date, minutes));
  }
  refreshAvailabilityDirty("有未保存的不可预约时间");
}

function replaceAvailabilityRange(coachId, date, startMinutes, endMinutes, lesson, location, note) {
  const bookedTemplateUpdates = slots.filter((slot) => {
    return (
      slot.coachId === coachId &&
      slot.date === date &&
      slot.booked &&
      rangesOverlap(minutesFromTime(slot.start), minutesFromTime(slot.end), startMinutes, endMinutes)
    );
  });
  const overwritten = slots.filter((slot) => {
    return (
      slot.coachId === coachId &&
      slot.date === date &&
      !slot.booked &&
      rangesOverlap(minutesFromTime(slot.start), minutesFromTime(slot.end), startMinutes, endMinutes)
    );
  });
  const overwrittenIds = new Set(overwritten.map((slot) => slot.id));

  overwritten.forEach(markDeletedSlot);
  slots = slots.filter((slot) => !overwrittenIds.has(slot.id));

  const newSlots = createSlotsFromRange(coachId, date, startMinutes, endMinutes, lesson, location, note);
  slots = [...slots, ...newSlots];
  newSlots.forEach(markAddedSlot);
  bookedTemplateUpdates.forEach((slot) => {
    slot.availabilityLocation = location;
    markRangeCells(slot.date, Math.max(minutesFromTime(slot.start), startMinutes), Math.min(minutesFromTime(slot.end), endMinutes), unsavedRecurringCellKeys);
  });

  return { newSlots, overwritten, bookedTemplateUpdates };
}

function getRecurringDatesForDate(coachId, date) {
  const targetWeekday = weekdayIndex(date);
  const today = todayIso();
  const dates = new Set();
  const targetDayOffset = (targetWeekday || 7) - 1;
  const currentWeekStart = startOfWeekIso(todayIso());

  if (date >= today) {
    dates.add(date);
  }

  for (let weekOffset = 0; weekOffset <= recurringFutureWeeks; weekOffset += 1) {
    const recurringDate = addDaysIso(currentWeekStart, weekOffset * 7 + targetDayOffset);
    if (recurringDate >= today) {
      dates.add(recurringDate);
    }
  }

  slots.forEach((slot) => {
    if (slot.coachId === coachId && slot.date >= today && weekdayIndex(slot.date) === targetWeekday) {
      dates.add(slot.date);
    }
  });

  pendingDeletedSlots.forEach((slot) => {
    if (slot.coachId === coachId && slot.date >= today && weekdayIndex(slot.date) === targetWeekday) {
      dates.add(slot.date);
    }
  });

  return [...dates].sort();
}

function replaceRecurringAvailabilityRange(coachId, date, startMinutes, endMinutes, lesson, location, note) {
  return getRecurringDatesForDate(coachId, date).reduce(
    (summary, recurringDate) => {
      markRangeCells(recurringDate, startMinutes, endMinutes, unsavedRecurringCellKeys);
      const result = replaceAvailabilityRange(coachId, recurringDate, startMinutes, endMinutes, lesson, location, note);
      summary.newSlots.push(...result.newSlots);
      summary.overwritten.push(...result.overwritten);
      summary.bookedTemplateUpdates.push(...result.bookedTemplateUpdates);
      return summary;
    },
    { newSlots: [], overwritten: [], bookedTemplateUpdates: [] }
  );
}

function removeAvailabilityRange(coachId, date, startMinutes, endMinutes) {
  const bookedTemplateUpdates = slots.filter((slot) => {
    return (
      slot.coachId === coachId &&
      slot.date === date &&
      slot.booked &&
      rangesOverlap(minutesFromTime(slot.start), minutesFromTime(slot.end), startMinutes, endMinutes)
    );
  });
  const removed = slots.filter((slot) => {
    return (
      slot.coachId === coachId &&
      slot.date === date &&
      !slot.booked &&
      rangesOverlap(minutesFromTime(slot.start), minutesFromTime(slot.end), startMinutes, endMinutes)
    );
  });
  const removedIds = new Set(removed.map((slot) => slot.id));

  removed.forEach(markDeletedSlot);
  slots = slots.filter((slot) => !removedIds.has(slot.id));
  bookedTemplateUpdates.forEach((slot) => {
    slot.availabilityLocation = unavailableSelection;
    markRangeCells(slot.date, Math.max(minutesFromTime(slot.start), startMinutes), Math.min(minutesFromTime(slot.end), endMinutes), unsavedRecurringCellKeys);
  });

  return removed;
}

function removeRecurringAvailabilityRange(coachId, date, startMinutes, endMinutes) {
  return getRecurringDatesForDate(coachId, date).flatMap((recurringDate) => {
    markRangeCells(recurringDate, startMinutes, endMinutes, unsavedRecurringCellKeys);
    return removeAvailabilityRange(coachId, recurringDate, startMinutes, endMinutes);
  });
}

function showFormMessage(message, isError = false) {
  elements.formMessage.textContent = message;
  elements.formMessage.style.color = isError ? "var(--red)" : "var(--green)";
}

function showProfileMessage(message, isError = false) {
  elements.profileMessage.textContent = message;
  elements.profileMessage.style.color = isError ? "var(--red)" : "var(--green)";
}

function setProfileDirty(isDirty, message) {
  hasUnsavedProfileChanges = isDirty;
  if (elements.saveProfileChanges) {
    elements.saveProfileChanges.classList.toggle("has-unsaved", isDirty);
  }
  if (message) {
    showProfileMessage(message, isDirty);
  }
}

function discardProfileChanges() {
  coachProfiles = loadProfiles();
  setProfileDirty(false);
  render();
}

function confirmDiscardProfileChanges() {
  if (!hasUnsavedProfileChanges) return true;
  const confirmed = window.confirm("你有尚未保存的更改，确定要放弃这些更改并离开吗？");
  if (confirmed) {
    discardProfileChanges();
  }
  return confirmed;
}

function setAvailabilityDirty(isDirty, message) {
  hasUnsavedAvailabilityChanges = isDirty;
  elements.availabilitySaveMessage.textContent = message || (isDirty ? "有未保存修改" : "没有未保存修改");
  elements.availabilitySaveMessage.style.color = isDirty ? "var(--red)" : "var(--muted)";
}

function refreshAvailabilityDirty(message) {
  const isDirty = unsavedAddedSlotIds.size > 0 || pendingDeletedSlots.size > 0 || unsavedBlockExceptionIds.size > 0 || unsavedRecurringCellKeys.size > 0;
  setAvailabilityDirty(isDirty, message || (isDirty ? "有未保存修改" : "没有未保存修改"));
}

function saveAvailabilityChanges() {
  if (!saveSlots()) {
    showFormMessage("保存失败。请先删除过大的本地照片或清理浏览器存储后再试。", true);
    return;
  }
  unsavedAddedSlotIds.clear();
  unsavedBlockedCellKeys.clear();
  unsavedRecurringCellKeys.clear();
  unsavedBlockExceptionIds.clear();
  pendingDeletedSlots.clear();
  clearUndoHistory();
  setAvailabilityDirty(false, "已保存");
  showFormMessage(lastStorageRecoveryMessage || "可预约时间已保存。");
  render();
}

function saveCoachProfile(event) {
  event.preventDefault();
  const coachId = currentCoachId;
  const travels = elements.travelsToOtherRinks.value === "yes";
  const rate = Number(elements.coachRate.value || 0);
  const lessonOptions = getLessonOptionsFromForm();
  const servedRinks = Array.from(elements.servedRinkInputs)
    .filter((input) => input.checked)
    .map((input) => input.value);

  if (!servedRinks.length) {
    showProfileMessage("请至少选择一个可授课冰场。", true);
    return;
  }

  coachProfiles[coachId] = {
    ...getProfile(coachId),
    coachId,
    rate,
    homeRink: servedRinks[0],
    servedRinks,
    travelsToOtherRinks: travels,
    travelFee: travels ? Number(elements.travelFee.value || 0) : 0,
    lessonOptions,
  };

  if (!saveProfiles()) {
    showProfileMessage("保存失败。请删除过大的本地照片或清理浏览器存储后再试。", true);
    return;
  }
  setProfileDirty(false);
  showProfileMessage("更改已保存。");
  render();
}

function getLessonOptionsFromForm() {
  const existingProfile = getProfile(currentCoachId);
  return [...elements.lessonOptionsList.querySelectorAll(".lesson-option-row")].map((row) => {
    const existingLesson = existingProfile.lessonOptions.find((lesson) => lesson.id === row.dataset.lessonId) || {};
    const duration = Number(row.querySelector(".lesson-duration-input").value || existingLesson.duration || 0);
    const price = Number(row.querySelector(".lesson-price-input").value || existingLesson.price || 0);
    return {
      ...existingLesson,
      id: row.dataset.lessonId,
      name: row.querySelector(".lesson-name-input").value.trim() || `${duration}-minute private lesson`,
      duration,
      price,
      custom: true,
    };
  });
}

function previewServedRinksChange() {
  const servedRinks = Array.from(elements.servedRinkInputs)
    .filter((input) => input.checked)
    .map((input) => input.value);
  if (!servedRinks.length) return;

  coachProfiles[currentCoachId] = {
    ...getProfile(currentCoachId),
    homeRink: servedRinks[0],
    servedRinks,
  };
  setProfileDirty(true, "有未保存的更改。");
  syncLocationOptions();
}

function saveCoachPhoto(event) {
  event.preventDefault();
  const coachId = currentCoachId;
  const photoUrl = pendingPhotoDataUrl || elements.coachPhotoUrl.value.trim();
  coachProfiles[coachId] = {
    ...getProfile(coachId),
    photoUrl,
  };

  elements.photoMessage.textContent = "照片已保存。";
  if (!saveProfiles()) {
    elements.photoMessage.textContent = "保存失败。图片可能太大，请换一张较小的照片。";
    elements.photoMessage.style.color = "var(--red)";
    return;
  }
  syncPhotoForm();
  render();
}

function addLessonOption() {
  const profile = getProfile(currentCoachId);
  const duration = Number(elements.lessonDuration.value || 0);
  const price = Number(elements.lessonPrice.value || 0);
  const name = elements.lessonName.value.trim() || `${duration}-minute private lesson`;

  if (!duration || !price) {
    showProfileMessage("请填写课程时长和价格。", true);
    return;
  }

  profile.lessonOptions.push({
    id: `lesson-${Date.now()}`,
    name,
    duration,
    price,
    custom: true,
  });
  coachProfiles[currentCoachId] = profile;
  elements.lessonName.value = "";
  elements.lessonDuration.value = "";
  elements.lessonPrice.value = "";
  setProfileDirty(true, "已添加课程选项，记得保存更改。");
  render();
}

function handleLessonOptionChange(event) {
  const row = event.target.closest(".lesson-option-row");
  if (!row) return;

  const profile = getProfile(currentCoachId);
  const lesson = profile.lessonOptions.find((item) => item.id === row.dataset.lessonId);
  if (!lesson) return;

  lesson.name = row.querySelector(".lesson-name-input").value.trim() || `${lesson.duration}-minute private lesson`;
  lesson.duration = Number(row.querySelector(".lesson-duration-input").value || lesson.duration);
  lesson.price = Number(row.querySelector(".lesson-price-input").value || lesson.price);
  lesson.custom = true;
  coachProfiles[currentCoachId] = profile;
  setProfileDirty(true, "有未保存的课程价格更改。");
}

function hasFutureBookingsForLesson(lesson) {
  return slots.some((slot) => {
    return (
      slot.coachId === currentCoachId &&
      slot.booked &&
      slot.date >= todayIso() &&
      slot.lessonName === lesson.name &&
      Number(slot.lessonDuration) === Number(lesson.duration)
    );
  });
}

function handleLessonOptionClick(event) {
  const button = event.target.closest("button[data-action='remove-lesson']");
  if (!button) return;

  const row = button.closest(".lesson-option-row");
  const profile = getProfile(currentCoachId);
  const lesson = profile.lessonOptions.find((item) => item.id === row.dataset.lessonId);
  if (profile.lessonOptions.length <= 1) {
    showProfileMessage("至少保留一个课程选项。", true);
    return;
  }
  if (!lesson) return;
  if (hasFutureBookingsForLesson(lesson)) {
    showProfileMessage("这个课程已有未来预约，不能直接删除。", true);
    return;
  }
  const confirmed = window.confirm("确定要删除这个课程选项吗？删除后，学生将无法再预约该课程。");
  if (!confirmed) return;

  profile.lessonOptions = profile.lessonOptions.filter((lesson) => lesson.id !== row.dataset.lessonId);
  coachProfiles[currentCoachId] = profile;
  setProfileDirty(true, "已删除课程选项，记得保存更改。");
  render();
}

function openBookingDialog(slotId) {
  const slot = slots.find((item) => item.id === slotId);
  if (!slot) return;

  const coach = getCoach(slot.coachId);
  const profile = getProfile(slot.coachId);
  const defaultConcreteLocation = (profile.servedRinks && profile.servedRinks[0]) || profile.homeRink || rinks[0];
  elements.bookingSlotId.value = slot.id;
  elements.dialogTitle.textContent = `${coach.name} · ${slot.lessonName || "Private lesson"} · $${slot.lessonPrice} · ${formatDate(slot.date)} ${slot.start}`;
  elements.bookingLocation.innerHTML = concreteLocationOptionsForCoach(slot.coachId);
  elements.bookingLocationLabel.classList.toggle("is-hidden", slot.location !== "Any served rink");
  elements.bookingLocation.value = slot.location === "Any served rink" ? defaultConcreteLocation : slot.location;
  elements.studentName.value = "";
  elements.studentEmail.value = "";
  elements.studentNote.value = "";
  elements.bookingDialog.showModal();
}

function openBookingDetails(slotId) {
  const slot = slots.find((item) => item.id === slotId);
  if (!slot || !slot.booked) return;

  const student = slot.student || {};
  elements.bookingDetailsTitle.textContent = `${formatDate(slot.date)} ${slot.start} - ${slot.end}`;
  elements.removeBookingDetails.dataset.id = slot.id;
  elements.bookingDetailsBody.innerHTML = `
    <div><span>学生</span><strong>${student.name || "学生"}</strong></div>
    <div><span>Email</span><strong>${student.email || "暂无 email"}</strong></div>
    <div><span>场馆</span><strong>${formatLocationLabel(slot.location)}</strong></div>
    <div><span>课程</span><strong>${slot.lessonName || "私教课"} · ${slot.lessonDuration || ""} 分钟 · $${slot.lessonPrice}</strong></div>
    <div><span>备注</span><strong>${student.note || "暂无备注"}</strong></div>
  `;
  elements.bookingDetailsDialog.showModal();
}

function removeBookingFromDetails() {
  const slot = slots.find((item) => item.id === elements.removeBookingDetails.dataset.id);
  if (!slot || !slot.booked) return;

  const studentName = slot.student?.name || "这位学生";
  const confirmed = window.confirm(`确定要取消 ${studentName} 在 ${formatDate(slot.date)} ${slot.start}-${slot.end} 的预约吗？`);
  if (!confirmed) return;

  pushUndoState();
  slot.booked = false;
  slot.student = null;
  elements.bookingDetailsDialog.close();
  setAvailabilityDirty(true, "有未保存的预约修改");
  render();
}

function handleScheduleCalendarClick(event) {
  const cell = event.target.closest(".calendar-cell.has-booking");
  if (!cell || !cell.dataset.slotId) return;
  openBookingDetails(cell.dataset.slotId);
}

function confirmBooking(event) {
  event.preventDefault();
  const slot = slots.find((item) => item.id === elements.bookingSlotId.value);
  if (!slot || slot.booked) return;

  pushUndoState();
  slot.booked = true;
  if (slot.location === "Any served rink") {
    slot.location = elements.bookingLocation.value;
  }
  slot.student = {
    name: elements.studentName.value.trim(),
    email: elements.studentEmail.value.trim(),
    note: elements.studentNote.value.trim(),
  };

  elements.bookingDialog.close();
  setAvailabilityDirty(true, "有未保存的预约修改");
  render();
}

function handleSlotAction(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const { action, id } = button.dataset;
  if (action === "book") openBookingDialog(id);
  if (action === "delete") {
    const deleted = slots.find((slot) => slot.id === id);
    if (deleted) pushUndoState();
    if (deleted) markDeletedSlot(deleted);
    slots = slots.filter((slot) => slot.id !== id);
    refreshAvailabilityDirty();
    render();
  }
  if (action === "delete-many") {
    pushUndoState();
    if (button.dataset.date && button.dataset.start && button.dataset.end) {
      removeRecurringAvailabilityRange(currentCoachId, button.dataset.date, minutesFromTime(button.dataset.start), minutesFromTime(button.dataset.end));
    } else {
      const ids = new Set((button.dataset.ids || "").split(",").filter(Boolean));
      slots.filter((slot) => ids.has(slot.id)).forEach(markDeletedSlot);
      slots = slots.filter((slot) => !ids.has(slot.id));
    }
    refreshAvailabilityDirty();
    render();
  }
  if (action === "delete-block") {
    pushUndoState();
    if (unsavedBlockExceptionIds.has(id)) {
      unsavedBlockExceptionIds.delete(id);
    } else {
      unsavedBlockExceptionIds.add(`delete-${id}`);
    }
    blockedExceptions = blockedExceptions.filter((block) => block.id !== id);
    refreshAvailabilityDirty();
    render();
  }
  if (action === "cancel") {
    const slot = slots.find((item) => item.id === id);
    if (slot) {
      pushUndoState();
      slot.booked = false;
      slot.student = null;
      setAvailabilityDirty(true);
      render();
    }
  }
}

function markDeletedSlot(slot) {
  if (unsavedAddedSlotIds.has(slot.id)) {
    unsavedAddedSlotIds.delete(slot.id);
    return;
  }

  pendingDeletedSlots.set(slot.id, slot);
  markSlotCells(slot, unsavedBlockedCellKeys);
}

function markAddedSlot(slot) {
  unsavedAddedSlotIds.add(slot.id);
  for (let minutes = minutesFromTime(slot.start); minutes < minutesFromTime(slot.end); minutes += calendarStep) {
    unsavedBlockedCellKeys.delete(cellKey(slot.date, minutes));
  }
}

function rangesOverlap(startA, endA, startB, endB) {
  return startA < endB && endA > startB;
}

function slotOverlapsBlockedException(slot) {
  return blockedExceptions.some((block) => {
    return (
      block.coachId === slot.coachId &&
      block.date === slot.date &&
      rangesOverlap(minutesFromTime(slot.start), minutesFromTime(slot.end), minutesFromTime(block.start), minutesFromTime(block.end))
    );
  });
}

function undoEditingRange(date, start, end, showMessage = true) {
  const addedIdsToRemove = new Set();
  slots.forEach((slot) => {
    if (
      slot.coachId === currentCoachId &&
      slot.date === date &&
      unsavedAddedSlotIds.has(slot.id) &&
      rangesOverlap(minutesFromTime(slot.start), minutesFromTime(slot.end), start, end)
    ) {
      addedIdsToRemove.add(slot.id);
    }
  });

  slots = slots.filter((slot) => !addedIdsToRemove.has(slot.id));
  addedIdsToRemove.forEach((id) => unsavedAddedSlotIds.delete(id));

  const restored = [];
  pendingDeletedSlots.forEach((slot, id) => {
    if (
      slot.coachId === currentCoachId &&
      slot.date === date &&
      rangesOverlap(minutesFromTime(slot.start), minutesFromTime(slot.end), start, end)
    ) {
      restored.push(slot);
      pendingDeletedSlots.delete(id);
      for (let minutes = minutesFromTime(slot.start); minutes < minutesFromTime(slot.end); minutes += calendarStep) {
        unsavedBlockedCellKeys.delete(cellKey(slot.date, minutes));
      }
    }
  });

  const blockIdsToRemove = new Set();
  blockedExceptions.forEach((block) => {
    if (
      block.coachId === currentCoachId &&
      block.date === date &&
      unsavedBlockExceptionIds.has(block.id) &&
      rangesOverlap(minutesFromTime(block.start), minutesFromTime(block.end), start, end)
    ) {
      blockIdsToRemove.add(block.id);
      for (let minutes = minutesFromTime(block.start); minutes < minutesFromTime(block.end); minutes += calendarStep) {
        unsavedBlockedCellKeys.delete(cellKey(block.date, minutes));
      }
    }
  });
  blockedExceptions = blockedExceptions.filter((block) => !blockIdsToRemove.has(block.id));
  blockIdsToRemove.forEach((id) => unsavedBlockExceptionIds.delete(id));
  for (let minutes = start; minutes < end; minutes += calendarStep) {
    unsavedRecurringCellKeys.delete(cellKey(date, minutes));
  }

  slots = [...slots, ...restored];
  const changed = addedIdsToRemove.size || restored.length || blockIdsToRemove.size;
  refreshAvailabilityDirty(changed ? "已撤销未保存编辑" : "没有可撤销的编辑");
  if (showMessage) {
    showFormMessage(changed ? "已取消选中的未保存 editing。" : "这段没有未保存的 editing。");
  }
  return Boolean(changed);
}

function undoRecurringEditingRange(date, start, end) {
  const changedCount = getRecurringDatesForDate(currentCoachId, date).filter((recurringDate) => {
    return undoEditingRange(recurringDate, start, end, false);
  }).length;
  showFormMessage(changedCount ? `已取消 ${changedCount} 周的未保存 recurring editing。` : "这段没有未保存的 editing。");
  return changedCount;
}

function startCalendarDrag(event) {
  const cell = event.target.closest(".calendar-cell");
  if (!cell) return;

  const date = addDaysIso(elements.calendarWeekStart.value, Number(cell.dataset.dayIndex));
  const minutes = Number(cell.dataset.minutes);
  if (isPastCalendarCell(date, minutes)) {
    cell.blur();
    return;
  }
  const slot = findSlotAt(currentCoachId, date, minutes);
  const selectedLocation = elements.calendarLocationType.value;
  const isUnsavedOpen = Boolean(slot && unsavedAddedSlotIds.has(slot.id));
  const isUnsavedBlocked = !slot && unsavedBlockedCellKeys.has(cellKey(date, minutes));
  const shouldUndoEditing =
    (isUnsavedOpen && selectedLocation === slot.location) ||
    (isUnsavedBlocked && selectedLocation === unavailableSelection);
  dragState = {
    dayIndex: Number(cell.dataset.dayIndex),
    start: minutes,
    end: minutes,
    mode: shouldUndoEditing ? "undo" : "open",
  };
  cell.setPointerCapture(event.pointerId);
  paintDragSelection();
}

function moveCalendarDrag(event) {
  if (!dragState) return;

  const target = document.elementFromPoint(event.clientX, event.clientY);
  const cell = target && target.closest(".calendar-cell");
  if (!cell || Number(cell.dataset.dayIndex) !== dragState.dayIndex) return;

  dragState.end = Number(cell.dataset.minutes);
  paintDragSelection();
}

function finishCalendarDrag() {
  if (!dragState) return;

  const start = Math.min(dragState.start, dragState.end);
  const end = Math.max(dragState.start, dragState.end) + calendarStep;
  const date = addDaysIso(elements.calendarWeekStart.value, dragState.dayIndex);
  const undoSnapshot = captureUndoState();

  if (dragState.mode === "undo") {
    const changedCount = undoRecurringEditingRange(date, start, end);
    if (changedCount) {
      pushUndoState(undoSnapshot);
    }
  } else if (elements.calendarLocationType.value === unavailableSelection) {
    const removed = removeRecurringAvailabilityRange(currentCoachId, date, start, end);
    if (removed.length) {
      pushUndoState(undoSnapshot);
      refreshAvailabilityDirty();
      showFormMessage(`已删除 ${removed.length} 个每周可预约时间，记得保存可预约时间。`);
    } else {
      showFormMessage("这段没有可删除的开放时间，可能已经被预约或本来就是不可预约。");
    }
  } else {
    const lesson = getAvailabilityLesson();
    if (end - start < calendarStep) {
      showFormMessage(`拖选范围少于 ${calendarStep} 分钟，无法生成可预约时间。`, true);
      dragState = null;
      clearDragSelection();
      return;
    }

    const { newSlots, overwritten, bookedTemplateUpdates } = replaceRecurringAvailabilityRange(
      currentCoachId,
      date,
      start,
      end,
      lesson,
      elements.calendarLocationType.value,
      `从日历添加：${formatLocationLabel(elements.calendarLocationType.value)}。`
    );
    if (newSlots.length || overwritten.length || bookedTemplateUpdates.length) {
      pushUndoState(undoSnapshot);
      refreshAvailabilityDirty();
    }
    if (newSlots.length || overwritten.length || bookedTemplateUpdates.length) {
      showFormMessage(`日历已同步每周可预约时间：${newSlots.length} 个新时间，${overwritten.length} 个开放时间，${bookedTemplateUpdates.length} 个已预约时间底色。`);
    } else {
      showFormMessage("这段时间已被预约或无法覆盖。");
    }
  }

  dragState = null;
  clearDragSelection();
  render();
}

function paintDragSelection() {
  const start = Math.min(dragState.start, dragState.end);
  const end = Math.max(dragState.start, dragState.end);
  const isRemovingAvailability = elements.calendarLocationType.value === unavailableSelection;
  const selectionColor = isRemovingAvailability ? "#e2e8f0" : getRinkColor(elements.calendarLocationType.value);
  elements.dragCalendar.querySelectorAll(".calendar-cell").forEach((cell) => {
    cell.classList.remove("selecting", "blocking", "reverting", "removing");
    const sameDay = Number(cell.dataset.dayIndex) === dragState.dayIndex;
    const minutes = Number(cell.dataset.minutes);
    const inRange = sameDay && minutes >= start && minutes <= end;
    if (inRange && dragState.mode === "open") {
      cell.style.setProperty("--selection-color", selectionColor);
    } else {
      cell.style.removeProperty("--selection-color");
    }
    cell.classList.toggle("selecting", inRange && dragState.mode === "open");
    cell.classList.toggle("removing", inRange && dragState.mode === "open" && isRemovingAvailability);
    cell.classList.toggle("reverting", inRange && dragState.mode === "undo");
  });
}

function clearDragSelection() {
  elements.dragCalendar.querySelectorAll(".calendar-cell").forEach((cell) => {
    cell.classList.remove("selecting", "blocking", "reverting", "removing");
    cell.style.removeProperty("--selection-color");
  });
}
