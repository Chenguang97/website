import { isCancelledBooking, isPastBooking } from "../domain/scheduling.mjs";

const statusLabels = {
  Confirmed: "已确认",
  confirmed: "已确认",
  Pending: "待确认",
  pending: "待确认",
  Cancelled: "已取消",
  cancelled: "已取消",
};

export function getBookingStatusLabel(slot, now = new Date()) {
  if (isCancelledBooking(slot)) return "已取消";
  if (isPastBooking(slot, now)) return "已结束";
  if (new Date(`${slot.date}T${slot.start}`) <= now) return "进行中";
  return slot.status ? statusLabels[slot.status] || slot.status : "已确认";
}
