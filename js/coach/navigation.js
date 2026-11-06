import { closeCoachBookingFilter } from "./bookings/controls.js";
import { confirmDiscardProfileChanges } from "./profile/actions.js";
import { activeCoachPanelStorageKey } from "../core/config.js";
import { coachElements as elements } from "../dom/coach-elements.js";
import { renderCalendarRinkOptions } from "./availability/render.js";
import { storageSetItem } from "../core/storage-adapter.js";

export function selectCalendarRink(event) {
  const button = event.target.closest("button[data-rink]");
  if (!button) return;
  elements.calendarLocationType.value = button.dataset.rink;
  renderCalendarRinkOptions();
}

export function switchMethod(event) {
  const button = event.currentTarget;
  const method = button.dataset.method;
  elements.methodButtons.forEach((item) => {
    const isActive = item === button;
    item.classList.toggle("active", isActive);
    item.setAttribute("aria-selected", String(isActive));
  });
  elements.methodPanels.forEach((panel) => panel.classList.toggle("is-hidden", panel.dataset.methodPanel !== method));
}

export function switchAvailabilitySection(event) {
  const button = event.currentTarget;
  const sectionId = button.dataset.availabilitySection;
  elements.availabilitySubtabs.forEach((item) => {
    const isActive = item === button;
    item.classList.toggle("active", isActive);
    item.setAttribute("aria-selected", String(isActive));
  });
  elements.availabilitySections.forEach((section) => section.classList.toggle("active", section.dataset.availabilityContent === sectionId));
}

export function switchBookingSection(event) {
  const button = event.currentTarget;
  const sectionId = button.dataset.bookingSection;
  closeCoachBookingFilter();
  elements.bookingSubtabs.forEach((item) => {
    const isActive = item === button;
    item.classList.toggle("active", isActive);
    item.setAttribute("aria-selected", String(isActive));
  });
  elements.bookingSections.forEach((section) => section.classList.toggle("active", section.dataset.bookingContent === sectionId));
}

export function activateCoachPanel(panelId, shouldPersist = true) {
  const targetPanelId = [...elements.coachTabs].some((button) => button.dataset.coachPanel === panelId) ? panelId : "profilePanel";
  document.documentElement.dataset.activeCoachPanel = targetPanelId;
  elements.coachTabs.forEach((item) => {
    const isActive = item.dataset.coachPanel === targetPanelId;
    item.classList.toggle("active", isActive);
    item.setAttribute("aria-selected", String(isActive));
  });
  elements.coachPanels.forEach((panel) => panel.classList.toggle("active", panel.dataset.coachContent === targetPanelId));
  if (shouldPersist) storageSetItem(activeCoachPanelStorageKey, targetPanelId);
}

export function switchCoachPanel(event) {
  if (confirmDiscardProfileChanges()) activateCoachPanel(event.currentTarget.dataset.coachPanel);
}

