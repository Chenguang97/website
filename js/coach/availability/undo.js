import { setAvailabilityDirty, showFormMessage } from "./status.js";
import {
  clearUndoHistory,
  cloneUndoData,
  isUndoShortcut,
  popLatestUndoSnapshot,
  pushUndoSnapshot,
} from "../../core/undo-history.js";
import {
  renderDragCalendar,
  renderDropdownOpenSlots,
  renderDropdownWeekSlots,
} from "./render.js";
import { renderExceptionDragCalendar } from "../bookings/calendar-render.js";
import { replaceBlockedExceptions, replaceSlots, state } from "../../core/state.js";

export function captureAvailabilityUndoState() {
  return {
    type: "availability",
    slots: cloneUndoData(state.slots),
    blockedExceptions: cloneUndoData(state.blockedExceptions),
    unsavedAddedSlotIds: [...state.unsavedAddedSlotIds],
    unsavedBlockedCellKeys: [...state.unsavedBlockedCellKeys],
    unsavedRecurringCellKeys: [...state.unsavedRecurringCellKeys],
    unsavedBlockExceptionIds: [...state.unsavedBlockExceptionIds],
    pendingDeletedSlots: cloneUndoData([...state.pendingDeletedSlots.entries()]),
    hasUnsavedAvailabilityChanges: state.hasUnsavedAvailabilityChanges,
  };
}

export function pushAvailabilityUndoState(snapshot = captureAvailabilityUndoState()) {
  pushUndoSnapshot(snapshot);
}

export function clearAvailabilityUndoHistory() {
  clearUndoHistory("availability");
}

export function undoAvailabilityChange() {
  const snapshot = popLatestUndoSnapshot("availability");
  if (!snapshot) {
    showFormMessage("没有可以撤销的开放时间更改。");
    return;
  }
  restoreAvailabilitySnapshot(snapshot);
  renderAvailabilityAfterUndo();
  showFormMessage("已撤销上一步更改。");
}

export function handleAvailabilityUndoKeydown(event) {
  if (!isUndoShortcut(event)) return;
  event.preventDefault();
  undoAvailabilityChange();
}

function restoreAvailabilitySnapshot(snapshot) {
  replaceSlots(cloneUndoData(snapshot.slots));
  replaceBlockedExceptions(cloneUndoData(snapshot.blockedExceptions));
  replaceSetContents(state.unsavedAddedSlotIds, snapshot.unsavedAddedSlotIds);
  replaceSetContents(state.unsavedBlockedCellKeys, snapshot.unsavedBlockedCellKeys);
  replaceSetContents(state.unsavedRecurringCellKeys, snapshot.unsavedRecurringCellKeys);
  replaceSetContents(state.unsavedBlockExceptionIds, snapshot.unsavedBlockExceptionIds);
  state.pendingDeletedSlots.clear();
  cloneUndoData(snapshot.pendingDeletedSlots).forEach(([key, value]) => state.pendingDeletedSlots.set(key, value));
  setAvailabilityDirty(snapshot.hasUnsavedAvailabilityChanges);
}

function replaceSetContents(target, values) {
  target.clear();
  values.forEach((value) => target.add(value));
}

function renderAvailabilityAfterUndo() {
  renderDragCalendar();
  renderExceptionDragCalendar();
  renderDropdownOpenSlots();
  renderDropdownWeekSlots();
}

