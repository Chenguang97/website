import { isUndoShortcut } from "../../ui/undo-shortcut.js";
import { refreshProfileFeedback, showProfileMessage } from "./status.js";
import { renderCoachProfile } from "./render.js";
import { currentCoachId } from "../../core/config.js";
import { undoCoachProfileDraft } from "../../core/state.js";

export function undoProfileChange() {
  const result = undoCoachProfileDraft(currentCoachId);
  if (!result.ok) {
    showProfileMessage("没有可以撤销的资料更改。");
    return;
  }
  refreshProfileFeedback();
  renderCoachProfile();
  showProfileMessage("已恢复课程");
}

export function handleProfileUndoKeydown(event) {
  if (!isUndoShortcut(event)) return;
  event.preventDefault();
  undoProfileChange();
}
