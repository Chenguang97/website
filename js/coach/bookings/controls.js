import { captureCoachBookingReadModel } from "./read-model.js";
import { renderCoachSlots } from "./render.js";
import {
  applyCoachBookingStudentPicker,
  clearDraftStudents,
  closeCoachBookingStudentPicker,
  getHighlightedCoachBookingStudentKey,
  isCoachBookingStudentPickerOpen,
  moveCoachBookingStudentHighlight,
  selectMatchingStudents,
  toggleCoachBookingStudentPicker,
  toggleDraftStudent,
  updateCoachBookingStudentSearch,
} from "./student-picker.js";
import { coachElements as elements } from "../../dom/coach-elements.js";
import { renderExceptionCalendarAvailability } from "./calendar-render.js";
import { setBookingListPeriod } from "./view-state.js";
import { animateBookingPeriod } from "./period-motion.js";
import { receiveCoachBookingRequests } from "./request-editor.js";
import { clearAppliedCoachBookingStudentKeys } from "./filter-state.js";
import { positionCoachBookingStudentPanel } from "./student-picker-layout.js";

export function renderAppliedCoachBookingStudentFilter(model = captureCoachBookingReadModel()) {
  renderCoachSlots(model);
  receiveCoachBookingRequests(model, { reset: true });
  renderExceptionCalendarAvailability(model);
}

export function searchCoachBookingStudents(event) {
  updateCoachBookingStudentSearch(captureCoachBookingReadModel().students, event.currentTarget.value);
}

export function openCoachBookingStudentSearch() {
  toggleCoachBookingStudentPicker(captureCoachBookingReadModel().students);
  if (isCoachBookingStudentPickerOpen()) elements.coachBookingStudentSearch.focus();
}

export function handleCoachBookingStudentKeydown(event) {
  if (!isCoachBookingStudentPickerOpen()) return;
  if (event.target !== elements.coachBookingStudentSearch && event.key !== "Escape") return;
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    moveCoachBookingStudentHighlight(captureCoachBookingReadModel().students, event.key === "ArrowDown" ? 1 : -1);
    return;
  }
  if (event.key === "Enter") {
    const students = captureCoachBookingReadModel().students;
    const key = getHighlightedCoachBookingStudentKey(students);
    if (key !== undefined) {
      event.preventDefault();
      toggleDraftStudent(students, key);
    }
    return;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    closeCoachBookingStudentPicker(captureCoachBookingReadModel().students, { restoreFocus: true });
  }
}

export function handleCoachBookingStudentOutsideClick(event) {
  const picker = elements.coachBookingStudentPicker;
  const eventPath = event.composedPath?.() || [];
  if (isCoachBookingStudentPickerOpen() && !picker?.contains(event.target) && !eventPath.includes(picker)) {
    closeCoachBookingStudentPicker(captureCoachBookingReadModel().students);
  }
}

export function repositionCoachBookingStudentPicker() {
  if (isCoachBookingStudentPickerOpen() && !positionCoachBookingStudentPanel()) {
    closeCoachBookingStudentPicker(captureCoachBookingReadModel().students);
  }
}

export function handleCoachBookingFilterAction(event) {
  const students = captureCoachBookingReadModel().students;
  const action = event.target.closest("[data-student-action]")?.dataset.studentAction;
  if (action === "clear-search") {
    elements.coachBookingStudentSearch.value = "";
    updateCoachBookingStudentSearch(students, "");
    elements.coachBookingStudentSearch.focus();
  } else if (action === "select-matches") selectMatchingStudents(students);
  else if (action === "clear-draft") clearDraftStudents(students);
  else if (action === "cancel") closeCoachBookingStudentPicker(students, { restoreFocus: true });
  else if (action === "apply") {
    if (applyCoachBookingStudentPicker(students)) renderAppliedCoachBookingStudentFilter();
  }
  if (action) return;

  const checkbox = event.target.closest('input[data-student-key]');
  if (checkbox) toggleDraftStudent(students, checkbox.dataset.studentKey);
}

export function switchCoachBookingPeriod(event) {
  selectCoachBookingListCategory(event.currentTarget.dataset.coachBookingPeriod, { animate: true });
}

export function selectCoachBookingListCategory(category, { animate = false } = {}) {
  const nextCategory = ["upcoming", "past"].includes(category) ? category : "upcoming";
  const button = [...elements.coachBookingPeriods].find((item) => item.dataset.coachBookingPeriod === nextCategory);
  if (animate && button) animateBookingPeriod(button);
  setBookingListPeriod(nextCategory);
  const model = captureCoachBookingReadModel();
  renderCoachSlots(model);
  receiveCoachBookingRequests(model, { reset: true });
}

export function clearCoachBookingStudentFilter() {
  clearAppliedCoachBookingStudentKeys();
  const model = captureCoachBookingReadModel();
  closeCoachBookingStudentPicker(model.students);
  renderAppliedCoachBookingStudentFilter(model);
}

export function closeCoachBookingFilter() {
  closeCoachBookingStudentPicker(captureCoachBookingReadModel().students);
}
