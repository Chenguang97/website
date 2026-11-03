import { elements } from "./elements.js";
import { state } from "./state.js";

export function showProfileMessage(message, isError = false, showUndo = false) {
  elements.profileMessage.textContent = message;
  elements.profileMessage.style.color = isError ? "var(--red)" : "var(--brand)";
  elements.undoProfileChange.hidden = !showUndo;
}

export function setProfileSaveStatus(message, tone = "saved") {
  elements.profileSaveStatus.textContent = message;
  elements.profileSaveStatus.dataset.tone = tone;
}

export function setProfileDirty(isDirty, message = "") {
  state.hasUnsavedProfileChanges = isDirty;
  elements.saveProfileChanges.classList.toggle("has-unsaved", isDirty);
  elements.profilePreviewNote.hidden = !isDirty;
  setProfileSaveStatus(isDirty ? "有未保存的更改" : "已保存", isDirty ? "dirty" : "saved");
  if (message) showProfileMessage(message);
  else if (!isDirty) showProfileMessage("");
}

export function setProfileSaving(isSaving) {
  state.isSavingProfile = isSaving;
  elements.saveProfileChanges.disabled = isSaving;
  elements.saveProfileChanges.toggleAttribute("aria-busy", isSaving);
  elements.saveProfileChanges.textContent = isSaving ? "保存中…" : "保存更改";
  if (isSaving) setProfileSaveStatus("保存中…", "saving");
}

export function showProfileSaveFailure(message) {
  setProfileSaveStatus("保存失败", "error");
  showProfileMessage(message, true);
}
