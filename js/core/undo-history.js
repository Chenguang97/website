import { state } from "./state.js";

export function cloneUndoData(value) {
  return JSON.parse(JSON.stringify(value));
}

export function pushUndoSnapshot(snapshot) {
  state.undoStack.push(snapshot);
  if (state.undoStack.length > state.undoStackLimit) state.undoStack.shift();
}

export function popLatestUndoSnapshot(types) {
  const accepted = new Set(Array.isArray(types) ? types : [types]);
  const index = state.undoStack.findLastIndex((snapshot) => accepted.has(snapshot.type));
  if (index < 0) return null;
  return state.undoStack.splice(index, 1)[0];
}

export function clearUndoHistory(type) {
  if (!type) {
    state.undoStack.length = 0;
    return;
  }
  state.undoStack = state.undoStack.filter((snapshot) => snapshot.type !== type);
}

export function isUndoShortcut(event) {
  if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "z" || event.shiftKey) return false;
  const target = event.target;
  return !(target instanceof HTMLElement && (target.closest("input, textarea, select") || target.isContentEditable));
}

