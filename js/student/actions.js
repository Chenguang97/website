import {
  cancelStudentBooking,
  openBookingDialog,
  openModifyBookingDialog,
  openStudentSlotOptions,
  syncModifyBookingLocation,
} from "./booking-actions.js";
import { bookingDialogElements } from "../dom/booking-dialog-elements.js";
import { studentElements } from "../dom/student-elements.js";
import {
  renderStudentDatePendingState,
  renderStudentSlots,
  updateStudentFilterSummaries,
} from "./render.js";
import { state } from "../core/state.js";
import { addDaysIso, nextWeekdayIso } from "../core/utils-data.js";

const elements = { ...studentElements, ...bookingDialogElements };

export function handleStudentAction(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const { action, id, ids } = button.dataset;

  if (action === "student-week") {
    const offset = Number(button.dataset.offset || 0);
    state.studentSelectedDate = addDaysIso(state.studentSelectedDate || elements.studentDateFilter.value || nextWeekdayIso(), offset);
    elements.studentDateFilter.value = state.studentSelectedDate;
    renderStudentSlots();
  } else if (action === "set-student-view-mode") {
    state.studentViewMode = button.dataset.viewMode === "week" ? "week" : "day";
    renderStudentSlots();
  } else if (action === "apply-student-date") {
    applyStudentDateSelection();
  } else if (action === "remove-student-filter") {
    removeStudentFilterChip(button.dataset.filterName, button.dataset.filterValue);
  } else if (action === "subscribe-opening") {
    button.textContent = "已订阅候补 / 临时空位提醒";
    button.dataset.waitlist = "subscribed";
  } else if (action === "send-multi-coach-request") {
    button.textContent = "已发送给多个教练";
    button.dataset.coachNotification = "multi-coach-request-sent";
  } else if (action === "choose-time") {
    openStudentSlotOptions((ids || "").split(",").filter(Boolean));
  } else if (action === "book") {
    openBookingDialog(id, button.dataset.lessonId);
  } else if (action === "modify-student-booking") {
    openModifyBookingDialog(id);
  } else if (action === "cancel-student-booking") {
    cancelStudentBooking(id);
  }
}

export function handleStudentDateDraftChange() {
  renderStudentDatePendingState();
}

function applyStudentDateSelection() {
  state.studentSelectedDate = elements.studentDateFilter.value || state.studentSelectedDate || nextWeekdayIso();
  elements.studentDateFilter.value = state.studentSelectedDate;
  renderStudentSlots();
}

function cancelStudentDateSelection() {
  elements.studentDateFilter.value = state.studentSelectedDate || nextWeekdayIso();
  renderStudentDatePendingState();
}

export function handleStudentDateOutsideClick(event) {
  if (!elements.studentDateActions || elements.studentDateActions.classList.contains("is-hidden")) return;
  if (event.target.closest("#studentDateFilter") || event.target.closest("#studentDateActions")) return;
  cancelStudentDateSelection();
}

export function handleBookingNewSlotChange() {
  if (elements.bookingDialogMode.value !== "modify") return;
  const currentSlot = state.slots.find((slot) => slot.id === elements.bookingSlotId.value);
  if (currentSlot) syncModifyBookingLocation(currentSlot);
}

function removeStudentFilterChip(name, value) {
  const input = document.querySelector(`input[name="${name}"][value="${value}"]`);
  const allInput = document.querySelector(`input[name="${name}"][value="all"]`);
  if (!input) return;
  input.checked = false;
  if (![...document.querySelectorAll(`input[name="${name}"]:checked`)].some((item) => item.value !== "all")) {
    if (allInput) allInput.checked = true;
    syncStudentFilterCheckboxes(allInput);
  } else if (allInput) {
    allInput.checked = false;
  }
  updateStudentFilterSummaries();
  renderStudentSlots();
}

export function handleStudentFilterChange(event) {
  const input = event.target.closest("input[type='checkbox']");
  if (!input) return;
  syncStudentFilterCheckboxes(input);
  updateStudentFilterSummaries();
}

export function applyStudentFilterPanel(event) {
  const panelType = event.currentTarget.dataset.studentFilterPanel;
  const panel = panelType === "coach" ? elements.studentCoachFilterPanel : elements.studentRinkFilterPanel;
  if (!panel) return;
  panel.classList.add("is-hidden");
  if (panelType === "coach" && elements.studentCoachSearch) elements.studentCoachSearch.value = "";
  if (panelType === "rink" && elements.studentRinkSearch) elements.studentRinkSearch.value = "";
  renderStudentSlots();
}

export function openStudentFilterPanel(event) {
  const search = event.currentTarget;
  const panel = search === elements.studentCoachSearch ? elements.studentCoachFilterPanel : elements.studentRinkFilterPanel;
  const optionGroup = search === elements.studentCoachSearch ? elements.studentCoachFilterGroup : elements.studentRinkFilterGroup;
  if (!panel) return;
  if (panel.classList.contains("is-hidden")) {
    search.value = "";
    optionGroup?.querySelectorAll("label").forEach((label) => label.classList.remove("is-hidden"));
  }
  panel.classList.remove("is-hidden");
}

export function handleStudentFilterSearch(event) {
  const search = event.currentTarget;
  const panel = search === elements.studentCoachSearch ? elements.studentCoachFilterGroup : elements.studentRinkFilterGroup;
  const query = search.value.trim().toLowerCase();
  if (!panel) return;
  openStudentFilterPanel(event);
  panel.querySelectorAll("label").forEach((label) => {
    const isAllOption = label.querySelector("input")?.value === "all";
    const matches = !query || label.textContent.toLowerCase().includes(query);
    label.classList.toggle("is-hidden", !isAllOption && !matches);
  });
}

export function handleStudentFilterOutsideClick(event) {
  if (!elements.studentControls || elements.studentControls.contains(event.target)) return;
  elements.studentCoachFilterPanel?.classList.add("is-hidden");
  elements.studentRinkFilterPanel?.classList.add("is-hidden");
  if (elements.studentCoachSearch) elements.studentCoachSearch.value = "";
  if (elements.studentRinkSearch) elements.studentRinkSearch.value = "";
}

function syncStudentFilterCheckboxes(changedInput) {
  const { name, value, checked } = changedInput;
  const inputs = [...document.querySelectorAll(`input[name="${name}"]`)];
  const allInput = inputs.find((input) => input.value === "all");
  const itemInputs = inputs.filter((input) => input.value !== "all");
  if (!allInput) return;
  if (value === "all") {
    allInput.checked = checked || !itemInputs.some((input) => input.checked);
    itemInputs.forEach((input) => { input.checked = allInput.checked; });
    return;
  }
  if (allInput.checked && !checked) {
    itemInputs.forEach((input) => { input.checked = input === changedInput; });
    changedInput.checked = true;
  }
  if (!itemInputs.some((input) => input.checked)) {
    allInput.checked = true;
    itemInputs.forEach((input) => { input.checked = true; });
  } else {
    allInput.checked = itemInputs.every((input) => input.checked);
  }
}

