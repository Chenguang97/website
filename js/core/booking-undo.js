import { readScheduleState, peekBookingUndo, completeBookingUndo } from "./state.js";
import { persistBookingSchedule, refreshLocalScheduleFacts } from "./scheduling-transactions.js";
import { undoBookingChange } from "../domain/bookings.mjs";

export function undoLatestBookingChange() {
  const snapshot = peekBookingUndo();
  if (!snapshot) return { ok: false, reason: "empty" };
  const result = restoreBookingUndo(snapshot);
  if (result.ok) completeBookingUndo(snapshot);
  return result;
}

export function restoreBookingUndo(snapshot) {
  if (refreshLocalScheduleFacts()) return { ok: false, reason: "stale" };
  const slots = undoBookingChange(readScheduleState().publishedSlots, snapshot.slots, snapshot.after);
  if (!slots) return { ok: false, reason: "conflict", message: "预约已变化，请检查后重试。" };
  return persistBookingSchedule({ slots });
}
