function cloneData(value) {
  return JSON.parse(JSON.stringify(value));
}

function captureUndoState() {
  return {
    slots: cloneData(slots),
    blockedExceptions: cloneData(blockedExceptions),
    unsavedAddedSlotIds: [...unsavedAddedSlotIds],
    unsavedBlockedCellKeys: [...unsavedBlockedCellKeys],
    unsavedRecurringCellKeys: [...unsavedRecurringCellKeys],
    unsavedBlockExceptionIds: [...unsavedBlockExceptionIds],
    pendingDeletedSlots: cloneData([...pendingDeletedSlots.entries()]),
    hasUnsavedAvailabilityChanges,
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

function pushUndoState(snapshot) {
  undoStack.push(snapshot || captureUndoState());
  if (undoStack.length > undoStackLimit) {
    undoStack.shift();
  }
}

function clearUndoHistory() {
  undoStack.length = 0;
}

function restoreUndoState(snapshot) {
  slots = cloneData(snapshot.slots);
  blockedExceptions = cloneData(snapshot.blockedExceptions);
  replaceSetContents(unsavedAddedSlotIds, snapshot.unsavedAddedSlotIds);
  replaceSetContents(unsavedBlockedCellKeys, snapshot.unsavedBlockedCellKeys);
  replaceSetContents(unsavedRecurringCellKeys, snapshot.unsavedRecurringCellKeys);
  replaceSetContents(unsavedBlockExceptionIds, snapshot.unsavedBlockExceptionIds);
  replaceMapContents(pendingDeletedSlots, cloneData(snapshot.pendingDeletedSlots));
  setAvailabilityDirty(snapshot.hasUnsavedAvailabilityChanges);
}

function undoLastChange() {
  const snapshot = undoStack.pop();
  if (!snapshot) {
    showFormMessage("没有可以撤销的更改。");
    return;
  }

  restoreUndoState(snapshot);
  render();
  showFormMessage("已撤销上一步更改。");
}

function handleGlobalKeydown(event) {
  const isUndo = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && !event.shiftKey;
  if (!isUndo) return;
  const target = event.target;
  if (target instanceof HTMLElement && (target.closest("input, textarea, select") || target.isContentEditable)) return;

  event.preventDefault();
  undoLastChange();
}
