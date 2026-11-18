const localRinks = ["Polar Ice Rink", "Arcadia Ice Arena", "Oceanside Ice Arena"];
export let rinks = localRinks;
export const rinkColors = {
  "Polar Ice Rink": "#bbf7d0",
  "Arcadia Ice Arena": "#bfdbfe",
  "Oceanside Ice Arena": "#fde68a",
  "Any served rink": "#ddd6fe",
  Zoom: "#bae6fd",
  Unavailable: "#e2e8f0",
};
export const locationShortLabels = {
  "Polar Ice Rink": "Polar Ice",
  "Arcadia Ice Arena": "Arcadia",
  "Oceanside Ice Arena": "Oceanside",
  "Any served rink": "不限冰场",
  Zoom: "Zoom",
  Unavailable: "不可预约",
};

const localCoaches = [
  { id: "maya", name: "Maya Chen", subject: "Figure Skating Coach" },
  { id: "alex", name: "Alex Rivera", subject: "Hockey Skating Coach" },
  { id: "sam", name: "Sam Patel", subject: "Off-ice & Jumps Coach" },
];

export let coaches = localCoaches;
export let currentCoachId = "maya";
export const slotsStorageKey = "ice-skating-coach-booking-slots-v12";
export const profileStorageKey = "ice-skating-coach-profiles-v2";
export const blockedStorageKey = "ice-skating-coach-blocked-exceptions-v1";
export const bookingRequestsStorageKey = "ice-skating-booking-requests-v1";
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
export let studentHasFullAccess = new URLSearchParams(globalThis.location?.search || "").get("access") === "full";

// Explicit dependency inversion: the page transport installs a read-only port.
// Core never imports transport/page modules and this stores no business drafts.
let serviceSource = null;
const uninitializedService = Object.freeze({ mode: "uninitialized", service: false, user: null });
export const readServiceContext = () => serviceSource?.readContext() || uninitializedService;
export const readServiceSession = () => serviceSource?.readSession() || null;
export const readServiceBootstrap = () => serviceSource?.readBootstrap() || null;
export function requireServiceProjection() {
  const projection = readServiceBootstrap();
  if (!projection) throw new Error("服务数据尚未载入；请先完成异步 bootstrap。");
  return projection.data;
}
export function synchronizeServiceIdentity() {
  if (!serviceSource) return;
  if (!readServiceContext().service) {
    coaches = localCoaches; rinks = localRinks; currentCoachId = "maya";
    studentHasFullAccess = !readServiceContext().publicView && new URLSearchParams(globalThis.location?.search || "").get("access") === "full";
    return;
  }
  if (readServiceContext().reloadRequired) { coaches = Object.freeze([]); rinks = Object.freeze([]); currentCoachId = ""; studentHasFullAccess = false; return; }
  const user = readServiceSession()?.user;
  const data = readServiceBootstrap()?.data;
  rinks = Object.freeze((data?.rinks || []).map(rink => typeof rink === "string" ? rink : rink.name).filter(Boolean));
  const profiles = data?.coachProfiles || Object.fromEntries(serviceSource.readPublicCoachProfiles().map(packet => [packet.profile?.coachId, packet.profile]));
  coaches = Object.freeze(Object.entries(profiles).filter(([, profile]) => profile).map(([id, profile]) => Object.freeze({ id, name: profile.name || "教练", subject: profile.subject || "" })));
  currentCoachId = user?.coachId || "";
  studentHasFullAccess = user?.role === "student" && user.status === "active";
}
export function connectServiceSource(port) {
  if (serviceSource && serviceSource !== port) throw new Error("Service source is already connected");
  if (!["readContext", "readSession", "readBootstrap", "readPublicCoachProfiles"].every(key => typeof port?.[key] === "function")) throw new TypeError("Invalid service source");
  serviceSource = port;
  synchronizeServiceIdentity();
}
