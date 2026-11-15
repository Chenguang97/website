import { coachElements as elements } from "../../dom/coach-elements.js";

// Keep one shared picker anchored in the viewport; only its option list scrolls.
export function positionCoachBookingStudentPanel() {
  const panel = elements.coachBookingStudentResults;
  if (panel.hidden) return true;
  const trigger = elements.coachBookingStudentTrigger.getBoundingClientRect();
  const viewportHeight = document.documentElement.clientHeight || window.innerHeight;
  const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
  const headerBottom = Math.max(0, elements.coachActionBar.getBoundingClientRect().bottom);
  if (trigger.height > 0 && (trigger.bottom < headerBottom || trigger.top > viewportHeight)) return false;

  const margin = 12;
  const gap = 6;
  const above = Math.max(0, trigger.top - headerBottom - margin - gap);
  const below = Math.max(0, viewportHeight - trigger.bottom - margin - gap);
  const placement = Math.max(above, below) < 220 ? "viewport" : below >= 260 || below >= above ? "below" : "above";
  const top = placement === "viewport" ? headerBottom + margin : trigger.bottom + gap;
  const available = placement === "viewport" ? viewportHeight - top - margin : placement === "above" ? above : below;
  const width = panel.getBoundingClientRect().width;
  const left = Math.max(margin, Math.min(trigger.left, viewportWidth - width - margin));
  panel.dataset.placement = placement;
  const values = {
    "--coach-student-panel-top": `${top}px`,
    "--coach-student-panel-bottom": `${viewportHeight - trigger.top + gap}px`,
    "--coach-student-panel-left": `${left}px`,
    "--coach-student-panel-max-height": `${Math.max(0, Math.min(480, available))}px`,
  };
  for (const [name, value] of Object.entries(values)) {
    if (panel.style.getPropertyValue(name) !== value) panel.style.setProperty(name, value);
  }
  return true;
}
