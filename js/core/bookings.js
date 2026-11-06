import { replaceSlots, state } from "./state.js";

export function restoreConsumedAvailabilitySlots(slot) {
  if (!Array.isArray(slot.consumedAvailabilitySlots) || !slot.consumedAvailabilitySlots.length) return;
  const existingIds = new Set(state.slots.map((item) => item.id));
  const restoredSlots = slot.consumedAvailabilitySlots
    .filter((item) => !existingIds.has(item.id))
    .map((item) => ({ ...item, booked: false, student: null, consumedAvailabilitySlots: undefined }));
  replaceSlots([...state.slots, ...restoredSlots]);
  slot.consumedAvailabilitySlots = [];
}
