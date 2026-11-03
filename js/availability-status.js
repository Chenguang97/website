import { elements } from "./elements.js";
import { state } from "./state.js";
function showFormMessage(message, isError = false) {
  if (!elements.formMessage) return;
  elements.formMessage.textContent = message;
  elements.formMessage.style.color = isError ? "var(--red)" : "var(--green)";
}
function setAvailabilityDirty(isDirty, message) {
  state.hasUnsavedAvailabilityChanges = isDirty;
  if (!elements.availabilitySaveMessage) return;
  elements.availabilitySaveMessage.textContent = message || (isDirty ? "有未保存修改" : "没有未保存修改");
  elements.availabilitySaveMessage.style.color = isDirty ? "var(--red)" : "var(--muted)";
}
function refreshAvailabilityDirty(message) {
  const isDirty = state.unsavedAddedSlotIds.size > 0 || state.pendingDeletedSlots.size > 0 || state.unsavedBlockExceptionIds.size > 0 || state.unsavedRecurringCellKeys.size > 0;
  setAvailabilityDirty(isDirty, message || (isDirty ? "有未保存修改" : "没有未保存修改"));
}
export {
  refreshAvailabilityDirty,
  setAvailabilityDirty,
  showFormMessage
};
