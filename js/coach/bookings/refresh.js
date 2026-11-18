import { captureCoachBookingReadModel } from "./read-model.js";
import { renderAvailabilityData } from "../availability/render.js";
import { renderExceptionCalendarAvailability } from "./calendar-render.js";
import { renderCoachSlots } from "./render.js";
import { renderCoachBookingRequests } from "./request-render.js";
import { receiveCoachBookingRequests } from "./request-editor.js";

function renderBookingSurfaces(model) {
  renderCoachSlots(model);
  renderAvailabilityData();
  renderExceptionCalendarAvailability(model);
}
export function receiveCoachBookingChanges({ resetRequest = false } = {}) {
  const model = captureCoachBookingReadModel();
  receiveCoachBookingRequests(model, { reset: resetRequest });
  renderBookingSurfaces(model);
}
// Repaint only. Fact/selection transitions are explicit at the receive boundary.
export function renderCoachBookingChanges() {
  const model = captureCoachBookingReadModel();
  renderCoachBookingRequests(model);
  renderBookingSurfaces(model);
}
