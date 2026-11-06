import { restoreConsumedAvailabilitySlots } from "../core/bookings.js";
import { pushBookingUndoSnapshot } from "../core/booking-undo.js";
import { rinks } from "../core/config.js";
import { bookingDialogElements } from "../dom/booking-dialog-elements.js";
import { studentElements } from "../dom/student-elements.js";
import {
  concreteLocationOptionsForCoach,
  getFittingLessonOptionsForStart,
  getSelectedStudentLessonDuration,
  getStudentLessonOptionsForCoach,
  renderStudentPage,
} from "./render.js";
import { getProfile, replaceSlots, saveSlots, state } from "../core/state.js";
import {
  canFitLessonFromSlot,
  getAvailabilitySlotsCoveredByLesson,
  isPastStudentBooking,
  slotOverlapsBlockedException,
} from "../core/scheduling-rules.js";
import { formatLocationLabel } from "../ui/display.js";
import { showFormMessage } from "../ui/form-message.js";
import { closeBookingDetails, getBookingDetailsSlotId } from "../ui/booking-details.js";
import { escapeAttribute, escapeHtml } from "../ui/safe-html.mjs";
import { formatDate, getCoach, minutesFromTime, timeFromMinutes } from "../core/utils-data.js";
const elements = { ...studentElements, ...bookingDialogElements };
function openBookingDialog(slotId, lessonId = "") {
  const slot = state.slots.find((item) => item.id === slotId);
  if (!slot) return;
  const coach = getCoach(slot.coachId);
  const profile = getProfile(slot.coachId);
  const lesson = getStudentLessonOptionsForCoach(slot.coachId).find((option) => option.id === lessonId) || getFittingLessonOptionsForStart(slot, getSelectedStudentLessonDuration())[0] || getStudentLessonOptionsForCoach(slot.coachId)[0];
  const defaultConcreteLocation = profile.servedRinks && profile.servedRinks[0] || profile.homeRink || rinks[0];
  elements.bookingSlotId.value = slot.id;
  elements.bookingLessonId.value = lesson.id;
  elements.bookingDialogMode.value = "create";
  elements.dialogTitle.textContent = `${coach.name} · ${lesson.name || "Private lesson"} · $${lesson.price} · ${formatDate(slot.date)} ${slot.start}`;
  elements.bookingSubmitButton.textContent = "确认预约";
  elements.bookingNewSlotLabel.classList.add("is-hidden");
  elements.bookingNewSlot.innerHTML = "";
  elements.bookingLocation.innerHTML = bookingLocationOptionsForSlot(slot);
  elements.bookingLocationLabel.classList.remove("is-hidden");
  elements.bookingLocation.disabled = false;
  elements.bookingLocation.value = slot.location === "Any served rink" ? defaultConcreteLocation : slot.location;
  elements.bookingForSelf.checked = true;
  elements.studentName.value = "";
  syncBookingForSelf();
  elements.studentEmailLabel.classList.remove("is-hidden");
  elements.studentEmail.disabled = false;
  elements.studentEmail.required = true;
  elements.studentEmail.value = "";
  elements.studentNote.value = "";
  if (elements.studentSlotOptionsDialog?.open) {
    elements.studentSlotOptionsDialog.close();
  }
  elements.bookingDialog.showModal();
}
function openModifyBookingDialog(slotId) {
  const slot = state.slots.find((item) => item.id === slotId);
  if (!slot || !slot.booked || !slot.student || isPastStudentBooking(slot)) return;
  const coach = getCoach(slot.coachId);
  elements.bookingSlotId.value = slot.id;
  elements.bookingDialogMode.value = "modify";
  elements.dialogTitle.textContent = `修改预约 · ${coach.name} · ${formatDate(slot.date)} ${slot.start}`;
  elements.bookingSubmitButton.textContent = "保存修改";
  elements.bookingNewSlotLabel.classList.add("is-hidden");
  elements.bookingNewSlot.innerHTML = "";
  elements.bookingNewSlot.value = slot.id;
  elements.bookingLocationLabel.classList.add("is-hidden");
  elements.bookingLocation.disabled = true;
  elements.studentEmailLabel.classList.add("is-hidden");
  elements.studentEmail.disabled = true;
  elements.studentEmail.required = false;
  elements.bookingForSelf.checked = !slot.student.name || slot.student.name === "本人";
  elements.studentName.value = elements.bookingForSelf.checked ? "" : slot.student.name;
  syncBookingForSelf();
  elements.studentEmail.value = slot.student.email || "";
  elements.studentNote.value = slot.student.note || "";
  elements.bookingDialog.showModal();
}
function bookingLocationOptionsForSlot(slot) {
  if (slot.location === "Any served rink") {
    return concreteLocationOptionsForCoach(slot.coachId);
  }
  return `<option value="${slot.location}">${formatLocationLabel(slot.location)}</option>`;
}
function syncModifyBookingLocation(currentSlot) {
  const selectedSlot = state.slots.find((slot) => slot.id === elements.bookingNewSlot.value) || currentSlot;
  const profile = getProfile(selectedSlot.coachId);
  const defaultConcreteLocation = profile.servedRinks && profile.servedRinks[0] || profile.homeRink || rinks[0];
  elements.bookingLocation.innerHTML = bookingLocationOptionsForSlot(selectedSlot);
  elements.bookingLocationLabel.classList.remove("is-hidden");
  elements.bookingLocation.value = selectedSlot.id === currentSlot.id ? currentSlot.location : selectedSlot.location === "Any served rink" ? defaultConcreteLocation : selectedSlot.location;
}
function openStudentSlotOptions(slotIds) {
  if (!elements.studentSlotOptionsDialog || !elements.studentSlotOptionsList) return;
  const selectedDuration = getSelectedStudentLessonDuration();
  const startSlots = slotIds.map((id) => state.slots.find((slot) => slot.id === id)).filter(Boolean).filter((slot) => !slot.booked && !slotOverlapsBlockedException(slot)).sort((a, b) => `${getCoach(a.coachId).name}${a.location}${a.lessonPrice}`.localeCompare(`${getCoach(b.coachId).name}${b.location}${b.lessonPrice}`));
  const options = startSlots.flatMap((slot) => {
    return getFittingLessonOptionsForStart(slot, selectedDuration).map((lesson) => ({ slot, lesson }));
  });
  if (!options.length) return;
  const first = options[0].slot;
  elements.studentSlotOptionsTitle.textContent = `${formatDate(first.date)} ${first.start}`;
  elements.studentSlotOptionsList.innerHTML = options.map(({ slot, lesson }) => {
    const coach = getCoach(slot.coachId);
    const endTime = timeFromMinutes(minutesFromTime(slot.start) + Number(lesson.duration));
    return `
        <button class="student-coach-option" type="button" data-action="book" data-id="${escapeAttribute(slot.id)}" data-lesson-id="${escapeAttribute(lesson.id)}">
          <strong>${escapeHtml(coach.name)}</strong>
          <span>${escapeHtml(coach.subject)}</span>
          <small>${escapeHtml(slot.start)}-${escapeHtml(endTime)} · ${escapeHtml(formatLocationLabel(slot.location))} · ${escapeHtml(lesson.name || `${lesson.duration} min private lesson`)} · $${escapeHtml(lesson.price)}</small>
        </button>
      `;
  }).join("");
  elements.studentSlotOptionsDialog.showModal();
}
function cancelStudentBooking(slotId) {
  const slot = state.slots.find((item) => item.id === slotId);
  if (!slot || !slot.booked || isPastStudentBooking(slot)) return;
  const confirmed = window.confirm(`确定要取消 ${formatDate(slot.date)} ${slot.start}-${slot.end} 的预约吗？`);
  if (!confirmed) return;
  pushBookingUndoSnapshot();
  restoreConsumedAvailabilitySlots(slot);
  slot.booked = false;
  slot.student = null;
  if (!saveSlots()) return;
  renderStudentPage();
}

export function removeStudentBookingFromDetails() {
  const slot = state.slots.find((item) => item.id === getBookingDetailsSlotId());
  if (!slot || !slot.booked || isPastStudentBooking(slot)) return;
  if (!window.confirm(`确定要取消 ${formatDate(slot.date)} ${slot.start}-${slot.end} 的预约吗？`)) return;
  pushBookingUndoSnapshot();
  restoreConsumedAvailabilitySlots(slot);
  slot.booked = false;
  slot.student = null;
  if (!saveSlots()) return;
  closeBookingDetails();
  renderStudentPage();
}
function confirmBooking(event) {
  event.preventDefault();
  const slot = state.slots.find((item) => item.id === elements.bookingSlotId.value);
  const isModify = elements.bookingDialogMode.value === "modify";
  if (!slot || slot.booked && !isModify || !slot.booked && isModify) return;
  const lesson = isModify ? null : getStudentLessonOptionsForCoach(slot.coachId).find((option) => option.id === elements.bookingLessonId?.value) || getFittingLessonOptionsForStart(slot, getSelectedStudentLessonDuration())[0];
  if (!isModify && (!lesson || !canFitLessonFromSlot(slot, Number(lesson.duration)))) {
    showFormMessage("这个时间已经无法完整容纳所选课程时长，请重新选择。", true);
    return;
  }
  if (!isModify && (slot.booked || slotOverlapsBlockedException(slot))) {
    showFormMessage("提交预约时已重新校验可用性：该时段刚刚被占用，请重新选择。", true);
    return;
  }
  const bookingForSelf = elements.bookingForSelf.checked;
  const student = {
    name: bookingForSelf ? "本人" : elements.studentName.value.trim(),
    email: isModify ? slot.student?.email || "" : elements.studentEmail.value.trim(),
    note: elements.studentNote.value.trim()
  };
  pushBookingUndoSnapshot();
  if (isModify) {
    slot.student = student;
  } else {
    applyLessonToBookingSlot(slot, lesson);
    slot.booked = true;
    slot.status = "Confirmed";
    slot.version = (slot.version || 0) + 1;
    slot.transactionState = "atomic-confirmed";
    slot.student = student;
    slot.notifications = [
      { type: "coach-booking-created", channel: "in-app notification", message: "通知教练：新预约已确认" }
    ];
    if (slot.location === "Any served rink") {
      slot.location = elements.bookingLocation.value;
    }
  }
  elements.bookingDialog.close();
  if (document.body.dataset.page === "student" && !saveSlots()) return;
  renderStudentPage();
}
function applyLessonToBookingSlot(slot, lesson) {
  const duration = Number(lesson.duration);
  const coveredSlots = getAvailabilitySlotsCoveredByLesson(slot, duration).filter((coveredSlot) => coveredSlot.id !== slot.id);
  slot.consumedAvailabilitySlots = coveredSlots.map((coveredSlot) => ({ ...coveredSlot }));
  replaceSlots(state.slots.filter((item) => !coveredSlots.some((coveredSlot) => coveredSlot.id === item.id)));
  slot.end = timeFromMinutes(minutesFromTime(slot.start) + duration);
  slot.lessonId = lesson.id;
  slot.lessonName = lesson.name;
  slot.lessonDuration = duration;
  slot.lessonPrice = lesson.price;
}
function syncBookingForSelf() {
  const bookingForSelf = elements.bookingForSelf.checked;
  elements.studentNameLabel.classList.toggle("is-hidden", bookingForSelf);
  elements.studentName.disabled = bookingForSelf;
  elements.studentName.required = !bookingForSelf;
  if (bookingForSelf) {
    elements.studentName.value = "本人";
  }
}
export {
  cancelStudentBooking,
  confirmBooking,
  openBookingDialog,
  openModifyBookingDialog,
  openStudentSlotOptions,
  syncBookingForSelf,
  syncModifyBookingLocation
};

