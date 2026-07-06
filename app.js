const rinks = ["Polar Ice Rink", "Arcadia Ice Arena", "Oceanside Ice Arena"];
const rinkColors = {
  "Polar Ice Rink": "#bbf7d0",
  "Arcadia Ice Arena": "#bfdbfe",
  "Oceanside Ice Arena": "#fde68a",
  "Any served rink": "#ddd6fe",
  Zoom: "#bae6fd",
};

const coaches = [
  { id: "maya", name: "Maya Chen", subject: "Figure Skating Coach" },
  { id: "alex", name: "Alex Rivera", subject: "Hockey Skating Coach" },
  { id: "sam", name: "Sam Patel", subject: "Off-ice & Jumps Coach" },
];

const currentCoachId = "maya";
const slotsStorageKey = "ice-skating-coach-booking-slots-v6";
const profileStorageKey = "ice-skating-coach-profiles-v2";
const blockedStorageKey = "ice-skating-coach-blocked-exceptions-v1";
const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const calendarStep = 30;
const unavailableSelection = "Unavailable";
const fullDayStart = "00:00";
const fullDayEnd = "24:00";
const coreDayStart = "06:00";
const coreDayEnd = "18:00";
const defaultStart = "06:00";
const defaultEnd = "16:00";

const elements = {
  modeButtons: document.querySelectorAll(".mode-button"),
  coachTabs: document.querySelectorAll(".coach-tab"),
  coachPanels: document.querySelectorAll("[data-coach-content]"),
  methodButtons: document.querySelectorAll(".method-button"),
  methodPanels: document.querySelectorAll("[data-method-panel]"),
  availabilitySubtabs: document.querySelectorAll(".availability-subtab"),
  availabilitySections: document.querySelectorAll("[data-availability-content]"),
  views: document.querySelectorAll(".view"),
  coachProfileForm: document.querySelector("#coachProfileForm"),
  coachRate: document.querySelector("#coachRate"),
  lessonOptionsList: document.querySelector("#lessonOptionsList"),
  lessonName: document.querySelector("#lessonName"),
  lessonDuration: document.querySelector("#lessonDuration"),
  lessonPrice: document.querySelector("#lessonPrice"),
  addLessonOption: document.querySelector("#addLessonOption"),
  servedRinkInputs: document.querySelectorAll("input[name='servedRinks']"),
  travelsToOtherRinks: document.querySelector("#travelsToOtherRinks"),
  travelFeeLabel: document.querySelector("#travelFeeLabel"),
  travelFee: document.querySelector("#travelFee"),
  profileMessage: document.querySelector("#profileMessage"),
  coachPhotoForm: document.querySelector("#coachPhotoForm"),
  coachPhotoUrl: document.querySelector("#coachPhotoUrl"),
  coachPhotoPreview: document.querySelector("#coachPhotoPreview"),
  photoMessage: document.querySelector("#photoMessage"),
  studentCoachFilter: document.querySelector("#studentCoachFilter"),
  availabilityForm: document.querySelector("#availabilityForm"),
  slotDate: document.querySelector("#slotDate"),
  startTime: document.querySelector("#startTime"),
  endTime: document.querySelector("#endTime"),
  locationType: document.querySelector("#locationType"),
  calendarLocationType: document.querySelector("#calendarLocationType"),
  calendarRinkOptions: document.querySelector("#calendarRinkOptions"),
  coachNote: document.querySelector("#coachNote"),
  toggleCalendarHours: document.querySelector("#toggleCalendarHours"),
  calendarWeekStart: document.querySelector("#calendarWeekStart"),
  dragCalendar: document.querySelector("#dragCalendar"),
  dropdownOpenSlots: document.querySelector("#dropdownOpenSlots"),
  dropdownWeekSlots: document.querySelector("#dropdownWeekSlots"),
  saveAvailability: document.querySelector("#saveAvailability"),
  availabilitySaveMessage: document.querySelector("#availabilitySaveMessage"),
  openBlockDialog: document.querySelector("#openBlockDialog"),
  blockDialog: document.querySelector("#blockDialog"),
  blockDialogForm: document.querySelector("#blockDialogForm"),
  blockDialogDate: document.querySelector("#blockDialogDate"),
  blockDialogStart: document.querySelector("#blockDialogStart"),
  blockDialogEnd: document.querySelector("#blockDialogEnd"),
  blockRepeatWeekly: document.querySelector("#blockRepeatWeekly"),
  closeBlockDialog: document.querySelector("#closeBlockDialog"),
  cancelBlockDialog: document.querySelector("#cancelBlockDialog"),
  exceptionCalendarWeekStart: document.querySelector("#exceptionCalendarWeekStart"),
  toggleExceptionCalendarHours: document.querySelector("#toggleExceptionCalendarHours"),
  exceptionDragCalendar: document.querySelector("#exceptionDragCalendar"),
  scheduleLegend: document.querySelector("#scheduleLegend"),
  exceptionsList: document.querySelector("#exceptionsList"),
  coachSlots: document.querySelector("#coachSlots"),
  studentSlots: document.querySelector("#studentSlots"),
  studentDateFilter: document.querySelector("#studentDateFilter"),
  formMessage: document.querySelector("#formMessage"),
  availableCount: document.querySelector("#availableCount"),
  bookedCount: document.querySelector("#bookedCount"),
  resetDemo: document.querySelector("#resetDemo"),
  bookingDialog: document.querySelector("#bookingDialog"),
  bookingForm: document.querySelector("#bookingForm"),
  bookingSlotId: document.querySelector("#bookingSlotId"),
  dialogTitle: document.querySelector("#dialogTitle"),
  studentName: document.querySelector("#studentName"),
  studentEmail: document.querySelector("#studentEmail"),
  studentNote: document.querySelector("#studentNote"),
  closeDialog: document.querySelector("#closeDialog"),
};

let coachProfiles = loadProfiles();
let slots = loadSlots();
let blockedExceptions = loadBlockedExceptions();
let dragState = null;
let hasUnsavedAvailabilityChanges = false;
let calendarShowsFullDay = false;
let exceptionCalendarShowsFullDay = false;
const unsavedAddedSlotIds = new Set();
const unsavedBlockedCellKeys = new Set();
const unsavedBlockExceptionIds = new Set();
const pendingDeletedSlots = new Map();

function todayIso(offset = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
}

function startOfWeekIso(dateString = todayIso()) {
  const date = new Date(`${dateString}T00:00:00`);
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1);
  return date.toISOString().slice(0, 10);
}

function addDaysIso(dateString, offset) {
  const date = new Date(`${dateString}T00:00:00`);
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
}

function isWeekday(dateString) {
  const day = new Date(`${dateString}T00:00:00`).getDay();
  return day >= 1 && day <= 5;
}

function nextWeekdayIso(offset = 0) {
  let date = todayIso(offset);
  while (!isWeekday(date)) {
    date = addDaysIso(date, 1);
  }
  return date;
}

function minutesFromTime(time) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function timeFromMinutes(totalMinutes) {
  const hours = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
  const minutes = String(totalMinutes % 60).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function cellKey(date, minutes) {
  return `${currentCoachId}|${date}|${minutes}`;
}

function markSlotCells(slot, targetSet) {
  for (let minutes = minutesFromTime(slot.start); minutes < minutesFromTime(slot.end); minutes += calendarStep) {
    targetSet.add(cellKey(slot.date, minutes));
  }
}

function formatDate(dateString) {
  return new Intl.DateTimeFormat("zh-CN", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(`${dateString}T00:00:00`));
}

function getCoach(coachId) {
  return coaches.find((coach) => coach.id === coachId) || coaches[0];
}

function getProfile(coachId) {
  return coachProfiles[coachId] || createDefaultProfile(coachId);
}

function createId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `slot-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createDefaultProfile(coachId) {
  const index = Math.max(0, coaches.findIndex((coach) => coach.id === coachId));
  const rate = [120, 95, 110][index];
  return {
    coachId,
    rate,
    homeRink: rinks[index % rinks.length],
    servedRinks: [...rinks],
    travelsToOtherRinks: false,
    travelFee: 0,
    photoUrl: "",
    lessonOptions: createDefaultLessonOptions(rate),
  };
}

function createDefaultLessonOptions(rate) {
  return [
    {
      id: "lesson-30",
      name: "30 min private lesson",
      duration: 30,
      price: Math.round(rate / 2),
      custom: false,
    },
    {
      id: "lesson-60",
      name: "60 min private lesson",
      duration: 60,
      price: rate,
      custom: false,
    },
  ];
}

function normalizeProfile(profile) {
  const normalized = { ...createDefaultProfile(profile.coachId), ...profile };
  if (!Array.isArray(normalized.servedRinks) || !normalized.servedRinks.length) {
    normalized.servedRinks = [normalized.homeRink || rinks[0]];
  }
  if (!Array.isArray(normalized.lessonOptions) || !normalized.lessonOptions.length) {
    normalized.lessonOptions = createDefaultLessonOptions(Number(normalized.rate || 0));
  }
  return normalized;
}

function createDefaultProfiles() {
  return coaches.reduce((profiles, coach) => {
    profiles[coach.id] = createDefaultProfile(coach.id);
    return profiles;
  }, {});
}

function createDefaultSlots() {
  const generated = [];
  coaches.forEach((coach) => {
    const lesson = getAvailabilityLesson(coach.id);
    for (let offset = 0; offset < 30; offset += 1) {
      const date = todayIso(offset);
      if (!isWeekday(date)) continue;

      generated.push(
        ...createSlotsFromRange(
          coach.id,
          date,
          minutesFromTime(defaultStart),
          minutesFromTime(defaultEnd),
          lesson,
          "Any served rink",
          "Default M-F availability: 6:00-16:00 for all served rinks.",
          false
        )
      );
    }
  });

  generated[2].booked = true;
  generated[2].student = {
    name: "Demo Student",
    email: "student@example.com",
    note: "Working on beginner edges.",
  };
  return generated;
}

function createSlot(coachId, date, start, end, location, note, lesson) {
  return {
    id: createId(),
    coachId,
    date,
    start,
    end,
    location,
    note,
    lessonId: lesson.id,
    lessonName: lesson.name,
    lessonDuration: lesson.duration,
    lessonPrice: lesson.price,
    booked: false,
    student: null,
  };
}

function loadProfiles() {
  const stored = localStorage.getItem(profileStorageKey);
  if (!stored) return createDefaultProfiles();

  try {
    const parsed = { ...createDefaultProfiles(), ...JSON.parse(stored) };
    return Object.fromEntries(Object.entries(parsed).map(([coachId, profile]) => [coachId, normalizeProfile({ ...profile, coachId })]));
  } catch {
    return createDefaultProfiles();
  }
}

function loadSlots() {
  const stored = localStorage.getItem(slotsStorageKey);
  if (!stored) return createDefaultSlots();

  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : createDefaultSlots();
  } catch {
    return createDefaultSlots();
  }
}

function loadBlockedExceptions() {
  const stored = localStorage.getItem(blockedStorageKey);
  if (!stored) return [];

  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveProfiles() {
  localStorage.setItem(profileStorageKey, JSON.stringify(coachProfiles));
}

function saveSlots() {
  localStorage.setItem(slotsStorageKey, JSON.stringify(slots));
  localStorage.setItem(blockedStorageKey, JSON.stringify(blockedExceptions));
}

function coachOptions(includeAll = false) {
  const options = coaches
    .map((coach) => `<option value="${coach.id}">${coach.name} · ${coach.subject}</option>`)
    .join("");
  return includeAll ? `<option value="all">全部 coach</option>${options}` : options;
}

function rinkOptionsForCoach(coachId) {
  const profile = getProfile(coachId);
  const servedRinks = profile.servedRinks && profile.servedRinks.length ? profile.servedRinks : [profile.homeRink || rinks[0]];
  return [
    `<option value="Any served rink">All served rinks</option>`,
    ...servedRinks.map((rink) => `<option value="${rink}">${rink}</option>`),
    `<option value="Zoom">Zoom</option>`,
  ].join("");
}

function populateCoachSelects() {
  elements.studentCoachFilter.innerHTML = coachOptions(true);
}

function getAvailabilityLesson(coachId = currentCoachId) {
  const profile = getProfile(coachId);
  const lesson30 = profile.lessonOptions.find((lesson) => Number(lesson.duration) === 30);
  const baseLesson = lesson30 || profile.lessonOptions[0];
  return {
    ...baseLesson,
    duration: calendarStep,
  };
}

function populateTimeSelects() {
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

function syncEndTimeOptions(startSelect, endSelect, preferredEnd = endSelect.value) {
  const minimumEnd = minutesFromTime(startSelect.value) + calendarStep;
  const options = [];

  for (let minutes = minimumEnd; minutes <= minutesFromTime(fullDayEnd); minutes += calendarStep) {
    options.push(`<option value="${timeFromMinutes(minutes)}">${timeFromMinutes(minutes)}</option>`);
  }

  endSelect.innerHTML = options.join("");
  endSelect.value = minutesFromTime(preferredEnd) >= minimumEnd ? preferredEnd : timeFromMinutes(minimumEnd);
}

function slotSort(a, b) {
  return `${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`);
}

function render() {
  slots.sort(slotSort);
  syncProfileForm();
  syncPhotoForm();
  syncLocationOptions();
  renderCoachSlots();
  renderStudentSlots();
  renderStats();
  renderDropdownOpenSlots();
  renderDropdownWeekSlots();
  renderExceptionsList();
  renderCalendarAvailability();
  renderExceptionCalendarAvailability();
}

function renderStats() {
  elements.availableCount.textContent = slots.filter((slot) => !slot.booked).length;
  elements.bookedCount.textContent = slots.filter((slot) => slot.booked).length;
}

function syncProfileForm() {
  const profile = getProfile(currentCoachId);
  elements.coachRate.value = profile.rate;
  elements.servedRinkInputs.forEach((input) => {
    input.checked = profile.servedRinks.includes(input.value);
  });
  elements.travelsToOtherRinks.value = profile.travelsToOtherRinks ? "yes" : "no";
  elements.travelFee.value = profile.travelFee || "";
  elements.travelFeeLabel.classList.toggle("is-hidden", !profile.travelsToOtherRinks);
  renderLessonOptions();
}

function renderLessonOptions() {
  const profile = getProfile(currentCoachId);
  elements.lessonOptionsList.innerHTML = profile.lessonOptions
    .map((lesson) => {
      return `
        <article class="lesson-option-row" data-lesson-id="${lesson.id}">
          <input class="lesson-name-input" type="text" value="${lesson.name}" aria-label="Lesson name" />
          <input class="lesson-duration-input" type="number" min="15" step="15" value="${lesson.duration}" aria-label="Lesson duration" />
          <input class="lesson-price-input" type="number" min="0" step="5" value="${lesson.price}" aria-label="Lesson price" />
          <button class="danger-button" type="button" data-action="remove-lesson">删除</button>
        </article>
      `;
    })
    .join("");
}

function syncPhotoForm() {
  const coach = getCoach(currentCoachId);
  const profile = getProfile(currentCoachId);
  elements.coachPhotoUrl.value = profile.photoUrl || "";

  if (profile.photoUrl) {
    elements.coachPhotoPreview.textContent = "";
    elements.coachPhotoPreview.style.backgroundImage = `url("${profile.photoUrl}")`;
  } else {
    elements.coachPhotoPreview.style.backgroundImage = "";
    elements.coachPhotoPreview.textContent = coach.name
      .split(" ")
      .map((part) => part[0])
      .join("")
      .slice(0, 2);
  }
}

function syncLocationOptions() {
  const dropdownLocation = elements.locationType.value || "Any served rink";
  const calendarLocation = elements.calendarLocationType.value || "Any served rink";
  elements.locationType.innerHTML = rinkOptionsForCoach(currentCoachId);
  elements.calendarLocationType.innerHTML = `${rinkOptionsForCoach(currentCoachId)}<option value="${unavailableSelection}">Unavailable</option>`;
  elements.locationType.value = dropdownLocation;
  elements.calendarLocationType.value = calendarLocation;
  if (!elements.locationType.value) elements.locationType.value = "Any served rink";
  if (!elements.calendarLocationType.value) elements.calendarLocationType.value = "Any served rink";
  renderCalendarRinkOptions();
  renderScheduleLegend();
}

function renderCalendarRinkOptions() {
  const profile = getProfile(currentCoachId);
  const servedRinks = profile.servedRinks && profile.servedRinks.length ? profile.servedRinks : [profile.homeRink || rinks[0]];
  const options = [
    ["Any served rink", "All served rinks"],
    ...servedRinks.map((rink) => [rink, rink]),
    ["Zoom", "Zoom"],
    [unavailableSelection, "Unavailable"],
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

function getRinkColor(location) {
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
    ["Any served rink", "All served rinks"],
    ...servedRinks.map((rink) => [rink, rink]),
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
            <span><i class="legend-dot" style="background:${getRinkColor(value)}"></i>open</span>
            <span><i class="legend-dot" style="background:${getBookedRinkColor(value)}"></i>booked</span>
          </div>
        </div>
      `;
    }),
    `<div class="schedule-legend-row compact"><strong>Unavailable</strong><div class="schedule-legend-states"><span><i class="legend-dot blocked"></i>blocked</span></div></div>`,
  ].join("");
}

function renderCoachSlots() {
  const visible = slots.filter((slot) => slot.booked && slot.coachId === currentCoachId);

  if (!visible.length) {
    elements.coachSlots.innerHTML = `<p class="empty-state">目前还没有学生预约。学生 book 之后会显示在这里。</p>`;
    return;
  }

  elements.coachSlots.innerHTML = visible.map(renderCoachSlotCard).join("");
}

function renderCoachSlotCard(slot) {
  const coach = getCoach(slot.coachId);
  const bookedText = slot.booked
    ? `<p class="slot-note">学生：${slot.student.name} · ${slot.student.email}${slot.student.note ? `<br>${slot.student.note}` : ""}</p>`
    : `<p class="slot-note">${slot.note || "没有备注"}</p>`;

  return `
    <article class="slot-card ${slot.booked ? "booked" : ""}">
      <div class="slot-top">
        <div>
          <div class="slot-time">${slot.start} - ${slot.end}</div>
          <div class="slot-meta">${formatDate(slot.date)} · ${coach.name} · ${slot.location} · ${slot.lessonName || "Private lesson"} · $${slot.lessonPrice}</div>
        </div>
        <span class="pill ${slot.booked ? "booked" : ""}">${slot.booked ? "已预订" : "可预约"}</span>
      </div>
      ${bookedText}
      <div class="slot-actions">
        ${slot.booked ? `<button class="ghost-button" type="button" data-action="cancel" data-id="${slot.id}">取消预约</button>` : ""}
        <button class="danger-button" type="button" data-action="delete" data-id="${slot.id}">Block / 删除</button>
      </div>
    </article>
  `;
}

function renderExceptionsList() {
  const booked = slots.filter((slot) => slot.coachId === currentCoachId && slot.booked);
  const blocks = blockedExceptions.filter((block) => block.coachId === currentCoachId);

  if (!booked.length && !blocks.length) {
    elements.exceptionsList.innerHTML = `<p class="empty-state">还没有 booked lessons 或 unavailable time。</p>`;
    return;
  }

  const blockCards = blocks.map((block) => {
    return `
      <article class="open-slot-row booked">
        <div>
          <strong>${block.start} - ${block.end}</strong>
          <span>${formatDate(block.date)} · Blocked</span>
        </div>
        <div>
          <strong>${block.reason || "Unavailable time"}</strong>
          <span>Unavailable time</span>
        </div>
        <button class="danger-button" type="button" data-action="delete-block" data-id="${block.id}">Delete</button>
      </article>
    `;
  });

  const bookedCards = booked.map((slot) => {
    return `
      <article class="open-slot-row booked">
        <div>
          <strong>${slot.start} - ${slot.end}</strong>
          <span>${formatDate(slot.date)} · Booked</span>
        </div>
        <div>
          <strong>${slot.location}</strong>
          <span>${slot.student ? `${slot.student.name} · ${slot.student.email}` : "Student booking"}</span>
        </div>
        <button class="ghost-button" type="button" data-action="cancel" data-id="${slot.id}">取消预约</button>
      </article>
    `;
  });

  elements.exceptionsList.innerHTML = [...blockCards, ...bookedCards].join("");
}

function getSlotsForDate(date) {
  return slots.filter((slot) => slot.coachId === currentCoachId && slot.date === date).sort(slotSort);
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

function renderDropdownOpenSlots() {
  const visible = groupSlotsForDisplay(getSlotsForDate(elements.slotDate.value), { ignoreBooked: true });

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
            <span>${group.type === "booked" ? "Booked" : "Available"}</span>
          </div>
          <div>
            <strong>${group.location}</strong>
            <span>Open availability</span>
          </div>
          ${
            group.type === "booked"
              ? `<span class="pill booked">Booked</span>`
              : `<button class="danger-button" type="button" data-action="delete-many" data-ids="${group.ids.join(",")}">Delete</button>`
          }
        </article>
      `;
    })
    .join("");
}

function renderDropdownWeekSlots() {
  const weekStart = startOfWeekIso(elements.slotDate.value || todayIso());
  const cards = dayLabels.map((label, index) => {
    const date = addDaysIso(weekStart, index);
    const daySlots = groupSlotsForDisplay(getSlotsForDate(date), { ignoreBooked: true }).filter((group) => group.type === "open");
    const chips = daySlots.length
      ? daySlots
          .map((group) => `<span class="time-chip" style="background:${getRinkColor(group.location)}">${group.start}-${group.end}<small>${group.location}</small></span>`)
          .join("")
      : `<span>No open time</span>`;

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

function renderStudentSlots() {
  const coachFilter = elements.studentCoachFilter.value;
  const dateFilter = elements.studentDateFilter.value;
  const available = slots.filter((slot) => {
    const coachMatches = coachFilter === "all" || slot.coachId === coachFilter;
    const dateMatches = !dateFilter || slot.date === dateFilter;
    return !slot.booked && !slotOverlapsBlockedException(slot) && coachMatches && dateMatches;
  });

  if (!available.length) {
    elements.studentSlots.innerHTML = `<p class="empty-state">当前筛选条件下没有可预约滑冰时间。可以换一个日期或 coach。</p>`;
    return;
  }

  elements.studentSlots.innerHTML = available.map(renderStudentSlotCard).join("");
}

function renderStudentSlotCard(slot) {
  const coach = getCoach(slot.coachId);
  const profile = getProfile(slot.coachId);
  const travelText = profile.travelsToOtherRinks
    ? `Can travel to other rinks · additional fee $${profile.travelFee || 0}`
    : `Regular rinks: ${(profile.servedRinks || [profile.homeRink]).join(", ")} or Zoom`;

  return `
    <article class="slot-card">
      <div class="slot-top">
        <div>
          <div class="slot-time">${slot.start} - ${slot.end}</div>
          <div class="slot-meta">${formatDate(slot.date)} · ${slot.location}</div>
        </div>
        <span class="pill">$${slot.lessonPrice}</span>
      </div>
      <p class="slot-note"><strong>${coach.name}</strong> · ${coach.subject}<br>${slot.lessonName || "Private lesson"} · ${slot.lessonDuration || ""} min<br>${travelText}<br>${slot.note || "可预约一节 ice skating coaching session。"}</p>
      <button class="primary-button" type="button" data-action="book" data-id="${slot.id}">Book this time</button>
    </article>
  `;
}

function renderDragCalendar() {
  const weekStart = startOfWeekIso(elements.calendarWeekStart.value || todayIso());
  elements.calendarWeekStart.value = weekStart;
  const displayStart = calendarShowsFullDay ? fullDayStart : coreDayStart;
  const displayEnd = calendarShowsFullDay ? fullDayEnd : coreDayEnd;

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

function renderExceptionDragCalendar() {
  const weekStart = startOfWeekIso(elements.exceptionCalendarWeekStart.value || elements.calendarWeekStart.value || todayIso());
  elements.exceptionCalendarWeekStart.value = weekStart;
  const displayStart = exceptionCalendarShowsFullDay ? fullDayStart : coreDayStart;
  const displayEnd = exceptionCalendarShowsFullDay ? fullDayEnd : coreDayEnd;

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

  elements.exceptionDragCalendar.innerHTML = header + rows.join("");
  renderExceptionCalendarAvailability();
}

function findSlotAt(coachId, date, minutes) {
  return slots.find((item) => {
    return item.coachId === coachId && item.date === date && minutes >= minutesFromTime(item.start) && minutes < minutesFromTime(item.end);
  });
}

function findBlockAt(date, minutes) {
  return blockedExceptions.find((block) => {
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
    const isUnsavedOpen = Boolean(slot && unsavedAddedSlotIds.has(slot.id));
    const isUnsavedBlock = !slot && unsavedBlockedCellKeys.has(cellKey(date, minutes));

    cell.style.removeProperty("--rink-color");
    if (slot) {
      cell.style.setProperty("--rink-color", getRinkColor(slot.location));
    }
    cell.classList.toggle("has-slot", Boolean(slot));
    cell.classList.toggle("has-booking", false);
    cell.classList.toggle("has-blocked", !slot);
    cell.classList.toggle("is-editing", isUnsavedOpen || isUnsavedBlock);
    cell.title = slot ? `${slot.start}-${slot.end} ${slot.location}` : "Blocked";
  });
}

function renderExceptionCalendarAvailability() {
  if (!elements.exceptionDragCalendar || !elements.exceptionDragCalendar.children.length) return;

  const weekStart = elements.exceptionCalendarWeekStart.value;
  const cells = elements.exceptionDragCalendar.querySelectorAll(".calendar-cell");
  cells.forEach((cell) => {
    const date = addDaysIso(weekStart, Number(cell.dataset.dayIndex));
    const minutes = Number(cell.dataset.minutes);
    const slot = findSlotAt(currentCoachId, date, minutes);
    const block = findBlockAt(date, minutes);
    const isUnsavedBlock = Boolean(block && unsavedBlockExceptionIds.has(block.id));
    const studentName = slot && slot.booked && slot.student ? slot.student.name : "";
    const isBookingStart = Boolean(studentName && minutes === minutesFromTime(slot.start));

    cell.textContent = "";
    cell.style.removeProperty("--rink-color");
    cell.style.removeProperty("--booked-rink-color");
    if (slot && !block) {
      cell.style.setProperty("--rink-color", getRinkColor(slot.location));
      cell.style.setProperty("--booked-rink-color", getBookedRinkColor(slot.location));
    }
    cell.classList.toggle("has-slot", Boolean(slot && !block));
    cell.classList.toggle("has-booking", Boolean(slot && slot.booked));
    cell.classList.toggle("has-blocked", !slot || Boolean(block));
    cell.classList.toggle("is-editing", isUnsavedBlock);
    cell.classList.toggle("booking-start", isBookingStart);
    if (isBookingStart) {
      cell.innerHTML = `<span class="calendar-cell-label">${studentName}</span>`;
    }
    cell.title = block ? `${block.start}-${block.end} Blocked` : slot ? `${slot.start}-${slot.end} ${slot.location}${studentName ? ` · ${studentName}` : ""}` : "Blocked";
    cell.setAttribute("aria-label", cell.title);
  });
}

function addAvailability(event) {
  event.preventDefault();
  const startMinutes = minutesFromTime(elements.startTime.value);
  const endMinutes = minutesFromTime(elements.endTime.value);
  const lesson = getAvailabilityLesson();

  if (endMinutes <= startMinutes) {
    showFormMessage("结束时间需要晚于开始时间。", true);
    return;
  }

  if (endMinutes - startMinutes < calendarStep) {
    showFormMessage(`这个时间范围少于 ${calendarStep} 分钟，无法生成 availability。`, true);
    return;
  }

  const { newSlots, overwritten } = replaceAvailabilityRange(
    currentCoachId,
    elements.slotDate.value,
    startMinutes,
    endMinutes,
    lesson,
    elements.locationType.value,
    elements.coachNote.value.trim()
  );

  if (!newSlots.length) {
    showFormMessage("这段时间没有可覆盖的 open availability，可能已经被预约。");
    return;
  }

  elements.coachNote.value = "";
  refreshAvailabilityDirty();
  showFormMessage(overwritten.length ? `已更新 ${overwritten.length} 个旧 availability，并添加 ${newSlots.length} 个新时间。` : `已添加 ${newSlots.length} 个可预约滑冰时间。`);
  render();
}

function toggleCalendarHours() {
  calendarShowsFullDay = !calendarShowsFullDay;
  elements.toggleCalendarHours.textContent = calendarShowsFullDay ? "Show 6:00-18:00" : "Show full 24 hours";
  renderDragCalendar();
}

function toggleExceptionCalendarHours() {
  exceptionCalendarShowsFullDay = !exceptionCalendarShowsFullDay;
  elements.toggleExceptionCalendarHours.textContent = exceptionCalendarShowsFullDay ? "Show 6:00-18:00" : "Show full 24 hours";
  renderExceptionDragCalendar();
}

function openBlockTimeDialog() {
  elements.blockDialogDate.value = elements.exceptionCalendarWeekStart.value || elements.slotDate.value || nextWeekdayIso();
  elements.blockDialogStart.value = defaultStart;
  syncEndTimeOptions(elements.blockDialogStart, elements.blockDialogEnd, "12:00");
  elements.blockRepeatWeekly.checked = false;
  elements.blockDialog.showModal();
}

function closeBlockTimeDialog() {
  elements.blockDialog.close();
}

function addBlockException(event) {
  event.preventDefault();
  const start = elements.blockDialogStart.value;
  const end = elements.blockDialogEnd.value;
  const date = elements.blockDialogDate.value;

  if (minutesFromTime(end) <= minutesFromTime(start)) {
    showFormMessage("结束时间需要晚于开始时间。", true);
    return;
  }

  const repeatCount = elements.blockRepeatWeekly.checked ? 12 : 1;
  for (let index = 0; index < repeatCount; index += 1) {
    addBlockExceptionRange(addDaysIso(date, index * 7), minutesFromTime(start), minutesFromTime(end));
  }

  elements.blockDialog.close();
  showFormMessage(elements.blockRepeatWeekly.checked ? "已添加每周重复 unavailable time，记得 Save Availability。" : "已添加 unavailable time，记得 Save Availability。");
  render();
}

function addBlockExceptionRange(date, start, end, reason = "Unavailable time") {
  const block = {
    id: createId(),
    coachId: currentCoachId,
    date,
    start: timeFromMinutes(start),
    end: timeFromMinutes(end),
    reason,
  };
  blockedExceptions.push(block);
  unsavedBlockExceptionIds.add(block.id);
  for (let minutes = start; minutes < end; minutes += calendarStep) {
    unsavedBlockedCellKeys.add(cellKey(date, minutes));
  }
  refreshAvailabilityDirty("Unsaved block");
}

function createSlotsFromRange(coachId, date, startMinutes, endMinutes, lesson, location, note, checkExisting = true) {
  const newSlots = [];
  const duration = Number(lesson.duration);
  for (let current = startMinutes; current + duration <= endMinutes; current += duration) {
    const existing = checkExisting ? findSlotAt(coachId, date, current) : null;
    if (!existing) {
      newSlots.push(createSlot(coachId, date, timeFromMinutes(current), timeFromMinutes(current + duration), location, note, lesson));
    }
  }
  return newSlots;
}

function replaceAvailabilityRange(coachId, date, startMinutes, endMinutes, lesson, location, note) {
  const overwritten = slots.filter((slot) => {
    return (
      slot.coachId === coachId &&
      slot.date === date &&
      !slot.booked &&
      rangesOverlap(minutesFromTime(slot.start), minutesFromTime(slot.end), startMinutes, endMinutes)
    );
  });
  const overwrittenIds = new Set(overwritten.map((slot) => slot.id));

  overwritten.forEach(markDeletedSlot);
  slots = slots.filter((slot) => !overwrittenIds.has(slot.id));

  const newSlots = createSlotsFromRange(coachId, date, startMinutes, endMinutes, lesson, location, note);
  slots = [...slots, ...newSlots];
  newSlots.forEach(markAddedSlot);

  return { newSlots, overwritten };
}

function removeAvailabilityRange(coachId, date, startMinutes, endMinutes) {
  const removed = slots.filter((slot) => {
    return (
      slot.coachId === coachId &&
      slot.date === date &&
      !slot.booked &&
      rangesOverlap(minutesFromTime(slot.start), minutesFromTime(slot.end), startMinutes, endMinutes)
    );
  });
  const removedIds = new Set(removed.map((slot) => slot.id));

  removed.forEach(markDeletedSlot);
  slots = slots.filter((slot) => !removedIds.has(slot.id));

  return removed;
}

function showFormMessage(message, isError = false) {
  elements.formMessage.textContent = message;
  elements.formMessage.style.color = isError ? "var(--red)" : "var(--green)";
}

function showProfileMessage(message, isError = false) {
  elements.profileMessage.textContent = message;
  elements.profileMessage.style.color = isError ? "var(--red)" : "var(--green)";
}

function setAvailabilityDirty(isDirty, message) {
  hasUnsavedAvailabilityChanges = isDirty;
  elements.availabilitySaveMessage.textContent = message || (isDirty ? "Unsaved changes" : "No unsaved changes");
  elements.availabilitySaveMessage.style.color = isDirty ? "var(--red)" : "var(--muted)";
}

function refreshAvailabilityDirty(message) {
  const isDirty = unsavedAddedSlotIds.size > 0 || pendingDeletedSlots.size > 0 || unsavedBlockExceptionIds.size > 0;
  setAvailabilityDirty(isDirty, message || (isDirty ? "Unsaved changes" : "No unsaved changes"));
}

function saveAvailabilityChanges() {
  saveSlots();
  unsavedAddedSlotIds.clear();
  unsavedBlockedCellKeys.clear();
  unsavedBlockExceptionIds.clear();
  pendingDeletedSlots.clear();
  setAvailabilityDirty(false, "Saved");
  showFormMessage("Availability 已保存。");
  render();
}

function saveCoachProfile(event) {
  event.preventDefault();
  const coachId = currentCoachId;
  const travels = elements.travelsToOtherRinks.value === "yes";
  const rate = Number(elements.coachRate.value || 0);
  const servedRinks = Array.from(elements.servedRinkInputs)
    .filter((input) => input.checked)
    .map((input) => input.value);

  if (!servedRinks.length) {
    showProfileMessage("请至少选择一个 regularly served rink。", true);
    return;
  }

  const lessonOptions = getProfile(coachId).lessonOptions.map((lesson) => {
    if (lesson.custom) return lesson;
    if (lesson.id === "lesson-30") return { ...lesson, price: Math.round(rate / 2) };
    if (lesson.id === "lesson-60") return { ...lesson, price: rate };
    return lesson;
  });

  coachProfiles[coachId] = {
    ...getProfile(coachId),
    coachId,
    rate,
    homeRink: servedRinks[0],
    servedRinks,
    travelsToOtherRinks: travels,
    travelFee: travels ? Number(elements.travelFee.value || 0) : 0,
    lessonOptions,
  };

  showProfileMessage("Coach profile 已保存。");
  saveProfiles();
  render();
}

function previewServedRinksChange() {
  const servedRinks = Array.from(elements.servedRinkInputs)
    .filter((input) => input.checked)
    .map((input) => input.value);
  if (!servedRinks.length) return;

  coachProfiles[currentCoachId] = {
    ...getProfile(currentCoachId),
    homeRink: servedRinks[0],
    servedRinks,
  };
  syncLocationOptions();
}

function saveCoachPhoto(event) {
  event.preventDefault();
  const coachId = currentCoachId;
  coachProfiles[coachId] = {
    ...getProfile(coachId),
    photoUrl: elements.coachPhotoUrl.value.trim(),
  };

  elements.photoMessage.textContent = "照片已保存。";
  saveProfiles();
  syncPhotoForm();
  render();
}

function addLessonOption() {
  const profile = getProfile(currentCoachId);
  const duration = Number(elements.lessonDuration.value || 0);
  const price = Number(elements.lessonPrice.value || 0);
  const name = elements.lessonName.value.trim() || `${duration} min private lesson`;

  if (!duration || !price) {
    showProfileMessage("请填写 lesson duration 和 price。", true);
    return;
  }

  profile.lessonOptions.push({
    id: `lesson-${Date.now()}`,
    name,
    duration,
    price,
    custom: true,
  });
  coachProfiles[currentCoachId] = profile;
  elements.lessonName.value = "";
  elements.lessonDuration.value = "45";
  elements.lessonPrice.value = "";
  showProfileMessage("已添加 lesson option。");
  saveProfiles();
  render();
}

function handleLessonOptionChange(event) {
  const row = event.target.closest(".lesson-option-row");
  if (!row) return;

  const profile = getProfile(currentCoachId);
  const lesson = profile.lessonOptions.find((item) => item.id === row.dataset.lessonId);
  if (!lesson) return;

  lesson.name = row.querySelector(".lesson-name-input").value.trim() || `${lesson.duration} min private lesson`;
  lesson.duration = Number(row.querySelector(".lesson-duration-input").value || lesson.duration);
  lesson.price = Number(row.querySelector(".lesson-price-input").value || lesson.price);
  lesson.custom = true;
  coachProfiles[currentCoachId] = profile;
  saveProfiles();
}

function handleLessonOptionClick(event) {
  const button = event.target.closest("button[data-action='remove-lesson']");
  if (!button) return;

  const row = button.closest(".lesson-option-row");
  const profile = getProfile(currentCoachId);
  if (profile.lessonOptions.length <= 1) {
    showProfileMessage("至少保留一个 lesson option。", true);
    return;
  }

  profile.lessonOptions = profile.lessonOptions.filter((lesson) => lesson.id !== row.dataset.lessonId);
  coachProfiles[currentCoachId] = profile;
  showProfileMessage("已删除 lesson option。");
  saveProfiles();
  render();
}

function openBookingDialog(slotId) {
  const slot = slots.find((item) => item.id === slotId);
  if (!slot) return;

  const coach = getCoach(slot.coachId);
  elements.bookingSlotId.value = slot.id;
  elements.dialogTitle.textContent = `${coach.name} · ${slot.lessonName || "Private lesson"} · $${slot.lessonPrice} · ${formatDate(slot.date)} ${slot.start}`;
  elements.studentName.value = "";
  elements.studentEmail.value = "";
  elements.studentNote.value = "";
  elements.bookingDialog.showModal();
}

function confirmBooking(event) {
  event.preventDefault();
  const slot = slots.find((item) => item.id === elements.bookingSlotId.value);
  if (!slot || slot.booked) return;

  slot.booked = true;
  slot.student = {
    name: elements.studentName.value.trim(),
    email: elements.studentEmail.value.trim(),
    note: elements.studentNote.value.trim(),
  };

  elements.bookingDialog.close();
  setAvailabilityDirty(true, "Unsaved booking change");
  render();
}

function handleSlotAction(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const { action, id } = button.dataset;
  if (action === "book") openBookingDialog(id);
  if (action === "delete") {
    const deleted = slots.find((slot) => slot.id === id);
    if (deleted) markDeletedSlot(deleted);
    slots = slots.filter((slot) => slot.id !== id);
    refreshAvailabilityDirty();
    render();
  }
  if (action === "delete-many") {
    const ids = new Set((button.dataset.ids || "").split(",").filter(Boolean));
    slots.filter((slot) => ids.has(slot.id)).forEach(markDeletedSlot);
    slots = slots.filter((slot) => !ids.has(slot.id));
    refreshAvailabilityDirty();
    render();
  }
  if (action === "delete-block") {
    if (unsavedBlockExceptionIds.has(id)) {
      unsavedBlockExceptionIds.delete(id);
    } else {
      unsavedBlockExceptionIds.add(`delete-${id}`);
    }
    blockedExceptions = blockedExceptions.filter((block) => block.id !== id);
    refreshAvailabilityDirty();
    render();
  }
  if (action === "cancel") {
    const slot = slots.find((item) => item.id === id);
    if (slot) {
      slot.booked = false;
      slot.student = null;
      setAvailabilityDirty(true);
      render();
    }
  }
}

function markDeletedSlot(slot) {
  if (unsavedAddedSlotIds.has(slot.id)) {
    unsavedAddedSlotIds.delete(slot.id);
    return;
  }

  pendingDeletedSlots.set(slot.id, slot);
  markSlotCells(slot, unsavedBlockedCellKeys);
}

function markAddedSlot(slot) {
  unsavedAddedSlotIds.add(slot.id);
  for (let minutes = minutesFromTime(slot.start); minutes < minutesFromTime(slot.end); minutes += calendarStep) {
    unsavedBlockedCellKeys.delete(cellKey(slot.date, minutes));
  }
}

function rangesOverlap(startA, endA, startB, endB) {
  return startA < endB && endA > startB;
}

function slotOverlapsBlockedException(slot) {
  return blockedExceptions.some((block) => {
    return (
      block.coachId === slot.coachId &&
      block.date === slot.date &&
      rangesOverlap(minutesFromTime(slot.start), minutesFromTime(slot.end), minutesFromTime(block.start), minutesFromTime(block.end))
    );
  });
}

function undoEditingRange(date, start, end) {
  const addedIdsToRemove = new Set();
  slots.forEach((slot) => {
    if (
      slot.coachId === currentCoachId &&
      slot.date === date &&
      unsavedAddedSlotIds.has(slot.id) &&
      rangesOverlap(minutesFromTime(slot.start), minutesFromTime(slot.end), start, end)
    ) {
      addedIdsToRemove.add(slot.id);
    }
  });

  slots = slots.filter((slot) => !addedIdsToRemove.has(slot.id));
  addedIdsToRemove.forEach((id) => unsavedAddedSlotIds.delete(id));

  const restored = [];
  pendingDeletedSlots.forEach((slot, id) => {
    if (
      slot.coachId === currentCoachId &&
      slot.date === date &&
      rangesOverlap(minutesFromTime(slot.start), minutesFromTime(slot.end), start, end)
    ) {
      restored.push(slot);
      pendingDeletedSlots.delete(id);
      for (let minutes = minutesFromTime(slot.start); minutes < minutesFromTime(slot.end); minutes += calendarStep) {
        unsavedBlockedCellKeys.delete(cellKey(slot.date, minutes));
      }
    }
  });

  const blockIdsToRemove = new Set();
  blockedExceptions.forEach((block) => {
    if (
      block.coachId === currentCoachId &&
      block.date === date &&
      unsavedBlockExceptionIds.has(block.id) &&
      rangesOverlap(minutesFromTime(block.start), minutesFromTime(block.end), start, end)
    ) {
      blockIdsToRemove.add(block.id);
      for (let minutes = minutesFromTime(block.start); minutes < minutesFromTime(block.end); minutes += calendarStep) {
        unsavedBlockedCellKeys.delete(cellKey(block.date, minutes));
      }
    }
  });
  blockedExceptions = blockedExceptions.filter((block) => !blockIdsToRemove.has(block.id));
  blockIdsToRemove.forEach((id) => unsavedBlockExceptionIds.delete(id));

  slots = [...slots, ...restored];
  const changed = addedIdsToRemove.size || restored.length || blockIdsToRemove.size;
  refreshAvailabilityDirty(changed ? "Editing reverted" : "No editing selection to revert");
  showFormMessage(changed ? "已取消选中的未保存 editing。" : "这段没有未保存的 editing。");
}

function startCalendarDrag(event) {
  const cell = event.target.closest(".calendar-cell");
  if (!cell) return;

  const date = addDaysIso(elements.calendarWeekStart.value, Number(cell.dataset.dayIndex));
  const minutes = Number(cell.dataset.minutes);
  const slot = findSlotAt(currentCoachId, date, minutes);
  const isEditing =
    Boolean(slot && unsavedAddedSlotIds.has(slot.id)) ||
    (!slot && unsavedBlockedCellKeys.has(cellKey(date, minutes)));
  dragState = {
    dayIndex: Number(cell.dataset.dayIndex),
    start: minutes,
    end: minutes,
    mode: isEditing ? "undo" : "open",
  };
  cell.setPointerCapture(event.pointerId);
  paintDragSelection();
}

function moveCalendarDrag(event) {
  if (!dragState) return;

  const target = document.elementFromPoint(event.clientX, event.clientY);
  const cell = target && target.closest(".calendar-cell");
  if (!cell || Number(cell.dataset.dayIndex) !== dragState.dayIndex) return;

  dragState.end = Number(cell.dataset.minutes);
  paintDragSelection();
}

function finishCalendarDrag() {
  if (!dragState) return;

  const start = Math.min(dragState.start, dragState.end);
  const end = Math.max(dragState.start, dragState.end) + calendarStep;
  const date = addDaysIso(elements.calendarWeekStart.value, dragState.dayIndex);

  if (dragState.mode === "undo") {
    undoEditingRange(date, start, end);
  } else if (elements.calendarLocationType.value === unavailableSelection) {
    const removed = removeAvailabilityRange(currentCoachId, date, start, end);
    if (removed.length) {
      refreshAvailabilityDirty();
      showFormMessage(`已删除 ${removed.length} 个 availability，记得 Save Availability。`);
    } else {
      showFormMessage("这段没有可删除的 open availability，可能已经被预约或本来就是 unavailable。");
    }
  } else {
    const lesson = getAvailabilityLesson();
    if (end - start < calendarStep) {
      showFormMessage(`拖选范围少于 ${calendarStep} 分钟，无法生成 availability。`, true);
      dragState = null;
      clearDragSelection();
      return;
    }

    const { newSlots, overwritten } = replaceAvailabilityRange(
      currentCoachId,
      date,
      start,
      end,
      lesson,
      elements.calendarLocationType.value,
      `Added from calendar for ${elements.calendarLocationType.value}.`
    );
    if (newSlots.length) {
      refreshAvailabilityDirty();
    }
    if (newSlots.length) {
      showFormMessage(overwritten.length ? `Calendar 已覆盖 ${overwritten.length} 个旧 availability，颜色已更新。` : `Calendar 已添加 ${newSlots.length} 个 availability。`);
    } else {
      showFormMessage("这段时间已被预约或无法覆盖。");
    }
  }

  dragState = null;
  clearDragSelection();
  render();
}

function paintDragSelection() {
  const start = Math.min(dragState.start, dragState.end);
  const end = Math.max(dragState.start, dragState.end);
  const isRemovingAvailability = elements.calendarLocationType.value === unavailableSelection;
  const selectionColor = isRemovingAvailability ? "#e2e8f0" : getRinkColor(elements.calendarLocationType.value);
  elements.dragCalendar.querySelectorAll(".calendar-cell").forEach((cell) => {
    cell.classList.remove("selecting", "blocking", "reverting", "removing");
    const sameDay = Number(cell.dataset.dayIndex) === dragState.dayIndex;
    const minutes = Number(cell.dataset.minutes);
    const inRange = sameDay && minutes >= start && minutes <= end;
    if (inRange && dragState.mode === "open") {
      cell.style.setProperty("--selection-color", selectionColor);
    } else {
      cell.style.removeProperty("--selection-color");
    }
    cell.classList.toggle("selecting", inRange && dragState.mode === "open");
    cell.classList.toggle("removing", inRange && dragState.mode === "open" && isRemovingAvailability);
    cell.classList.toggle("reverting", inRange && dragState.mode === "undo");
  });
}

function clearDragSelection() {
  elements.dragCalendar.querySelectorAll(".calendar-cell").forEach((cell) => {
    cell.classList.remove("selecting", "blocking", "reverting", "removing");
    cell.style.removeProperty("--selection-color");
  });
}

function selectCalendarRink(event) {
  const button = event.target.closest("button[data-rink]");
  if (!button) return;

  elements.calendarLocationType.value = button.dataset.rink;
  renderCalendarRinkOptions();
}

function switchView(event) {
  const button = event.currentTarget;
  const viewId = button.dataset.view;

  elements.modeButtons.forEach((item) => {
    const isActive = item === button;
    item.classList.toggle("active", isActive);
    item.setAttribute("aria-selected", String(isActive));
  });

  elements.views.forEach((view) => {
    view.classList.toggle("active", view.id === viewId);
  });
}

function switchMethod(event) {
  const button = event.currentTarget;
  const method = button.dataset.method;

  elements.methodButtons.forEach((item) => {
    const isActive = item === button;
    item.classList.toggle("active", isActive);
    item.setAttribute("aria-selected", String(isActive));
  });

  elements.methodPanels.forEach((panel) => {
    panel.classList.toggle("is-hidden", panel.dataset.methodPanel !== method);
  });
}

function switchAvailabilitySection(event) {
  const button = event.currentTarget;
  const sectionId = button.dataset.availabilitySection;

  elements.availabilitySubtabs.forEach((item) => {
    const isActive = item === button;
    item.classList.toggle("active", isActive);
    item.setAttribute("aria-selected", String(isActive));
  });

  elements.availabilitySections.forEach((section) => {
    section.classList.toggle("active", section.dataset.availabilityContent === sectionId);
  });
}

function switchCoachPanel(event) {
  const button = event.currentTarget;
  const panelId = button.dataset.coachPanel;

  elements.coachTabs.forEach((item) => {
    const isActive = item === button;
    item.classList.toggle("active", isActive);
    item.setAttribute("aria-selected", String(isActive));
  });

  elements.coachPanels.forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.coachContent === panelId);
  });
}

function resetDemoData() {
  coachProfiles = createDefaultProfiles();
  slots = createDefaultSlots();
  unsavedAddedSlotIds.clear();
  unsavedBlockedCellKeys.clear();
  unsavedBlockExceptionIds.clear();
  pendingDeletedSlots.clear();
  saveProfiles();
  saveSlots();
  setAvailabilityDirty(false, "Saved reset data");
  render();
  showFormMessage("已重置：默认周一到周五 6:00-16:00 对 all served rinks 可预约。");
}

function bindEvents() {
  elements.modeButtons.forEach((button) => button.addEventListener("click", switchView));
  elements.coachTabs.forEach((button) => button.addEventListener("click", switchCoachPanel));
  elements.methodButtons.forEach((button) => button.addEventListener("click", switchMethod));
  elements.availabilitySubtabs.forEach((button) => button.addEventListener("click", switchAvailabilitySection));
  elements.coachProfileForm.addEventListener("submit", saveCoachProfile);
  elements.coachPhotoForm.addEventListener("submit", saveCoachPhoto);
  elements.addLessonOption.addEventListener("click", addLessonOption);
  elements.lessonOptionsList.addEventListener("change", handleLessonOptionChange);
  elements.lessonOptionsList.addEventListener("click", handleLessonOptionClick);
  elements.servedRinkInputs.forEach((input) => input.addEventListener("change", previewServedRinksChange));
  elements.travelsToOtherRinks.addEventListener("change", () => {
    elements.travelFeeLabel.classList.toggle("is-hidden", elements.travelsToOtherRinks.value !== "yes");
  });
  elements.availabilityForm.addEventListener("submit", addAvailability);
  elements.openBlockDialog.addEventListener("click", openBlockTimeDialog);
  elements.blockDialogForm.addEventListener("submit", addBlockException);
  elements.closeBlockDialog.addEventListener("click", closeBlockTimeDialog);
  elements.cancelBlockDialog.addEventListener("click", closeBlockTimeDialog);
  elements.calendarRinkOptions.addEventListener("click", selectCalendarRink);
  elements.startTime.addEventListener("change", () => syncEndTimeOptions(elements.startTime, elements.endTime));
  elements.blockDialogStart.addEventListener("change", () => syncEndTimeOptions(elements.blockDialogStart, elements.blockDialogEnd));
  elements.toggleCalendarHours.addEventListener("click", toggleCalendarHours);
  elements.toggleExceptionCalendarHours.addEventListener("click", toggleExceptionCalendarHours);
  elements.slotDate.addEventListener("change", () => {
    elements.calendarWeekStart.value = startOfWeekIso(elements.slotDate.value);
    renderDragCalendar();
    renderDropdownOpenSlots();
    renderDropdownWeekSlots();
  });
  elements.studentCoachFilter.addEventListener("change", renderStudentSlots);
  elements.studentDateFilter.addEventListener("change", renderStudentSlots);
  elements.calendarWeekStart.addEventListener("change", () => {
    renderDragCalendar();
    renderDropdownWeekSlots();
  });
  elements.exceptionCalendarWeekStart.addEventListener("change", renderExceptionDragCalendar);
  elements.coachSlots.addEventListener("click", handleSlotAction);
  elements.exceptionsList.addEventListener("click", handleSlotAction);
  elements.dropdownOpenSlots.addEventListener("click", handleSlotAction);
  elements.studentSlots.addEventListener("click", handleSlotAction);
  elements.saveAvailability.addEventListener("click", saveAvailabilityChanges);
  elements.dragCalendar.addEventListener("pointerdown", startCalendarDrag);
  elements.dragCalendar.addEventListener("pointermove", moveCalendarDrag);
  elements.dragCalendar.addEventListener("pointerup", finishCalendarDrag);
  elements.dragCalendar.addEventListener("pointercancel", () => {
    dragState = null;
    clearDragSelection();
  });
  elements.bookingForm.addEventListener("submit", confirmBooking);
  elements.closeDialog.addEventListener("click", () => elements.bookingDialog.close());
  elements.resetDemo.addEventListener("click", resetDemoData);
}

function init() {
  populateCoachSelects();
  populateTimeSelects();
  const initialDate = nextWeekdayIso();
  elements.slotDate.value = initialDate;
  elements.blockDialogDate.value = initialDate;
  elements.studentDateFilter.value = initialDate;
  elements.calendarWeekStart.value = startOfWeekIso(initialDate);
  elements.exceptionCalendarWeekStart.value = startOfWeekIso(initialDate);
  bindEvents();
  renderDragCalendar();
  renderExceptionDragCalendar();
  render();
}

init();
