import { selectElements } from "./select-elements.js";

export const bookingDialogElements = selectElements({
  bookingDialog: "#bookingDialog", bookingForm: "#bookingForm", bookingSlotId: "#bookingSlotId", bookingLessonId: "#bookingLessonId",
  bookingDialogMode: "#bookingDialogMode", bookingNewSlotLabel: "#bookingNewSlotLabel", bookingNewSlot: "#bookingNewSlot",
  bookingSubmitButton: "#bookingSubmitButton", dialogTitle: "#dialogTitle", bookingLocationLabel: "#bookingLocationLabel",
  bookingLocation: "#bookingLocation", bookingDetailsDialog: "#bookingDetailsDialog", bookingDetailsTitle: "#bookingDetailsTitle",
  bookingDetailsBody: "#bookingDetailsBody", closeBookingDetails: "#closeBookingDetails", removeBookingDetails: "#removeBookingDetails",
  bookingForSelf: "#bookingForSelf", studentNameLabel: "#studentNameLabel", studentName: "#studentName",
  studentEmailLabel: "#studentEmailLabel", studentEmail: "#studentEmail", studentNote: "#studentNote", closeDialog: "#closeDialog",
});
