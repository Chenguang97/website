import { coreDayEnd, coreDayStart, currentCoachId, fullDayEnd, fullDayStart } from "../core/config.js";
import { state } from "../core/state.js";
import { addDaysIso, minutesFromTime } from "../core/utils-data.js";
import { coachBookingMatchesStudent } from "./bookings/render.js";
import { formatLocationLabel } from "../ui/display.js";
import { getBookedRinkColor } from "./calendar-colors.js";

export function renderCoachBookingBlocks({ calendar, weekStart, showsFullDay, filtersStudents = false, enablesDetails = false }) {
  calendar.querySelectorAll(".coach-calendar-booking").forEach((block) => block.remove());

  const displayStart = minutesFromTime(showsFullDay ? fullDayStart : coreDayStart);
  const displayEnd = minutesFromTime(showsFullDay ? fullDayEnd : coreDayEnd);
  const weekDates = Array.from({ length: 7 }, (_, index) => addDaysIso(weekStart, index));
  state.slots
    .filter((slot) => slot.coachId === currentCoachId && slot.booked && weekDates.includes(slot.date))
    .forEach((slot) => {
      const slotStart = minutesFromTime(slot.start);
      const slotEnd = minutesFromTime(slot.end);
      const clippedStart = Math.max(displayStart, slotStart);
      const clippedEnd = Math.min(displayEnd, slotEnd);
      const overlapsBlock = state.blockedExceptions.some((block) => block.coachId === currentCoachId
        && block.date === slot.date
        && slotStart < minutesFromTime(block.end)
        && slotEnd > minutesFromTime(block.start));
      if (clippedEnd <= clippedStart || overlapsBlock) return;

      const isFiltered = filtersStudents && !coachBookingMatchesStudent(slot);
      const hasDetailsAction = enablesDetails && !isFiltered;
      const booking = document.createElement(hasDetailsAction ? "button" : "div");
      const duration = slotEnd - slotStart;
      const studentName = slot.student?.name || "学生";
      const location = formatLocationLabel(slot.location);
      const fullLabel = enablesDetails ? `${studentName}，${slot.start}-${slot.end}，${location}` : `${slot.start}-${slot.end}，${location}，已预约`;
      booking.className = `coach-calendar-booking${isFiltered ? " is-filtered" : ""}${enablesDetails ? "" : " is-availability-booking"}${duration <= 30 ? " is-compact" : ""}`;
      booking.style.gridColumn = String(weekDates.indexOf(slot.date) + 2);
      booking.style.gridRow = `${2 + clippedStart - displayStart} / span ${clippedEnd - clippedStart}`;
      booking.style.setProperty("--booking-accent", getBookedRinkColor(slot.location));
      booking.setAttribute("aria-label", isFiltered ? `${slot.start}-${slot.end} 已占用（其他学生预约）` : fullLabel);
      booking.title = isFiltered ? `${slot.start}-${slot.end} 已占用（其他学生预约）` : fullLabel;
      if (hasDetailsAction) {
        booking.type = "button";
        booking.dataset.slotId = slot.id;
      }

      const name = document.createElement("strong");
      name.textContent = isFiltered ? "已占用" : enablesDetails ? studentName : "已预约";
      const time = document.createElement("span");
      time.className = "coach-calendar-booking-time";
      time.textContent = `${slot.start}–${slot.end}`;
      const rink = document.createElement("span");
      rink.className = "coach-calendar-booking-rink";
      rink.textContent = location;
      booking.append(name, time, rink);
      calendar.append(booking);
    });
}


