import { setAvailabilityDirty } from "../availability/status.js";
import { pushBookingUndoSnapshot } from "../../core/booking-undo.js";
import { restoreConsumedAvailabilitySlots } from "../../core/bookings.js";
import { state } from "../../core/state.js";
import { formatDate } from "../../core/utils-data.js";
import { bookingDialogElements } from "../../dom/booking-dialog-elements.js";
import { closeBookingDetails, getBookingDetailsSlotId, openBookingDetails } from "../../ui/booking-details.js";
import { renderCoachBookingChanges } from "./refresh.js";

export function removeCoachBookingFromDetails() {
  const slot = state.slots.find((item) => item.id === getBookingDetailsSlotId());
  if (!slot || !slot.booked) return;
  const studentName = slot.student?.name || "这位学生";
  if (!window.confirm(`确定要取消 ${studentName} 在 ${formatDate(slot.date)} ${slot.start}-${slot.end} 的预约吗？`)) return;
  pushBookingUndoSnapshot();
  restoreConsumedAvailabilitySlots(slot);
  slot.booked = false;
  slot.student = null;
  closeBookingDetails();
  setAvailabilityDirty(true, "有未保存的预约修改");
  renderCoachBookingChanges();
}

export function handleScheduleCalendarClick(event) {
  const booking = event.target.closest(".coach-calendar-booking[data-slot-id], .calendar-cell.has-booking[data-slot-id]");
  if (booking) openBookingDetails(booking.dataset.slotId);
}

export function prepareCoachBookingCancellation(slotId) {
  bookingDialogElements.removeBookingDetails.dataset.id = slotId;
  removeCoachBookingFromDetails();
}
