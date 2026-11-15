import { coachElements as elements } from "../dom/coach-elements.js";
import { state } from "../core/state.js";

const saveFeedback = { profile: null, schedule: null };
let scheduleSaving = false;

export function isCoachScheduleSaving() { return scheduleSaving; }
export function setCoachScheduleSaving(saving) {
  scheduleSaving = saving;
  renderCoachHeaderSave();
  elements.saveAvailability.disabled = saving;
}

export function renderCoachHeaderSave() {
  const panel = document.documentElement.dataset.activeCoachPanel;
  const profile = panel === "profilePanel";
  const dirty = profile ? state.hasUnsavedProfileChanges : state.hasUnsavedAvailabilityChanges;
  const busy = profile ? state.isSavingProfile : scheduleSaving;
  const feedback = saveFeedback[profile ? "profile" : "schedule"];
  const tone = busy ? "saving" : feedback?.tone === "error" && dirty ? "error" : dirty ? "dirty" : "saved";
  const message = busy ? "保存中…" : tone === "error" ? feedback.message : dirty ? "未保存更改" : "已保存";
  elements.coachSaveToolbar.hidden = !(profile || panel === "availabilityPanel" || dirty || busy);
  elements.profileSaveStatus.textContent = message;
  elements.profileSaveStatus.dataset.tone = tone;
  elements.profileSaveStatus.parentElement.hidden = false;
  elements.coachSaveError.hidden = tone !== "error";
  elements.coachSaveError.textContent = tone === "error" ? feedback.reason || "保存失败，修改已保留，请重试。" : "";
  elements.saveProfileChanges.hidden = false;
  elements.saveProfileChanges.disabled = busy || !dirty;
  elements.saveProfileChanges.classList.toggle("has-unsaved", dirty);
  if (busy) elements.saveProfileChanges.setAttribute("aria-busy", "true");
  else elements.saveProfileChanges.removeAttribute("aria-busy");
  elements.coachSaveLabel.textContent = busy ? "保存中…" : "保存更改";
}

export function setCoachHeaderSaveFeedback(scope, message, tone, reason = "") {
  saveFeedback[scope] = { message, tone, reason };
  renderCoachHeaderSave();
}
