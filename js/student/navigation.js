import { activeStudentPanelStorageKey } from "../core/config.js";
import { studentElements as elements } from "../dom/student-elements.js";
import { storageSetItem } from "../core/storage-adapter.js";

export function activateStudentPanel(panelId, shouldPersist = true) {
  const targetPanelId = [...elements.studentTabs].some((button) => button.dataset.studentPanel === panelId) ? panelId : "studentBookPanel";
  document.documentElement.dataset.activeStudentPanel = targetPanelId;
  elements.studentTabs.forEach((item) => {
    const isActive = item.dataset.studentPanel === targetPanelId;
    item.classList.toggle("active", isActive);
    item.setAttribute("aria-selected", String(isActive));
  });
  elements.studentPanels.forEach((panel) => panel.classList.toggle("active", panel.dataset.studentContent === targetPanelId));
  if (shouldPersist) storageSetItem(activeStudentPanelStorageKey, targetPanelId);
}

export function switchStudentPanel(event) {
  activateStudentPanel(event.currentTarget.dataset.studentPanel);
}

