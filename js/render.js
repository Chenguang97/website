import {
  calendarStep,
  coaches,
  coreDayEnd,
  coreDayStart,
  currentCoachId,
  dayLabels,
  defaultStart,
  fullDayEnd,
  fullDayStart,
  publicStudentPreviewHours,
  rinkColors,
  rinks,
  studentHasFullAccess,
  unavailableSelection,
} from "./config.js";
import { elements } from "./elements.js";
import { coachSpecialtyOptions, normalizeCoachSpecialties, normalizeCustomCoachSpecialties } from "./domain/coach-profile.mjs";
import {
  canFitLessonFromSlot as canFitLessonFrom,
  findSlotAt as findSlotAtIn,
  getAvailabilityLocation,
  isPastBooking,
  slotOverlapsBlockedException as overlapsBlocked,
  slotSort,
} from "./domain/scheduling.mjs";
import { coachBookingMatchesStudent, renderCoachCalendarFilterSummary, renderCoachSlots } from "./coach-bookings-render.js";
import { ensureCoachProfileDraft, getProfile, state } from "./state.js";
import { escapeAttribute, escapeHtml } from "./ui/safe-html.mjs";
import { formatLocationLabel } from "./ui/display.js";
import {
  addDaysIso,
  cellKey,
  formatDate,
  formatWeekday,
  getCoach,
  isPastCalendarCell,
  minutesFromTime,
  nextWeekdayIso,
  startOfWeekIso,
  timeFromMinutes,
  todayIso,
} from "./utils-data.js";

function canFitLessonFromSlot(slot, duration) {
  return canFitLessonFrom(slot, duration, state.slots, state.blockedExceptions, calendarStep, fullDayEnd);
}

function findSlotAt(coachId, date, minutes) {
  return findSlotAtIn(state.slots, coachId, date, minutes);
}

function isPastStudentBooking(slot) {
  return isPastBooking(slot);
}

function slotOverlapsBlockedException(slot) {
  return overlapsBlocked(slot, state.blockedExceptions);
}

function rinkOptionsForCoach(coachId) {
  const profile = getProfile(coachId);
  const servedRinks = profile.servedRinks && profile.servedRinks.length ? profile.servedRinks : [profile.homeRink || rinks[0]];
  return [
    `<option value="Any served rink">${formatLocationLabel("Any served rink")}</option>`,
    ...servedRinks.map((rink) => `<option value="${rink}">${formatLocationLabel(rink)}</option>`),
    `<option value="Zoom">Zoom</option>`,
  ].join("");
}

export function concreteLocationOptionsForCoach(coachId) {
  const profile = getProfile(coachId);
  const servedRinks = profile.servedRinks && profile.servedRinks.length ? profile.servedRinks : [profile.homeRink || rinks[0]];
  return [...servedRinks, "Zoom"].map((location) => `<option value="${location}">${formatLocationLabel(location)}</option>`).join("");
}

export function populateCoachSelects() {
  if (elements.studentCoachFilterGroup) {
    elements.studentCoachFilterGroup.innerHTML = [
      `<label><input type="checkbox" name="studentCoachFilter" value="all" checked /> 全部教练</label>`,
      ...coaches.map((coach) => `<label><input type="checkbox" name="studentCoachFilter" value="${coach.id}" checked /> ${coach.name}</label>`),
    ].join("");
  }

  if (elements.studentRinkFilterGroup) {
    elements.studentRinkFilterGroup.innerHTML = [
      `<label><input type="checkbox" name="studentRinkFilter" value="all" checked /> 全部冰场</label>`,
      ...rinks.map((rink) => `<label><input type="checkbox" name="studentRinkFilter" value="${rink}" checked /> ${rink}</label>`),
      `<label><input type="checkbox" name="studentRinkFilter" value="Zoom" checked /> Zoom</label>`,
    ].join("");
  }
  if (elements.multiCoachRequestTargets) {
    elements.multiCoachRequestTargets.innerHTML = coaches
      .map((coach) => `<option value="${escapeAttribute(coach.id)}">${escapeHtml(coach.name)}</option>`)
      .join("");
  }
  updateStudentFilterSummaries();
  renderStudentFilterChips();
}

export function populateTimeSelects() {
  const startMinutes = minutesFromTime(fullDayStart);
  const endMinutes = minutesFromTime(fullDayEnd);
  const startOptions = [];

  for (let minutes = startMinutes; minutes < endMinutes; minutes += calendarStep) {
    startOptions.push(`<option value="${timeFromMinutes(minutes)}">${timeFromMinutes(minutes)}</option>`);
  }

  elements.startTime.innerHTML = startOptions.join("");
  elements.blockDialogStart.innerHTML = startOptions.join("");
  elements.startTime.value = defaultStart;
  elements.blockDialogStart.value = defaultStart;
  syncEndTimeOptions(elements.startTime, elements.endTime, "12:00");
  syncEndTimeOptions(elements.blockDialogStart, elements.blockDialogEnd, "12:00");
}

export function syncEndTimeOptions(startSelect, endSelect, preferredEnd = endSelect.value) {
  const minimumEnd = minutesFromTime(startSelect.value) + calendarStep;
  const options = [];

  for (let minutes = minimumEnd; minutes <= minutesFromTime(fullDayEnd); minutes += calendarStep) {
    options.push(`<option value="${timeFromMinutes(minutes)}">${timeFromMinutes(minutes)}</option>`);
  }

  endSelect.innerHTML = options.join("");
  endSelect.value = minutesFromTime(preferredEnd) >= minimumEnd ? preferredEnd : timeFromMinutes(minimumEnd);
}

export function render() {
  state.slots.sort(slotSort);
  const page = document.body.dataset.page;
  if (page === "coach") {
    syncProfileForm();
    syncPhotoForm();
    syncLocationOptions();
    renderCoachSlots();
    renderStats();
    renderDropdownOpenSlots();
    renderDropdownWeekSlots();
    renderCalendarAvailability();
    renderExceptionCalendarAvailability();
  } else if (page === "student") {
    renderStudentSlots();
    renderStudentOwnBookings();
  } else if (page === "admin") {
    renderStats();
  }
}

function renderStats() {
  const weekStart = startOfWeekIso(todayIso());
  const weekEnd = addDaysIso(weekStart, 7);
  const weeklyCoachSlots = state.slots.filter((slot) => slot.coachId === currentCoachId && slot.date >= weekStart && slot.date < weekEnd);
  const availableHours = weeklyCoachSlots
    .filter((slot) => !slot.booked && !slotOverlapsBlockedException(slot))
    .reduce((total, slot) => total + (minutesFromTime(slot.end) - minutesFromTime(slot.start)) / 60, 0);
  const bookedCount = weeklyCoachSlots.filter((slot) => slot.booked).length;
  const allBookedCount = state.slots.filter((slot) => slot.booked).length;
  if (elements.availableCount) {
    elements.availableCount.textContent = Number.isInteger(availableHours) ? String(availableHours) : availableHours.toFixed(1);
  }
  if (elements.bookedCount) {
    elements.bookedCount.textContent = bookedCount;
  }
  if (elements.adminBookedCount) {
    elements.adminBookedCount.textContent = allBookedCount;
  }
}

function syncProfileForm() {
  ensureCoachProfileDraft();
  const profile = getProfile(currentCoachId);
  elements.coachRate.value = profile.rate;
  elements.coachBio.value = typeof profile.bio === "string" ? profile.bio : "";
  renderCoachSpecialtyOptions(profile.specialties);
  renderCoachCustomSpecialties(profile.customSpecialties);
  elements.servedRinkInputs.forEach((input) => {
    input.checked = profile.servedRinks.includes(input.value);
  });
  elements.travelsToOtherRinks.value = profile.travelsToOtherRinks ? "negotiable" : "no";
  elements.travelConditions.value = typeof profile.travelConditions === "string" ? profile.travelConditions : "";
  elements.travelConditionsLabel.classList.toggle("is-hidden", !profile.travelsToOtherRinks);
  renderLessonOptions();
}

export function renderCoachCustomSpecialties(selectedValues = getProfile(currentCoachId).customSpecialties) {
  const specialties = normalizeCustomCoachSpecialties(selectedValues);
  elements.coachCustomSpecialties.replaceChildren(...specialties.map((specialty) => {
    const tag = document.createElement("span");
    tag.className = "coach-specialty-tag coach-custom-specialty-tag is-selected";
    const check = document.createElement("span");
    check.className = "specialty-check";
    check.setAttribute("aria-hidden", "true");
    check.textContent = "✓";
    const text = document.createElement("span");
    text.textContent = specialty;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.dataset.action = "remove-custom-specialty";
    remove.dataset.specialty = specialty;
    remove.setAttribute("aria-label", `移除专长 ${specialty}`);
    remove.title = "移除";
    remove.textContent = "×";
    tag.append(check, text, remove);
    return tag;
  }));
  elements.coachCustomSpecialties.hidden = !specialties.length;
}

function renderCoachSpecialtyOptions(selectedValues) {
  const selected = new Set(normalizeCoachSpecialties(selectedValues));
  elements.coachSpecialtyOptions.replaceChildren(...coachSpecialtyOptions.map((option) => {
    const button = document.createElement("button");
    const isSelected = selected.has(option.id);
    button.type = "button";
    button.className = `coach-specialty-tag coach-specialty-preset${isSelected ? " is-selected" : ""}`;
    button.dataset.action = "toggle-specialty";
    button.dataset.specialtyId = option.id;
    button.setAttribute("aria-pressed", String(isSelected));
    const check = document.createElement("span");
    check.className = "specialty-check";
    check.setAttribute("aria-hidden", "true");
    check.textContent = "✓";
    const text = document.createElement("span");
    text.textContent = option.label;
    button.append(check, text);
    return button;
  }));
}

function renderLessonOptions() {
  const profile = getProfile(currentCoachId);
  const rows = profile.lessonOptions
    .map((lesson) => {
      const displayName = lesson.name
        .replace("30 min private lesson", "30 分钟私教")
        .replace("60 min private lesson", "60 分钟私教")
        .replace("45 min private lesson", "45 分钟私教");
      return `
        <article class="lesson-option-row" data-lesson-id="${lesson.id}">
          <input class="lesson-name-input" type="text" value="${escapeAttribute(displayName)}" aria-label="课程名称" />
          <input class="lesson-duration-input" type="number" min="15" step="15" value="${lesson.duration}" aria-label="Lesson duration" />
          <input class="lesson-price-input" type="number" min="0" step="0.01" value="${lesson.price}" aria-label="Lesson price" />
          <button class="lesson-delete-button" type="button" data-action="remove-lesson" data-tooltip="删除课程" aria-label="删除 ${escapeAttribute(displayName)}">
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 3h6l1 2h4v2h-1l-1 14H6L5 7H4V5h4l1-2Zm-1.86 4 .75 12h8.22l.75-12H7.14ZM10 9h2v7h-2V9Zm4 0h2v7h-2V9Z" /></svg>
          </button>
        </article>
      `;
    })
    .join("");
  elements.lessonOptionsList.innerHTML = `
    <div class="lesson-option-header" aria-hidden="true">
      <span>课程名称</span>
      <span>时长（分钟）</span>
      <span>价格（美元）</span>
      <span>操作</span>
    </div>
    ${rows}
  `;
}

function setPhotoPreview(element, photoUrl) {
  const coach = getCoach(currentCoachId);
  if (photoUrl) {
    element.textContent = "";
    element.style.backgroundImage = `url("${photoUrl}")`;
    return;
  }

  element.style.backgroundImage = "";
  element.textContent = coach.name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2);
}

export function setCoachPhotoPreview(photoUrl) {
  setPhotoPreview(elements.coachPhotoPreview, photoUrl);
}

export function setCoachPhotoDialogPreview(photoUrl) {
  setPhotoPreview(elements.coachPhotoDialogPreview, photoUrl);
}

export function syncPhotoForm() {
  const profile = getProfile(currentCoachId);
  setCoachPhotoPreview(profile.photoUrl || "");
}

export function handlePhotoFileChange() {
  const file = elements.coachPhotoFile.files && elements.coachPhotoFile.files[0];
  if (!file) return Promise.resolve("");
  if (!file.type.startsWith("image/")) {
    elements.photoMessage.textContent = "请选择图片文件。";
    elements.photoMessage.style.color = "var(--red)";
    elements.coachPhotoFile.value = "";
    return Promise.resolve("");
  }

  return readResizedImage(file)
    .then((dataUrl) => {
      return dataUrl;
    })
    .catch(() => {
      elements.photoMessage.textContent = "照片读取失败，请换一张图片。";
      elements.photoMessage.style.color = "var(--red)";
      elements.coachPhotoFile.value = "";
      return "";
    });
}

function readResizedImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("error", reject);
    reader.addEventListener("load", () => {
      const image = new Image();
      image.addEventListener("error", reject);
      image.addEventListener("load", () => {
        const maxSize = 520;
        const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      });
      image.src = String(reader.result || "");
    });
    reader.readAsDataURL(file);
  });
}

export function syncLocationOptions() {
  const dropdownLocation = elements.locationType.value || "Any served rink";
  const calendarLocation = elements.calendarLocationType.value || "Any served rink";
  elements.locationType.innerHTML = rinkOptionsForCoach(currentCoachId);
  elements.calendarLocationType.innerHTML = `${rinkOptionsForCoach(currentCoachId)}<option value="${unavailableSelection}">不可预约</option>`;
  elements.locationType.value = dropdownLocation;
  elements.calendarLocationType.value = calendarLocation;
  if (!elements.locationType.value) elements.locationType.value = "Any served rink";
  if (!elements.calendarLocationType.value) elements.calendarLocationType.value = "Any served rink";
  renderCalendarRinkOptions();
  renderScheduleLegend();
}

export function renderCalendarRinkOptions() {
  const profile = getProfile(currentCoachId);
  const servedRinks = profile.servedRinks && profile.servedRinks.length ? profile.servedRinks : [profile.homeRink || rinks[0]];
  const options = [
    ["Any served rink", formatLocationLabel("Any served rink")],
    ...servedRinks.map((rink) => [rink, formatLocationLabel(rink)]),
    ["Zoom", "Zoom"],
    [unavailableSelection, "不可预约"],
  ];

  elements.calendarRinkOptions.innerHTML = options
    .map(([value, label]) => {
      const isActive = elements.calendarLocationType.value === value;
      return `
        <button class="rink-option ${isActive ? "active" : ""}" type="button" data-rink="${value}" style="--rink-option-color:${getRinkColor(value)}">
          <i class="legend-dot" aria-hidden="true"></i>
          <span>${label}</span>
        </button>
      `;
    })
    .join("");
}

export function getRinkColor(location) {
  return rinkColors[location] || "#bbf7d0";
}

function getBookedRinkColor(location) {
  const bookedColors = {
    "Polar Ice Rink": "#22c55e",
    "Arcadia Ice Arena": "#3b82f6",
    "Oceanside Ice Arena": "#f59e0b",
    "Any served rink": "#8b5cf6",
    Zoom: "#0ea5e9",
  };
  return bookedColors[location] || "#22c55e";
}

function getScheduleLegendItems() {
  const profile = getProfile(currentCoachId);
  const servedRinks = profile.servedRinks && profile.servedRinks.length ? profile.servedRinks : [profile.homeRink || rinks[0]];
  return [
    ["Any served rink", formatLocationLabel("Any served rink")],
    ...servedRinks.map((rink) => [rink, formatLocationLabel(rink)]),
    ["Zoom", "Zoom"],
  ];
}

function renderScheduleLegend() {
  elements.scheduleLegend.innerHTML = [
    ...getScheduleLegendItems().map(([value, label]) => {
      return `
        <div class="schedule-legend-row">
          <strong>${label}</strong>
          <div class="schedule-legend-states">
            <span><i class="legend-dot" style="background:${getRinkColor(value)}"></i>可预约</span>
            <span><i class="legend-dot" style="background:${getBookedRinkColor(value)}"></i>已预约</span>
          </div>
        </div>
      `;
    }),
    `<div class="schedule-legend-row compact"><strong>不可预约</strong><div class="schedule-legend-states"><span><i class="legend-dot blocked"></i>不可预约</span></div></div>`,
  ].join("");
}

function getSlotsForDate(date) {
  return state.slots.filter((slot) => slot.coachId === currentCoachId && slot.date === date).sort(slotSort);
}

function groupSlotsForDisplay(daySlots, options = {}) {
  const ignoreBooked = Boolean(options.ignoreBooked);
  return daySlots.reduce((groups, slot) => {
    if (slot.booked && !ignoreBooked) {
      groups.push({
        type: "booked",
        ids: [slot.id],
        start: slot.start,
        end: slot.end,
        lessonName: slot.lessonName,
        lessonPrice: slot.lessonPrice,
        location: slot.location,
      });
      return groups;
    }

    const previous = groups[groups.length - 1];
    const canMerge =
      previous &&
      previous.type === "open" &&
      previous.end === slot.start &&
      previous.lessonName === slot.lessonName &&
      previous.lessonPrice === slot.lessonPrice &&
      previous.location === slot.location;

    if (canMerge) {
      previous.end = slot.end;
      previous.ids.push(slot.id);
      return groups;
    }

    groups.push({
      type: "open",
      ids: [slot.id],
      start: slot.start,
      end: slot.end,
      lessonName: slot.lessonName,
      lessonPrice: slot.lessonPrice,
      location: slot.location,
    });
    return groups;
  }, []);
}

export function renderDropdownOpenSlots() {
  const selectedDate = elements.slotDate.value || todayIso();
  const visible = groupSlotsForDisplay(getSlotsForDate(selectedDate), { ignoreBooked: true });

  elements.selectedDateMeta.textContent = `${selectedDate} · ${formatWeekday(selectedDate)}`;

  if (!visible.length) {
    elements.dropdownOpenSlots.innerHTML = `<p class="empty-state">这一天还没有开放时间。用上面的 Dropdown 添加，或切到 Calendar 拖选。</p>`;
    return;
  }

  elements.dropdownOpenSlots.innerHTML = visible
    .map((group) => {
      return `
        <article class="open-slot-row ${group.type === "booked" ? "booked" : ""}">
          <div>
            <strong>${group.start} - ${group.end}</strong>
            <span>${group.type === "booked" ? "已预约" : "可预约"}</span>
          </div>
          <div>
            <strong>${formatLocationLabel(group.location)}</strong>
            <span>开放给学生预约</span>
          </div>
          ${
            group.type === "booked"
              ? `<span class="pill booked">已预约</span>`
              : `<button class="danger-button" type="button" data-action="delete-many" data-ids="${group.ids.join(",")}" data-date="${selectedDate}" data-start="${group.start}" data-end="${group.end}">删除</button>`
          }
        </article>
      `;
    })
    .join("");
}

export function renderDropdownWeekSlots() {
  const weekStart = startOfWeekIso(elements.slotDate.value || todayIso());
  const cards = dayLabels.map((label, index) => {
    const date = addDaysIso(weekStart, index);
    const daySlots = groupSlotsForDisplay(getSlotsForDate(date), { ignoreBooked: true }).filter((group) => group.type === "open");
    const chips = daySlots.length
      ? daySlots
          .map((group) => `<span class="time-chip" style="background:${getRinkColor(group.location)}">${group.start}-${group.end}<small>${formatLocationLabel(group.location)}</small></span>`)
          .join("")
      : `<span>暂无开放时间</span>`;

    return `
      <article class="week-day-card">
        <strong>${label}</strong>
        <span>${formatDate(date)}</span>
        <div>${chips}</div>
      </article>
    `;
  });

  elements.dropdownWeekSlots.innerHTML = cards.join("");
}

export function renderStudentSlots() {
  renderStudentAccessState();
  renderStudentViewModeButtons();
  if (!studentHasFullAccess) {
    renderStudentDayAvailability([]);
    renderPublicStudentCalendar();
    return;
  }

  const selectedCoaches = getSelectedStudentFilterValues("studentCoachFilter", coaches.map((coach) => coach.id));
  const selectedRinks = getSelectedStudentFilterValues("studentRinkFilter", [...rinks, "Zoom"]);
  renderStudentLessonDurationFilter(selectedCoaches);
  const selectedDuration = getSelectedStudentLessonDuration();
  const selectedDate = state.studentSelectedDate || elements.studentDateFilter.value || nextWeekdayIso();
  const weekStart = startOfWeekIso(selectedDate);
  const weekEnd = addDaysIso(weekStart, 7);
  const available = state.slots.filter((slot) => {
    const coachMatches = selectedCoaches.has(slot.coachId);
    const rinkMatches = studentRinkMatches(slot, selectedRinks);
    const dateMatches = slot.date >= weekStart && slot.date < weekEnd;
    return !slot.booked && !slotOverlapsBlockedException(slot) && coachMatches && rinkMatches && dateMatches && getFittingLessonOptionsForStart(slot, selectedDuration).length > 0;
  });

  elements.studentDateFilter.value = selectedDate;
  renderStudentDatePendingState();
  renderStudentViewDateRange(selectedDate, weekStart);
  renderStudentDayAvailability(getStudentAvailableSlotsForDate(selectedDate, selectedCoaches, selectedRinks, selectedDuration));
  if (state.studentViewMode === "day") {
    elements.studentSlots.innerHTML = "";
    return;
  }
  if (elements.studentDayAvailability) {
    elements.studentDayAvailability.innerHTML = "";
    elements.studentDayAvailability.classList.add("is-hidden");
  }
  renderFullStudentCalendar(weekStart, available);
}

function getStudentAvailableSlotsForDate(date, selectedCoaches, selectedRinks, selectedDuration = getSelectedStudentLessonDuration()) {
  return state.slots
    .filter((slot) => {
      const coachMatches = selectedCoaches.has(slot.coachId);
      const rinkMatches = studentRinkMatches(slot, selectedRinks);
      return slot.date === date && !slot.booked && !slotOverlapsBlockedException(slot) && coachMatches && rinkMatches && getFittingLessonOptionsForStart(slot, selectedDuration).length > 0;
    })
    .sort(slotSort);
}

function renderStudentLessonDurationFilter(selectedCoaches) {
  if (!elements.studentLessonDurationFilter) return;
  const previousValue = elements.studentLessonDurationFilter.value || "all";
  const durations = [...selectedCoaches]
    .flatMap((coachId) => getStudentLessonOptionsForCoach(coachId).map((lesson) => Number(lesson.duration)))
    .filter((duration) => Number.isFinite(duration) && duration > 0);
  const uniqueDurations = [...new Set(durations)].sort((a, b) => a - b);
  elements.studentLessonDurationFilter.innerHTML = [
    `<option value="all">全部时长</option>`,
    ...uniqueDurations.map((duration) => `<option value="${duration}">${duration} 分钟</option>`),
  ].join("");
  elements.studentLessonDurationFilter.value = uniqueDurations.includes(Number(previousValue)) ? previousValue : "all";
}

export function getSelectedStudentLessonDuration() {
  const value = elements.studentLessonDurationFilter?.value || "all";
  return value === "all" ? null : Number(value);
}

export function getStudentLessonOptionsForCoach(coachId) {
  const profile = getProfile(coachId);
  return (Array.isArray(profile.lessonOptions) && profile.lessonOptions.length ? profile.lessonOptions : createDefaultLessonOptions(Number(profile.rate || 0)))
    .filter((lesson) => Number(lesson.duration) > 0)
    .sort((a, b) => Number(a.duration) - Number(b.duration));
}

export function getFittingLessonOptionsForStart(slot, selectedDuration = null) {
  return getStudentLessonOptionsForCoach(slot.coachId).filter((lesson) => {
    const duration = Number(lesson.duration);
    return (!selectedDuration || duration === selectedDuration) && canFitLessonFromSlot(slot, duration);
  });
}

function renderStudentDayAvailability(daySlots) {
  if (!elements.studentDayAvailability) return;

  renderStudentViewModeButtons();
  elements.studentDayAvailability.classList.toggle("is-hidden", !studentHasFullAccess || state.studentViewMode !== "day");

  if (!studentHasFullAccess || state.studentViewMode !== "day") {
    elements.studentDayAvailability.innerHTML = "";
    return;
  }

  const selectedDate = elements.studentDateFilter.value || nextWeekdayIso();
  const slotsByCell = daySlots.reduce((groups, slot) => {
    const key = minutesFromTime(slot.start);
    groups[key] = groups[key] || [];
    groups[key].push(slot);
    return groups;
  }, {});
  const rows = [];

  for (let minutes = minutesFromTime(coreDayStart); minutes < minutesFromTime(coreDayEnd); minutes += calendarStep) {
    const cellSlots = slotsByCell[minutes] || [];
    rows.push(`<div class="calendar-time">${timeFromMinutes(minutes)}</div>`);
    rows.push(renderStudentDayAvailabilityCell(selectedDate, minutes, cellSlots));
  }

  elements.studentDayAvailability.innerHTML = `
    <section class="student-day-availability-card calendar-panel">
      <div class="student-day-availability-heading">
        <div>
          <p class="eyebrow">所选日期 availability</p>
          <h3>${formatDate(selectedDate)}</h3>
        </div>
        <span>${daySlots.length} 个可预约时段</span>
      </div>
      <div class="calendar-legend student-calendar-legend" aria-label="所选日期预约日历图例">
        <span><i class="student-availability-swatch low"></i>可约教练少</span>
        <span><i class="student-availability-swatch medium"></i>可约教练中等</span>
        <span><i class="student-availability-swatch high"></i>可约教练多</span>
        <span><i class="legend-dot blocked"></i>未开放</span>
      </div>
      <div class="student-day-calendar drag-calendar" aria-label="${formatDate(selectedDate)} 可预约时间">
        <div class="calendar-corner"></div>
        <div class="calendar-day">Availability</div>
        ${rows.join("")}
      </div>
      ${
        daySlots.length
          ? ""
          : `<p class="empty-state compact-empty">当前选择的教练和冰场在这一天没有可预约时段。</p>`
      }
    </section>
  `;
}

function renderStudentViewModeButtons() {
  elements.studentViewModeButtons?.forEach((button) => {
    const isActive = button.dataset.viewMode === state.studentViewMode;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

function renderStudentViewDateRange(selectedDate, weekStart = startOfWeekIso(selectedDate)) {
  if (!elements.studentViewDateRange) return;
  const text = state.studentViewMode === "week"
    ? `${formatDate(weekStart)} - ${formatDate(addDaysIso(weekStart, 6))}`
    : formatDate(selectedDate);
  elements.studentViewDateRange.textContent = text;
}

export function renderStudentDatePendingState() {
  if (!elements.studentDateFilter) return;
  const hasPendingDate = Boolean(state.studentSelectedDate && elements.studentDateFilter.value && elements.studentDateFilter.value !== state.studentSelectedDate);
  elements.studentPendingDateMessage?.classList.toggle("is-hidden", !hasPendingDate);
  elements.studentDateActions?.classList.toggle("is-hidden", !hasPendingDate);
}

function renderStudentDayAvailabilityCell(date, minutes, cellSlots) {
  if (!cellSlots.length) {
    return `<div class="calendar-cell student-calendar-cell has-blocked" aria-label="${formatDate(date)} ${timeFromMinutes(minutes)} 未开放"></div>`;
  }

  const slotIds = cellSlots.map((slot) => slot.id).join(",");
  const availabilityLevel = getStudentAvailabilityLevel(cellSlots.length);
  const visibleCoachNames = getStudentDayAvailabilityCoachNames(cellSlots);
  const extraCount = cellSlots.length - visibleCoachNames.length;
  const coachCountLabel = `${cellSlots.length} coach${cellSlots.length === 1 ? "" : "es"} available`;
  return `
    <div class="calendar-cell student-calendar-cell has-slot availability-${availabilityLevel}">
      <button class="student-time-option" type="button" data-action="choose-time" data-ids="${slotIds}" title="${cellSlots.length} 位教练可预约">
        <span class="student-day-calendar-summary">
          <strong>${coachCountLabel}</strong>
          <small>· ${visibleCoachNames.join(" · ")}${extraCount > 0 ? ` · +${extraCount} more` : ""}</small>
        </span>
      </button>
    </div>
  `;
}

function getStudentDayAvailabilityCoachNames(cellSlots) {
  return cellSlots.slice(0, 3).map((slot) => getCoach(slot.coachId).name);
}

function getSelectedStudentFilterValues(name, fallbackValues) {
  const checked = [...document.querySelectorAll(`input[name="${name}"]:checked`)].map((input) => input.value);
  if (!checked.length || checked.includes("all")) return new Set(fallbackValues);
  return new Set(checked);
}

export function updateStudentFilterSummaries() {
  updateStudentFilterSummary("studentCoachFilter", elements.studentCoachFilterSummary, "位教练", coaches.length);
  updateStudentFilterSummary("studentRinkFilter", elements.studentRinkFilterSummary, "个冰场", rinks.length + 1);
  renderStudentFilterChips();
}

function updateStudentFilterSummary(name, summaryElement, unit, totalCount) {
  if (!summaryElement) return;
  const checked = [...document.querySelectorAll(`input[name="${name}"]:checked`)].map((input) => input.value);
  const selectedCount = !checked.length || checked.includes("all") ? totalCount : checked.length;
  summaryElement.textContent = `已选 ${selectedCount} ${unit}`;
}

export function renderStudentFilterChips() {
  renderStudentFilterChipGroup("studentCoachFilter", elements.studentCoachChips, coaches.length, "全部教练");
  renderStudentFilterChipGroup("studentRinkFilter", elements.studentRinkChips, rinks.length + 1, "全部冰场");
}

function renderStudentFilterChipGroup(name, container, totalCount, allLabel) {
  if (!container) return;
  const checked = [...document.querySelectorAll(`input[name="${name}"]:checked`)];
  const isAll = !checked.length || checked.some((input) => input.value === "all") || checked.filter((input) => input.value !== "all").length === totalCount;
  const selectedInputs = isAll ? [] : checked.filter((input) => input.value !== "all");
  const chips = isAll
    ? `<span class="student-filter-chip is-all">${allLabel}</span>`
    : selectedInputs
        .map((input) => `<button class="student-filter-chip" type="button" data-action="remove-student-filter" data-filter-name="${escapeAttribute(name)}" data-filter-value="${escapeAttribute(input.value)}">${escapeHtml(input.closest("label")?.textContent.trim())} <span aria-hidden="true">×</span></button>`)
        .join("");
  container.innerHTML = chips;
}

function studentRinkMatches(slot, selectedRinks) {
  if (slot.location === "Any served rink") {
    const profile = getProfile(slot.coachId);
    const servedRinks = profile.servedRinks && profile.servedRinks.length ? profile.servedRinks : [profile.homeRink || rinks[0]];
    return servedRinks.some((rink) => selectedRinks.has(rink));
  }
  return selectedRinks.has(slot.location);
}

function renderStudentAccessState() {
  if (elements.studentControls) {
    elements.studentControls.classList.toggle("is-hidden", !studentHasFullAccess);
  }
  if (elements.studentLoginPrompt) {
    elements.studentLoginPrompt.classList.toggle("is-hidden", studentHasFullAccess);
  }
  if (elements.studentAccessMessage) {
    elements.studentAccessMessage.textContent = studentHasFullAccess
      ? "已登录：可查看完整教练、场馆、价格和预约信息。"
      : `未登录预览：只显示未来 ${publicStudentPreviewHours} 小时内是否有可预约时间，不显示教练、场馆和价格。`;
  }
}

export function renderStudentOwnBookings() {
  if (!elements.studentOwnBookings) return;

  if (!studentHasFullAccess) {
    elements.studentOwnBookings.innerHTML = `
      <p class="empty-state">登录 / 注册后可以查看自己的预约记录。</p>
      <a class="primary-button public-login-link" href="login/index.html">登录 / 注册</a>
    `;
    return;
  }

  const bookings = state.slots
    .filter((slot) => slot.booked && slot.student)
    .slice()
    .sort(slotSort);

  const upcoming = bookings.filter((slot) => !isPastStudentBooking(slot));
  const completed = bookings.filter(isPastStudentBooking).sort((a, b) => slotSort(b, a));

  elements.studentOwnBookings.innerHTML = bookings.length
    ? `
      ${renderStudentBookingSection("还没有进行的课", upcoming, "暂无未进行的预约。")}
      ${renderStudentBookingSection("已经上完的课", completed, "暂无已完成课程。")}
    `
    : `<p class="empty-state">还没有预约记录。</p>`;
}

function renderStudentBookingSection(title, bookingSlots, emptyText) {
  return `
    <section class="student-booking-section">
      <div class="student-booking-section-heading">
        <h4>${title}</h4>
        <span>${bookingSlots.length} 节</span>
      </div>
      <div class="student-mini-list-group">
        ${
          bookingSlots.length
            ? bookingSlots.map(renderStudentMiniBooking).join("")
            : `<p class="empty-state compact-empty">${emptyText}</p>`
        }
      </div>
    </section>
  `;
}

function renderStudentMiniBooking(slot) {
  const coach = getCoach(slot.coachId);
  const isCompleted = isPastStudentBooking(slot);
  return `
    <article class="student-mini-booking ${isCompleted ? "is-completed" : ""}">
      <div>
        <strong>${escapeHtml(formatDate(slot.date))} · ${escapeHtml(slot.start)}-${escapeHtml(slot.end)}</strong>
        <span>${escapeHtml(slot.student?.name || "本人")} · ${escapeHtml(coach.name)} · ${escapeHtml(formatLocationLabel(slot.location))} · ${escapeHtml(slot.status || "Confirmed")}</span>
      </div>
      <div class="student-mini-booking-actions">
        <small>$${slot.lessonPrice}</small>
        ${
          isCompleted
            ? ""
            : `
              <button class="ghost-button" type="button" data-action="modify-student-booking" data-id="${escapeAttribute(slot.id)}">修改</button>
              <button class="danger-button" type="button" data-action="cancel-student-booking" data-id="${escapeAttribute(slot.id)}">取消</button>
            `
        }
      </div>
    </article>
  `;
}

function localIsoFromDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function timeFromDate(date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function renderPublicStudentCalendar() {
  const windows = getPublicAvailabilityWindows();
  const rows = windows.map(renderPublicStudentCalendarRow).join("");
  const emptyText = windows.some((window) => window.hasOpenSlot)
    ? ""
    : `<p class="public-calendar-note">未来 ${publicStudentPreviewHours} 小时内暂无公开可预约时间。登录后可以查看完整未来课表。</p>`;

  elements.studentSlots.innerHTML = `
    <section class="public-calendar-card" aria-label="公开可预约时间预览">
      <div class="public-calendar-header">
        <div>
          <p class="eyebrow">公开预览</p>
          <h3>未来 ${publicStudentPreviewHours} 小时</h3>
        </div>
        <span>弱化数据</span>
      </div>
      <div class="public-calendar-grid">
        <div class="public-calendar-time public-calendar-head">时间</div>
        <div class="public-calendar-status public-calendar-head">状态</div>
        ${rows}
      </div>
      ${emptyText}
      <a class="ghost-button public-login-link" href="login/index.html">登录 / 注册查看完整时间表</a>
    </section>
  `;
}

function getPublicAvailabilityWindows() {
  const now = new Date();
  const startMinutes = now.getHours() * 60 + now.getMinutes();
  const roundedStartMinutes = Math.ceil(startMinutes / calendarStep) * calendarStep;
  const cursorStart = new Date(now);
  cursorStart.setHours(Math.floor(roundedStartMinutes / 60), roundedStartMinutes % 60, 0, 0);
  const end = new Date(now.getTime() + publicStudentPreviewHours * 60 * 60 * 1000);
  const windows = [];

  for (let cursor = cursorStart; cursor < end; cursor = new Date(cursor.getTime() + calendarStep * 60 * 1000)) {
    const windowEnd = new Date(cursor.getTime() + calendarStep * 60 * 1000);
    const hasOpenSlot = state.slots.some((slot) => {
      const slotStart = new Date(`${slot.date}T${slot.start}`);
      const slotEnd = new Date(`${slot.date}T${slot.end}`);
      return !slot.booked && !slotOverlapsBlockedException(slot) && slotStart < windowEnd && slotEnd > cursor;
    });

    windows.push({
      date: localIsoFromDate(cursor),
      start: timeFromDate(cursor),
      end: timeFromDate(windowEnd),
      hasOpenSlot,
    });
  }

  return windows;
}

function renderPublicStudentCalendarRow(window) {
  return `
    <div class="public-calendar-time">
      <strong>${window.start} - ${window.end}</strong>
      <span>${formatDate(window.date)}</span>
    </div>
    <div class="public-calendar-status ${window.hasOpenSlot ? "has-public-availability" : "no-public-availability"}">
      <span>${window.hasOpenSlot ? "有可预约时间" : "暂无可预约时间"}</span>
    </div>
  `;
}

function renderFullStudentCalendar(weekStart, availableSlots) {
  const slotsByCell = availableSlots.reduce((groups, slot) => {
    const key = `${slot.date}|${minutesFromTime(slot.start)}`;
    groups[key] = groups[key] || [];
    groups[key].push(slot);
    return groups;
  }, {});
  const weekEnd = addDaysIso(weekStart, 6);
  const rows = [];

  for (let minutes = minutesFromTime(coreDayStart); minutes < minutesFromTime(coreDayEnd); minutes += calendarStep) {
    rows.push(`<div class="calendar-time">${timeFromMinutes(minutes)}</div>`);
    for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
      const date = addDaysIso(weekStart, dayIndex);
      const cellSlots = slotsByCell[`${date}|${minutes}`] || [];
      rows.push(renderStudentCalendarCell(date, minutes, cellSlots));
    }
  }

  const hasOpenSlots = availableSlots.length > 0;
  elements.studentSlots.innerHTML = `
    <section class="student-calendar-card calendar-panel" aria-label="学生可预约周历">
      <div class="panel-heading compact-heading student-calendar-header">
        <div>
          <p class="eyebrow">预约日历</p>
          <h3>${formatDate(weekStart)} - ${formatDate(weekEnd)}</h3>
        </div>
      </div>
      <div class="calendar-legend student-calendar-legend" aria-label="学生预约日历图例">
        <span><i class="student-availability-swatch low"></i>空档少</span>
        <span><i class="student-availability-swatch medium"></i>空档中等</span>
        <span><i class="student-availability-swatch high"></i>空档多</span>
        <span><i class="legend-dot blocked"></i>未开放</span>
      </div>
      <div class="calendar-week-frame">
        <button class="calendar-side-arrow" type="button" data-action="student-week" data-offset="-7" aria-label="上一周">‹</button>
        <div class="student-booking-calendar drag-calendar">
          <div class="calendar-corner"></div>
          ${dayLabels
            .map((label, index) => {
              const date = addDaysIso(weekStart, index);
              return `<div class="calendar-day">${label}<span>${formatDate(date)}</span></div>`;
            })
            .join("")}
          ${rows.join("")}
        </div>
        <button class="calendar-side-arrow" type="button" data-action="student-week" data-offset="7" aria-label="下一周">›</button>
      </div>
      ${
        hasOpenSlots
          ? ""
          : `<p class="empty-state">当前筛选条件下没有可预约滑冰时间。可以换一周或选择全部教练。</p>`
      }
    </section>
  `;
}

function renderStudentCalendarCell(date, minutes, cellSlots) {
  if (!cellSlots.length) {
    return `<div class="calendar-cell student-calendar-cell has-blocked" aria-label="${formatDate(date)} ${timeFromMinutes(minutes)} 未开放"></div>`;
  }

  const slotIds = cellSlots.map((slot) => slot.id).join(",");
  const availabilityLevel = getStudentAvailabilityLevel(cellSlots.length);
  return `
    <div class="calendar-cell student-calendar-cell has-slot availability-${availabilityLevel}">
      <button class="student-time-option" type="button" data-action="choose-time" data-ids="${slotIds}" title="${cellSlots.length} 位教练可预约">
        <span class="visually-hidden">${cellSlots.length} 位教练可预约</span>
      </button>
    </div>
  `;
}

function getStudentAvailabilityLevel(count) {
  if (count >= 3) return "high";
  if (count === 2) return "medium";
  return "low";
}

function renderStudentSlotCard(slot) {
  const coach = getCoach(slot.coachId);
  const profile = getProfile(slot.coachId);
  const travelText = profile.travelsToOtherRinks
    ? "其他冰场授课可协商"
    : `可授课冰场：${(profile.servedRinks || [profile.homeRink]).map(formatLocationLabel).join(", ")} 或 Zoom`;

  return `
    <article class="slot-card">
      <div class="slot-top">
        <div>
          <div class="slot-time">${escapeHtml(slot.start)} - ${escapeHtml(slot.end)}</div>
          <div class="slot-meta">${escapeHtml(formatDate(slot.date))} · ${escapeHtml(slot.location)}</div>
        </div>
        <span class="pill">$${slot.lessonPrice}</span>
      </div>
      <p class="slot-note"><strong>${escapeHtml(coach.name)}</strong> · ${escapeHtml(coach.subject)}<br>${escapeHtml(slot.lessonName || "私教课")} · ${escapeHtml(slot.lessonDuration || "")} 分钟<br>${escapeHtml(travelText)}<br>${escapeHtml(slot.note || "可预约一节滑冰私教课。")}</p>
      <button class="primary-button" type="button" data-action="book" data-id="${escapeAttribute(slot.id)}">Book this time</button>
    </article>
  `;
}

export function renderDragCalendar() {
  const weekStart = startOfWeekIso(elements.calendarWeekStart.value || todayIso());
  elements.calendarWeekStart.value = weekStart;
  const displayStart = state.calendarShowsFullDay ? fullDayStart : coreDayStart;
  const displayEnd = state.calendarShowsFullDay ? fullDayEnd : coreDayEnd;

  const header = [
    `<div class="calendar-corner"></div>`,
    ...dayLabels.map((label, index) => {
      const date = addDaysIso(weekStart, index);
      return `<div class="calendar-day">${label}<span>${formatDate(date)}</span></div>`;
    }),
  ].join("");

  const rows = [];
  for (let minutes = minutesFromTime(displayStart); minutes < minutesFromTime(displayEnd); minutes += calendarStep) {
    rows.push(`<div class="calendar-time">${timeFromMinutes(minutes)}</div>`);
    for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
      rows.push(`
        <button
          class="calendar-cell"
          type="button"
          data-day-index="${dayIndex}"
          data-minutes="${minutes}"
          aria-label="${dayLabels[dayIndex]} ${timeFromMinutes(minutes)}"
        ></button>
      `);
    }
  }

  elements.dragCalendar.innerHTML = header + rows.join("");
  renderCalendarAvailability();
}

export function renderExceptionDragCalendar() {
  const weekStart = startOfWeekIso(elements.exceptionCalendarWeekStart.value || elements.calendarWeekStart.value || todayIso());
  elements.exceptionCalendarWeekStart.value = weekStart;
  const weekEnd = addDaysIso(weekStart, 6);
  const [startYear, startMonth, startDay] = weekStart.split("-").map(Number);
  const [endYear, endMonth, endDay] = weekEnd.split("-").map(Number);
  if (elements.coachScheduleWeekRange) {
    elements.coachScheduleWeekRange.innerHTML = `<span>${startYear}年${startMonth}月${startDay}日</span><wbr>—<wbr><span>${endYear !== startYear ? `${endYear}年` : ""}${endMonth}月${endDay}日</span>`;
  }
  const currentDate = todayIso();
  const displayStart = state.exceptionCalendarShowsFullDay ? fullDayStart : coreDayStart;
  const displayEnd = state.exceptionCalendarShowsFullDay ? fullDayEnd : coreDayEnd;

  const header = [
    `<div class="calendar-corner"></div>`,
    ...dayLabels.map((label, index) => {
      const date = addDaysIso(weekStart, index);
      return `<div class="calendar-day${date === currentDate ? " is-today" : ""}" data-date="${date}"${date === currentDate ? ' aria-current="date"' : ""}>${label}<span>${formatDate(date)}${date === currentDate ? " · 今天" : ""}</span></div>`;
    }),
  ].join("");

  const rows = [];
  for (let minutes = minutesFromTime(displayStart); minutes < minutesFromTime(displayEnd); minutes += calendarStep) {
    rows.push(`<div class="calendar-time">${timeFromMinutes(minutes)}</div>`);
    for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
      rows.push(`
        <button
          class="calendar-cell"
          type="button"
          data-day-index="${dayIndex}"
          data-minutes="${minutes}"
          aria-label="${dayLabels[dayIndex]} ${timeFromMinutes(minutes)}"
        ></button>
      `);
    }
  }

  elements.exceptionDragCalendar.innerHTML = header + rows.join("");
  renderExceptionCalendarAvailability();
}

function findBlockAt(date, minutes) {
  return state.blockedExceptions.find((block) => {
    return block.coachId === currentCoachId && block.date === date && minutes >= minutesFromTime(block.start) && minutes < minutesFromTime(block.end);
  });
}

function renderCalendarAvailability() {
  if (!elements.dragCalendar || !elements.dragCalendar.children.length) return;

  const weekStart = elements.calendarWeekStart.value;
  const selectedCoach = currentCoachId;
  const cells = elements.dragCalendar.querySelectorAll(".calendar-cell");
  cells.forEach((cell) => {
    const date = addDaysIso(weekStart, Number(cell.dataset.dayIndex));
    const minutes = Number(cell.dataset.minutes);
    const slot = findSlotAt(selectedCoach, date, minutes);
    const isUnsavedOpen = Boolean(slot && state.unsavedAddedSlotIds.has(slot.id));
    const isUnsavedBlock = !slot && state.unsavedBlockedCellKeys.has(cellKey(date, minutes));
    const isRecurringEdit = state.unsavedRecurringCellKeys.has(cellKey(date, minutes));
    const isPast = isPastCalendarCell(date, minutes);

    cell.style.removeProperty("--rink-color");
    if (slot) {
      cell.style.setProperty("--rink-color", getRinkColor(getAvailabilityLocation(slot)));
    }
    cell.classList.toggle("has-slot", Boolean(slot));
    cell.classList.toggle("has-booking", Boolean(slot && slot.booked));
    cell.classList.toggle("has-blocked", !slot);
    cell.classList.toggle("is-editing", isUnsavedOpen || isUnsavedBlock || isRecurringEdit);
    cell.classList.toggle("is-past", isPast);
    cell.title = slot
      ? `${slot.start}-${slot.end} ${formatLocationLabel(getAvailabilityLocation(slot))}${slot.booked ? ` · 已预约 · ${formatLocationLabel(slot.location)}` : " · 可预约"}${isPast ? " · 已过去" : ""}`
      : `不可预约${isPast ? " · 已过去" : ""}`;
    cell.setAttribute("aria-label", cell.title);
  });
}

export function renderExceptionCalendarAvailability() {
  if (!elements.exceptionDragCalendar || !elements.exceptionDragCalendar.children.length) return;

  const weekStart = elements.exceptionCalendarWeekStart.value;
  const cells = elements.exceptionDragCalendar.querySelectorAll(".calendar-cell");
  cells.forEach((cell) => {
    const date = addDaysIso(weekStart, Number(cell.dataset.dayIndex));
    const minutes = Number(cell.dataset.minutes);
    const slot = findSlotAt(currentCoachId, date, minutes);
    const block = findBlockAt(date, minutes);
    const isUnsavedBlock = Boolean(block && state.unsavedBlockExceptionIds.has(block.id));
    const studentName = slot && slot.booked && slot.student ? slot.student.name : "";
    const isFilteredBooking = Boolean(slot && slot.booked && !coachBookingMatchesStudent(slot));
    const isBookingStart = Boolean(slot && slot.booked && minutes === minutesFromTime(slot.start));

    cell.textContent = "";
    delete cell.dataset.slotId;
    cell.style.removeProperty("--rink-color");
    cell.style.removeProperty("--booked-rink-color");
    if (slot && !block) {
      cell.style.setProperty("--rink-color", getRinkColor(slot.location));
      cell.style.setProperty("--booked-rink-color", getBookedRinkColor(slot.location));
    }
    cell.classList.toggle("has-slot", Boolean(slot && !block));
    cell.classList.toggle("has-booking", Boolean(slot && slot.booked));
    cell.classList.toggle("is-filtered-booking", isFilteredBooking);
    if (slot && slot.booked && !block && !isFilteredBooking) {
      cell.dataset.slotId = slot.id;
    }
    cell.classList.toggle("has-blocked", !slot || Boolean(block));
    cell.classList.toggle("is-editing", isUnsavedBlock);
    cell.classList.toggle("booking-start", isBookingStart);
    if (isBookingStart) {
      const label = document.createElement("span");
      label.className = "calendar-cell-label";
      label.textContent = isFilteredBooking ? "已占用" : studentName || "学生";
      cell.append(label);
    }
    cell.title = block ? `${block.start}-${block.end} 不可预约` : isFilteredBooking ? `${slot.start}-${slot.end} 已占用（其他学生预约）` : slot ? `${slot.start}-${slot.end} ${formatLocationLabel(slot.location)}${studentName ? ` · ${studentName}` : ""}` : "不可预约";
    cell.setAttribute("aria-label", cell.title);
  });
  renderCoachCalendarFilterSummary();
}
