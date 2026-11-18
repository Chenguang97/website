import { isStudentService } from "./service-data.js";
import { removeStudentFilterChip, closeStudentFilterPanel } from "./filter-controls.js";
import {
  cancelStudentBooking,
  openBookingDialog,
  openModifyBookingDialog,
  openStudentSlotOptions,
} from "./booking-actions.js";
import { studentElements } from "../dom/student-elements.js";
import { refreshStudentCalendar } from "./calendar-controller.js";
import { renderStudentDatePendingState } from "./calendar-render.js";
import { getStudentDateDraft, setStudentDateDraft, cancelStudentDateDraft, getStudentSelectedDate, selectStudentDate, setStudentViewMode } from "./view-state.js";
import { addDaysIso, nextWeekdayIso } from "../core/utils-data.js";

const elements = studentElements;

export function handleStudentAction(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const { action, id, ids } = button.dataset;
  if (isStudentService() && ["subscribe-opening", "send-multi-coach-request"].includes(action)) return;

  if (action === "student-week") {
    const offset = Number(button.dataset.offset || 0);
    selectStudentDate(addDaysIso(getStudentSelectedDate() || nextWeekdayIso(), offset));
    elements.studentDateFilter.value = getStudentSelectedDate();
    refreshStudentCalendar();
  } else if (action === "set-student-view-mode") {
    setStudentViewMode(button.dataset.viewMode);
    refreshStudentCalendar();
  } else if (action === "apply-student-date") {
    applyStudentDateSelection();
  } else if (action === "remove-student-filter") {
    removeStudentFilterChip(button.dataset.filterName, button.dataset.filterValue);
    refreshStudentCalendar();
  } else if (action === "subscribe-opening") {
    button.textContent = "已订阅候补 / 临时空位提醒";
    button.dataset.waitlist = "subscribed";
  } else if (action === "send-multi-coach-request") {
    button.textContent = "已发送给多个教练";
    button.dataset.coachNotification = "multi-coach-request-sent";
  } else if (action === "choose-time") {
    openStudentSlotOptions((ids || "").split(",").filter(Boolean));
  } else if (action === "book") {
    openBookingDialog(id, button.dataset.lessonId);
  } else if (action === "modify-student-booking") {
    openModifyBookingDialog(id);
  } else if (action === "cancel-student-booking") {
    cancelStudentBooking(id);
  }
}

export function handleStudentDateDraftChange() {
  setStudentDateDraft(elements.studentDateFilter.value);
  renderStudentDatePendingState();
}

function applyStudentDateSelection() {
  selectStudentDate(getStudentDateDraft() || getStudentSelectedDate() || nextWeekdayIso());
  elements.studentDateFilter.value = getStudentSelectedDate();
  refreshStudentCalendar();
}

function cancelStudentDateSelection() {
  cancelStudentDateDraft();
  elements.studentDateFilter.value = getStudentSelectedDate() || nextWeekdayIso();
  renderStudentDatePendingState();
}

export function handleStudentDateOutsideClick(event) {
  if (!elements.studentDateActions || elements.studentDateActions.classList.contains("is-hidden")) return;
  if (event.target.closest("#studentDateFilter") || event.target.closest("#studentDateActions")) return;
  cancelStudentDateSelection();
}

export function applyStudentFilterPanel(event) {
  closeStudentFilterPanel(event);
  refreshStudentCalendar();
}
