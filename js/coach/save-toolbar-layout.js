import { createControlScope } from "../ui/control-lifecycle.js";

const owners = new WeakMap();
import { coachElements as elements } from "../dom/coach-elements.js";

// Measure the shared frame, never change it to make room for the controls.
export function initializeCoachSaveToolbarLayout() {
  const toolbar = elements.coachSaveToolbar;
  const existing = owners.get(toolbar);
  if (existing) return existing;
  const scope = createControlScope();
  const view = toolbar.ownerDocument.defaultView;
  let destroyed = false;
  const frame = elements.coachWorkspaceContainer;
  const cardGap = 24;
  const viewportInset = 16;
  const bottomInset = 24;

  function updatePlacement() {
    if (destroyed) return;
    const bounds = frame.getBoundingClientRect();
    const width = Number.parseFloat(view.getComputedStyle(toolbar).getPropertyValue("--coach-save-side-width"));
    const left = bounds.right + cardGap;
    const fits = bounds.width > 0 && width > 0
      && left + width + viewportInset <= toolbar.ownerDocument.documentElement.clientWidth;
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
  scope.listen(view, "resize", updatePlacement);
  scope.listen(view, "scroll", updatePlacement, { passive: true });
  const Observer = view.ResizeObserver || globalThis.ResizeObserver;
  if (typeof Observer === "function") {
    const observer = new Observer(updatePlacement);
    observer.observe(frame);
    observer.observe(toolbar);
    scope.add(() => observer.disconnect());
  }
  const controller = {
    destroy() {
      if (destroyed) return;
      destroyed = true;
      scope.destroy();
      if (owners.get(toolbar) === controller) owners.delete(toolbar);
    },
  };
  owners.set(toolbar, controller);
  return controller;
}
