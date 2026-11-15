import { getCoachBookingStudents, renderCoachSlots } from "./render.js?v=coach-booking-row-effect-1";
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
import { state } from "../../core/state.js";
import { animateBookingPeriod } from "./period-motion.js?v=booking-period-liquid-1";
import { renderCoachBookingRequests } from "./request-render.js?v=coach-booking-row-effect-1";
import { clearAppliedCoachBookingStudentKeys } from "./filter-state.js";

function renderAppliedCoachBookingStudentFilter() {
  renderCoachSlots();
  renderCoachBookingRequests();
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
  state.coachBookingListPeriod = nextCategory;
  renderCoachSlots();
  renderCoachBookingRequests();
}

export function clearCoachBookingStudentFilter() {
  clearAppliedCoachBookingStudentKeys();
  closeCoachBookingStudentPicker(getCoachBookingStudents());
  renderAppliedCoachBookingStudentFilter();
}

export function closeCoachBookingFilter() {
  closeCoachBookingStudentPicker(getCoachBookingStudents());
}

