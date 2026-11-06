import { coachElements as elements } from "../../dom/coach-elements.js";
import { renderExceptionDragCalendar } from "./calendar-render.js";
import { addDaysIso, startOfWeekIso, todayIso } from "../../core/utils-data.js";

const monthLabels = Array.from({ length: 12 }, (_, index) => `${index + 1}月`);
let isOpen = false;
let viewYear = 0;
let viewMonth = 0;
let selectedDate = "";
let activeDate = "";

function isoDate(year, month, day) {
  const date = new Date(year, month, day);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dateParts(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  return { year, month: month - 1, day };
}

function shiftMonth(year, month, offset) {
  const date = new Date(year, month + offset, 1);
  return { year: date.getFullYear(), month: date.getMonth() };
}

function renderSelects() {
  elements.coachScheduleMonth.replaceChildren(...monthLabels.map((label, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = label;
    option.selected = index === viewMonth;
    return option;
  }));
  const currentYear = new Date().getFullYear();
  const firstYear = Math.min(1900, viewYear - 10);
  const lastYear = Math.max(currentYear + 20, viewYear + 10);
  const years = [];
  for (let year = firstYear; year <= lastYear; year += 1) {
    const option = document.createElement("option");
    option.value = String(year);
    option.textContent = `${year}年`;
    option.selected = year === viewYear;
    years.push(option);
  }
  elements.coachScheduleYear.replaceChildren(...years);
}

function renderGrid() {
  const first = new Date(viewYear, viewMonth, 1);
  const offset = (first.getDay() + 6) % 7;
  const gridStart = isoDate(viewYear, viewMonth, 1 - offset);
  const today = todayIso();
  const buttons = Array.from({ length: 42 }, (_, index) => {
    const date = addDaysIso(gridStart, index);
    const parts = dateParts(date);
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.date = date;
    button.setAttribute("role", "gridcell");
    button.setAttribute("aria-label", new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "long" }).format(new Date(`${date}T00:00:00`)));
    button.setAttribute("aria-selected", String(date === selectedDate));
    button.tabIndex = date === activeDate ? 0 : -1;
    button.textContent = String(parts.day);
    button.classList.toggle("is-outside", parts.month !== viewMonth);
    button.classList.toggle("is-today", date === today);
    button.classList.toggle("is-selected", date === selectedDate);
    return button;
  });
  elements.coachScheduleDateGrid.replaceChildren(...buttons);
}

function renderDatePicker() {
  renderSelects();
  renderGrid();
}

function positionDatePopover() {
  const popover = elements.coachScheduleDatePopover;
  const parent = popover.offsetParent || elements.coachScheduleDateTrigger.parentElement;
  const parentRect = parent.getBoundingClientRect();
  const triggerRect = elements.coachScheduleDateTrigger.getBoundingClientRect();
  const popoverRect = popover.getBoundingClientRect();
  const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
  const viewportHeight = document.documentElement.clientHeight || window.innerHeight;
  const desiredLeft = triggerRect.left - parentRect.left;
  const maximumLeft = Math.max(0, viewportWidth - parentRect.left - popoverRect.width - 16);
  popover.style.left = `${Math.max(0, Math.min(desiredLeft, maximumLeft))}px`;
  const below = triggerRect.bottom - parentRect.top + 8;
  const above = triggerRect.top - parentRect.top - popoverRect.height - 8;
  popover.style.top = `${triggerRect.bottom + popoverRect.height + 16 <= viewportHeight || above < 0 ? below : above}px`;
}

function openCoachScheduleDatePicker() {
  const weekStart = startOfWeekIso(elements.exceptionCalendarWeekStart.value || todayIso());
  if (!selectedDate || startOfWeekIso(selectedDate) !== weekStart) selectedDate = weekStart;
  activeDate = selectedDate;
  ({ year: viewYear, month: viewMonth } = dateParts(selectedDate));
  isOpen = true;
  elements.coachScheduleDatePopover.hidden = false;
  elements.coachScheduleDateTrigger.setAttribute("aria-expanded", "true");
  renderDatePicker();
  positionDatePopover();
  elements.coachScheduleDateGrid.querySelector(`[data-date="${activeDate}"]`)?.focus();
}

function closeCoachScheduleDatePicker({ restoreFocus = true } = {}) {
  if (!isOpen) return;
  isOpen = false;
  elements.coachScheduleDatePopover.hidden = true;
  elements.coachScheduleDateTrigger.setAttribute("aria-expanded", "false");
  if (restoreFocus) elements.coachScheduleDateTrigger.focus();
}

function selectDate(date) {
  selectedDate = date;
  activeDate = date;
  elements.exceptionCalendarWeekStart.value = date;
  renderExceptionDragCalendar();
  closeCoachScheduleDatePicker();
}

function moveActiveDate(offset) {
  activeDate = addDaysIso(activeDate, offset);
  const parts = dateParts(activeDate);
  viewYear = parts.year;
  viewMonth = parts.month;
  renderDatePicker();
  elements.coachScheduleDateGrid.querySelector(`[data-date="${activeDate}"]`)?.focus();
}

function handleGridKeydown(event) {
  const dateButton = event.target.closest("[data-date]");
  if (!dateButton) return;
  activeDate = dateButton.dataset.date;
  const moves = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7, Home: -((new Date(`${activeDate}T00:00:00`).getDay() + 6) % 7), End: 6 - ((new Date(`${activeDate}T00:00:00`).getDay() + 6) % 7) };
  if (event.key in moves) {
    event.preventDefault();
    moveActiveDate(moves[event.key]);
  } else if (event.key === "PageUp" || event.key === "PageDown") {
    event.preventDefault();
    const parts = dateParts(activeDate);
    const shifted = shiftMonth(parts.year, parts.month, event.key === "PageUp" ? -1 : 1);
    activeDate = isoDate(shifted.year, shifted.month, Math.min(parts.day, new Date(shifted.year, shifted.month + 1, 0).getDate()));
    viewYear = shifted.year;
    viewMonth = shifted.month;
    renderDatePicker();
    elements.coachScheduleDateGrid.querySelector(`[data-date="${activeDate}"]`)?.focus();
  } else if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    selectDate(activeDate);
  } else if (event.key === "Escape") {
    event.preventDefault();
    closeCoachScheduleDatePicker();
  }
}

function initializeCoachScheduleDatePicker() {
  elements.coachScheduleDateTrigger.addEventListener("click", () => {
    if (isOpen) closeCoachScheduleDatePicker();
    else openCoachScheduleDatePicker();
  });
  elements.coachScheduleDatePopover.addEventListener("click", (event) => {
    const date = event.target.closest("[data-date]")?.dataset.date;
    if (date) {
      selectDate(date);
      return;
    }
    const action = event.target.closest("[data-date-action]")?.dataset.dateAction;
    if (action === "previous-month" || action === "next-month") {
      ({ year: viewYear, month: viewMonth } = shiftMonth(viewYear, viewMonth, action === "previous-month" ? -1 : 1));
      renderDatePicker();
    }
  });
  elements.coachScheduleDateGrid.addEventListener("keydown", handleGridKeydown);
  elements.coachScheduleMonth.addEventListener("change", () => {
    viewMonth = Number(elements.coachScheduleMonth.value);
    activeDate = isoDate(viewYear, viewMonth, 1);
    renderDatePicker();
  });
  elements.coachScheduleYear.addEventListener("change", () => {
    viewYear = Number(elements.coachScheduleYear.value);
    activeDate = isoDate(viewYear, viewMonth, 1);
    renderDatePicker();
  });
  document.addEventListener("click", (event) => {
    if (isOpen && !elements.coachScheduleDatePopover.contains(event.target) && !elements.coachScheduleDateTrigger.contains(event.target)) {
      closeCoachScheduleDatePicker();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (isOpen && event.key === "Escape") {
      event.preventDefault();
      closeCoachScheduleDatePicker();
    }
  });
}

export { closeCoachScheduleDatePicker, initializeCoachScheduleDatePicker, openCoachScheduleDatePicker };

