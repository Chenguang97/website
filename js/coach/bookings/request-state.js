const validFilters = new Set(["all", "coach", "student", "history"]);

let activeFilter = "all";
let currentFilter = "all";
const selectedRequestIds = { current: "", history: "" };

export function getCoachRequestFilter() {
  return activeFilter;
}

export function setCoachRequestFilter(filter) {
  activeFilter = validFilters.has(filter) ? filter : "all";
  if (activeFilter !== "history") currentFilter = activeFilter;
  return activeFilter;
}

export function getCoachCurrentRequestFilter() {
  return currentFilter;
}

export function getCoachRequestStudentScope() {
  return activeFilter === "history" ? "requestHistory" : "requests";
}

export function getSelectedCoachRequestId() {
  return selectedRequestIds[activeFilter === "history" ? "history" : "current"];
}

export function setSelectedCoachRequestId(requestId) {
  const scope = activeFilter === "history" ? "history" : "current";
  selectedRequestIds[scope] = String(requestId || "");
  return selectedRequestIds[scope];
}

// Selection transitions belong to the workspace receive boundary, never paint.
export function receiveCoachRequestSelection(model) {
  let id = getSelectedCoachRequestId();
  if (!model.visibleRequest(id)) id = setSelectedCoachRequestId(model.requests[0]?.id || "");
  return model.visibleRequest(id);
}
