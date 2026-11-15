import { animateBookingView } from "./bookings/view-motion.js?v=booking-liquid-restored-1";
import { animateAvailabilityMethod } from "./availability/method-motion.js?v=confirmed-liquid-switch-1";
import { animateCoachTab } from "./tab-motion.js?v=coach-top-liquid-2";
import { closeCoachBookingFilter } from "./bookings/controls.js?v=booking-liquid-restored-1";
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
  animateAvailabilityMethod(button);
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
  activateBookingSection(event.currentTarget.dataset.bookingSection, { animate: true });
}

export function activateBookingSection(sectionId, { animate = false } = {}) {
  const showsRequests = sectionId === "coachRequestWorkspace";
  const button = [...elements.bookingSubtabs].find((item) => item.dataset.bookingSection === sectionId) || null;
  const targetSectionId = showsRequests ? "coachRequestWorkspace" : (button?.dataset.bookingSection || "bookingCalendarSection");
  if (animate && button) animateBookingView(button);
  closeCoachBookingFilter();
  elements.coachBookingPanel.dataset.bookingView = showsRequests ? "requests" : targetSectionId === "bookingListSection" ? "list" : "calendar";
  elements.coachRequestSectionTrigger.classList.toggle("active", showsRequests);
  elements.coachRequestSectionTrigger.setAttribute("aria-selected", String(showsRequests));
  elements.bookingSubtabs.forEach((item) => {
    const isActive = !showsRequests && item === button;
    item.classList.toggle("active", isActive);
    item.setAttribute("aria-selected", String(isActive));
  });
  elements.bookingSections.forEach((section) => section.classList.toggle("active", !showsRequests && section.dataset.bookingContent === targetSectionId));
  elements.coachRequestWorkspace.hidden = !showsRequests;
  const studentFilterMount = showsRequests ? elements.coachRequestStudentFilterMount : elements.coachScheduleStudentFilterMount;
  if (elements.coachBookingStudentPicker.parentElement !== studentFilterMount) studentFilterMount.append(elements.coachBookingStudentPicker);
}

export function activateCoachPanel(panelId, shouldPersist = true) {
  const targetPanelId = [...elements.coachTabs].some((button) => button.dataset.coachPanel === panelId) ? panelId : "profilePanel";
  const showsProfileSave = targetPanelId === "profilePanel";
  document.documentElement.dataset.activeCoachPanel = targetPanelId;
  elements.saveProfileChanges.hidden = !showsProfileSave;
  elements.profileSaveStatus.parentElement.hidden = !showsProfileSave;
  elements.coachTabs.forEach((item) => {
    const isActive = item.dataset.coachPanel === targetPanelId;
    item.classList.toggle("active", isActive);
    item.setAttribute("aria-selected", String(isActive));
  });
  elements.coachPanels.forEach((panel) => panel.classList.toggle("active", panel.dataset.coachContent === targetPanelId));
  const activeButton = [...elements.coachTabs].find((button) => button.dataset.coachPanel === targetPanelId);
  if (activeButton) animateCoachTab(activeButton, { animate: shouldPersist });
  if (shouldPersist) storageSetItem(activeCoachPanelStorageKey, targetPanelId);
}

export function switchCoachPanel(event) {
  if (!confirmDiscardProfileChanges()) return;
  activateCoachPanel(event.currentTarget.dataset.coachPanel);
}

