import { offerSessionsHtml } from "./offer-sessions.js";
import { isStudentService, studentAvailability, studentCoach, studentProjection } from "./service-data.js";
import { studentCommands } from "./remote-actions.js";
import { productClient } from "../service/runtime.js";
import { openStudentDialog, closeStudentDialog } from "./dialogs.js";
import { bookLesson, cancelBooking, getBookingLessonOptions, updateBookingStudent } from "../core/bookings.js";
import { rinks } from "../core/config.js";
import { studentBookingElements } from "../dom/student-booking-elements.js";
import { studentElements } from "../dom/student-elements.js";
import { refreshStudentPage } from "./calendar-controller.js";
import { getFittingLessonOptionsForStart, getConcreteLocationsForCoach, getStudentSlotOptions } from "./queries.js";
import { getSelectedStudentLessonDuration } from "./filter-controls.js";
import { readProfileState, readScheduleState } from "../core/state.js";
import {
  canCancelBooking,
  isPastStudentBooking,
} from "../core/scheduling-rules.js";
import { formatLocationLabel } from "../ui/display.js";
import { showFormMessage } from "../ui/form-message.js";
import { closeBookingDetails, getBookingDetailsSlotId } from "../ui/booking-details.js";
import { escapeAttribute, escapeHtml } from "../ui/safe-html.mjs";
import { formatDate, getCoach, minutesFromTime, timeFromMinutes } from "../core/utils-data.js";
const elements = studentElements;
let selectedOffer = null;
function openBookingDialog(slotId, lessonId = "") {
  const slot = isStudentService() ? studentAvailability.find(slotId) : readScheduleState().publishedSlots.find((item) => item.id === slotId);
  if (!slot) return;
  const coach = isStudentService() ? studentCoach(slot.coachId) : getCoach(slot.coachId);
  const profile = readProfileState(slot.coachId).saved;
  const lessons = isStudentService() ? getFittingLessonOptionsForStart(slot, getSelectedStudentLessonDuration()) : getBookingLessonOptions(slot.coachId);
  const lesson = lessons.find((option) => option.id === lessonId) || (isStudentService() ? lessons[0] : getFittingLessonOptionsForStart(slot, getSelectedStudentLessonDuration())[0] || lessons[0]);
  if (!lesson) return;
  selectedOffer = isStudentService() ? lesson.offer : null;
  renderBookingSessions(selectedOffer);
  const defaultConcreteLocation = profile.servedRinks && profile.servedRinks[0] || profile.homeRink || rinks[0];
  studentBookingElements.bookingSlotId.value = slot.id;
  studentBookingElements.bookingLessonId.value = lesson.id;
  studentBookingElements.bookingDialogMode.value = "create";
  studentBookingElements.dialogTitle.textContent = `${coach.name} · ${lesson.name || "Private lesson"} · $${lesson.price} · ${formatDate(slot.date)} ${slot.start}`;
  studentBookingElements.bookingSubmitButton.textContent = "确认预约";
  studentBookingElements.bookingLocation.innerHTML = bookingLocationOptionsForSlot(slot);
  studentBookingElements.bookingLocationLabel.classList.remove("is-hidden");
  studentBookingElements.bookingLocation.disabled = false;
  studentBookingElements.bookingLocation.value = slot.location === "Any served rink" ? defaultConcreteLocation : slot.location;
  studentBookingElements.bookingForSelf.checked = true;
  studentBookingElements.studentName.value = "";
  syncBookingForSelf();
  studentBookingElements.studentEmailLabel.classList.remove("is-hidden");
  studentBookingElements.studentEmail.disabled = false;
  studentBookingElements.studentEmail.required = true;
  studentBookingElements.studentEmail.value = isStudentService() ? productClient.readSession()?.user?.email || "" : "";
  if (isStudentService()) { studentBookingElements.studentEmail.readOnly = true; studentBookingElements.studentEmail.required = false; }
  studentBookingElements.studentNote.value = "";
  if (elements.studentSlotOptionsDialog?.open) {
    elements.studentSlotOptionsDialog.close();
  }
  if (isStudentService()) openStudentDialog(studentBookingElements.bookingDialog); else studentBookingElements.bookingDialog.showModal();
}
function openModifyBookingDialog(slotId) {
  const slot = readScheduleState().publishedSlots.find((item) => item.id === slotId);
  if (!slot || !slot.booked || !slot.student || isPastStudentBooking(slot)) return;
  renderBookingSessions(null);
  const coach = isStudentService() ? studentCoach(slot.coachId) : getCoach(slot.coachId);
  studentBookingElements.bookingSlotId.value = slot.id;
  studentBookingElements.bookingDialogMode.value = "modify";
  studentBookingElements.dialogTitle.textContent = `修改预约 · ${coach.name} · ${formatDate(slot.date)} ${slot.start}`;
  studentBookingElements.bookingSubmitButton.textContent = "保存修改";
  studentBookingElements.bookingLocationLabel.classList.add("is-hidden");
  studentBookingElements.bookingLocation.disabled = true;
  studentBookingElements.studentEmailLabel.classList.add("is-hidden");
  studentBookingElements.studentEmail.disabled = true;
  studentBookingElements.studentEmail.required = false;
  studentBookingElements.bookingForSelf.checked = !slot.student.name || slot.student.name === "本人";
  studentBookingElements.studentName.value = studentBookingElements.bookingForSelf.checked ? "" : slot.student.name;
  syncBookingForSelf();
  studentBookingElements.studentEmail.value = slot.student.email || "";
  studentBookingElements.studentNote.value = slot.student.note || "";
  if (isStudentService()) openStudentDialog(studentBookingElements.bookingDialog); else studentBookingElements.bookingDialog.showModal();
}
function bookingLocationOptionsForSlot(slot) {
  if (slot.location === "Any served rink") {
    return getConcreteLocationsForCoach(slot.coachId).map((location) => `<option value="${escapeAttribute(location)}">${escapeHtml(formatLocationLabel(location))}</option>`).join("");
  }
  return `<option value="${escapeAttribute(slot.location)}">${escapeHtml(formatLocationLabel(slot.location))}</option>`;
}
function openStudentSlotOptions(slotIds) {
  if (!elements.studentSlotOptionsDialog || !elements.studentSlotOptionsList) return;
  const selectedDuration = getSelectedStudentLessonDuration();
  const options = getStudentSlotOptions(slotIds, selectedDuration).sort((a, b) => `${getCoach(a.slot.coachId).name}${a.slot.location}${a.slot.lessonPrice}`.localeCompare(`${getCoach(b.slot.coachId).name}${b.slot.location}${b.slot.lessonPrice}`));
  if (!options.length) return;
  const first = options[0].slot;
  elements.studentSlotOptionsTitle.textContent = `${formatDate(first.date)} ${first.start}`;
  elements.studentSlotOptionsList.innerHTML = options.map(({ slot, lesson }) => {
    const coach = isStudentService() ? studentCoach(slot.coachId) : getCoach(slot.coachId);
    const endTime = timeFromMinutes(minutesFromTime(slot.start) + Number(lesson.duration));
    return `
        <button class="student-coach-option" type="button" data-action="book" data-id="${escapeAttribute(slot.id)}" data-lesson-id="${escapeAttribute(lesson.id)}">
          <strong>${escapeHtml(coach.name)}</strong>
          <span>${escapeHtml(coach.subject)}</span>
          <small>${escapeHtml(slot.start)}-${escapeHtml(endTime)} · ${escapeHtml(formatLocationLabel(slot.location))} · ${escapeHtml(lesson.name || `${lesson.duration} min private lesson`)} · $${escapeHtml(lesson.price)}</small>
          ${isStudentService() ? offerSessionsHtml(lesson.offer) : ""}
        </button>
      `;
  }).join("");
  if (isStudentService()) openStudentDialog(elements.studentSlotOptionsDialog); else elements.studentSlotOptionsDialog.showModal();
}
function cancelStudentBooking(slotId, { fromDetails = false } = {}) {
  const slot = readScheduleState().publishedSlots.find((item) => item.id === slotId);
  if (!slot || (!isStudentService() && !canCancelBooking(slot))) return;
  if (!window.confirm(`确定要取消 ${formatDate(slot.date)} ${slot.start}-${slot.end} 的预约吗？`)) return;
  if (isStudentService()) return studentCommands.run("cancel-booking", { bookingId: slot.id }, () => { if (fromDetails) closeBookingDetails(); });
  const result = cancelBooking(slot.id, { role: "student", name: slot.student?.name || "学生" });
  if (!result.ok) { showFormMessage(studentBookingElements.formMessage, result.message, true); return; }
  if (fromDetails) closeBookingDetails();
  refreshStudentPage();
}

export function removeStudentBookingFromDetails() {
  cancelStudentBooking(getBookingDetailsSlotId(), { fromDetails: true });
}

function confirmBooking(event) {
  event.preventDefault();
  const slotId = studentBookingElements.bookingSlotId.value;
  const isModify = studentBookingElements.bookingDialogMode.value === "modify";
  const student = {
    name: studentBookingElements.bookingForSelf.checked ? "本人" : studentBookingElements.studentName.value.trim(),
    email: studentBookingElements.studentEmail.value.trim(),
    note: studentBookingElements.studentNote.value.trim(),
  };
  if (isStudentService()) {
    const snapshot = bookingFormSignature();
    const payload = { ...(isModify ? { bookingId: slotId } : selectedOffer ? { slotId: selectedOffer.sourceSlotId || selectedOffer.id, start: selectedOffer.start, location: selectedOffer.location, lessonId: selectedOffer.lessonId } : {}), attendeeName: studentBookingElements.bookingForSelf.checked ? studentProjection()?.data.studentProfile?.contact?.name || productClient.readSession()?.user?.name || "本人" : student.name, note: student.note };
    if (!isModify && !selectedOffer) return;
    return studentCommands.run(isModify ? "modify-booking" : "book", payload, () => { if (bookingFormSignature() === snapshot) closeStudentDialog(studentBookingElements.bookingDialog); });
  }
  const result = isModify
    ? updateBookingStudent(slotId, student)
    : bookLesson({ slotId, lessonId: studentBookingElements.bookingLessonId.value, student, location: studentBookingElements.bookingLocation.value });
  if (!result.ok) { showFormMessage(studentBookingElements.formMessage, result.message, true); return; }
  studentBookingElements.bookingDialog.close();
  refreshStudentPage();
}

function syncBookingForSelf() {
  const bookingForSelf = studentBookingElements.bookingForSelf.checked;
  studentBookingElements.studentNameLabel.classList.toggle("is-hidden", bookingForSelf);
  studentBookingElements.studentName.disabled = bookingForSelf;
  studentBookingElements.studentName.required = !bookingForSelf;
  if (bookingForSelf) {
    studentBookingElements.studentName.value = "本人";
  }
}
export {
  cancelStudentBooking,
  confirmBooking,
  openBookingDialog,
  openModifyBookingDialog,
  openStudentSlotOptions,
  syncBookingForSelf
};

function bookingFormSignature() {
  return JSON.stringify([studentBookingElements.bookingSlotId.value, studentBookingElements.bookingDialogMode.value, studentBookingElements.bookingForSelf.checked, studentBookingElements.studentName.value, studentBookingElements.studentNote.value, studentBookingElements.bookingLessonId.value]);
}

function renderBookingSessions(offer) {
  if (!elements.studentBookingSessions) return;
  const summary = offerSessionsHtml(offer);
  elements.studentBookingSessions.innerHTML = summary;
  elements.studentBookingSessions.hidden = !summary;
}
