var rinks = ["Polar Ice Rink", "Arcadia Ice Arena", "Oceanside Ice Arena"];
var rinkColors = {
  "Polar Ice Rink": "#bbf7d0",
  "Arcadia Ice Arena": "#bfdbfe",
  "Oceanside Ice Arena": "#fde68a",
  "Any served rink": "#ddd6fe",
  Zoom: "#bae6fd",
  Unavailable: "#e2e8f0",
};

var coaches = [
  { id: "maya", name: "Maya Chen", subject: "Figure Skating Coach" },
  { id: "alex", name: "Alex Rivera", subject: "Hockey Skating Coach" },
  { id: "sam", name: "Sam Patel", subject: "Off-ice & Jumps Coach" },
];

var currentCoachId = "maya";
var slotsStorageKey = "ice-skating-coach-booking-slots-v12";
var profileStorageKey = "ice-skating-coach-profiles-v2";
var blockedStorageKey = "ice-skating-coach-blocked-exceptions-v1";
var activeCoachPanelStorageKey = "ice-skating-coach-active-panel-v1";
var dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
var calendarStep = 30;
var unavailableSelection = "Unavailable";
var fullDayStart = "00:00";
var fullDayEnd = "24:00";
var coreDayStart = "06:00";
var coreDayEnd = "18:00";
var defaultStart = "06:00";
var defaultEnd = "16:00";
var recurringPastWeeks = 8;
var recurringFutureWeeks = 52;
