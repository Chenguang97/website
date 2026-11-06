import { restoreBookingUndoSnapshot } from "../core/booking-undo.js";
import { isUndoShortcut, popLatestUndoSnapshot } from "../core/undo-history.js";
import { renderStudentOwnBookings, renderStudentSlots } from "./render.js";

export function undoStudentBookingChange() {
  const snapshot = popLatestUndoSnapshot("booking");
  if (!snapshot) return;
  restoreBookingUndoSnapshot(snapshot);
  renderStudentSlots();
  renderStudentOwnBookings();
}

export function handleStudentUndoKeydown(event) {
  if (!isUndoShortcut(event)) return;
  event.preventDefault();
  undoStudentBookingChange();
}
