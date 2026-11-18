import { coachUsesService, coachCanManage, runCoachServiceOperation } from "../service-controller.js";
import { publishCoachAvailability as publishServiceAvailability } from "../../service/operations.js";
import { readScheduleState, getSchedulingConfig } from "../../core/state.js";
import { buildCoachAvailabilityPayload } from "./service-payload.js";
import { renderWorkTimetable } from "./planner-render.js";
import { validatePlanningRange } from './editing-range.js';
import { setAvailabilityWeek } from "./week-navigation.js";
import { availabilityShowsFullDay, toggleAvailabilityFullDay } from "./view-state.js";
import { renderAvailabilityStatus, showFormMessage, clearCalendarFeedback } from "./status.js";
import { isCoachScheduleSaving, setCoachHeaderSaveFeedback, setCoachScheduleSaving } from "../header-status.js";
import { currentCoachId } from "../../core/config.js";
import { coachElements as elements } from "../../dom/coach-elements.js";
import { getLastStorageRecoveryMessage } from "../../core/state.js";
import { getPlanningScope } from "./planner-state.js";
import { changeCoachOpenAvailability, prepareAvailabilityPublication, publishCoachAvailability } from "../../core/availability-operations.js";
import { renderDragCalendar, renderAvailabilityData, } from "./render.js";
import { renderExceptionCalendarAvailability } from "../bookings/calendar-render.js";
import { addDaysIso, nextWeekdayIso, startOfWeekIso, todayIso } from "../../core/utils-data.js";
function renderAvailabilityChanges() {
  renderAvailabilityData();
  renderExceptionCalendarAvailability();
}
function toggleCalendarHours() {
  toggleAvailabilityFullDay();
  elements.toggleCalendarHours.textContent = availabilityShowsFullDay() ? "收起全天" : "显示全天";
  renderDragCalendar();
}
function renderWeeklyAvailabilityViews() {
  renderDragCalendar();
  renderWorkTimetable();
}
function handleAvailabilityWeekInput() {
  setAvailabilityWeek(elements.calendarWeekStart.value);
  renderWeeklyAvailabilityViews();
}
function shiftCalendarWeek(direction) {
  const currentWeek = startOfWeekIso(elements.calendarWeekStart.value || nextWeekdayIso());
  setAvailabilityWeek(addDaysIso(currentWeek, direction * 7));
  renderWeeklyAvailabilityViews();
}
function goToCurrentCalendarWeek() {
  setAvailabilityWeek(todayIso());
  renderWeeklyAvailabilityViews();
}

export function changeOpenAvailability(removals, additions, editingScope, options = {}) {
  if (!coachCanManage()) return '申请待审核，目前仅可完善资料。';
  if (!validatePlanningRange()) return '请先打开「编辑范围」修正日期，再重试。';
  const scope = getPlanningScope();
  if (JSON.stringify(scope) !== JSON.stringify(editingScope)) return "编辑范围已变化，请重试。";
  const result = changeCoachOpenAvailability(currentCoachId, removals, additions, scope, options);
  if (!result.ok) return result.message;
  renderAvailabilityStatus();
  renderAvailabilityChanges();
  showFormMessage("");
  clearCalendarFeedback();
  return "";
}
export function changeWorkTimeRange(day, original, next, editingScope) {
  return changeOpenAvailability(original ? [{ ...original, date: day.date }] : [], next ? [{ ...next, date: day.date }] : [], editingScope, { preserveProtected: editingScope.mode === "weekly" });
}
function saveAvailabilityChanges() {
  if (isCoachScheduleSaving() || !coachCanManage()) return;
  const prepared = prepareAvailabilityPublication(currentCoachId);
  if (!prepared.ok) {
    if (prepared.reason === "stale") renderAvailabilityChanges();
    if (prepared.reason === "regenerate") elements.coachSchedulerPanel.open = true;
    showFormMessage(prepared.message, true);
    return;
  }
  if (prepared.closedMinutes > 0 && !window.confirm(`按当前工作、地点、课程和通勤规则，需关闭 ${prepared.closedMinutes} 分钟不再可预约的开放片段。已有预约保持不变，不会自动切换授课地点。确认保存？`)) return;
  if (coachUsesService()) {
    const snapshot = readScheduleState();
    let payload;
    try {
      payload = buildCoachAvailabilityPayload(prepared.closedMinutes > 0 ? { ...snapshot, slots: prepared.safe } : snapshot, currentCoachId, getSchedulingConfig());
    } catch (error) { showFormMessage(error.message, true); return; }
    return runCoachServiceOperation('availability-save', () => publishServiceAvailability(payload, prepared.closedMinutes > 0 ? { acceptedSafety: prepared } : undefined), {
      busy: setCoachScheduleSaving,
      success() { renderAvailabilityStatus(); renderAvailabilityChanges(); showFormMessage('提交的开放安排已发布，后来编辑仍保留在草稿中。'); },
      failure(receipt) { setCoachHeaderSaveFeedback('schedule', '发布未完成', 'error', receipt.message || '发布结果未确认，草稿已保留。'); },
      message: '提交的开放安排已发布。',
    });
  }
  setCoachScheduleSaving(true);
  try {
    const result = publishCoachAvailability(prepared);
    if (!result.ok) {
      const reason = result.message || "保存失败。请清理浏览器存储后再试，当前草稿已保留。";
      setCoachHeaderSaveFeedback("schedule", "保存失败", "error", reason);
      showFormMessage(reason, true);
      return;
    }
    renderAvailabilityStatus("已保存");
    showFormMessage(getLastStorageRecoveryMessage() || "可预约时间已保存。");
    renderAvailabilityChanges();
  } finally { setCoachScheduleSaving(false); }
}
export { handleAvailabilityWeekInput, goToCurrentCalendarWeek, renderWeeklyAvailabilityViews, saveAvailabilityChanges, shiftCalendarWeek, toggleCalendarHours };
