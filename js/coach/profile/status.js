import { coachElements as elements } from "../../dom/coach-elements.js";
import { state } from "../../core/state.js";
import { renderCoachHeaderSave, setCoachHeaderSaveFeedback } from "../header-status.js";

export function showProfileMessage(message, isError = false, showUndo = false) {
  elements.profileMessage.textContent = message;
  elements.profileMessage.style.color = isError ? "var(--red)" : "var(--brand)";
  elements.undoProfileChange.hidden = !showUndo;
}

export function setProfileSaveStatus(message, tone = "saved") {
  setCoachHeaderSaveFeedback("profile", message, tone);
}

export function setProfileDirty(isDirty, message = "") {
  state.hasUnsavedProfileChanges = isDirty;
  setProfileSaveStatus(isDirty ? "有未保存的更改" : "已保存", isDirty ? "dirty" : "saved");
  if (message) showProfileMessage(message);
  else if (!isDirty) showProfileMessage("");
}

export function setProfileSaving(isSaving) {
  state.isSavingProfile = isSaving;
  if (isSaving) setProfileSaveStatus("保存中…", "saving");
  else renderCoachHeaderSave();
}

export function showProfileSaveFailure(message) {
  setCoachHeaderSaveFeedback("profile", "保存失败", "error", message);
  showProfileMessage(message, true);
}

