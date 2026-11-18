import { showFormMessage as presentFormMessage } from "../../ui/form-message.js";
import { coachElements as elements } from "../../dom/coach-elements.js";
import { readAvailabilityChanges } from "../../core/state.js";
import { setCoachHeaderSaveFeedback } from "../header-status.js";
let calendarFeedbackTimer = null;
export function clearCalendarFeedback() {
  clearTimeout(calendarFeedbackTimer);
  calendarFeedbackTimer = null;
  elements.coachOpenOperationMessage.textContent = "";
  elements.coachOpenOperationMessage.hidden = true;
}
export function showCalendarFeedback(message, isError = false) {
  clearCalendarFeedback();
  elements.coachOpenOperationMessage.textContent = message;
  elements.coachOpenOperationMessage.dataset.tone = isError ? "error" : "success";
  elements.coachOpenOperationMessage.hidden = false;
  if (!isError) calendarFeedbackTimer = setTimeout(clearCalendarFeedback, 2000);
}
function showFormMessage(message, isError = false) {
  if (!elements.formMessage) return;
  elements.formMessage.dataset.tone = isError ? "error" : "success";
  presentFormMessage(elements.formMessage, message, isError);
}
function renderAvailabilityStatus(message) {
  const isDirty = readAvailabilityChanges().dirty;
  setCoachHeaderSaveFeedback("schedule", isDirty ? "有未保存的更改" : "已保存", isDirty ? "dirty" : "saved");
  if (!elements.availabilitySaveMessage) return;
  elements.availabilitySaveMessage.textContent = message || (isDirty ? "有未保存修改" : "没有未保存修改");
  elements.availabilitySaveMessage.style.color = isDirty ? "var(--red)" : "var(--muted)";
}
export {
  renderAvailabilityStatus,
  showFormMessage
};

