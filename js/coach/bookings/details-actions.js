import { pushBookingUndoSnapshot } from "../../core/booking-undo.js";
import { cancelBooking } from "../../core/bookings.js";
import { saveSlots, state } from "../../core/state.js";
import { currentCoachId } from "../../core/config.js";
import { canCancelBooking } from "../../core/scheduling-rules.js";
import { formatDate } from "../../core/utils-data.js";
import { bookingDialogElements } from "../../dom/booking-dialog-elements.js";
import { closeBookingDetails, getBookingDetailsSlotId, openBookingDetails } from "../../ui/booking-details.js?v=coach-booking-list-1";
import { renderCoachBookingChanges } from "./refresh.js?v=coach-booking-row-effect-1";

export function removeCoachBookingFromDetails() {
  const slot = state.slots.find((item) => item.id === getBookingDetailsSlotId() && item.coachId === currentCoachId);
  if (!canCancelBooking(slot)) return;
  const studentName = slot.student?.name || "这位学生";
  if (!window.confirm(`确定要取消 ${studentName} 在 ${formatDate(slot.date)} ${slot.start}-${slot.end} 的预约吗？`)) return;
  pushBookingUndoSnapshot();
  cancelBooking(slot, { role: "coach", name: "Maya Chen" });
  closeBookingDetails();
  saveSlots();
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
