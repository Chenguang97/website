import { setAvailabilityDirty, showFormMessage } from "./availability-status.js";
import { getCoachBookingStudents, renderCoachBookingStudentFilter, renderCoachSlots } from "./coach-bookings-render.js";
import { confirmDiscardProfileChanges, setProfileDirty } from "./coach-profile-actions.js";
import { activeCoachPanelStorageKey, activeStudentPanelStorageKey } from "./config.js";
import { createDefaultProfiles, createDefaultSlots } from "./demo-data.js";
import { elements } from "./elements.js";
import { render, renderCalendarRinkOptions, renderExceptionCalendarAvailability } from "./render.js";
import {
  clearCoachProfileDraft,
  replaceCoachProfiles,
  replaceSlots,
  saveProfiles,
  saveSlots,
  state,
} from "./state.js";
import { storageSetItem } from "./storage-adapter.js";
import { clearUndoHistory } from "./undo.js";

export function selectCalendarRink(event) {
  const button = event.target.closest("button[data-rink]");
  if (!button) return;

  elements.calendarLocationType.value = button.dataset.rink;
  renderCalendarRinkOptions();
}

function switchView(event) {
  const button = event.currentTarget;
  const viewId = button.dataset.view;

  elements.modeButtons.forEach((item) => {
    const isActive = item === button;
    item.classList.toggle("active", isActive);
    item.setAttribute("aria-selected", String(isActive));
  });

  elements.views.forEach((view) => {
    view.classList.toggle("active", view.id === viewId);
  });
}

export function switchMethod(event) {
  const button = event.currentTarget;
  const method = button.dataset.method;

  elements.methodButtons.forEach((item) => {
    const isActive = item === button;
    item.classList.toggle("active", isActive);
    item.setAttribute("aria-selected", String(isActive));
  });

  elements.methodPanels.forEach((panel) => {
    panel.classList.toggle("is-hidden", panel.dataset.methodPanel !== method);
  });
}

export function switchAvailabilitySection(event) {
  const button = event.currentTarget;
  const sectionId = button.dataset.availabilitySection;

  elements.availabilitySubtabs.forEach((item) => {
    const isActive = item === button;
    item.classList.toggle("active", isActive);
    item.setAttribute("aria-selected", String(isActive));
  });

  elements.availabilitySections.forEach((section) => {
    section.classList.toggle("active", section.dataset.availabilityContent === sectionId);
  });
}

export function switchBookingSection(event) {
  const button = event.currentTarget;
  const sectionId = button.dataset.bookingSection;

  elements.bookingSubtabs.forEach((item) => {
    const isActive = item === button;
    item.classList.toggle("active", isActive);
    item.setAttribute("aria-selected", String(isActive));
  });

  elements.bookingSections.forEach((section) => {
    section.classList.toggle("active", section.dataset.bookingContent === sectionId);
  });
}

export function switchStudentPanel(event) {
  activateStudentPanel(event.currentTarget.dataset.studentPanel);
}

export function searchCoachBookingStudents(event) {
  state.coachBookingStudentSearch = event.currentTarget.value;
  renderCoachBookingStudentFilter();
}

export function selectCoachBookingStudent(event) {
  state.coachBookingStudentKey = event.currentTarget.value;
  state.coachBookingSelectedStudent = getCoachBookingStudents().find((student) => student.key === state.coachBookingStudentKey) || null;
  renderCoachSlots();
  renderExceptionCalendarAvailability();
}

function clearCoachBookingStudentFilter() {
  state.coachBookingStudentKey = "";
  state.coachBookingStudentSearch = "";
  state.coachBookingSelectedStudent = null;
  if (elements.coachBookingStudentSearch) elements.coachBookingStudentSearch.value = "";
  renderCoachSlots();
  renderExceptionCalendarAvailability();
}

export function handleCoachBookingFilterAction(event) {
  if (event.target.closest('[data-action="clear-coach-booking-student"]')) clearCoachBookingStudentFilter();
}

export function switchCoachBookingPeriod(event) {
  state.coachBookingListPeriod = event.currentTarget.dataset.coachBookingPeriod === "past" ? "past" : "upcoming";
  renderCoachSlots();
}

export function activateStudentPanel(panelId, shouldPersist = true) {
  const targetPanelId = [...elements.studentTabs].some((button) => button.dataset.studentPanel === panelId) ? panelId : "studentBookPanel";
  document.documentElement.dataset.activeStudentPanel = targetPanelId;

  elements.studentTabs.forEach((item) => {
    const isActive = item.dataset.studentPanel === targetPanelId;
    item.classList.toggle("active", isActive);
    item.setAttribute("aria-selected", String(isActive));
  });

  elements.studentPanels.forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.studentContent === targetPanelId);
  });

  if (shouldPersist) {
    storageSetItem(activeStudentPanelStorageKey, targetPanelId);
  }
}

export function activateCoachPanel(panelId, shouldPersist = true) {
  const targetPanelId = [...elements.coachTabs].some((button) => button.dataset.coachPanel === panelId) ? panelId : "profilePanel";
  document.documentElement.dataset.activeCoachPanel = targetPanelId;

  elements.coachTabs.forEach((item) => {
    const isActive = item.dataset.coachPanel === targetPanelId;
    item.classList.toggle("active", isActive);
    item.setAttribute("aria-selected", String(isActive));
  });

  elements.coachPanels.forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.coachContent === targetPanelId);
  });

  if (shouldPersist) {
    storageSetItem(activeCoachPanelStorageKey, targetPanelId);
  }
}

export function switchCoachPanel(event) {
  if (!confirmDiscardProfileChanges()) return;
  activateCoachPanel(event.currentTarget.dataset.coachPanel);
}

export function resetDemoData() {
  replaceCoachProfiles(createDefaultProfiles());
  clearCoachProfileDraft();
  replaceSlots(createDefaultSlots());
  state.hasUnsavedProfileChanges = false;
  state.unsavedAddedSlotIds.clear();
  state.unsavedBlockedCellKeys.clear();
  state.unsavedRecurringCellKeys.clear();
  state.unsavedBlockExceptionIds.clear();
  state.pendingDeletedSlots.clear();
  clearUndoHistory();
  if (!saveProfiles() || !saveSlots()) {
    if (document.body.dataset.page !== "admin") showFormMessage("重置失败。浏览器存储空间不足。", true);
    return;
  }
  if (document.body.dataset.page === "admin") {
    render();
    return;
  }
  setProfileDirty(false);
  setAvailabilityDirty(false, "已重置示例数据");
  render();
  showFormMessage("已重置：默认周一到周五 6:00-16:00 对不限冰场可预约。");
}
