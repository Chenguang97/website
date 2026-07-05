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
const slotsStorageKey = "ice-skating-coach-booking-slots-v5";
const profileStorageKey = "ice-skating-coach-profiles-v1";
const blockedStorageKey = "ice-skating-coach-blocked-exceptions-v1";
const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const calendarStep = 30;
const fullDayStart = "00:00";
const fullDayEnd = "24:00";
const coreDayStart = "06:00";
const coreDayEnd = "18:00";
const defaultStart = "09:00";
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
  lessonTypeSelect: document.querySelector("#lessonTypeSelect"),
  calendarLessonTypeSelect: document.querySelector("#calendarLessonTypeSelect"),
  locationType: document.querySelector("#locationType"),
  calendarLocationType: document.querySelector("#calendarLocationType"),
  rinkLegend: document.querySelector("#rinkLegend"),
  coachNote: document.querySelector("#coachNote"),
  calendarNote: document.querySelector("#calendarNote"),
  calendarEditMode: document.querySelector("#calendarEditMode"),
  toggleCalendarHours: document.querySelector("#toggleCalendarHours"),
  calendarWeekStart: document.querySelector("#calendarWeekStart"),
  dragCalendar: document.querySelector("#dragCalendar"),
  dropdownOpenSlots: document.querySelector("#dropdownOpenSlots"),
  dropdownWeekSlots: document.querySelector("#dropdownWeekSlots"),
  saveAvailability: document.querySelector("#saveAvailability"),
  availabilitySaveMessage: document.querySelector("#availabilitySaveMessage"),
  blockExceptionForm: document.querySelector("#blockExceptionForm"),
  blockDate: document.querySelector("#blockDate"),
  blockStartTime: document.querySelector("#blockStartTime"),
  blockEndTime: document.querySelector("#blockEndTime"),
  blockReason: document.querySelector("#blockReason"),
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
    servedRinks: [rinks[index % rinks.length]],
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
    const profile = getProfile(coach.id);
    const lesson = profile.lessonOptions[1] || profile.lessonOptions[0];
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
          "Default M-F availability: 9:00-16:00.",
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
  const allowedRinks = profile.travelsToOtherRinks ? rinks : servedRinks;
  return ["Any served rink", ...allowedRinks, "Zoom"].map((rink) => `<option value="${rink}">${rink}</option>`).join("");
}

function populateCoachSelects() {
  elements.studentCoachFilter.innerHTML = coachOptions(true);
}

function populateLessonTypeSelects() {
  const profile = getProfile(currentCoachId);
  const options = profile.lessonOptions
    .map((lesson) => `<option value="${lesson.id}">${lesson.name} · ${lesson.duration} min · $${lesson.price}</option>`)
    .join("");

  elements.lessonTypeSelect.innerHTML = options;
  elements.calendarLessonTypeSelect.innerHTML = options;
}

function getLessonById(lessonId) {
  const profile = getProfile(currentCoachId);
  return profile.lessonOptions.find((lesson) => lesson.id === lessonId) || profile.lessonOptions[0];
}

function hasLesson(lessonId) {
  return getProfile(currentCoachId).lessonOptions.some((lesson) => lesson.id === lessonId);
}

function populateTimeSelects() {
  const startMinutes = minutesFromTime(fullDayStart);
  const endMinutes = minutesFromTime(fullDayEnd);
  const startOptions = [];
  const endOptions = [];

  for (let minutes = startMinutes; minutes < endMinutes; minutes += calendarStep) {
    startOptions.push(`<option value="${timeFromMinutes(minutes)}">${timeFromMinutes(minutes)}</option>`);
  }

  for (let minutes = startMinutes + calendarStep; minutes <= endMinutes; minutes += calendarStep) {
    endOptions.push(`<option value="${timeFromMinutes(minutes)}">${timeFromMinutes(minutes)}</option>`);
  }

  elements.startTime.innerHTML = startOptions.join("");
  elements.endTime.innerHTML = endOptions.join("");
  elements.blockStartTime.innerHTML = startOptions.join("");
  elements.blockEndTime.innerHTML = endOptions.join("");
  elements.startTime.value = defaultStart;
  elements.endTime.value = "12:00";
  elements.blockStartTime.value = defaultStart;
  elements.blockEndTime.value = "12:00";
}

function slotSort(a, b) {
  return `${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`);
}

function render() {
  slots.sort(slotSort);
  syncProfileForm();
  syncPhotoForm();
  syncLessonTypeSelects();
  syncLocationOptions();
  renderCoachSlots();
  renderStudentSlots();
  renderStats();
  renderDropdownOpenSlots();
  renderDropdownWeekSlots();
  renderExceptionsList();
  renderCalendarAvailability();
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

function syncLessonTypeSelects() {
  const previousDropdown = elements.lessonTypeSelect.value;
  const previousCalendar = elements.calendarLessonTypeSelect.value;
  populateLessonTypeSelects();
  if (hasLesson(previousDropdown)) elements.lessonTypeSelect.value = previousDropdown;
  if (hasLesson(previousCalendar)) elements.calendarLessonTypeSelect.value = previousCalendar;
}

function syncLocationOptions() {
  elements.locationType.innerHTML = rinkOptionsForCoach(currentCoachId);
  elements.calendarLocationType.innerHTML = rinkOptionsForCoach(currentCoachId);
  renderRinkLegend();
}

function renderRinkLegend() {
  const profile = getProfile(currentCoachId);
  const servedRinks = profile.servedRinks && profile.servedRinks.length ? profile.servedRinks : [profile.homeRink || rinks[0]];
  elements.rinkLegend.innerHTML = ["Any served rink", ...servedRinks, "Zoom"]
    .map((rink) => `<span><i class="legend-dot" style="background:${getRinkColor(rink)}"></i>${rink}</span>`)
    .join("");
}

function getRinkColor(location) {
  return rinkColors[location] || "#bbf7d0";
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
    elements.exceptionsList.innerHTML = `<p class="empty-state">还没有 temporary block 或学生预约。</p>`;
    return;
  }

  const blockCards = blocks.map((block) => {
    return `
      <article class="slot-card blocked-card">
        <div class="slot-top">
          <div>
            <div class="slot-time">${block.start} - ${block.end}</div>
            <div class="slot-meta">${formatDate(block.date)} · Temporary block</div>
          </div>
          <span class="pill booked">Blocked</span>
        </div>
        <p class="slot-note">${block.reason || "Coach unavailable."}</p>
        <button class="danger-button" type="button" data-action="delete-block" data-id="${block.id}">Delete</button>
      </article>
    `;
  });

  elements.exceptionsList.innerHTML = [...blockCards, ...booked.map(renderCoachSlotCard)].join("");
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
            <strong>${group.lessonName || "Private lesson"} · $${group.lessonPrice}</strong>
            <span>${group.location}</span>
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

function findSlotAt(coachId, date, minutes) {
  return slots.find((item) => {
    return item.coachId === coachId && item.date === date && minutes >= minutesFromTime(item.start) && minutes < minutesFromTime(item.end);
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

function addAvailability(event) {
  event.preventDefault();
  const startMinutes = minutesFromTime(elements.startTime.value);
  const endMinutes = minutesFromTime(elements.endTime.value);
  const lesson = getLessonById(elements.lessonTypeSelect.value);

  if (endMinutes <= startMinutes) {
    showFormMessage("结束时间需要晚于开始时间。", true);
    return;
  }

  if (endMinutes - startMinutes < lesson.duration) {
    showFormMessage(`这个时间范围少于 ${lesson.duration} 分钟，无法生成 ${lesson.name}。`, true);
    return;
  }

  const newSlots = createSlotsFromRange(
    currentCoachId,
    elements.slotDate.value,
    startMinutes,
    endMinutes,
    lesson,
    elements.locationType.value,
    elements.coachNote.value.trim()
  );

  if (!newSlots.length) {
    showFormMessage("这段时间已经是 available；不用重复添加。");
    return;
  }

  slots = [...slots, ...newSlots];
  newSlots.forEach(markAddedSlot);
  elements.coachNote.value = "";
  refreshAvailabilityDirty();
  showFormMessage(`已添加 ${newSlots.length} 个可预约滑冰时间。`);
  render();
}

function toggleCalendarHours() {
  calendarShowsFullDay = !calendarShowsFullDay;
  elements.toggleCalendarHours.textContent = calendarShowsFullDay ? "Show 6:00-18:00" : "Show full 24 hours";
  renderDragCalendar();
}

function addBlockException(event) {
  event.preventDefault();
  const start = elements.blockStartTime.value;
  const end = elements.blockEndTime.value;

  if (minutesFromTime(end) <= minutesFromTime(start)) {
    showFormMessage("Block 的结束时间需要晚于开始时间。", true);
    return;
  }

  const block = {
    id: createId(),
    coachId: currentCoachId,
    date: elements.blockDate.value,
    start,
    end,
    reason: elements.blockReason.value.trim(),
  };
  blockedExceptions.push(block);
  unsavedBlockExceptionIds.add(block.id);
  elements.blockReason.value = "";
  refreshAvailabilityDirty("Unsaved block");
  showFormMessage("已添加 temporary block，记得 Save Availability。");
  render();
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
  syncLessonTypeSelects();
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
    mode: isEditing ? "undo" : elements.calendarEditMode.value,
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
  } else if (dragState.mode === "block") {
    const block = {
      id: createId(),
      coachId: currentCoachId,
      date,
      start: timeFromMinutes(start),
      end: timeFromMinutes(end),
      reason: "Blocked from calendar",
    };
    blockedExceptions.push(block);
    unsavedBlockExceptionIds.add(block.id);
    for (let minutes = start; minutes < end; minutes += calendarStep) {
      unsavedBlockedCellKeys.add(cellKey(date, minutes));
    }
    refreshAvailabilityDirty();
    showFormMessage("已添加 temporary block，记得 Save Availability。");
  } else {
    const lesson = getLessonById(elements.calendarLessonTypeSelect.value);
    if (end - start < lesson.duration) {
      showFormMessage(`拖选范围少于 ${lesson.duration} 分钟，无法生成 ${lesson.name}。`, true);
      dragState = null;
      clearDragSelection();
      return;
    }

    const newSlots = createSlotsFromRange(
      currentCoachId,
      date,
      start,
      end,
      lesson,
      elements.calendarLocationType.value,
      elements.calendarNote.value.trim() || "Added from calendar."
    );
    slots = [...slots, ...newSlots];
    if (newSlots.length) {
      newSlots.forEach(markAddedSlot);
      refreshAvailabilityDirty();
    }
    showFormMessage(newSlots.length ? `Calendar 已添加 ${newSlots.length} 个 availability。` : "这段时间已经是 available；不用重复添加。");
  }

  dragState = null;
  clearDragSelection();
  render();
}

function paintDragSelection() {
  const start = Math.min(dragState.start, dragState.end);
  const end = Math.max(dragState.start, dragState.end);
  elements.dragCalendar.querySelectorAll(".calendar-cell").forEach((cell) => {
    cell.classList.remove("selecting", "blocking", "reverting");
    const sameDay = Number(cell.dataset.dayIndex) === dragState.dayIndex;
    const minutes = Number(cell.dataset.minutes);
    const inRange = sameDay && minutes >= start && minutes <= end;
    cell.classList.toggle("selecting", inRange && dragState.mode === "open");
    cell.classList.toggle("blocking", inRange && dragState.mode === "block");
    cell.classList.toggle("reverting", inRange && dragState.mode === "undo");
  });
}

function clearDragSelection() {
  elements.dragCalendar.querySelectorAll(".calendar-cell").forEach((cell) => {
    cell.classList.remove("selecting", "blocking", "reverting");
  });
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
  showFormMessage("已重置：默认周一到周五 9:00-16:00 可预约。");
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
  elements.blockExceptionForm.addEventListener("submit", addBlockException);
  elements.toggleCalendarHours.addEventListener("click", toggleCalendarHours);
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
  elements.blockDate.value = initialDate;
  elements.studentDateFilter.value = initialDate;
  elements.calendarWeekStart.value = startOfWeekIso(initialDate);
  bindEvents();
  renderDragCalendar();
  render();
}

init();
