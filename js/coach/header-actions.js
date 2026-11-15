import { saveAvailabilityChanges } from "./availability/actions.js";
import { state } from "../core/state.js";
import { coachElements as elements } from "../dom/coach-elements.js";

export function previewCoachSavedProfile(event) {
  if (!state.hasUnsavedProfileChanges && !state.hasUnsavedAvailabilityChanges) return;
  if (!window.confirm("预览将显示已保存版本，不包含当前未保存修改。是否继续预览？选择取消返回编辑。")) {
    event.preventDefault();
  }
}

export function saveCoachHeaderChanges() {
  if (document.documentElement.dataset.activeCoachPanel === "profilePanel") {
    if (state.hasUnsavedProfileChanges) elements.coachProfileForm.requestSubmit();
  } else if (state.hasUnsavedAvailabilityChanges) {
    saveAvailabilityChanges();
  }
}
