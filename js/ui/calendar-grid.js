import { calendarStep, dayLabels } from "../core/config.js";
import { addDaysIso, minutesFromTime, timeFromMinutes, todayIso } from "../core/utils-data.js";
import { formatLocationShortLabel } from "./display.js";

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

export function setCalendarCellLocation(cell, location) {
  if (location) cell.dataset.calendarLocation = location;
  else delete cell.dataset.calendarLocation;
}

function createLocationWatermark(calendar, dayIndex, cells, location) {
  const firstCell = cells[0];
  const startMinutes = Number(firstCell.dataset.minutes);
  const endMinutes = Number(cells.at(-1).dataset.minutes) + calendarStep;
  const duration = endMinutes - startMinutes;
  const gridRowStart = firstCell.style.gridRowStart || firstCell.style.gridRow.split("/")[0].trim();
  const watermark = document.createElement("div");
  watermark.className = "calendar-location-watermark";
  watermark.dataset.dayIndex = String(dayIndex);
  watermark.dataset.startMinutes = String(startMinutes);
  watermark.dataset.endMinutes = String(endMinutes);
  watermark.dataset.location = location;
  watermark.style.gridColumn = String(dayIndex + 2);
  watermark.style.gridRow = `${gridRowStart} / span ${duration}`;
  watermark.setAttribute("aria-hidden", "true");

  const text = formatLocationShortLabel(location).toLocaleUpperCase("en-US");
  const repeatCount = Math.max(1, Math.ceil(duration / 210));
  for (let index = 0; index < repeatCount; index += 1) {
    const stamp = document.createElement("span");
    stamp.className = "calendar-location-watermark-text";
    stamp.textContent = text;
    stamp.style.setProperty("--watermark-top", `${((index + 0.5) / repeatCount) * 100}%`);
    const stagger = (dayIndex + Math.floor(startMinutes / calendarStep) + index) % 2 === 0 ? 42 : 62;
    stamp.style.setProperty("--watermark-left", `${stagger}%`);
    watermark.append(stamp);
  }
  calendar.append(watermark);
}

export function renderCalendarLocationWatermarks(calendar) {
  calendar.querySelectorAll(".calendar-location-watermark").forEach((watermark) => watermark.remove());
  for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
    const cells = [...calendar.querySelectorAll(`.calendar-cell[data-day-index="${dayIndex}"]`)]
      .sort((left, right) => Number(left.dataset.minutes) - Number(right.dataset.minutes));
    let segment = [];
    let segmentLocation = "";

    function flushSegment() {
      if (segment.length && segmentLocation) {
        createLocationWatermark(calendar, dayIndex, segment, segmentLocation);
      }
      segment = [];
      segmentLocation = "";
    }

    cells.forEach((cell) => {
      const location = cell.dataset.calendarLocation || "";
      const minutes = Number(cell.dataset.minutes);
      const isFree = Boolean(location)
        && cell.classList.contains("has-slot")
        && !cell.classList.contains("has-booking")
        && !cell.classList.contains("has-blocked");
      const previous = segment.at(-1);
      const isContinuous = previous
        && location === segmentLocation
        && minutes === Number(previous.dataset.minutes) + calendarStep;
      if (!isFree) {
        flushSegment();
        return;
      }
      if (!isContinuous) flushSegment();
      if (!segment.length) segmentLocation = location;
      segment.push(cell);
    });
    flushSegment();
  }
}

