import { isCancelledBooking, isPastBooking } from "../domain/scheduling.mjs";

const statusLabels = {
  Booked: "预约成功",
  booked: "预约成功",
  Confirmed: "预约成功",
  confirmed: "预约成功",
  Pending: "预约成功",
  pending: "预约成功",
  Cancelled: "已取消",
  cancelled: "已取消",
};

export function getBookingStatusLabel(slot, now = new Date()) {
  if (isCancelledBooking(slot)) return "已取消";
  if (isPastBooking(slot, now)) return "已结束";
  return slot.status ? statusLabels[slot.status] || slot.status : "预约成功";
}
