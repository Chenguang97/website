import { refreshAvailabilityDirty, setAvailabilityDirty, showFormMessage } from "./availability-status.js";
import {
  cancelStudentBooking,
  openBookingDetails,
  openBookingDialog,
  openModifyBookingDialog,
  openStudentSlotOptions,
  removeBookingFromDetails,
  restoreConsumedAvailabilitySlots,
  syncModifyBookingLocation,
} from "./booking-actions.js";
import {
  calendarStep,
  currentCoachId,
  fullDayEnd,
  recurringFutureWeeks,
  recurringPastWeeks,
  unavailableSelection,
} from "./config.js";
import { findSlotAt as findSlotAtIn, rangesOverlap } from "./domain/scheduling.mjs";
import { elements } from "./elements.js";
import {
  addBlockedException as appendBlockedException,
  getAvailabilityLesson,
  getLastStorageRecoveryMessage,
  replaceBlockedExceptions,
  replaceSlots,
  saveSlots,
  state,
} from "./state.js";
import { formatLocationLabel } from "./ui/display.js";
import {
  getRinkColor,
  render,
  renderDragCalendar,
  renderDropdownOpenSlots,
  renderDropdownWeekSlots,
  renderExceptionDragCalendar,
  renderStudentDatePendingState,
  renderStudentSlots,
  syncEndTimeOptions,
  updateStudentFilterSummaries,
} from "./render.js";
import { captureUndoState, clearUndoHistory, pushUndoState } from "./undo.js";
import {
  addDaysIso,
  cellKey,
  createId,
  createSlotsFromRange,
  formatDate,
  isPastCalendarCell,
  markRangeCells,
  markSlotCells,
  minutesFromTime,
  nextWeekdayIso,
  startOfWeekIso,
  timeFromMinutes,
  todayIso,
  weekdayIndex,
} from "./utils-data.js";

function findSlotAt(coachId, date, minutes) {
  return findSlotAtIn(state.slots, coachId, date, minutes);
}

export function addAvailability(event) {
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
    state.pendingAvailabilityConflict = change;
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
  const conflicts = state.slots.filter((slot) => {
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

export function cancelAvailabilityConflict() {
  state.pendingAvailabilityConflict = null;
  if (typeof elements.conflictDialog.close === "function") {
    elements.conflictDialog.close();
  }
  elements.conflictDialog.open = false;
  elements.conflictDialog.removeAttribute("open");
  showFormMessage("已取消覆盖，原有可用时间未修改。");
}

export function confirmAvailabilityConflictOverride() {
  if (!state.pendingAvailabilityConflict) return;
  const change = state.pendingAvailabilityConflict;
  state.pendingAvailabilityConflict = null;
  if (typeof elements.conflictDialog.close === "function") {
    elements.conflictDialog.close();
  }
  elements.conflictDialog.open = false;
  elements.conflictDialog.removeAttribute("open");
  requestAvailabilityChange(change, true);
}

export function toggleCalendarHours() {
  state.calendarShowsFullDay = !state.calendarShowsFullDay;
  elements.toggleCalendarHours.textContent = state.calendarShowsFullDay ? "收起全天" : "显示全天";
  renderDragCalendar();
}

export function toggleExceptionCalendarHours() {
  state.exceptionCalendarShowsFullDay = !state.exceptionCalendarShowsFullDay;
  elements.toggleExceptionCalendarHours.textContent = state.exceptionCalendarShowsFullDay ? "收起全天" : "显示全天";
  renderExceptionDragCalendar();
}

export function renderWeeklyAvailabilityViews() {
  renderDragCalendar();
  renderDropdownWeekSlots();
}

export function shiftCalendarWeek(direction) {
  const currentWeek = startOfWeekIso(elements.calendarWeekStart.value || nextWeekdayIso());
  elements.calendarWeekStart.value = addDaysIso(currentWeek, direction * 7);
  renderWeeklyAvailabilityViews();
}

export function goToCurrentCalendarWeek() {
  elements.calendarWeekStart.value = startOfWeekIso(todayIso());
  renderWeeklyAvailabilityViews();
}

export function shiftScheduleWeek(direction) {
  const currentWeek = startOfWeekIso(elements.exceptionCalendarWeekStart.value || todayIso());
  elements.exceptionCalendarWeekStart.value = addDaysIso(currentWeek, direction * 7);
  renderExceptionDragCalendar();
}

export function goToCurrentScheduleWeek() {
  elements.exceptionCalendarWeekStart.value = startOfWeekIso(todayIso());
  renderExceptionDragCalendar();
}

export function openBlockTimeDialog() {
  elements.blockDialogDate.value = elements.exceptionCalendarWeekStart.value || elements.slotDate.value || nextWeekdayIso();
  elements.blockDialogStart.value = defaultStart;
  syncEndTimeOptions(elements.blockDialogStart, elements.blockDialogEnd, "12:00");
  elements.blockRepeatWeekly.checked = false;
  elements.blockDialog.showModal();
}

export function closeBlockTimeDialog() {
  elements.blockDialog.close();
}

export function addBlockException(event) {
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
  appendBlockedException(block);
  state.unsavedBlockExceptionIds.add(block.id);
  for (let minutes = start; minutes < end; minutes += calendarStep) {
    state.unsavedBlockedCellKeys.add(cellKey(date, minutes));
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
  const bookedTemplateUpdates = state.slots.filter((slot) => {
    return (
      slot.coachId === coachId &&
      slot.date === date &&
      slot.booked &&
      rangesOverlap(minutesFromTime(slot.start), minutesFromTime(slot.end), startMinutes, endMinutes)
    );
  });
  const overwritten = state.slots.filter((slot) => {
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

  replaceSlots(state.slots.filter((slot) => !overwrittenIds.has(slot.id)));
  replaceSlots([...state.slots, ...trimmed]);
  trimmed.forEach(markAddedSlot);

  const newSlots = createSlotsFromRange(coachId, date, startMinutes, endMinutes, lesson, location, note, true, state.slots);
  replaceSlots([...state.slots, ...newSlots]);
  newSlots.forEach(markAddedSlot);
  bookedTemplateUpdates.forEach((slot) => {
    slot.availabilityLocation = location;
    markRangeCells(slot.date, Math.max(minutesFromTime(slot.start), startMinutes), Math.min(minutesFromTime(slot.end), endMinutes), state.unsavedRecurringCellKeys);
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

  state.slots.forEach((slot) => {
    if (slot.coachId === coachId && slot.date >= today && weekdayIndex(slot.date) === targetWeekday) {
      dates.add(slot.date);
    }
  });

  state.pendingDeletedSlots.forEach((slot) => {
    if (slot.coachId === coachId && slot.date >= today && weekdayIndex(slot.date) === targetWeekday) {
      dates.add(slot.date);
    }
  });

  return [...dates].sort();
}

function replaceRecurringAvailabilityRange(coachId, date, startMinutes, endMinutes, lesson, location, note, trimCrossRinkConflicts = false) {
  return getRecurringDatesForDate(coachId, date).reduce(
    (summary, recurringDate) => {
      markRangeCells(recurringDate, startMinutes, endMinutes, state.unsavedRecurringCellKeys);
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
  const bookedTemplateUpdates = state.slots.filter((slot) => {
    return (
      slot.coachId === coachId &&
      slot.date === date &&
      slot.booked &&
      rangesOverlap(minutesFromTime(slot.start), minutesFromTime(slot.end), startMinutes, endMinutes)
    );
  });
  const removed = state.slots.filter((slot) => {
    return (
      slot.coachId === coachId &&
      slot.date === date &&
      !slot.booked &&
      rangesOverlap(minutesFromTime(slot.start), minutesFromTime(slot.end), startMinutes, endMinutes)
    );
  });
  const removedIds = new Set(removed.map((slot) => slot.id));

  removed.forEach(markDeletedSlot);
  replaceSlots(state.slots.filter((slot) => !removedIds.has(slot.id)));
  bookedTemplateUpdates.forEach((slot) => {
    slot.availabilityLocation = unavailableSelection;
    markRangeCells(slot.date, Math.max(minutesFromTime(slot.start), startMinutes), Math.min(minutesFromTime(slot.end), endMinutes), state.unsavedRecurringCellKeys);
  });

  return removed;
}

function removeRecurringAvailabilityRange(coachId, date, startMinutes, endMinutes) {
  return getRecurringDatesForDate(coachId, date).flatMap((recurringDate) => {
    markRangeCells(recurringDate, startMinutes, endMinutes, state.unsavedRecurringCellKeys);
    return removeAvailabilityRange(coachId, recurringDate, startMinutes, endMinutes);
  });
}

export function saveAvailabilityChanges() {
  if (!saveSlots()) {
    showFormMessage("保存失败。请先删除过大的本地照片或清理浏览器存储后再试。", true);
    return;
  }
  state.unsavedAddedSlotIds.clear();
  state.unsavedBlockedCellKeys.clear();
  state.unsavedRecurringCellKeys.clear();
  state.unsavedBlockExceptionIds.clear();
  state.pendingDeletedSlots.clear();
  clearUndoHistory();
  setAvailabilityDirty(false, "已保存");
  showFormMessage(getLastStorageRecoveryMessage() || "可预约时间已保存。");
  render();
}

export function handleSlotAction(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const { action, id, ids } = button.dataset;
  if (action === "coach-booking-details" || action === "coach-cancel-booking") {
    const slot = state.slots.find((item) => item.id === id && item.coachId === currentCoachId && item.booked);
    if (!slot) return;
    if (action === "coach-booking-details") openBookingDetails(id);
    else {
      elements.removeBookingDetails.dataset.id = id;
      removeBookingFromDetails();
    }
    return;
  }
  if (action === "student-week") {
    const offset = Number(button.dataset.offset || 0);
    state.studentSelectedDate = addDaysIso(state.studentSelectedDate || elements.studentDateFilter.value || nextWeekdayIso(), offset);
    elements.studentDateFilter.value = state.studentSelectedDate;
    renderStudentSlots();
    return;
  }
  if (action === "set-student-view-mode") {
    state.studentViewMode = button.dataset.viewMode === "week" ? "week" : "day";
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
  if (action === "subscribe-opening") {
    button.textContent = "已订阅候补 / 临时空位提醒";
    button.dataset.waitlist = "subscribed";
    return;
  }
  if (action === "send-multi-coach-request") {
    button.textContent = "已发送给多个教练";
    button.dataset.coachNotification = "multi-coach-request-sent";
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
    const deleted = state.slots.find((slot) => slot.id === id);
    if (deleted) pushUndoState();
    if (deleted) markDeletedSlot(deleted);
    replaceSlots(state.slots.filter((slot) => slot.id !== id));
    refreshAvailabilityDirty();
    render();
  }
  if (action === "delete-many") {
    pushUndoState();
    if (button.dataset.date && button.dataset.start && button.dataset.end) {
      removeRecurringAvailabilityRange(currentCoachId, button.dataset.date, minutesFromTime(button.dataset.start), minutesFromTime(button.dataset.end));
    } else {
      const ids = new Set((button.dataset.ids || "").split(",").filter(Boolean));
      state.slots.filter((slot) => ids.has(slot.id)).forEach(markDeletedSlot);
      replaceSlots(state.slots.filter((slot) => !ids.has(slot.id)));
    }
    refreshAvailabilityDirty();
    render();
  }
  if (action === "delete-block") {
    pushUndoState();
    if (state.unsavedBlockExceptionIds.has(id)) {
      state.unsavedBlockExceptionIds.delete(id);
    } else {
      state.unsavedBlockExceptionIds.add(`delete-${id}`);
    }
    replaceBlockedExceptions(state.blockedExceptions.filter((block) => block.id !== id));
    refreshAvailabilityDirty();
    render();
  }
  if (action === "cancel") {
    const slot = state.slots.find((item) => item.id === id);
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

export function handleStudentDateDraftChange() {
  renderStudentDatePendingState();
}

function applyStudentDateSelection() {
  state.studentSelectedDate = elements.studentDateFilter.value || state.studentSelectedDate || nextWeekdayIso();
  elements.studentDateFilter.value = state.studentSelectedDate;
  renderStudentSlots();
}

function cancelStudentDateSelection() {
  elements.studentDateFilter.value = state.studentSelectedDate || nextWeekdayIso();
  renderStudentDatePendingState();
}

export function handleStudentDateOutsideClick(event) {
  if (!elements.studentDateActions || elements.studentDateActions.classList.contains("is-hidden")) return;
  if (event.target.closest("#studentDateFilter") || event.target.closest("#studentDateActions")) return;
  cancelStudentDateSelection();
}

export function handleBookingNewSlotChange() {
  if (elements.bookingDialogMode.value !== "modify") return;
  const currentSlot = state.slots.find((slot) => slot.id === elements.bookingSlotId.value);
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

export function handleStudentFilterChange(event) {
  const input = event.target.closest("input[type='checkbox']");
  if (!input) return;

  syncStudentFilterCheckboxes(input);
  updateStudentFilterSummaries();
}

export function applyStudentFilterPanel(event) {
  const panelType = event.currentTarget.dataset.studentFilterPanel;
  const panel = panelType === "coach" ? elements.studentCoachFilterPanel : elements.studentRinkFilterPanel;
  if (!panel) return;

  panel.classList.add("is-hidden");
  if (panelType === "coach" && elements.studentCoachSearch) elements.studentCoachSearch.value = "";
  if (panelType === "rink" && elements.studentRinkSearch) elements.studentRinkSearch.value = "";
  renderStudentSlots();
}

export function openStudentFilterPanel(event) {
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

export function handleStudentFilterSearch(event) {
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

export function handleStudentFilterOutsideClick(event) {
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
  if (state.unsavedAddedSlotIds.has(slot.id)) {
    state.unsavedAddedSlotIds.delete(slot.id);
    return;
  }

  state.pendingDeletedSlots.set(slot.id, slot);
  markSlotCells(slot, state.unsavedBlockedCellKeys);
}

function markAddedSlot(slot) {
  state.unsavedAddedSlotIds.add(slot.id);
  for (let minutes = minutesFromTime(slot.start); minutes < minutesFromTime(slot.end); minutes += calendarStep) {
    state.unsavedBlockedCellKeys.delete(cellKey(slot.date, minutes));
  }
}

function undoEditingRange(date, start, end, showMessage = true) {
  const addedIdsToRemove = new Set();
  state.slots.forEach((slot) => {
    if (
      slot.coachId === currentCoachId &&
      slot.date === date &&
      state.unsavedAddedSlotIds.has(slot.id) &&
      rangesOverlap(minutesFromTime(slot.start), minutesFromTime(slot.end), start, end)
    ) {
      addedIdsToRemove.add(slot.id);
    }
  });

  replaceSlots(state.slots.filter((slot) => !addedIdsToRemove.has(slot.id)));
  addedIdsToRemove.forEach((id) => state.unsavedAddedSlotIds.delete(id));

  const restored = [];
  state.pendingDeletedSlots.forEach((slot, id) => {
    if (
      slot.coachId === currentCoachId &&
      slot.date === date &&
      rangesOverlap(minutesFromTime(slot.start), minutesFromTime(slot.end), start, end)
    ) {
      restored.push(slot);
      state.pendingDeletedSlots.delete(id);
      for (let minutes = minutesFromTime(slot.start); minutes < minutesFromTime(slot.end); minutes += calendarStep) {
        state.unsavedBlockedCellKeys.delete(cellKey(slot.date, minutes));
      }
    }
  });

  const blockIdsToRemove = new Set();
  state.blockedExceptions.forEach((block) => {
    if (
      block.coachId === currentCoachId &&
      block.date === date &&
      state.unsavedBlockExceptionIds.has(block.id) &&
      rangesOverlap(minutesFromTime(block.start), minutesFromTime(block.end), start, end)
    ) {
      blockIdsToRemove.add(block.id);
      for (let minutes = minutesFromTime(block.start); minutes < minutesFromTime(block.end); minutes += calendarStep) {
        state.unsavedBlockedCellKeys.delete(cellKey(block.date, minutes));
      }
    }
  });
  replaceBlockedExceptions(state.blockedExceptions.filter((block) => !blockIdsToRemove.has(block.id)));
  blockIdsToRemove.forEach((id) => state.unsavedBlockExceptionIds.delete(id));
  for (let minutes = start; minutes < end; minutes += calendarStep) {
    state.unsavedRecurringCellKeys.delete(cellKey(date, minutes));
  }

  replaceSlots([...state.slots, ...restored]);
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

export function startCalendarDrag(event) {
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
  const isUnsavedOpen = Boolean(slot && state.unsavedAddedSlotIds.has(slot.id));
  const isUnsavedBlocked = !slot && state.unsavedBlockedCellKeys.has(cellKey(date, minutes));
  const shouldUndoEditing =
    (isUnsavedOpen && selectedLocation === slot.location) ||
    (isUnsavedBlocked && selectedLocation === unavailableSelection);
  state.dragState = {
    dayIndex: Number(cell.dataset.dayIndex),
    start: minutes,
    end: minutes,
    mode: shouldUndoEditing ? "undo" : "open",
  };
  cell.setPointerCapture(event.pointerId);
  paintDragSelection();
}

export function moveCalendarDrag(event) {
  if (!state.dragState) return;

  const target = document.elementFromPoint(event.clientX, event.clientY);
  const cell = target && target.closest(".calendar-cell");
  if (!cell || Number(cell.dataset.dayIndex) !== state.dragState.dayIndex) return;

  state.dragState.end = Number(cell.dataset.minutes);
  paintDragSelection();
}

export function finishCalendarDrag() {
  if (!state.dragState) return;

  const start = Math.min(state.dragState.start, state.dragState.end);
  const end = Math.max(state.dragState.start, state.dragState.end) + calendarStep;
  const date = addDaysIso(elements.calendarWeekStart.value, state.dragState.dayIndex);
  const undoSnapshot = captureUndoState();

  if (state.dragState.mode === "undo") {
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
      state.dragState = null;
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

  state.dragState = null;
  clearDragSelection();
  render();
}

function paintDragSelection() {
  const start = Math.min(state.dragState.start, state.dragState.end);
  const end = Math.max(state.dragState.start, state.dragState.end);
  const isRemovingAvailability = elements.calendarLocationType.value === unavailableSelection;
  const selectionColor = isRemovingAvailability ? "#e2e8f0" : getRinkColor(elements.calendarLocationType.value);
  elements.dragCalendar.querySelectorAll(".calendar-cell").forEach((cell) => {
    cell.classList.remove("selecting", "blocking", "reverting", "removing");
    const sameDay = Number(cell.dataset.dayIndex) === state.dragState.dayIndex;
    const minutes = Number(cell.dataset.minutes);
    const inRange = sameDay && minutes >= start && minutes <= end;
    if (inRange && state.dragState.mode === "open") {
      cell.style.setProperty("--selection-color", selectionColor);
    } else {
      cell.style.removeProperty("--selection-color");
    }
    cell.classList.toggle("selecting", inRange && state.dragState.mode === "open");
    cell.classList.toggle("removing", inRange && state.dragState.mode === "open" && isRemovingAvailability);
    cell.classList.toggle("reverting", inRange && state.dragState.mode === "undo");
  });
}

export function clearDragSelection() {
  elements.dragCalendar.querySelectorAll(".calendar-cell").forEach((cell) => {
    cell.classList.remove("selecting", "blocking", "reverting", "removing");
    cell.style.removeProperty("--selection-color");
  });
}
