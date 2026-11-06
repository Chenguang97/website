import {
  clearUndoHistory,
  cloneUndoData,
  isUndoShortcut,
  popLatestUndoSnapshot,
  pushUndoSnapshot,
} from "../../core/undo-history.js";
import { setProfileDirty, showProfileMessage } from "./status.js";
import { renderCoachProfile } from "./render.js";
import { ensureCoachProfileDraft, setCoachProfileDraft, state } from "../../core/state.js";

export function captureProfileUndoState() {
  return {
    type: "coach-profile",
    coachProfileDraft: cloneUndoData(ensureCoachProfileDraft()),
    hasUnsavedProfileChanges: state.hasUnsavedProfileChanges,
  };
}

export function pushProfileUndoState(snapshot = captureProfileUndoState()) {
  pushUndoSnapshot(snapshot);
}

export function clearProfileUndoHistory() {
  clearUndoHistory("coach-profile");
}

export function undoProfileChange() {
  const snapshot = popLatestUndoSnapshot("coach-profile");
  if (!snapshot) {
    showProfileMessage("没有可以撤销的资料更改。");
    return;
  }
  setCoachProfileDraft(cloneUndoData(snapshot.coachProfileDraft));
  setProfileDirty(snapshot.hasUnsavedProfileChanges);
  renderCoachProfile();
  showProfileMessage("已恢复课程");
}

export function handleProfileUndoKeydown(event) {
  if (!isUndoShortcut(event)) return;
  event.preventDefault();
  undoProfileChange();
}

