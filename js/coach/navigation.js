import { coachCanManage } from "./service-controller.js";
import { animateBookingView } from "./bookings/view-motion.js";
import { animateAvailabilityMethod } from "./availability/method-motion.js";
import { animateCoachTab } from "./tab-motion.js";
import { closeCoachBookingFilter, renderAppliedCoachBookingStudentFilter } from "./bookings/controls.js";
import { selectCoachBookingFilterScope } from "./bookings/filter-state.js";
import { getCoachRequestStudentScope } from "./bookings/request-state.js";
import { confirmDiscardProfileChanges } from "./profile/save-controller.js";
import { activeCoachPanelStorageKey } from "../core/config.js";
import { coachElements as elements } from "../dom/coach-elements.js";
import { setOpenSelection } from "./availability/calendar-selection.js";
import { renderOpenSelection } from "./availability/open-block-render.js";
import { renderCalendarRinkOptions } from "./availability/render.js";
import { writeStorageItem } from "../core/storage-adapter.js";
import { renderCoachHeaderSave } from "./header-status.js";

let recordSection = "bookingCalendarSection";
const scrollPositions = { records: 0, requests: 0 };
const innerScrollPositions = new Map();
const scrollSelectors = ["#exceptionDragCalendar", "#coachRequestRecords", "#coachRequestConversation"];

export function openCoachBookingRecords() {
  activateBookingSection(recordSection);
}

export function selectCalendarRink(event) {
  const button = event.target.closest("button[data-rink]");
  if (!button) return;
  elements.calendarLocationType.value = elements.calendarLocationType.value === button.dataset.rink ? "" : button.dataset.rink;
  setOpenSelection(null);
  renderOpenSelection();
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
  if (!coachCanManage()) return;
  const showsRequests = sectionId === "coachRequestWorkspace";
  const previousScope = elements.coachBookingPanel.dataset.bookingView === "requests" ? "requests" : "records";
  const scope = showsRequests ? "requests" : "records";
  if (scope !== previousScope) {
    scrollPositions[previousScope] = window.scrollY;
    scrollSelectors.forEach((selector) => {
      const node = document.querySelector(selector);
      if (node) innerScrollPositions.set(selector, { top: node.scrollTop, left: node.scrollLeft });
    });
  }
  const button = [...elements.bookingSubtabs].find((item) => item.dataset.bookingSection === sectionId) || null;
  const targetSectionId = showsRequests ? "coachRequestWorkspace" : (button?.dataset.bookingSection || "bookingCalendarSection");
  const showsList = targetSectionId === "bookingListSection";
  if (animate && button) animateBookingView(button);
  closeCoachBookingFilter();
  selectCoachBookingFilterScope(showsRequests ? getCoachRequestStudentScope() : "records");
  if (!showsRequests) recordSection = targetSectionId;
  elements.coachBookingPanel.dataset.bookingView = showsRequests ? "requests" : showsList ? "list" : "calendar";
  elements.coachBookingContentTitle.textContent = showsRequests ? "特殊请求" : "预约记录";
  elements.coachBookingContentNote.textContent = showsRequests ? "处理需要双方商议的例外安排" : showsList ? "查看即将开始和历史预约" : "查看已成立的预约与安排不可预约时间";
  elements.coachBookingContentNote.hidden = showsRequests;
  elements.openBlockDialog.textContent = showsList ? "＋ 设置不可预约时间" : "＋ 不可预约时间";
  elements.coachBookingRecordsTrigger.classList.toggle("active", !showsRequests);
  elements.coachBookingRecordsTrigger.setAttribute("aria-pressed", String(!showsRequests));
  elements.coachRequestSectionTrigger.classList.toggle("active", showsRequests);
  elements.coachRequestSectionTrigger.setAttribute("aria-pressed", String(showsRequests));
  elements.bookingSubtabs.forEach((item) => {
    const isActive = !showsRequests && item === button;
    item.classList.toggle("active", isActive);
    item.setAttribute("aria-selected", String(isActive));
  });
  elements.bookingSections.forEach((section) => section.classList.toggle("active", !showsRequests && section.dataset.bookingContent === targetSectionId));
  elements.coachRequestWorkspace.hidden = !showsRequests;
  const studentFilterMount = showsRequests ? elements.coachRequestStudentFilterMount : showsList ? elements.coachListStudentFilterMount : elements.coachScheduleStudentFilterMount;
  elements.coachBookingStudentLabel.textContent = showsRequests ? "学生" : showsList ? "学生：" : "查看学生";
  if (elements.coachBookingStudentPicker.parentElement !== studentFilterMount) studentFilterMount.append(elements.coachBookingStudentPicker);
  if (scope !== previousScope) {
    renderAppliedCoachBookingStudentFilter();
    scrollSelectors.forEach((selector) => {
      const node = document.querySelector(selector);
      const position = innerScrollPositions.get(selector);
      if (node && position) { node.scrollTop = position.top; node.scrollLeft = position.left; }
    });
    if (window.scrollY !== scrollPositions[scope]) window.scrollTo({ top: scrollPositions[scope], behavior: "instant" });
  }
}

export function activateCoachPanel(panelId, shouldPersist = true) {
  const targetPanelId = !coachCanManage() ? "profilePanel" : [...elements.coachTabs].some((button) => button.dataset.coachPanel === panelId) ? panelId : "profilePanel";
  document.documentElement.dataset.activeCoachPanel = targetPanelId;
  renderCoachHeaderSave();
  elements.coachTabs.forEach((item) => {
    const isActive = item.dataset.coachPanel === targetPanelId;
    item.classList.toggle("active", isActive);
    item.setAttribute("aria-selected", String(isActive));
  });
  elements.coachPanels.forEach((panel) => panel.classList.toggle("active", panel.dataset.coachContent === targetPanelId));
  const activeButton = [...elements.coachTabs].find((button) => button.dataset.coachPanel === targetPanelId);
  if (activeButton) animateCoachTab(activeButton, { animate: shouldPersist });
  if (shouldPersist) writeStorageItem(activeCoachPanelStorageKey, targetPanelId);
}

export function switchCoachPanel(event) {
  if (!confirmDiscardProfileChanges()) return;
  if (event.currentTarget.dataset.coachPanel === "bookingsPanel") openCoachBookingRecords();
  activateCoachPanel(event.currentTarget.dataset.coachPanel);
}
