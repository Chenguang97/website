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

// Pure display mapping. The caller supplies facts from its captured rule clock.
export function getBookingStatusLabel({ status, past, cancelled }) {
  if (cancelled) return "已取消";
  if (past) return "已结束";
  return status ? statusLabels[status] || status : "预约成功";
}
