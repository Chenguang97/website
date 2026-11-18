import { coachCanManage } from "../service-controller.js";
import { renderFieldMessage } from "../../ui/field-feedback.js";
import { renderWorkTimetable } from "../availability/planner-render.js";
import { scheduleShowsFullDay, toggleScheduleFullDay } from "./view-state.js";
import { openBookingDetails } from "../../ui/booking-details.js";
import { prepareCoachBookingCancellation } from "./details-actions.js";
import { renderAvailabilityStatus, showFormMessage } from "../availability/status.js";
import { calendarStep, currentCoachId, defaultStart } from "../../core/config.js";
import { isActiveBooking, rangesOverlap } from "../../domain/scheduling.mjs";
import { coachElements as elements } from "../../dom/coach-elements.js";
import {
  addAvailabilityBlocks,
  readScheduleState,
} from "../../core/state.js";
import {
  renderDragCalendar, syncEndTimeOptions,
} from "../availability/render.js";
import { renderExceptionDragCalendar } from "./calendar-render.js";
import {
  addDaysIso,
  cellKey,
  createId,
  minutesFromTime,
  startOfWeekIso,
  timeFromMinutes,
  todayIso,
} from "../../core/utils-data.js";

export function toggleScheduleCalendarHours() {
  toggleScheduleFullDay();
  elements.toggleExceptionCalendarHours.textContent = scheduleShowsFullDay() ? "收起全天" : "显示全天";
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
  if (!coachCanManage()) return;
  try {
    const today = todayIso();
    const viewedWeekStart = startOfWeekIso(elements.exceptionCalendarWeekStart.value || today);
    elements.blockDialogDate.value = viewedWeekStart === startOfWeekIso(today) ? today : viewedWeekStart;
    elements.blockDialogStart.value = defaultStart;
    syncEndTimeOptions(elements.blockDialogStart, elements.blockDialogEnd, "12:00");
    elements.blockRepeatWeekly.checked = false;
    clearBlockTimeDialogErrors();
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
  if (!coachCanManage()) return;
  clearBlockTimeDialogErrors();
  const start = elements.blockDialogStart.value;
  const end = elements.blockDialogEnd.value;
  const date = elements.blockDialogDate.value;
  if (!date || !elements.blockDialogDate.validity.valid) {
    showBlockDialogError("请选择有效日期。", [elements.blockDialogDate]);
    return;
  }
  if (!start || !end) {
    showBlockDialogError("请选择完整的开始和结束时间。", [!start ? elements.blockDialogStart : elements.blockDialogEnd]);
    return;
  }
  if (minutesFromTime(end) <= minutesFromTime(start)) {
    showBlockDialogError("结束时间需要晚于开始时间。", [elements.blockDialogEnd]);
    return;
  }

  const dates = Array.from({ length: elements.blockRepeatWeekly.checked ? 12 : 1 }, (_, index) => addDaysIso(date, index * 7));
  const bookingConflict = readScheduleState().slots.find((slot) => slot.coachId === currentCoachId
    && isActiveBooking(slot)
    && dates.includes(slot.date)
    && rangesOverlap(minutesFromTime(start), minutesFromTime(end), minutesFromTime(slot.start), minutesFromTime(slot.end)));
  if (bookingConflict) {
    showBlockDialogError(`该时间与 ${bookingConflict.date} ${bookingConflict.start}–${bookingConflict.end} 的已有预约冲突，请调整时间。`, [elements.blockDialogStart, elements.blockDialogEnd]);
    return;
  }

  const blocks = dates.map((blockDate) => ({
    id: createId(), coachId: currentCoachId, date: blockDate,
    start, end, reason: "不可预约时间",
  }));
  const result = addAvailabilityBlocks(blocks);
  if (!result.ok) { showBlockDialogError(result.message || "无法添加，草稿已保留。", [elements.blockDialogStart]); return; }
  renderAvailabilityStatus("有未保存的不可预约时间");
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
  const slot = readScheduleState().slots.find((item) => item.id === id && item.coachId === currentCoachId && item.booked);
  if (!slot) return;
  if (action === "coach-booking-details") openBookingDetails(id);
  else {
    prepareCoachBookingCancellation(id);
  }
}

function renderAffectedAvailabilityViews() {
  renderDragCalendar();
  renderExceptionDragCalendar();
  renderWorkTimetable();
}

export function clearBlockTimeDialogErrors() {
  [elements.blockDialogDateMessage, elements.blockDialogMessage].forEach((message) => {
    message.textContent = "";
    message.hidden = true;
  });
  [elements.blockDialogDate, elements.blockDialogStart, elements.blockDialogEnd].forEach((field) => field.removeAttribute("aria-invalid"));
}

function showBlockDialogError(message, fields) {
  const target = fields.includes(elements.blockDialogDate) ? elements.blockDialogDateMessage : elements.blockDialogMessage;
  renderFieldMessage(target, message);
  fields.forEach((field) => field.setAttribute("aria-invalid", "true"));
  fields[0].focus();
}

function setCoachBookingActionMessage(message, isError = false) {
  if (!elements.coachBookingActionStatus) return;
  elements.coachBookingActionStatus.textContent = message;
  elements.coachBookingActionStatus.hidden = !message;
  elements.coachBookingActionStatus.classList.toggle("is-error", isError);
}
