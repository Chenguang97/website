import { coachElements as elements } from "../../dom/coach-elements.js";
import { createCoachDatePicker } from "../date-picker.js";
import { renderExceptionDragCalendar } from "./calendar-render.js";
import { startOfWeekIso, todayIso } from "../../core/utils-data.js";
const owners = new WeakMap();
export function initializeCoachScheduleDatePicker() {
  const existing = owners.get(elements.coachScheduleDateTrigger);
  if (existing) return existing;
  const picker = createCoachDatePicker({
    trigger: elements.coachScheduleDateTrigger, popover: elements.coachScheduleDatePopover,
    template: elements.coachDatePickerTemplate, idPrefix: "coachSchedule",
    getValue: () => startOfWeekIso(elements.exceptionCalendarWeekStart.value || todayIso()),
    isValueCurrent: (selected, value) => startOfWeekIso(selected) === value,
    onSelect: (date) => { elements.exceptionCalendarWeekStart.value = startOfWeekIso(date); renderExceptionDragCalendar(); }
  });
  const controller = {
    open(options) { picker.open(options); },
    close(options) { picker.close(options); },
    destroy() {
      picker.destroy();
      if (owners.get(elements.coachScheduleDateTrigger) === controller) owners.delete(elements.coachScheduleDateTrigger);
    },
  };
  owners.set(elements.coachScheduleDateTrigger, controller);
  return controller;
}
export function openCoachScheduleDatePicker() { owners.get(elements.coachScheduleDateTrigger)?.open(); }
export function closeCoachScheduleDatePicker(options) { owners.get(elements.coachScheduleDateTrigger)?.close(options); }
