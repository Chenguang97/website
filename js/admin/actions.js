import { createDefaultProfiles, createDefaultSlots } from "../core/demo-data.js";
import { renderAdminDashboard } from "./render.js";
import {
  clearCoachProfileDraft, replaceCoachProfiles, replaceSlots, saveProfiles, saveSlots, state,
} from "../core/state.js";
import { clearUndoHistory } from "../core/undo-history.js";

export function resetDemoData() {
  replaceCoachProfiles(createDefaultProfiles());
  clearCoachProfileDraft();
  replaceSlots(createDefaultSlots());
  state.hasUnsavedProfileChanges = false;
  state.unsavedAddedSlotIds.clear();
  state.unsavedBlockedCellKeys.clear();
  state.unsavedRecurringCellKeys.clear();
  state.unsavedBlockExceptionIds.clear();
  state.pendingDeletedSlots.clear();
  clearUndoHistory();
  if (!saveProfiles() || !saveSlots()) {
    return;
  }
  renderAdminDashboard();
}

