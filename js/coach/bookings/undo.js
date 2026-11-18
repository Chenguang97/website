import { coachUsesService } from "../service-controller.js";
import { undoRemoteCoachBooking } from "./service-commands.js";
import { synchronizeCoachBookingRequests } from "./request-sync.js";
import { undoLatestBookingChange } from "../../core/booking-undo.js";
import { isUndoShortcut } from "../../ui/undo-shortcut.js";
import { showFormMessage } from "../availability/status.js";
import { receiveCoachBookingChanges } from "./refresh.js";

export function undoCoachBookingChange() {
  if (coachUsesService()) return undoRemoteCoachBooking();
  const result = undoLatestBookingChange();
  if (!result.ok) {
    showFormMessage(result.reason === 'empty' ? '没有可以撤销的预约更改。' : '撤销未能保存或预约已变化，请检查后重试。', result.reason !== 'empty');
    return;
  }
  synchronizeCoachBookingRequests();
  receiveCoachBookingChanges({ resetRequest: true });
  showFormMessage("已撤销上一步预约更改。");
}

export function handleCoachBookingUndoKeydown(event) {
  if (!isUndoShortcut(event)) return;
  event.preventDefault();
  undoCoachBookingChange();
}
