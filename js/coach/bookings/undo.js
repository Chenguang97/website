import { restoreBookingUndoSnapshot } from "../../core/booking-undo.js";
import { isUndoShortcut, popLatestUndoSnapshot } from "../../core/undo-history.js";
import { showFormMessage } from "../availability/status.js";
import { renderCoachBookingChanges } from "./refresh.js";

export function undoCoachBookingChange() {
  const snapshot = popLatestUndoSnapshot("booking");
  if (!snapshot) {
    showFormMessage("没有可以撤销的预约更改。");
    return;
  }
  restoreBookingUndoSnapshot(snapshot);
  renderCoachBookingChanges();
  showFormMessage("已撤销上一步预约更改。");
}

export function handleCoachBookingUndoKeydown(event) {
  if (!isUndoShortcut(event)) return;
  event.preventDefault();
  undoCoachBookingChange();
}
