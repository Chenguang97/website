import { isStudentService } from "./service-data.js";
import { studentCommands } from "./remote-actions.js";
import { undoLatestBookingChange } from "../core/booking-undo.js";
import { isUndoShortcut } from "../ui/undo-shortcut.js";
import { refreshStudentPage } from "./calendar-controller.js";

export function undoStudentBookingChange() {
  if (isStudentService()) return studentCommands.undo();
  if (!undoLatestBookingChange().ok) return;
  refreshStudentPage();
}

export function handleStudentUndoKeydown(event) {
  if (!isUndoShortcut(event)) return;
  event.preventDefault();
  undoStudentBookingChange();
}
