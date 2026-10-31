export const rinks = ["Polar Ice Rink", "Arcadia Ice Arena", "Oceanside Ice Arena"];
export const rinkColors = {
  "Polar Ice Rink": "#bbf7d0",
  "Arcadia Ice Arena": "#bfdbfe",
  "Oceanside Ice Arena": "#fde68a",
  "Any served rink": "#ddd6fe",
  Zoom: "#bae6fd",
  Unavailable: "#e2e8f0",
};

export const coaches = [
  { id: "maya", name: "Maya Chen", subject: "Figure Skating Coach" },
  { id: "alex", name: "Alex Rivera", subject: "Hockey Skating Coach" },
  { id: "sam", name: "Sam Patel", subject: "Off-ice & Jumps Coach" },
];

export const currentCoachId = "maya";
export const slotsStorageKey = "ice-skating-coach-booking-slots-v12";
export const profileStorageKey = "ice-skating-coach-profiles-v2";
export const blockedStorageKey = "ice-skating-coach-blocked-exceptions-v1";
export const activeCoachPanelStorageKey = "ice-skating-coach-active-panel-v1";
export const activeStudentPanelStorageKey = "ice-skating-student-active-panel-v1";
export const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const calendarStep = 30;
export const unavailableSelection = "Unavailable";
export const fullDayStart = "00:00";
export const fullDayEnd = "24:00";
export const coreDayStart = "06:00";
export const coreDayEnd = "18:00";
export const defaultStart = "06:00";
export const defaultEnd = "16:00";
export const recurringPastWeeks = 8;
export const recurringFutureWeeks = 52;
export const publicStudentPreviewHours = 3;
export const rescheduleWindowWeeks = 2;
export const rescheduleOptionLimit = 80;
export const studentHasFullAccess = new URLSearchParams(window.location.search).get("access") === "full";
