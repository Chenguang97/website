import { coachUsesService } from "../service-controller.js";
import { runCoachBookingCommand } from "./service-commands.js";
import { synchronizeCoachBookingRequests } from "./request-sync.js";
import { cancelBooking } from "../../core/bookings.js";
import { readScheduleState } from "../../core/state.js";
import { currentCoachId } from "../../core/config.js";
import { canCancelBooking } from "../../core/scheduling-rules.js";
import { formatDate } from "../../core/utils-data.js";
import { bookingDetailsElements } from "../../dom/booking-details-elements.js";
import { closeBookingDetails, getBookingDetailsSlotId, openBookingDetails } from "../../ui/booking-details.js";
import { receiveCoachBookingChanges } from "./refresh.js";
import { showFormMessage } from "../availability/status.js";

export function removeCoachBookingFromDetails() {
  const snapshot = readScheduleState();
  const slot = snapshot.slots.find((item) => item.id === getBookingDetailsSlotId() && item.coachId === currentCoachId);
  if (!canCancelBooking(slot)) return;
  const studentName = slot.student?.name || "这位学生";
  if (!window.confirm(`确定要取消 ${studentName} 在 ${formatDate(slot.date)} ${slot.start}-${slot.end} 的预约吗？`)) return;
  if (coachUsesService()) {
    const button = bookingDetailsElements.removeBookingDetails;
    return runCoachBookingCommand('cancel-booking', { bookingId: slot.id }, {
      key: 'booking-cancel',
      busy(value) { button.disabled = value; },
      success() { if (getBookingDetailsSlotId() === slot.id) closeBookingDetails(); },
      message: '预约已取消；可使用「撤销上次预约更改」。',
    });
  }
  const result = cancelBooking(slot.id, { role: "coach", name: "Maya Chen" });
  if (!result.ok) { showFormMessage(result.message, true); return; }
  closeBookingDetails();
  synchronizeCoachBookingRequests();
  receiveCoachBookingChanges({ resetRequest: true });
}

export function handleScheduleCalendarClick(event) {
  const booking = event.target.closest(".coach-calendar-booking[data-slot-id], .calendar-cell.has-booking[data-slot-id]");
  if (booking) openBookingDetails(booking.dataset.slotId);
}

export function prepareCoachBookingCancellation(slotId) {
  bookingDetailsElements.removeBookingDetails.dataset.id = slotId;
  return removeCoachBookingFromDetails();
}
