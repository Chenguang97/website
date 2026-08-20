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

function weekdayIndex(dateString) {
  return new Date(`${dateString}T00:00:00`).getDay();
}

function isPastCalendarCell(date, minutes) {
  const cellEnd = new Date(`${date}T${timeFromMinutes(minutes + calendarStep)}`);
  return cellEnd < new Date();
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

function markRangeCells(date, startMinutes, endMinutes, targetSet) {
  for (let minutes = startMinutes; minutes < endMinutes; minutes += calendarStep) {
    targetSet.add(cellKey(date, minutes));
  }
}

function formatDate(dateString) {
  return new Intl.DateTimeFormat("zh-CN", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(`${dateString}T00:00:00`));
}

function formatWeekday(dateString) {
  return new Intl.DateTimeFormat("zh-CN", {
    weekday: "long",
  }).format(new Date(`${dateString}T00:00:00`));
}

function getCoach(coachId) {
  return coaches.find((coach) => coach.id === coachId) || coaches[0];
}

function getProfile(coachId) {
  return coachProfiles[coachId] || createDefaultProfile(coachId);
}

function getAvailabilityLesson(coachId = currentCoachId) {
  const profile = getProfile(coachId);
  const lessonOptions = Array.isArray(profile.lessonOptions) && profile.lessonOptions.length ? profile.lessonOptions : createDefaultLessonOptions(Number(profile.rate || 0));
  const lesson30 = lessonOptions.find((lesson) => Number(lesson.duration) === 30);
  const baseLesson = lesson30 || lessonOptions[0];
  return {
    ...baseLesson,
    duration: calendarStep,
  };
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
  const lessonDurationsByCoach = {
    maya: [30, 45, 60],
    alex: [30, 60],
    sam: [45, 60],
  };
  return {
    coachId,
    rate,
    homeRink: rinks[index % rinks.length],
    servedRinks: [...rinks],
    travelsToOtherRinks: false,
    travelFee: 0,
    photoUrl: "",
    lessonOptions: createDefaultLessonOptions(rate, lessonDurationsByCoach[coachId]),
  };
}

function createDefaultLessonOptions(rate, durations = [30, 60]) {
  return durations.map((duration) => ({
    id: `lesson-${duration}`,
    name: `${duration} min private lesson`,
    duration,
    price: Math.round((rate * duration) / 60),
    custom: false,
  }));
}

function normalizeProfile(profile) {
  const normalized = { ...createDefaultProfile(profile.coachId), ...profile };
  if (!Array.isArray(normalized.servedRinks) || !normalized.servedRinks.length) {
    normalized.servedRinks = [normalized.homeRink || rinks[0]];
  }
  if (!Array.isArray(normalized.lessonOptions) || !normalized.lessonOptions.length) {
    normalized.lessonOptions = createDefaultLessonOptions(Number(normalized.rate || 0));
  } else {
    const existingLessonIds = new Set(normalized.lessonOptions.map((lesson) => lesson.id));
    const missingDefaults = createDefaultProfile(normalized.coachId).lessonOptions.filter((lesson) => !existingLessonIds.has(lesson.id));
    normalized.lessonOptions = [...normalized.lessonOptions, ...missingDefaults].sort((a, b) => Number(a.duration) - Number(b.duration));
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
  const recurringTemplate = {
    1: [
      { start: "06:00", end: "09:00", location: "Polar Ice Rink" },
      { start: "09:00", end: "12:00", location: "Arcadia Ice Arena" },
      { start: "12:00", end: "16:00", location: "Oceanside Ice Arena" },
    ],
    2: [{ start: defaultStart, end: defaultEnd, location: "Any served rink" }],
    3: [
      { start: "06:00", end: "10:00", location: "Any served rink" },
      { start: "10:00", end: "14:00", location: "Polar Ice Rink" },
      { start: "14:00", end: "16:00", location: "Zoom" },
    ],
    4: [{ start: defaultStart, end: defaultEnd, location: "Any served rink" }],
    5: [
      { start: "06:00", end: "11:00", location: "Arcadia Ice Arena" },
      { start: "11:00", end: "16:00", location: "Any served rink" },
    ],
  };
  coaches.forEach((coach) => {
    const lesson = getAvailabilityLesson(coach.id);
    for (let offset = -recurringPastWeeks * 7; offset <= recurringFutureWeeks * 7; offset += 1) {
      const date = todayIso(offset);
      if (!isWeekday(date)) continue;

      const dayTemplate = recurringTemplate[weekdayIndex(date)] || [{ start: defaultStart, end: defaultEnd, location: "Any served rink" }];
      dayTemplate.forEach((range) => {
        generated.push(
          ...createSlotsFromRange(
            coach.id,
            date,
            minutesFromTime(range.start),
            minutesFromTime(range.end),
            lesson,
            range.location,
            `Recurring ${dayLabels[(weekdayIndex(date) || 7) - 1]} availability: ${range.start}-${range.end}.`,
            false
          )
        );
      });
    }
  });

  [
    { date: addDaysIso(startOfWeekIso(nextWeekdayIso()), -7), start: "07:30", location: "Polar Ice Rink", name: "Emily Zhang", email: "emily@example.com", note: "Past lesson: forward stroking review." },
    { date: addDaysIso(startOfWeekIso(nextWeekdayIso()), -5), start: "10:30", location: "Polar Ice Rink", name: "Noah Kim", email: "noah@example.com", note: "Past lesson: test program run-through." },
    { date: addDaysIso(startOfWeekIso(nextWeekdayIso()), -3), start: "08:00", location: "Arcadia Ice Arena", name: "Ava Patel", email: "ava@example.com", note: "Past lesson: edge quality check." },
    { date: nextWeekdayIso(), start: "07:00", location: "Polar Ice Rink", name: "Emily Zhang", email: "emily@example.com", note: "Working on beginner edges." },
    { date: nextWeekdayIso(), start: "09:30", location: "Arcadia Ice Arena", name: "Emily Zhang", email: "emily@example.com", note: "Wants to review crossovers." },
    { date: addDaysIso(startOfWeekIso(nextWeekdayIso()), 2), start: "14:00", location: "Zoom", name: "Emily Zhang", email: "emily@example.com", note: "Off-ice rotation check." },
    { date: addDaysIso(startOfWeekIso(nextWeekdayIso()), 2), start: "10:30", location: "Polar Ice Rink", name: "Noah Kim", email: "noah@example.com", note: "Preparing for freestyle test." },
    { date: addDaysIso(startOfWeekIso(nextWeekdayIso()), 7), start: "12:30", location: "Oceanside Ice Arena", name: "Noah Kim", email: "noah@example.com", note: "Run-through on bigger ice." },
    { date: addDaysIso(startOfWeekIso(nextWeekdayIso()), 11), start: "08:30", location: "Arcadia Ice Arena", name: "Ava Patel", email: "ava@example.com", note: "Private lesson before competition." },
    { date: addDaysIso(startOfWeekIso(nextWeekdayIso()), 9), start: "14:30", location: "Zoom", name: "Mia Johnson", email: "mia@example.com", note: "Off-ice jump review." },
  ].forEach((booking) => {
    const slot = generated.find((item) => item.coachId === currentCoachId && item.date === booking.date && item.start === booking.start);
    if (!slot) return;
    slot.availabilityLocation = slot.availabilityLocation || getAvailabilityLocation(slot);
    slot.location = booking.location;
    slot.booked = true;
    slot.student = {
      name: booking.name,
      email: booking.email,
      note: booking.note,
    };
  });
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
    availabilityLocation: location,
    note,
    lessonId: lesson.id,
    lessonName: lesson.name,
    lessonDuration: lesson.duration,
    lessonPrice: lesson.price,
    booked: false,
    student: null,
  };
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

var memoryStorage = {};
var lastStorageRecoveryMessage = "";

function storageGetItem(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return Object.prototype.hasOwnProperty.call(memoryStorage, key) ? memoryStorage[key] : null;
  }
}

function storageSetItem(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    memoryStorage[key] = value;
    console.warn("localStorage unavailable; using in-memory storage for this session.", error);
    return false;
  }
}

function storageRemoveItem(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    delete memoryStorage[key];
  }
}

function storageKeys() {
  try {
    return Object.keys(localStorage);
  } catch {
    return Object.keys(memoryStorage);
  }
}

function isQuotaError(error) {
  return (
    error &&
    (error.name === "QuotaExceededError" ||
      error.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
      error.code === 22 ||
      error.code === 1014)
  );
}

function cleanupLegacyAppStorage() {
  const keepKeys = new Set([slotsStorageKey, profileStorageKey, blockedStorageKey, activeCoachPanelStorageKey, activeStudentPanelStorageKey]);
  const prefixes = [
    "ice-skating-coach-booking-slots-",
    "ice-skating-coach-profiles-",
    "ice-skating-coach-blocked-exceptions-",
  ];

  storageKeys().forEach((key) => {
    if (keepKeys.has(key)) return;
    if (prefixes.some((prefix) => key.startsWith(prefix))) {
      storageRemoveItem(key);
    }
  });
}

function clearOversizedLocalPhotos() {
  let removedCount = 0;
  Object.values(coachProfiles).forEach((profile) => {
    if (profile.photoUrl && profile.photoUrl.startsWith("data:image/")) {
      profile.photoUrl = "";
      removedCount += 1;
    }
  });

  if (!removedCount) return false;

  storageRemoveItem(profileStorageKey);
  storageSetItem(profileStorageKey, JSON.stringify(coachProfiles));
  lastStorageRecoveryMessage = `已清理 ${removedCount} 张过大的本地照片，并保存当前更改。`;
  return true;
}

function loadProfiles() {
  const stored = storageGetItem(profileStorageKey);
  if (!stored) return createDefaultProfiles();

  try {
    const parsed = { ...createDefaultProfiles(), ...JSON.parse(stored) };
    return Object.fromEntries(Object.entries(parsed).map(([coachId, profile]) => [coachId, normalizeProfile({ ...profile, coachId })]));
  } catch {
    return createDefaultProfiles();
  }
}

function loadSlots() {
  const stored = storageGetItem(slotsStorageKey);
  if (!stored) return createDefaultSlots();

  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed)
      ? parsed.map((slot) => ({ ...slot, availabilityLocation: slot.availabilityLocation || slot.location }))
      : createDefaultSlots();
  } catch {
    return createDefaultSlots();
  }
}

function loadBlockedExceptions() {
  const stored = storageGetItem(blockedStorageKey);
  if (!stored) return [];

  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveProfiles() {
  try {
    cleanupLegacyAppStorage();
    const saved = storageSetItem(profileStorageKey, JSON.stringify(coachProfiles));
    if (!saved) {
      lastStorageRecoveryMessage = "浏览器本地存储不可用，本次更改只会保留到刷新前。";
    }
    return true;
  } catch (error) {
    console.error("Failed to save coach profiles.", error);
    return false;
  }
}

function saveSlots() {
  lastStorageRecoveryMessage = "";
  try {
    cleanupLegacyAppStorage();
    const slotsSaved = storageSetItem(slotsStorageKey, JSON.stringify(slots));
    const blocksSaved = storageSetItem(blockedStorageKey, JSON.stringify(blockedExceptions));
    if (!slotsSaved || !blocksSaved) {
      lastStorageRecoveryMessage = "浏览器本地存储不可用，本次更改只会保留到刷新前。";
    }
    return true;
  } catch (error) {
    if (isQuotaError(error)) {
      try {
        cleanupLegacyAppStorage();
        clearOversizedLocalPhotos();
        storageSetItem(slotsStorageKey, JSON.stringify(slots));
        storageSetItem(blockedStorageKey, JSON.stringify(blockedExceptions));
        if (!lastStorageRecoveryMessage) {
          lastStorageRecoveryMessage = "已清理旧版本缓存，并保存当前更改。";
        }
        return true;
      } catch (retryError) {
        console.error("Failed to recover storage space for availability.", retryError);
      }
    }
    console.error("Failed to save availability.", error);
    return false;
  }
}
