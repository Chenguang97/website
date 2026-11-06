import { getCoachBookingStudents, renderCoachSlots } from "./render.js";
import {
  applyCoachBookingStudentPicker,
  clearDraftStudents,
  closeCoachBookingStudentPicker,
  getHighlightedCoachBookingStudentKey,
  isCoachBookingStudentPickerOpen,
  moveCoachBookingStudentHighlight,
  resetCoachBookingStudentPicker,
  selectMatchingStudents,
  toggleCoachBookingStudentPicker,
  toggleDraftStudent,
  updateCoachBookingStudentSearch,
} from "./student-picker.js";
import { coachElements as elements } from "../../dom/coach-elements.js";
import { renderExceptionCalendarAvailability } from "./calendar-render.js";
import { state } from "../../core/state.js";

function renderAppliedCoachBookingStudentFilter() {
  renderCoachSlots();
  renderExceptionCalendarAvailability();
}

export function searchCoachBookingStudents(event) {
  updateCoachBookingStudentSearch(getCoachBookingStudents(), event.currentTarget.value);
}

export function openCoachBookingStudentSearch() {
  toggleCoachBookingStudentPicker(getCoachBookingStudents());
  if (isCoachBookingStudentPickerOpen()) elements.coachBookingStudentSearch.focus();
}

export function handleCoachBookingStudentKeydown(event) {
  if (event.target !== elements.coachBookingStudentSearch && event.key !== "Escape") return;
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    moveCoachBookingStudentHighlight(getCoachBookingStudents(), event.key === "ArrowDown" ? 1 : -1);
    return;
  }
  if (event.key === "Enter") {
    const key = getHighlightedCoachBookingStudentKey(getCoachBookingStudents());
    if (key !== undefined) {
      event.preventDefault();
      toggleDraftStudent(getCoachBookingStudents(), key);
    }
    return;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    closeCoachBookingStudentPicker(getCoachBookingStudents(), { restoreFocus: true });
  }
}

export function handleCoachBookingStudentOutsideClick(event) {
  const picker = elements.coachBookingStudentPicker;
  const eventPath = event.composedPath?.() || [];
  if (isCoachBookingStudentPickerOpen() && !picker?.contains(event.target) && !eventPath.includes(picker)) {
    closeCoachBookingStudentPicker(getCoachBookingStudents());
  }
}

export function handleCoachBookingFilterAction(event) {
  const students = getCoachBookingStudents();
  const action = event.target.closest("[data-student-action]")?.dataset.studentAction;
  if (action === "select-matches") selectMatchingStudents(students);
  else if (action === "clear-draft") clearDraftStudents(students);
  else if (action === "cancel") closeCoachBookingStudentPicker(students, { restoreFocus: true });
  else if (action === "apply") {
    if (applyCoachBookingStudentPicker(students)) renderAppliedCoachBookingStudentFilter();
  } else if (action === "reset-filter") {
    resetCoachBookingStudentPicker(students);
    renderAppliedCoachBookingStudentFilter();
  }
  if (action) return;

  const checkbox = event.target.closest('input[data-student-key]');
  if (checkbox) toggleDraftStudent(students, checkbox.dataset.studentKey);
}

export function switchCoachBookingPeriod(event) {
  state.coachBookingListPeriod = event.currentTarget.dataset.coachBookingPeriod === "past" ? "past" : "upcoming";
  renderCoachSlots();
}

export function closeCoachBookingFilter() {
  closeCoachBookingStudentPicker(getCoachBookingStudents());
}

