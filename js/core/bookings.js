import { calendarStep } from "./config.js";
import { replaceSlots, state } from "./state.js";
import { createId, minutesFromTime, timeFromMinutes } from "./utils-data.js";

export function restoreConsumedAvailabilitySlots(slot) {
  if (!Array.isArray(slot.consumedAvailabilitySlots) || !slot.consumedAvailabilitySlots.length) return;
  const existingIds = new Set(state.slots.map((item) => item.id));
  const restoredSlots = slot.consumedAvailabilitySlots
    .filter((item) => !existingIds.has(item.id))
    .map((item) => ({ ...item, booked: false, student: null, consumedAvailabilitySlots: undefined }));
  replaceSlots([...state.slots, ...restoredSlots]);
  slot.consumedAvailabilitySlots = [];
}

export function cancelBooking(slot, actor, now = new Date()) {
  restoreConsumedAvailabilitySlots(slot);
  const reopenedSlot = {
    ...slot,
    id: createId(),
    end: timeFromMinutes(minutesFromTime(slot.start) + calendarStep),
    booked: false,
    student: null,
    status: undefined,
    cancellation: undefined,
    cancelledAt: undefined,
    cancelledBy: undefined,
    consumedAvailabilitySlots: undefined,
    notifications: undefined,
    transactionState: undefined,
  };
  slot.status = "Cancelled";
  slot.cancellation = { actorRole: actor.role, actorName: actor.name, at: now.toISOString() };
  slot.cancelledAt = now.toISOString();
  slot.cancelledBy = actor.role;
  slot.notifications = [...(slot.notifications || []), {
    type: "booking-cancelled",
    channel: "demo-event",
    actorRole: actor.role,
    message: `Demo 提示：${actor.name} 已取消预约，未发送真实通知。`,
    at: now.toISOString(),
  }];
  replaceSlots([...state.slots, reopenedSlot]);
  return slot;
}
