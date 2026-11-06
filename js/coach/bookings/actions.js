import { openBookingDetails } from "../../ui/booking-details.js";
import { prepareCoachBookingCancellation } from "./details-actions.js";
import { refreshAvailabilityDirty, showFormMessage } from "../availability/status.js";
import { calendarStep, currentCoachId, defaultStart } from "../../core/config.js";
import { rangesOverlap } from "../../domain/scheduling.mjs";
import { coachElements as elements } from "../../dom/coach-elements.js";
import {
  addBlockedException,
  state,
} from "../../core/state.js";
import {
  renderDragCalendar, renderDropdownOpenSlots, renderDropdownWeekSlots, syncEndTimeOptions,
} from "../availability/render.js";
import { renderExceptionDragCalendar } from "./calendar-render.js";
import { captureAvailabilityUndoState, pushAvailabilityUndoState } from "../availability/undo.js";
import {
  addDaysIso,
  cellKey,
  createId,
  minutesFromTime,
  nextWeekdayIso,
  startOfWeekIso,
  timeFromMinutes,
  todayIso,
} from "../../core/utils-data.js";

export function toggleScheduleCalendarHours() {
  state.exceptionCalendarShowsFullDay = !state.exceptionCalendarShowsFullDay;
  elements.toggleExceptionCalendarHours.textContent = state.exceptionCalendarShowsFullDay ? "收起全天" : "显示全天";
  renderExceptionDragCalendar();
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
  try {
    elements.blockDialogDate.value = elements.exceptionCalendarWeekStart.value || elements.slotDate.value || nextWeekdayIso();
    elements.blockDialogStart.value = defaultStart;
    syncEndTimeOptions(elements.blockDialogStart, elements.blockDialogEnd, "12:00");
    elements.blockRepeatWeekly.checked = false;
    setBlockDialogMessage("");
    setCoachBookingActionMessage("");
    elements.blockDialog.showModal();
  } catch (error) {
    console.error("Unable to open blocked-time dialog", error);
    setCoachBookingActionMessage("无法打开不可预约时间设置，请刷新页面后重试。", true);
  }
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
    setBlockDialogMessage("结束时间需要晚于开始时间。", true);
    return;
  }

  const dates = Array.from({ length: elements.blockRepeatWeekly.checked ? 12 : 1 }, (_, index) => addDaysIso(date, index * 7));
  const bookingConflict = state.slots.find((slot) => slot.coachId === currentCoachId
    && slot.booked
    && dates.includes(slot.date)
    && rangesOverlap(minutesFromTime(start), minutesFromTime(end), minutesFromTime(slot.start), minutesFromTime(slot.end)));
  if (bookingConflict) {
    setBlockDialogMessage(`该时间与 ${bookingConflict.date} ${bookingConflict.start}–${bookingConflict.end} 的已有预约冲突，请调整时间。`, true);
    elements.blockDialogStart.focus();
    return;
  }

  const undoSnapshot = captureAvailabilityUndoState();
  dates.forEach((blockDate) => addBlockExceptionRange(blockDate, minutesFromTime(start), minutesFromTime(end)));
  pushAvailabilityUndoState(undoSnapshot);
  elements.blockDialog.close();
  renderAffectedAvailabilityViews();
  const message = elements.blockRepeatWeekly.checked ? "已添加每周重复不可预约时间，请在「开放时间」中保存。" : "已添加不可预约时间，请在「开放时间」中保存。";
  showFormMessage(message);
  setCoachBookingActionMessage(message);
}

export function handleCoachBookingAction(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const { action, id } = button.dataset;
  if (action !== "coach-booking-details" && action !== "coach-cancel-booking") return;
  const slot = state.slots.find((item) => item.id === id && item.coachId === currentCoachId && item.booked);
  if (!slot) return;
  if (action === "coach-booking-details") openBookingDetails(id);
  else {
    prepareCoachBookingCancellation(id);
  }
}

function addBlockExceptionRange(date, start, end, reason = "不可预约时间") {
  const block = { id: createId(), coachId: currentCoachId, date, start: timeFromMinutes(start), end: timeFromMinutes(end), reason };
  addBlockedException(block);
  state.unsavedBlockExceptionIds.add(block.id);
  for (let minutes = start; minutes < end; minutes += calendarStep) {
    state.unsavedBlockedCellKeys.add(cellKey(date, minutes));
  }
  refreshAvailabilityDirty("有未保存的不可预约时间");
}

function renderAffectedAvailabilityViews() {
  renderDragCalendar();
  renderExceptionDragCalendar();
  renderDropdownOpenSlots();
  renderDropdownWeekSlots();
}

function setBlockDialogMessage(message) {
  if (!elements.blockDialogMessage) return;
  elements.blockDialogMessage.textContent = message;
  elements.blockDialogMessage.hidden = !message;
}

function setCoachBookingActionMessage(message, isError = false) {
  if (!elements.coachBookingActionStatus) return;
  elements.coachBookingActionStatus.textContent = message;
  elements.coachBookingActionStatus.hidden = !message;
  elements.coachBookingActionStatus.classList.toggle("is-error", isError);
}

