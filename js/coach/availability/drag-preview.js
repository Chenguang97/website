import { coachElements as elements } from "../../dom/coach-elements.js";
import { unavailableSelection } from "../../core/config.js";
import { renderCalendarLocationWatermarks, setCalendarCellLocation } from "../../ui/calendar-grid.js";
import { formatLocationLabel } from "../../ui/display.js";
import { getRinkColor } from "../calendar-colors.js";

let originalCells = [];

// Preview only the view. Business data and earlier unsaved drafts remain untouched
// until pointer-up commits the final range.
export function beginAvailabilityDragPreview() {
  originalCells = [...elements.dragCalendar.querySelectorAll(".calendar-cell")].map((cell) => ({
    cell,
    className: cell.className,
    location: cell.dataset.calendarLocation || "",
    title: cell.title,
    label: cell.getAttribute("aria-label"),
  }));
}

function restoreCells() {
  for (const { cell, className, location, title, label } of originalCells) {
    cell.className = className;
    setCalendarCellLocation(cell, location);
    cell.title = title;
    if (label === null) cell.removeAttribute("aria-label");
    else cell.setAttribute("aria-label", label);
    cell.style.removeProperty("--selection-color");
  }
}

export function paintAvailabilityDragPreview(drag) {
  restoreCells();
  const start = Math.min(drag.start, drag.end);
  const end = Math.max(drag.start, drag.end);
  const unavailable = drag.location === unavailableSelection;
  for (const { cell } of originalCells) {
    const minutes = Number(cell.dataset.minutes);
    if (Number(cell.dataset.dayIndex) !== drag.dayIndex || minutes < start || minutes > end
      || cell.classList.contains("has-booking") || cell.classList.contains("is-past")) continue;
    cell.classList.add("selecting");
    cell.classList.toggle("removing", unavailable);
    cell.classList.toggle("has-slot", !unavailable);
    cell.classList.toggle("has-blocked", unavailable);
    cell.style.setProperty("--selection-color", unavailable ? "#efede9" : getRinkColor(drag.location));
    setCalendarCellLocation(cell, unavailable ? "" : drag.location);
    cell.title = unavailable ? "预览：设为不可预约" : `预览：${formatLocationLabel(drag.location)} · 可预约`;
    cell.setAttribute("aria-label", cell.title);
  }
  renderCalendarLocationWatermarks(elements.dragCalendar);
}

export function clearAvailabilityDragPreview() {
  if (!originalCells.length) return;
  restoreCells();
  originalCells = [];
  renderCalendarLocationWatermarks(elements.dragCalendar);
}
