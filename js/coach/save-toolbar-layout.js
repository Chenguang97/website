import { coachElements as elements } from "../dom/coach-elements.js";

// Measure the shared frame, never change it to make room for the controls.
export function initializeCoachSaveToolbarLayout() {
  const toolbar = elements.coachSaveToolbar;
  const frame = elements.coachWorkspaceContainer;
  const cardGap = 24;
  const viewportInset = 16;
  const bottomInset = 24;

  function updatePlacement() {
    const bounds = frame.getBoundingClientRect();
    const width = Number.parseFloat(getComputedStyle(toolbar).getPropertyValue("--coach-save-side-width"));
    const left = bounds.right + cardGap;
    const fits = bounds.width > 0 && width > 0
      && left + width + viewportInset <= document.documentElement.clientWidth;
    const layout = fits ? "side" : "bottom";
    if (toolbar.dataset.layout !== layout) toolbar.dataset.layout = layout;
    if (fits) {
      const position = `${left}px`;
      if (toolbar.style.getPropertyValue("--coach-save-side-left") !== position) toolbar.style.setProperty("--coach-save-side-left", position);
    } else if (toolbar.style.getPropertyValue("--coach-save-side-left")) {
      toolbar.style.removeProperty("--coach-save-side-left");
    }
    const clearance = `${Math.max(188, toolbar.getBoundingClientRect().height + bottomInset + cardGap)}px`;
    if (frame.parentElement.style.getPropertyValue("--coach-save-clearance") !== clearance) {
      frame.parentElement.style.setProperty("--coach-save-clearance", clearance);
    }
  }

  updatePlacement();
  window.addEventListener("resize", updatePlacement);
  window.addEventListener("scroll", updatePlacement, { passive: true });
  if (typeof ResizeObserver === "function") {
    const observer = new ResizeObserver(updatePlacement);
    observer.observe(frame);
    observer.observe(toolbar);
  }
}
