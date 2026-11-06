import { selectElements } from "./select-elements.js";

export const studentElements = selectElements({
  studentCoachFilterGroup: "#studentCoachFilterGroup", studentRinkFilterGroup: "#studentRinkFilterGroup",
  studentCoachSearch: "#studentCoachSearch", studentRinkSearch: "#studentRinkSearch",
  studentCoachFilterSummary: "#studentCoachFilterSummary", studentRinkFilterSummary: "#studentRinkFilterSummary",
  studentCoachChips: "#studentCoachChips", studentRinkChips: "#studentRinkChips",
  studentCoachFilterPanel: "#studentCoachFilterPanel", studentRinkFilterPanel: "#studentRinkFilterPanel",
  multiCoachRequestTargets: "#multiCoachRequestTargets", studentSlots: "#studentSlots", studentOwnBookings: "#studentOwnBookings",
  studentAccessMessage: "#studentAccessMessage", studentLoginPrompt: "#studentLoginPrompt", studentControls: "#studentControls",
  studentDateFilter: "#studentDateFilter", studentLessonDurationFilter: "#studentLessonDurationFilter",
  studentPendingDateMessage: "#studentPendingDateMessage", studentDateActions: "#studentDateActions",
  studentViewDateRange: "#studentViewDateRange", studentDayAvailability: "#studentDayAvailability",
  studentSlotOptionsDialog: "#studentSlotOptionsDialog", studentSlotOptionsTitle: "#studentSlotOptionsTitle",
  studentSlotOptionsList: "#studentSlotOptionsList", closeStudentSlotOptions: "#closeStudentSlotOptions",
}, {
  studentFilterToggles: ".student-filter-toggle", studentTabs: ".student-page-tab", studentPanels: "[data-student-content]",
  studentViewModeButtons: ".student-view-mode-button",
});
