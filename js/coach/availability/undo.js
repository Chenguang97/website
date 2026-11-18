import { renderAvailabilityStatus, showFormMessage, showCalendarFeedback } from "./status.js";
import { isUndoShortcut } from "../../ui/undo-shortcut.js";
import {
  renderDragCalendar,
  } from "./render.js";
import { renderExceptionDragCalendar } from "../bookings/calendar-render.js";
import { undoAvailabilityDraft } from "../../core/state.js";
import { resetSchedulingSettingsEditor } from "./planner-render.js";

export function undoAvailabilityChange() {
  const result = undoAvailabilityDraft();
  if (!result.ok) { showCalendarFeedback("没有可撤销的修改", true); return; }
  renderAvailabilityStatus();
  renderAvailabilityAfterUndo();
  showFormMessage("");
  showCalendarFeedback("已撤销");
}

export function handleAvailabilityUndoKeydown(event) {
  if (!isUndoShortcut(event)) return;
  event.preventDefault();
  undoAvailabilityChange();
}

function renderAvailabilityAfterUndo() {
  resetSchedulingSettingsEditor();
  renderDragCalendar();
  renderExceptionDragCalendar();
}
