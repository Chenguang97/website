import { coreDayEnd, coreDayStart, fullDayEnd, fullDayStart } from "../core/config.js";
import { captureCoachBookingReadModel } from "./bookings/read-model.js";
import { addDaysIso, minutesFromTime } from "../core/utils-data.js";
import { hasBookingLocationChanged } from "../core/scheduling-rules.js";
import { formatLocationLabel, formatLocationShortLabel } from "../ui/display.js";
import { getBookedRinkColor } from "./calendar-colors.js";
import { getAvailabilityLocation } from "../domain/scheduling.mjs";

export function getCoachCalendarBookingLabel(slot, studentName = slot?.student?.name || "学生") {
  const actualLocation = formatLocationLabel(slot.location);
  const availabilityLocation = formatLocationLabel(getAvailabilityLocation(slot));
  const availabilityLabel = hasBookingLocationChanged(slot) ? "该时段开放冰场" : "原开放地点";
  return `${studentName}，${slot.start}–${slot.end}，${availabilityLabel}：${availabilityLocation}，实际授课地点：${actualLocation}`;
}

export function renderCoachBookingBlocks({ calendar, weekStart, showsFullDay, filtersStudents = false, enablesDetails = false, readModel = captureCoachBookingReadModel({ weekStart }) }) {
  calendar.querySelectorAll(".coach-calendar-booking").forEach((block) => block.remove());

  const displayStart = minutesFromTime(showsFullDay ? fullDayStart : coreDayStart);
  const displayEnd = minutesFromTime(showsFullDay ? fullDayEnd : coreDayEnd);
  const weekDates = Array.from({ length: 7 }, (_, index) => addDaysIso(weekStart, index));
  readModel.weekBookings
    .forEach((slot) => {
      const slotStart = minutesFromTime(slot.start);
      const slotEnd = minutesFromTime(slot.end);
      const clippedStart = Math.max(displayStart, slotStart);
      const clippedEnd = Math.min(displayEnd, slotEnd);
      const overlapsBlock = readModel.blocksOn(slot.date).some((block) => slotStart < minutesFromTime(block.end)
        && slotEnd > minutesFromTime(block.start));
      if (clippedEnd <= clippedStart || overlapsBlock) return;

      const isFiltered = filtersStudents && !readModel.matchesStudent(slot);
      const hasDetailsAction = enablesDetails && !isFiltered;
      const booking = document.createElement(hasDetailsAction ? "button" : "div");
      const duration = slotEnd - slotStart;
      const studentName = slot.student?.name || "学生";
      const fullLabel = getCoachCalendarBookingLabel(slot, enablesDetails ? studentName : "已预约");
      const locationChanged = !isFiltered && hasBookingLocationChanged(slot);
      booking.className = `coach-calendar-booking${isFiltered ? " is-filtered" : ""}${enablesDetails ? "" : " is-availability-booking"}${duration <= 30 ? " is-compact" : ""}${duration < 30 ? " is-short" : ""}${locationChanged ? " has-location-change" : ""}`;
      booking.style.gridColumn = String(weekDates.indexOf(slot.date) + 2);
      booking.style.gridRow = `${2 + clippedStart - displayStart} / span ${clippedEnd - clippedStart}`;
      booking.style.setProperty("--booking-accent", getBookedRinkColor(slot.location));
      booking.setAttribute("aria-label", isFiltered ? `${slot.start}–${slot.end} 已占用（其他学生预约）` : fullLabel);
      booking.title = isFiltered ? `${slot.start}–${slot.end} 已占用（其他学生预约）` : fullLabel;
      if (hasDetailsAction) {
        booking.type = "button";
        booking.dataset.slotId = slot.id;
      }

      const name = document.createElement("strong");
      name.textContent = isFiltered ? "已占用" : enablesDetails ? studentName : "已预约";
      const primary = document.createElement("div");
      primary.className = "coach-calendar-booking-primary";
      primary.append(name);
      if (locationChanged) {
        const changeBadge = document.createElement("span");
        changeBadge.className = "coach-calendar-location-change";
        changeBadge.textContent = "另约场地";
        primary.append(changeBadge);
      }
      const time = document.createElement("span");
      time.className = "coach-calendar-booking-time";
      time.textContent = `${slot.start}–${slot.end}`;
      const rink = document.createElement("span");
      rink.className = "coach-calendar-booking-rink";
      rink.textContent = formatLocationShortLabel(slot.location);
      const meta = document.createElement("div");
      meta.className = "coach-calendar-booking-meta";
      meta.append(time);
      if (!isFiltered) meta.append(rink);
      booking.append(primary, meta);
      calendar.append(booking);
    });
}


