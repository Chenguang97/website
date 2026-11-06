import { cloneUndoData, pushUndoSnapshot } from "./undo-history.js";
import { replaceSlots, state } from "./state.js";

export function pushBookingUndoSnapshot() {
  pushUndoSnapshot({ type: "booking", slots: cloneUndoData(state.slots) });
}

export function restoreBookingUndoSnapshot(snapshot) {
  replaceSlots(cloneUndoData(snapshot.slots));
}

