import { showFormMessage } from "../../ui/form-message.js";
import { coachElements as elements } from "../../dom/coach-elements.js";
import { currentCoachId } from "../../core/config.js";
import { readProfileState } from "../../core/state.js";
import { renderCoachHeaderSave, setCoachHeaderSaveFeedback, setCoachProfileSaving } from "../header-status.js";

export function showProfileMessage(message, isError = false, showUndo = false) {
  showFormMessage(elements.profileMessage, message, isError, "var(--brand)");
  elements.undoProfileChange.hidden = !showUndo;
}

export function setProfileSaveStatus(message, tone = "saved") {
  setCoachHeaderSaveFeedback("profile", message, tone);
}

export function refreshProfileFeedback(message = "") {
  const isDirty = readProfileState(currentCoachId).dirty;
  setProfileSaveStatus(isDirty ? "有未保存的更改" : "已保存", isDirty ? "dirty" : "saved");
  if (message) showProfileMessage(message);
  else if (!isDirty) showProfileMessage("");
}

export function setProfileSaving(isSaving) {
  setCoachProfileSaving(isSaving);
  if (isSaving) setProfileSaveStatus("保存中…", "saving");
  else renderCoachHeaderSave();
}

export function showProfileSaveFailure(message) {
  setCoachHeaderSaveFeedback("profile", "保存失败", "error", message);
  showProfileMessage(message, true);
}

