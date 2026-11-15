import { coachElements as elements } from "../../dom/coach-elements.js";

// Native sticky headings stay inside their date groups. Only the shared header
// height needs measuring, so resizing never leaves a heading behind the header.
export function initializeCoachBookingListLayout() {
  const header = elements.coachActionBar;
  function updateStickyOffset() {
    const style = getComputedStyle(header);
    const offset = ["sticky", "fixed"].includes(style.position)
      ? header.getBoundingClientRect().height + (Number.parseFloat(style.top) || 0)
      : 0;
    elements.coachBookingPanel.style.setProperty("--coach-booking-sticky-top", `${Math.ceil(offset)}px`);
  }
  updateStickyOffset();
  window.addEventListener("resize", updateStickyOffset);
  if (typeof ResizeObserver === "function") new ResizeObserver(updateStickyOffset).observe(header, { box: "border-box" });
}
