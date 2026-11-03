import { render } from "./render.js";
import { setProfileDirty, showProfileMessage } from "./coach-profile-status.js";
import { ensureCoachProfileDraft, replaceBlockedExceptions, replaceSlots, setCoachProfileDraft, state } from "./state.js";
import { setAvailabilityDirty, showFormMessage } from "./availability-status.js";

function cloneData(value) {
  return JSON.parse(JSON.stringify(value));
}

export function captureUndoState() {
  return {
    type: "availability",
    slots: cloneData(state.slots),
    blockedExceptions: cloneData(state.blockedExceptions),
    unsavedAddedSlotIds: [...state.unsavedAddedSlotIds],
    unsavedBlockedCellKeys: [...state.unsavedBlockedCellKeys],
    unsavedRecurringCellKeys: [...state.unsavedRecurringCellKeys],
    unsavedBlockExceptionIds: [...state.unsavedBlockExceptionIds],
    pendingDeletedSlots: cloneData([...state.pendingDeletedSlots.entries()]),
    hasUnsavedAvailabilityChanges: state.hasUnsavedAvailabilityChanges,
  };
}

export function captureProfileUndoState() {
  return {
    type: "coach-profile",
    coachProfileDraft: cloneData(ensureCoachProfileDraft()),
    hasUnsavedProfileChanges: state.hasUnsavedProfileChanges,
  };
}

function replaceSetContents(target, values) {
  target.clear();
  values.forEach((value) => target.add(value));
}

function replaceMapContents(target, entries) {
  target.clear();
  entries.forEach(([key, value]) => target.set(key, value));
}

export function pushUndoState(snapshot) {
  state.undoStack.push(snapshot || captureUndoState());
  if (state.undoStack.length > state.undoStackLimit) {
    state.undoStack.shift();
  }
}

export function clearUndoHistory(type) {
  if (!type) {
    state.undoStack.length = 0;
    return;
  }
  state.undoStack = state.undoStack.filter((snapshot) => snapshot.type !== type);
}

function restoreUndoState(snapshot) {
  replaceSlots(cloneData(snapshot.slots));
  replaceBlockedExceptions(cloneData(snapshot.blockedExceptions));
  replaceSetContents(state.unsavedAddedSlotIds, snapshot.unsavedAddedSlotIds);
  replaceSetContents(state.unsavedBlockedCellKeys, snapshot.unsavedBlockedCellKeys);
  replaceSetContents(state.unsavedRecurringCellKeys, snapshot.unsavedRecurringCellKeys);
  replaceSetContents(state.unsavedBlockExceptionIds, snapshot.unsavedBlockExceptionIds);
  replaceMapContents(state.pendingDeletedSlots, cloneData(snapshot.pendingDeletedSlots));
  setAvailabilityDirty(snapshot.hasUnsavedAvailabilityChanges);
}

export function undoLastChange() {
  const snapshot = state.undoStack.pop();
  if (!snapshot) {
    showFormMessage("没有可以撤销的更改。");
    return;
  }

  if (snapshot.type === "coach-profile") {
    setCoachProfileDraft(cloneData(snapshot.coachProfileDraft));
    setProfileDirty(snapshot.hasUnsavedProfileChanges);
    render();
    showProfileMessage("已恢复课程");
    return;
  }

  restoreUndoState(snapshot);
  render();
  showFormMessage("已撤销上一步更改。");
}

export function handleGlobalKeydown(event) {
  const isUndo = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && !event.shiftKey;
  if (!isUndo) return;
  const target = event.target;
  if (target instanceof HTMLElement && (target.closest("input, textarea, select") || target.isContentEditable)) return;

  event.preventDefault();
  undoLastChange();
}
