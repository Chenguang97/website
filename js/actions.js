function addAvailability(event) {
  event.preventDefault();
  const date = elements.slotDate.value;
  const location = elements.locationType.value;
  const startTime = elements.startTime.value;
  const endTime = elements.endTime.value;
  const timePattern = /^\d{2}:\d{2}$/;

  if (date && location && startTime && !endTime) {
    showFormMessage("请选择有效的结束时间，结束时间需要晚于开始时间。", true);
    return;
  }

  if (!date || !location || !startTime || !endTime) {
    showFormMessage("请填写日期、地点、开始时间和结束时间。", true);
    return;
  }

  if (!timePattern.test(startTime) || !timePattern.test(endTime)) {
    showFormMessage("时间格式无效，请选择有效的开始和结束时间。", true);
    return;
  }

  const startMinutes = minutesFromTime(elements.startTime.value);
  const endMinutes = minutesFromTime(elements.endTime.value);
  const lesson = getAvailabilityLesson();

  if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes) || endMinutes <= startMinutes) {
    showFormMessage("结束时间需要晚于开始时间。", true);
    return;
  }

  if (endMinutes - startMinutes < calendarStep) {
    showFormMessage(`这个时间范围少于 ${calendarStep} 分钟，无法生成可预约时间。`, true);
    return;
  }

  requestAvailabilityChange({
    date,
    startMinutes,
    endMinutes,
    lesson,
    location,
    note: elements.coachNote.value.trim(),
    source: "manual",
  });
}

function requestAvailabilityChange(change, allowOverride = false) {
  const conflicts = findRecurringAvailabilityConflicts(change.date, change.startMinutes, change.endMinutes, change.location);
  if (conflicts.length && !allowOverride) {
    pendingAvailabilityConflict = change;
    showAvailabilityConflictDialog(change, conflicts);
    return;
  }

  applyAvailabilityChange(change, allowOverride);
}

function applyAvailabilityChange(change, trimCrossRinkConflicts = false) {
  const undoSnapshot = captureUndoState();
  const { newSlots, overwritten, bookedTemplateUpdates, trimmed } = replaceRecurringAvailabilityRange(
    currentCoachId,
    change.date,
    change.startMinutes,
    change.endMinutes,
    change.lesson,
    change.location,
    change.note,
    trimCrossRinkConflicts
  );

  if (!newSlots.length && !overwritten.length && !bookedTemplateUpdates.length && !trimmed.length) {
    showFormMessage("这段时间没有可覆盖的开放时间，可能已经被预约。");
    return;
  }

  pushUndoState(undoSnapshot);
  elements.coachNote.value = "";
  refreshAvailabilityDirty();
  showFormMessage(`已同步每周可预约时间：${newSlots.length} 个新时间，${overwritten.length} 个开放时间，${trimmed.length} 个裁剪时段，${bookedTemplateUpdates.length} 个已预约时间底色。`);
  render();
}

function findAvailabilityConflicts(date, startMinutes, endMinutes, location) {
  const conflicts = slots.filter((slot) => {
    return (
      slot.coachId === currentCoachId &&
      slot.date === date &&
      !slot.booked &&
      slot.location !== location &&
      rangesOverlap(minutesFromTime(slot.start), minutesFromTime(slot.end), startMinutes, endMinutes)
    );
  });
  if (!conflicts.length) return conflicts;

  const conflictStart = Math.min(...conflicts.map((slot) => minutesFromTime(slot.start)));
  const conflictEnd = Math.max(...conflicts.map((slot) => minutesFromTime(slot.end)));
  const isExactRangeReplacement = conflictStart === startMinutes && conflictEnd === endMinutes;
  return isExactRangeReplacement ? [] : conflicts;
}

function findRecurringAvailabilityConflicts(date, startMinutes, endMinutes, location) {
  return getRecurringDatesForDate(currentCoachId, date).flatMap((recurringDate) => {
    return findAvailabilityConflicts(recurringDate, startMinutes, endMinutes, location);
  });
}

function showAvailabilityConflictDialog(change, conflicts) {
  const sample = conflicts.slice(0, 4).map((slot) => `${formatDate(slot.date)} ${slot.start}-${slot.end} · ${formatLocationLabel(slot.location)}`);
  const extra = conflicts.length > sample.length ? `，另有 ${conflicts.length - sample.length} 个重叠时段` : "";
  elements.conflictDetails.textContent = `新时段 ${formatDate(change.date)} ${timeFromMinutes(change.startMinutes)}-${timeFromMinutes(change.endMinutes)} · ${formatLocationLabel(change.location)} 与其他冰场开放时间重叠：${sample.join("；")}${extra}。请选择 Override 裁剪旧时段，或 Cancel 保留原状。`;
  if (typeof elements.conflictDialog.showModal === "function") {
    elements.conflictDialog.showModal();
  } else {
    elements.conflictDialog.open = true;
  }
}

function cancelAvailabilityConflict() {
  pendingAvailabilityConflict = null;
  if (typeof elements.conflictDialog.close === "function") {
    elements.conflictDialog.close();
  }
  elements.conflictDialog.open = false;
  elements.conflictDialog.removeAttribute("open");
  showFormMessage("已取消覆盖，原有可用时间未修改。");
}

function confirmAvailabilityConflictOverride() {
  if (!pendingAvailabilityConflict) return;
  const change = pendingAvailabilityConflict;
  pendingAvailabilityConflict = null;
  if (typeof elements.conflictDialog.close === "function") {
    elements.conflictDialog.close();
  }
  elements.conflictDialog.open = false;
  elements.conflictDialog.removeAttribute("open");
  requestAvailabilityChange(change, true);
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

function cloneSlotSegment(slot, startMinutes, endMinutes) {
  return {
    ...slot,
    id: createId(),
    start: timeFromMinutes(startMinutes),
    end: timeFromMinutes(endMinutes),
  };
}

function replaceAvailabilityRange(coachId, date, startMinutes, endMinutes, lesson, location, note, trimCrossRinkConflicts = false) {
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
  const trimmed = [];
  const overwrittenIds = new Set();

  overwritten.forEach((slot) => {
    const slotStart = minutesFromTime(slot.start);
    const slotEnd = minutesFromTime(slot.end);
    const shouldTrim = trimCrossRinkConflicts && slot.location !== location;

    overwrittenIds.add(slot.id);
    markDeletedSlot(slot);

    if (!shouldTrim) return;

    const leftStart = slotStart;
    const leftEnd = Math.min(startMinutes, slotEnd);
    const rightStart = Math.max(endMinutes, slotStart);
    const rightEnd = slotEnd;

    if (leftStart < leftEnd) {
      trimmed.push(cloneSlotSegment(slot, leftStart, leftEnd));
    }
    if (rightStart < rightEnd) {
      trimmed.push(cloneSlotSegment(slot, rightStart, rightEnd));
    }
  });

  slots = slots.filter((slot) => !overwrittenIds.has(slot.id));
  slots = [...slots, ...trimmed];
  trimmed.forEach(markAddedSlot);

  const newSlots = createSlotsFromRange(coachId, date, startMinutes, endMinutes, lesson, location, note);
  slots = [...slots, ...newSlots];
  newSlots.forEach(markAddedSlot);
  bookedTemplateUpdates.forEach((slot) => {
    slot.availabilityLocation = location;
    markRangeCells(slot.date, Math.max(minutesFromTime(slot.start), startMinutes), Math.min(minutesFromTime(slot.end), endMinutes), unsavedRecurringCellKeys);
  });

  return { newSlots, overwritten, bookedTemplateUpdates, trimmed };
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

function replaceRecurringAvailabilityRange(coachId, date, startMinutes, endMinutes, lesson, location, note, trimCrossRinkConflicts = false) {
  return getRecurringDatesForDate(coachId, date).reduce(
    (summary, recurringDate) => {
      markRangeCells(recurringDate, startMinutes, endMinutes, unsavedRecurringCellKeys);
      const result = replaceAvailabilityRange(coachId, recurringDate, startMinutes, endMinutes, lesson, location, note, trimCrossRinkConflicts);
      summary.newSlots.push(...result.newSlots);
      summary.overwritten.push(...result.overwritten);
      summary.bookedTemplateUpdates.push(...result.bookedTemplateUpdates);
      summary.trimmed.push(...result.trimmed);
      return summary;
    },
    { newSlots: [], overwritten: [], bookedTemplateUpdates: [], trimmed: [] }
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

function openBookingDialog(slotId, lessonId = "") {
  const slot = slots.find((item) => item.id === slotId);
  if (!slot) return;

  const coach = getCoach(slot.coachId);
  const profile = getProfile(slot.coachId);
  const lesson = getStudentLessonOptionsForCoach(slot.coachId).find((option) => option.id === lessonId) || getFittingLessonOptionsForStart(slot, getSelectedStudentLessonDuration())[0] || getStudentLessonOptionsForCoach(slot.coachId)[0];
  const defaultConcreteLocation = (profile.servedRinks && profile.servedRinks[0]) || profile.homeRink || rinks[0];
  elements.bookingSlotId.value = slot.id;
  elements.bookingLessonId.value = lesson.id;
  elements.bookingDialogMode.value = "create";
  elements.dialogTitle.textContent = `${coach.name} · ${lesson.name || "Private lesson"} · $${lesson.price} · ${formatDate(slot.date)} ${slot.start}`;
  elements.bookingSubmitButton.textContent = "确认预约";
  elements.bookingNewSlotLabel.classList.add("is-hidden");
  elements.bookingNewSlot.innerHTML = "";
  elements.bookingLocation.innerHTML = bookingLocationOptionsForSlot(slot);
  elements.bookingLocationLabel.classList.remove("is-hidden");
  elements.bookingLocation.disabled = false;
  elements.bookingLocation.value = slot.location === "Any served rink" ? defaultConcreteLocation : slot.location;
  elements.bookingForSelf.checked = true;
  elements.studentName.value = "";
  syncBookingForSelf();
  elements.studentEmailLabel.classList.remove("is-hidden");
  elements.studentEmail.disabled = false;
  elements.studentEmail.required = true;
  elements.studentEmail.value = "";
  elements.studentNote.value = "";
  if (elements.studentSlotOptionsDialog?.open) {
    elements.studentSlotOptionsDialog.close();
  }
  elements.bookingDialog.showModal();
}

function openModifyBookingDialog(slotId) {
  const slot = slots.find((item) => item.id === slotId);
  if (!slot || !slot.booked || !slot.student || isPastStudentBooking(slot)) return;

  const coach = getCoach(slot.coachId);
  elements.bookingSlotId.value = slot.id;
  elements.bookingDialogMode.value = "modify";
  elements.dialogTitle.textContent = `修改预约 · ${coach.name} · ${formatDate(slot.date)} ${slot.start}`;
  elements.bookingSubmitButton.textContent = "保存修改";
  elements.bookingNewSlotLabel.classList.add("is-hidden");
  elements.bookingNewSlot.innerHTML = "";
  elements.bookingNewSlot.value = slot.id;
  elements.bookingLocationLabel.classList.add("is-hidden");
  elements.bookingLocation.disabled = true;
  elements.studentEmailLabel.classList.add("is-hidden");
  elements.studentEmail.disabled = true;
  elements.studentEmail.required = false;
  elements.bookingForSelf.checked = !slot.student.name || slot.student.name === "本人";
  elements.studentName.value = elements.bookingForSelf.checked ? "" : slot.student.name;
  syncBookingForSelf();
  elements.studentEmail.value = slot.student.email || "";
  elements.studentNote.value = slot.student.note || "";
  elements.bookingDialog.showModal();
}

function populateRescheduleOptions(currentSlotId) {
  const currentSlot = slots.find((slot) => slot.id === currentSlotId);
  if (!currentSlot || elements.bookingDialogMode.value !== "modify" || elements.bookingSlotId.value !== currentSlotId || !elements.bookingDialog.open) return;

  const availableSlots = getRescheduleOptions(currentSlot);
  const optionHtml = [currentSlot, ...availableSlots].map((option) => renderRescheduleOption(currentSlot, option)).join("");
  const moreText = availableSlots.length >= rescheduleOptionLimit ? `<option disabled>更多时间请到预约课程日历选择</option>` : "";
  elements.bookingNewSlot.innerHTML = `${optionHtml}${moreText}`;
  elements.bookingNewSlot.value = currentSlot.id;
}

function getRescheduleOptions(currentSlot) {
  const today = todayIso();
  const windowEnd = addDaysIso(today, rescheduleWindowWeeks * 7);
  return slots
    .filter((slot) => slot.id !== currentSlot.id)
    .filter((slot) => !slot.booked && slot.date >= today && slot.date <= windowEnd)
    .filter((slot) => !isPastStudentBooking(slot) && !slotOverlapsBlockedException(slot))
    .sort(slotSort)
    .slice(0, rescheduleOptionLimit);
}

function renderRescheduleOption(currentSlot, slot) {
  const coach = getCoach(slot.coachId);
  const currentText = slot.id === currentSlot.id ? "当前时间 · " : "";
  return `<option value="${slot.id}">${currentText}${formatDate(slot.date)} ${slot.start}-${slot.end} · ${coach.name} · ${slot.lessonName || "私教课"} · $${slot.lessonPrice} · ${formatLocationLabel(slot.location)}</option>`;
}

function bookingLocationOptionsForSlot(slot) {
  if (slot.location === "Any served rink") {
    return concreteLocationOptionsForCoach(slot.coachId);
  }
  return `<option value="${slot.location}">${formatLocationLabel(slot.location)}</option>`;
}

function syncModifyBookingLocation(currentSlot) {
  const selectedSlot = slots.find((slot) => slot.id === elements.bookingNewSlot.value) || currentSlot;
  const profile = getProfile(selectedSlot.coachId);
  const defaultConcreteLocation = (profile.servedRinks && profile.servedRinks[0]) || profile.homeRink || rinks[0];
  elements.bookingLocation.innerHTML = bookingLocationOptionsForSlot(selectedSlot);
  elements.bookingLocationLabel.classList.remove("is-hidden");
  elements.bookingLocation.value = selectedSlot.id === currentSlot.id
    ? currentSlot.location
    : selectedSlot.location === "Any served rink"
      ? defaultConcreteLocation
      : selectedSlot.location;
}

function openStudentSlotOptions(slotIds) {
  if (!elements.studentSlotOptionsDialog || !elements.studentSlotOptionsList) return;

  const selectedDuration = getSelectedStudentLessonDuration();
  const startSlots = slotIds
    .map((id) => slots.find((slot) => slot.id === id))
    .filter(Boolean)
    .filter((slot) => !slot.booked && !slotOverlapsBlockedException(slot))
    .sort((a, b) => `${getCoach(a.coachId).name}${a.location}${a.lessonPrice}`.localeCompare(`${getCoach(b.coachId).name}${b.location}${b.lessonPrice}`));
  const options = startSlots.flatMap((slot) => {
    return getFittingLessonOptionsForStart(slot, selectedDuration).map((lesson) => ({ slot, lesson }));
  });

  if (!options.length) return;

  const first = options[0].slot;
  elements.studentSlotOptionsTitle.textContent = `${formatDate(first.date)} ${first.start}`;
  elements.studentSlotOptionsList.innerHTML = options
    .map(({ slot, lesson }) => {
      const coach = getCoach(slot.coachId);
      const endTime = timeFromMinutes(minutesFromTime(slot.start) + Number(lesson.duration));
      return `
        <button class="student-coach-option" type="button" data-action="book" data-id="${slot.id}" data-lesson-id="${lesson.id}">
          <strong>${coach.name}</strong>
          <span>${coach.subject}</span>
          <small>${slot.start}-${endTime} · ${formatLocationLabel(slot.location)} · ${lesson.name || `${lesson.duration} min private lesson`} · $${lesson.price}</small>
        </button>
      `;
    })
    .join("");
  elements.studentSlotOptionsDialog.showModal();
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
  restoreConsumedAvailabilitySlots(slot);
  slot.booked = false;
  slot.student = null;
  elements.bookingDetailsDialog.close();
  setAvailabilityDirty(true, "有未保存的预约修改");
  render();
}

function cancelStudentBooking(slotId) {
  const slot = slots.find((item) => item.id === slotId);
  if (!slot || !slot.booked || isPastStudentBooking(slot)) return;

  const confirmed = window.confirm(`确定要取消 ${formatDate(slot.date)} ${slot.start}-${slot.end} 的预约吗？`);
  if (!confirmed) return;

  pushUndoState();
  restoreConsumedAvailabilitySlots(slot);
  slot.booked = false;
  slot.student = null;
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
  const isModify = elements.bookingDialogMode.value === "modify";
  if (!slot || (slot.booked && !isModify) || (!slot.booked && isModify)) return;
  const lesson = isModify
    ? null
    : getStudentLessonOptionsForCoach(slot.coachId).find((option) => option.id === elements.bookingLessonId?.value) || getFittingLessonOptionsForStart(slot, getSelectedStudentLessonDuration())[0];

  if (!isModify && (!lesson || !canFitLessonFromSlot(slot, Number(lesson.duration)))) {
    showFormMessage("这个时间已经无法完整容纳所选课程时长，请重新选择。", true);
    return;
  }

  const bookingForSelf = elements.bookingForSelf.checked;
  const student = {
    name: bookingForSelf ? "本人" : elements.studentName.value.trim(),
    email: isModify ? slot.student?.email || "" : elements.studentEmail.value.trim(),
    note: elements.studentNote.value.trim(),
  };

  pushUndoState();
  if (isModify) {
    slot.student = student;
  } else {
    applyLessonToBookingSlot(slot, lesson);
    slot.booked = true;
    slot.student = student;
    if (slot.location === "Any served rink") {
      slot.location = elements.bookingLocation.value;
    }
  }

  elements.bookingDialog.close();
  setAvailabilityDirty(true, "有未保存的预约修改");
  render();
}

function applyLessonToBookingSlot(slot, lesson) {
  const duration = Number(lesson.duration);
  const coveredSlots = getAvailabilitySlotsCoveredByLesson(slot, duration).filter((coveredSlot) => coveredSlot.id !== slot.id);
  slot.consumedAvailabilitySlots = coveredSlots.map((coveredSlot) => ({ ...coveredSlot }));
  slots = slots.filter((item) => !coveredSlots.some((coveredSlot) => coveredSlot.id === item.id));
  slot.end = timeFromMinutes(minutesFromTime(slot.start) + duration);
  slot.lessonId = lesson.id;
  slot.lessonName = lesson.name;
  slot.lessonDuration = duration;
  slot.lessonPrice = lesson.price;
}

function getAvailabilitySlotsCoveredByLesson(startSlot, duration) {
  const startMinutes = minutesFromTime(startSlot.start);
  const endMinutes = startMinutes + Number(duration);
  const availabilityLocation = getAvailabilityLocation(startSlot);
  return slots.filter((slot) => {
    return (
      slot.coachId === startSlot.coachId &&
      slot.date === startSlot.date &&
      !slot.booked &&
      !slotOverlapsBlockedException(slot) &&
      getAvailabilityLocation(slot) === availabilityLocation &&
      rangesOverlap(minutesFromTime(slot.start), minutesFromTime(slot.end), startMinutes, endMinutes)
    );
  });
}

function restoreConsumedAvailabilitySlots(slot) {
  if (!Array.isArray(slot.consumedAvailabilitySlots) || !slot.consumedAvailabilitySlots.length) return;
  const existingIds = new Set(slots.map((item) => item.id));
  const restoredSlots = slot.consumedAvailabilitySlots
    .filter((item) => !existingIds.has(item.id))
    .map((item) => ({ ...item, booked: false, student: null, consumedAvailabilitySlots: undefined }));
  slots = [...slots, ...restoredSlots];
  slot.consumedAvailabilitySlots = [];
}

function syncBookingForSelf() {
  const bookingForSelf = elements.bookingForSelf.checked;
  elements.studentNameLabel.classList.toggle("is-hidden", bookingForSelf);
  elements.studentName.disabled = bookingForSelf;
  elements.studentName.required = !bookingForSelf;
  if (bookingForSelf) {
    elements.studentName.value = "";
  }
}

function handleSlotAction(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const { action, id, ids } = button.dataset;
  if (action === "student-week") {
    const offset = Number(button.dataset.offset || 0);
    studentSelectedDate = addDaysIso(studentSelectedDate || elements.studentDateFilter.value || nextWeekdayIso(), offset);
    elements.studentDateFilter.value = studentSelectedDate;
    renderStudentSlots();
    return;
  }
  if (action === "set-student-view-mode") {
    studentViewMode = button.dataset.viewMode === "week" ? "week" : "day";
    renderStudentSlots();
    return;
  }
  if (action === "apply-student-date") {
    applyStudentDateSelection();
    return;
  }
  if (action === "remove-student-filter") {
    removeStudentFilterChip(button.dataset.filterName, button.dataset.filterValue);
    return;
  }
  if (action === "choose-time") {
    openStudentSlotOptions((ids || "").split(",").filter(Boolean));
    return;
  }
  if (action === "book") {
    openBookingDialog(id, button.dataset.lessonId);
    return;
  }
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
      restoreConsumedAvailabilitySlots(slot);
      slot.booked = false;
      slot.student = null;
      setAvailabilityDirty(true);
      render();
    }
  }
  if (action === "modify-student-booking") {
    openModifyBookingDialog(id);
    return;
  }
  if (action === "cancel-student-booking") {
    cancelStudentBooking(id);
    return;
  }
}

function handleStudentDateDraftChange() {
  renderStudentDatePendingState();
}

function applyStudentDateSelection() {
  studentSelectedDate = elements.studentDateFilter.value || studentSelectedDate || nextWeekdayIso();
  elements.studentDateFilter.value = studentSelectedDate;
  renderStudentSlots();
}

function cancelStudentDateSelection() {
  elements.studentDateFilter.value = studentSelectedDate || nextWeekdayIso();
  renderStudentDatePendingState();
}

function handleStudentDateOutsideClick(event) {
  if (!elements.studentDateActions || elements.studentDateActions.classList.contains("is-hidden")) return;
  if (event.target.closest("#studentDateFilter") || event.target.closest("#studentDateActions")) return;
  cancelStudentDateSelection();
}

function handleBookingNewSlotChange() {
  if (elements.bookingDialogMode.value !== "modify") return;
  const currentSlot = slots.find((slot) => slot.id === elements.bookingSlotId.value);
  if (!currentSlot) return;
  syncModifyBookingLocation(currentSlot);
}

function removeStudentFilterChip(name, value) {
  const input = document.querySelector(`input[name="${name}"][value="${value}"]`);
  const allInput = document.querySelector(`input[name="${name}"][value="all"]`);
  if (!input) return;

  input.checked = false;
  if (![...document.querySelectorAll(`input[name="${name}"]:checked`)].some((item) => item.value !== "all")) {
    if (allInput) allInput.checked = true;
    syncStudentFilterCheckboxes(allInput);
  } else if (allInput) {
    allInput.checked = false;
  }
  updateStudentFilterSummaries();
  renderStudentSlots();
}

function handleStudentFilterChange(event) {
  const input = event.target.closest("input[type='checkbox']");
  if (!input) return;

  syncStudentFilterCheckboxes(input);
  updateStudentFilterSummaries();
}

function applyStudentFilterPanel(event) {
  const panelType = event.currentTarget.dataset.studentFilterPanel;
  const panel = panelType === "coach" ? elements.studentCoachFilterPanel : elements.studentRinkFilterPanel;
  if (!panel) return;

  panel.classList.add("is-hidden");
  if (panelType === "coach" && elements.studentCoachSearch) elements.studentCoachSearch.value = "";
  if (panelType === "rink" && elements.studentRinkSearch) elements.studentRinkSearch.value = "";
  renderStudentSlots();
}

function openStudentFilterPanel(event) {
  const search = event.currentTarget;
  const panel = search === elements.studentCoachSearch ? elements.studentCoachFilterPanel : elements.studentRinkFilterPanel;
  const optionGroup = search === elements.studentCoachSearch ? elements.studentCoachFilterGroup : elements.studentRinkFilterGroup;
  if (!panel) return;

  if (panel.classList.contains("is-hidden")) {
    search.value = "";
    optionGroup?.querySelectorAll("label").forEach((label) => {
      label.classList.remove("is-hidden");
    });
  }
  panel.classList.remove("is-hidden");
}

function handleStudentFilterSearch(event) {
  const search = event.currentTarget;
  const panel = search === elements.studentCoachSearch ? elements.studentCoachFilterGroup : elements.studentRinkFilterGroup;
  const query = search.value.trim().toLowerCase();
  if (!panel) return;

  openStudentFilterPanel(event);
  panel.querySelectorAll("label").forEach((label) => {
    const isAllOption = label.querySelector("input")?.value === "all";
    const matches = !query || label.textContent.toLowerCase().includes(query);
    label.classList.toggle("is-hidden", !isAllOption && !matches);
  });
}

function handleStudentFilterOutsideClick(event) {
  if (!elements.studentControls || elements.studentControls.contains(event.target)) return;

  elements.studentCoachFilterPanel?.classList.add("is-hidden");
  elements.studentRinkFilterPanel?.classList.add("is-hidden");
  if (elements.studentCoachSearch) elements.studentCoachSearch.value = "";
  if (elements.studentRinkSearch) elements.studentRinkSearch.value = "";
}

function syncStudentFilterCheckboxes(changedInput) {
  const { name, value, checked } = changedInput;
  const inputs = [...document.querySelectorAll(`input[name="${name}"]`)];
  const allInput = inputs.find((input) => input.value === "all");
  const itemInputs = inputs.filter((input) => input.value !== "all");
  if (!allInput) return;

  if (value === "all") {
    allInput.checked = checked || !itemInputs.some((input) => input.checked);
    itemInputs.forEach((input) => {
      input.checked = allInput.checked;
    });
    return;
  }

  if (allInput.checked && !checked) {
    itemInputs.forEach((input) => {
      input.checked = input === changedInput;
    });
    changedInput.checked = true;
  }
  if (!itemInputs.some((input) => input.checked)) {
    allInput.checked = true;
    itemInputs.forEach((input) => {
      input.checked = true;
    });
  } else {
    allInput.checked = itemInputs.every((input) => input.checked);
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

    requestAvailabilityChange({
      date,
      startMinutes: start,
      endMinutes: end,
      lesson,
      location: elements.calendarLocationType.value,
      note: `从日历添加：${formatLocationLabel(elements.calendarLocationType.value)}。`,
      source: "calendar",
    });
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
