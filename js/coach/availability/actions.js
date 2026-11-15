import { refreshAvailabilityDirty, setAvailabilityDirty, showFormMessage } from "./status.js";
import { isCoachScheduleSaving, setCoachHeaderSaveFeedback, setCoachScheduleSaving } from "../header-status.js";
import {
  calendarStep,
  currentCoachId,
  fullDayEnd,
  recurringFutureWeeks,
  recurringPastWeeks,
  unavailableSelection,
} from "../../core/config.js";
import { rangesOverlap } from "../../domain/scheduling.mjs";
import { coachElements } from "../../dom/coach-elements.js";
import {
  getAvailabilityLesson,
  getLastStorageRecoveryMessage,
  replaceBlockedExceptions,
  replaceSlots,
  saveSlots,
  state,
} from "../../core/state.js";
import { formatLocationLabel } from "../../ui/display.js";
import { clearUndoHistory } from "../../core/undo-history.js";
import {
  renderDragCalendar,
  renderAvailabilityData,
  renderDropdownOpenSlots,
  renderDropdownWeekSlots,
  syncEndTimeOptions,
} from "./render.js";
import { beginAvailabilityDragPreview, clearAvailabilityDragPreview, paintAvailabilityDragPreview } from "./drag-preview.js";
import { renderExceptionCalendarAvailability } from "../bookings/calendar-render.js";
import {
  captureAvailabilityUndoState,
  clearAvailabilityUndoHistory,
  pushAvailabilityUndoState,
} from "./undo.js";
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
} from "../../core/utils-data.js";

const elements = coachElements;

function renderAvailabilityChanges() {
  renderAvailabilityData();
  renderExceptionCalendarAvailability();
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
  const undoSnapshot = captureAvailabilityUndoState();
  const { newSlots, overwritten, trimmed } = replaceRecurringAvailabilityRange(
    currentCoachId,
    change.date,
    change.startMinutes,
    change.endMinutes,
    change.lesson,
    change.location,
    change.note,
    trimCrossRinkConflicts
  );

  if (!newSlots.length && !overwritten.length && !trimmed.length) {
    showFormMessage("这段时间没有可覆盖的开放时间，可能已经被预约。");
    return;
  }

  pushAvailabilityUndoState(undoSnapshot);
  elements.coachNote.value = "";
  refreshAvailabilityDirty();
  showFormMessage(`已同步每周可预约时间：${newSlots.length} 个新时间，${overwritten.length} 个开放时间，${trimmed.length} 个裁剪时段。已有预约保持不变。`);
  renderAvailabilityChanges();
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
  elements.conflictDetails.textContent = `新时段 ${formatDate(change.date)} ${timeFromMinutes(change.startMinutes)}-${timeFromMinutes(change.endMinutes)} · ${formatLocationLabel(change.location)} 与其他冰场开放时间重叠：${sample.join("；")}${extra}。选择「覆盖并添加」将裁剪旧的开放时段；选择「取消」保留原状。`;
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
  cancelCalendarDrag();
  state.calendarShowsFullDay = !state.calendarShowsFullDay;
  elements.toggleCalendarHours.textContent = state.calendarShowsFullDay ? "收起全天" : "显示全天";
  renderDragCalendar();
}

export function renderWeeklyAvailabilityViews() {
  cancelCalendarDrag();
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

function cloneSlotSegment(slot, startMinutes, endMinutes) {
  return {
    ...slot,
    id: createId(),
    start: timeFromMinutes(startMinutes),
    end: timeFromMinutes(endMinutes),
  };
}

function replaceAvailabilityRange(coachId, date, startMinutes, endMinutes, lesson, location, note, trimCrossRinkConflicts = false) {
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
  return { newSlots, overwritten, trimmed };
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
      summary.trimmed.push(...result.trimmed);
      return summary;
    },
    { newSlots: [], overwritten: [], trimmed: [] }
  );
}

function removeAvailabilityRange(coachId, date, startMinutes, endMinutes) {
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

  return removed;
}

function removeRecurringAvailabilityRange(coachId, date, startMinutes, endMinutes) {
  return getRecurringDatesForDate(coachId, date).flatMap((recurringDate) => {
    markRangeCells(recurringDate, startMinutes, endMinutes, state.unsavedRecurringCellKeys);
    return removeAvailabilityRange(coachId, recurringDate, startMinutes, endMinutes);
  });
}

export function saveAvailabilityChanges() {
  if (isCoachScheduleSaving()) return;
  setCoachScheduleSaving(true);
  try {
    if (!saveSlots()) {
      const reason = getLastStorageRecoveryMessage() || "保存失败。请清理浏览器存储后再试，当前草稿已保留。";
      setCoachHeaderSaveFeedback("schedule", "保存失败", "error", reason);
      showFormMessage(reason, true);
      return;
    }
    state.unsavedAddedSlotIds.clear();
    state.unsavedBlockedCellKeys.clear();
    state.unsavedRecurringCellKeys.clear();
    state.unsavedBlockExceptionIds.clear();
    state.pendingDeletedSlots.clear();
    clearAvailabilityUndoHistory();
    clearUndoHistory("booking");
    setAvailabilityDirty(false, "已保存");
    showFormMessage(getLastStorageRecoveryMessage() || "可预约时间已保存。");
    renderAvailabilityChanges();
  } finally {
    setCoachScheduleSaving(false);
  }
}

export function handleAvailabilitySlotAction(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const { action, id } = button.dataset;
  if (action === "delete") {
    const deleted = state.slots.find((slot) => slot.id === id);
    if (deleted) pushAvailabilityUndoState();
    if (deleted) markDeletedSlot(deleted);
    replaceSlots(state.slots.filter((slot) => slot.id !== id));
    refreshAvailabilityDirty();
    renderAvailabilityChanges();
  }
  if (action === "delete-many") {
    pushAvailabilityUndoState();
    if (button.dataset.date && button.dataset.start && button.dataset.end) {
      removeRecurringAvailabilityRange(currentCoachId, button.dataset.date, minutesFromTime(button.dataset.start), minutesFromTime(button.dataset.end));
    } else {
      const ids = new Set((button.dataset.ids || "").split(",").filter(Boolean));
      state.slots.filter((slot) => ids.has(slot.id)).forEach(markDeletedSlot);
      replaceSlots(state.slots.filter((slot) => !ids.has(slot.id)));
    }
    refreshAvailabilityDirty();
    renderAvailabilityChanges();
  }
  if (action === "delete-block") {
    pushAvailabilityUndoState();
    if (state.unsavedBlockExceptionIds.has(id)) {
      state.unsavedBlockExceptionIds.delete(id);
    } else {
      state.unsavedBlockExceptionIds.add(`delete-${id}`);
    }
    replaceBlockedExceptions(state.blockedExceptions.filter((block) => block.id !== id));
    refreshAvailabilityDirty();
    renderAvailabilityChanges();
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

export function startCalendarDrag(event) {
  if (event.button !== undefined && event.button !== 0) return;
  const cell = event.target.closest(".calendar-cell");
  if (!cell || cell.classList.contains("has-booking")) return;
  const dayIndex = Number(cell.dataset.dayIndex);
  const date = addDaysIso(elements.calendarWeekStart.value, dayIndex);
  const minutes = Number(cell.dataset.minutes);
  if (isPastCalendarCell(date, minutes)) {
    cell.blur();
    return;
  }
  cancelCalendarDrag();
  state.dragState = {
    dayIndex, date, start: minutes, end: minutes,
    location: elements.calendarLocationType.value,
    pointerId: event.pointerId,
  };
  beginAvailabilityDragPreview();
  elements.dragCalendar.setPointerCapture?.(event.pointerId);
  event.preventDefault?.();
  paintAvailabilityDragPreview(state.dragState);
}

export function moveCalendarDrag(event) {
  const drag = state.dragState;
  if (!drag || (event.pointerId !== undefined && event.pointerId !== drag.pointerId)) return;
  const cell = document.elementFromPoint(event.clientX, event.clientY)?.closest(".calendar-cell");
  if (!cell || !elements.dragCalendar.contains(cell) || Number(cell.dataset.dayIndex) !== drag.dayIndex) return;
  if (isPastCalendarCell(drag.date, Number(cell.dataset.minutes))) return;
  drag.end = Number(cell.dataset.minutes);
  paintAvailabilityDragPreview(drag);
}

export function cancelCalendarDrag(event) {
  const drag = state.dragState;
  if (!drag || (event?.pointerId !== undefined && event.pointerId !== drag.pointerId)) return;
  state.dragState = null;
  clearAvailabilityDragPreview();
  if (elements.dragCalendar.hasPointerCapture?.(drag.pointerId)) {
    elements.dragCalendar.releasePointerCapture(drag.pointerId);
  }
}

export function handleCalendarDragKeydown(event) {
  if (event.key !== "Escape" || !state.dragState) return;
  event.preventDefault();
  cancelCalendarDrag();
}

export function finishCalendarDrag(event) {
  const drag = state.dragState;
  if (!drag || (event?.pointerId !== undefined && event.pointerId !== drag.pointerId)) return;
  // Restore the exact pre-gesture view before committing only the final range.
  cancelCalendarDrag();
  const start = Math.min(drag.start, drag.end);
  const end = Math.max(drag.start, drag.end) + calendarStep;
  const undoSnapshot = captureAvailabilityUndoState();
  if (drag.location === unavailableSelection) {
    const removed = removeRecurringAvailabilityRange(currentCoachId, drag.date, start, end);
    if (removed.length) {
      pushAvailabilityUndoState(undoSnapshot);
      refreshAvailabilityDirty();
      showFormMessage(`已删除 ${removed.length} 个每周可预约时间，记得保存可预约时间。`);
    } else {
      showFormMessage("这段没有可删除的开放时间，可能已经被预约或本来就是不可预约。");
    }
  } else {
    requestAvailabilityChange({
      date: drag.date,
      startMinutes: start,
      endMinutes: end,
      lesson: getAvailabilityLesson(),
      location: drag.location,
      note: `从日历添加：${formatLocationLabel(drag.location)}。`,
      source: "calendar",
    });
  }
  renderAvailabilityChanges();
}
