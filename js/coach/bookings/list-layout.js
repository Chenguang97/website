import { createControlScope } from "../../ui/control-lifecycle.js";
let controller = null;
import { coachElements as elements } from "../../dom/coach-elements.js";

// Native sticky headings stay inside their date groups. Only the shared header
// height needs measuring, so resizing never leaves a heading behind the header.
export function initializeCoachBookingListLayout() {
  if (controller) return controller;
  const scope = createControlScope();
  let destroyed = false;
  const header = elements.coachActionBar;
  function updateStickyOffset() {
    if (destroyed) return;
    const style = getComputedStyle(header);
    const offset = ["sticky", "fixed"].includes(style.position)
      ? header.getBoundingClientRect().height + (Number.parseFloat(style.top) || 0)
      : 0;
    elements.coachBookingPanel.style.setProperty("--coach-booking-sticky-top", `${Math.ceil(offset)}px`);
  }
  updateStickyOffset();
  scope.listen(window, "resize", updateStickyOffset);
  if (typeof ResizeObserver === "function") {
    const observer = new ResizeObserver(updateStickyOffset);
    observer.observe(header, { box: "border-box" });
    scope.add(() => observer.disconnect());
  }
  controller = {
    destroy() {
      if (destroyed) return;
      destroyed = true;
      scope.destroy();
      controller = null;
    },
  };
  return controller;
}
