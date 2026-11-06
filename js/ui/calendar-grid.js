import { calendarStep, dayLabels } from "../core/config.js";
import { addDaysIso, minutesFromTime, timeFromMinutes, todayIso } from "../core/utils-data.js";

export function renderWeekCalendarGrid(calendar, weekStart, displayStart, displayEnd) {
  const currentDate = todayIso();
  const displayStartMinutes = minutesFromTime(displayStart);
  const header = [
    '<div class="calendar-corner" style="grid-column:1;grid-row:1"></div>',
    ...dayLabels.map((label, index) => {
      const date = addDaysIso(weekStart, index);
      const [, month, day] = date.split("-").map(Number);
      return `<div class="calendar-day${date === currentDate ? " is-today" : ""}" style="grid-column:${index + 2};grid-row:1" data-date="${date}"${date === currentDate ? ' aria-current="date"' : ""}><strong>周${"一二三四五六日"[index]}</strong><span>${month}/${day}${date === currentDate ? " · 今天" : ""}</span></div>`;
    }),
  ].join("");

  const rows = [];
  for (let minutes = minutesFromTime(displayStart); minutes < minutesFromTime(displayEnd); minutes += calendarStep) {
    const gridRow = 2 + minutes - displayStartMinutes;
    rows.push(`<div class="calendar-time" style="grid-column:1;grid-row:${gridRow} / span ${calendarStep}">${timeFromMinutes(minutes)}</div>`);
    for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
      rows.push(`<button class="calendar-cell" type="button" style="grid-column:${dayIndex + 2};grid-row:${gridRow} / span ${calendarStep}" data-day-index="${dayIndex}" data-minutes="${minutes}" aria-label="${dayLabels[dayIndex]} ${timeFromMinutes(minutes)}"></button>`);
    }
  }
  calendar.innerHTML = header + rows.join("");
}

