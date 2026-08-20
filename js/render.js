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
    `<option value="Any served rink">${formatLocationLabel("Any served rink")}</option>`,
    ...servedRinks.map((rink) => `<option value="${rink}">${formatLocationLabel(rink)}</option>`),
    `<option value="Zoom">Zoom</option>`,
  ].join("");
}

function concreteLocationOptionsForCoach(coachId) {
  const profile = getProfile(coachId);
  const servedRinks = profile.servedRinks && profile.servedRinks.length ? profile.servedRinks : [profile.homeRink || rinks[0]];
  return [...servedRinks, "Zoom"].map((location) => `<option value="${location}">${formatLocationLabel(location)}</option>`).join("");
}

function populateCoachSelects() {
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
  updateStudentFilterSummaries();
  renderStudentFilterChips();
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
  renderStudentOwnBookings();
  renderStats();
  renderDropdownOpenSlots();
  renderDropdownWeekSlots();
  renderCalendarAvailability();
  renderExceptionCalendarAvailability();
}

function renderStats() {
  const weekStart = startOfWeekIso(todayIso());
  const weekEnd = addDaysIso(weekStart, 7);
  const weeklyCoachSlots = slots.filter((slot) => slot.coachId === currentCoachId && slot.date >= weekStart && slot.date < weekEnd);
  const availableHours = weeklyCoachSlots
    .filter((slot) => !slot.booked && !slotOverlapsBlockedException(slot))
    .reduce((total, slot) => total + (minutesFromTime(slot.end) - minutesFromTime(slot.start)) / 60, 0);
  const bookedCount = weeklyCoachSlots.filter((slot) => slot.booked).length;
  const allBookedCount = slots.filter((slot) => slot.booked).length;
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
  const rows = profile.lessonOptions
    .map((lesson) => {
      const displayName = lesson.name
        .replace("30 min private lesson", "30 分钟私教")
        .replace("60 min private lesson", "60 分钟私教")
        .replace("45 min private lesson", "45 分钟私教");
      return `
        <article class="lesson-option-row" data-lesson-id="${lesson.id}">
          <input class="lesson-name-input" type="text" value="${displayName}" aria-label="课程名称" />
          <input class="lesson-duration-input" type="number" min="15" step="15" value="${lesson.duration}" aria-label="Lesson duration" />
          <input class="lesson-price-input" type="number" min="0" step="5" value="${lesson.price}" aria-label="Lesson price" />
          <button class="danger-button" type="button" data-action="remove-lesson" aria-label="删除课程">•••</button>
        </article>
      `;
    })
    .join("");
  elements.lessonOptionsList.innerHTML = `
    <div class="lesson-option-header" aria-hidden="true">
      <span>课程名称</span>
      <span>时长</span>
      <span>学生支付</span>
      <span>操作</span>
    </div>
    ${rows}
  `;
}

function setCoachPhotoPreview(photoUrl) {
  const coach = getCoach(currentCoachId);
  if (photoUrl) {
    elements.coachPhotoPreview.textContent = "";
    elements.coachPhotoPreview.style.backgroundImage = `url("${photoUrl}")`;
    return;
  }

  elements.coachPhotoPreview.style.backgroundImage = "";
  elements.coachPhotoPreview.textContent = coach.name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2);
}

function syncPhotoForm() {
  const profile = getProfile(currentCoachId);
  elements.coachPhotoUrl.value = profile.photoUrl || "";
  elements.coachPhotoFile.value = "";
  pendingPhotoDataUrl = "";
  setCoachPhotoPreview(profile.photoUrl);
}

function handlePhotoFileChange() {
  const file = elements.coachPhotoFile.files && elements.coachPhotoFile.files[0];
  if (!file) {
    pendingPhotoDataUrl = "";
    setCoachPhotoPreview(elements.coachPhotoUrl.value.trim() || getProfile(currentCoachId).photoUrl);
    return;
  }
  if (!file.type.startsWith("image/")) {
    elements.photoMessage.textContent = "请选择图片文件。";
    elements.photoMessage.style.color = "var(--red)";
    elements.coachPhotoFile.value = "";
    return;
  }

  readResizedImage(file)
    .then((dataUrl) => {
      pendingPhotoDataUrl = dataUrl;
      elements.coachPhotoUrl.value = "";
      setCoachPhotoPreview(pendingPhotoDataUrl);
      elements.photoMessage.textContent = "已选择本地照片，记得保存。";
      elements.photoMessage.style.color = "var(--green)";
    })
    .catch(() => {
      elements.photoMessage.textContent = "照片读取失败，请换一张图片。";
      elements.photoMessage.style.color = "var(--red)";
      elements.coachPhotoFile.value = "";
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

function syncLocationOptions() {
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

function renderCalendarRinkOptions() {
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

function getRinkColor(location) {
  return rinkColors[location] || "#bbf7d0";
}

function formatLocationLabel(location) {
  if (location === "Any served rink") return "不限冰场";
  if (location === unavailableSelection) return "不可预约";
  return location;
}

function getAvailabilityLocation(slot) {
  return slot?.availabilityLocation || slot?.location || unavailableSelection;
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

function renderCoachSlots() {
  const visible = slots.filter((slot) => slot.booked && slot.coachId === currentCoachId);

  if (!visible.length) {
    elements.coachSlots.innerHTML = `<p class="empty-state">目前还没有学生预约。学生 book 之后会显示在这里。</p>`;
    return;
  }

  const groupedByStudent = visible.reduce((groups, slot) => {
    const studentName = slot.student?.name || "Student";
    const studentEmail = slot.student?.email || "";
    const key = `${studentName.toLowerCase()}|${studentEmail.toLowerCase()}`;
    if (!groups.has(key)) {
      groups.set(key, {
        name: studentName,
        email: studentEmail,
        slots: [],
      });
    }
    groups.get(key).slots.push(slot);
    return groups;
  }, new Map());

  const studentGroups = Array.from(groupedByStudent.values()).sort((a, b) => {
    return `${a.name}${a.email}`.localeCompare(`${b.name}${b.email}`);
  });

  elements.coachSlots.innerHTML = studentGroups.map(renderStudentBookingGroup).join("");
}

function renderStudentBookingGroup(group) {
  const slotsByLocation = group.slots.reduce((locations, slot) => {
    if (!locations.has(slot.location)) locations.set(slot.location, []);
    locations.get(slot.location).push(slot);
    return locations;
  }, new Map());

  const locationGroups = Array.from(slotsByLocation.entries()).sort(([locationA], [locationB]) => locationA.localeCompare(locationB));
  const totalLessons = group.slots.length;

  return `
    <details class="student-booking-group" open>
      <summary>
        <div>
          <strong>${group.name}</strong>
          <span>${group.email || "No email"}</span>
        </div>
        <span class="pill">${totalLessons} lesson${totalLessons === 1 ? "" : "s"}</span>
      </summary>
      <div class="student-booking-locations">
        ${locationGroups
          .map(([location, locationSlots]) => {
            const sortedSlots = [...locationSlots].sort(slotSort);
            return `
              <section class="student-booking-location" style="--booking-location-color:${getRinkColor(location)}; --booking-location-booked-color:${getBookedRinkColor(location)}">
                <h4><i class="booking-location-dot" aria-hidden="true"></i>${location}</h4>
                <div class="booking-row-list">
                  ${sortedSlots.map(renderStudentBookingRow).join("")}
                </div>
              </section>
            `;
          })
          .join("")}
      </div>
    </details>
  `;
}

function renderStudentBookingRow(slot) {
  return `
    <article class="student-booking-row" style="--booking-location-color:${getRinkColor(slot.location)}; --booking-location-booked-color:${getBookedRinkColor(slot.location)}">
      <i class="booking-location-mark" aria-hidden="true"></i>
      <div>
        <strong>${formatDate(slot.date)} · ${slot.start} - ${slot.end}</strong>
        <span>${slot.lessonName || "Private lesson"} · ${slot.lessonDuration || ""} min · $${slot.lessonPrice}</span>
        ${slot.student?.note ? `<span>${slot.student.note}</span>` : ""}
      </div>
    </article>
  `;
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

function renderDropdownWeekSlots() {
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

function renderStudentSlots() {
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
  const selectedDate = studentSelectedDate || elements.studentDateFilter.value || nextWeekdayIso();
  const weekStart = startOfWeekIso(selectedDate);
  const weekEnd = addDaysIso(weekStart, 7);
  const available = slots.filter((slot) => {
    const coachMatches = selectedCoaches.has(slot.coachId);
    const rinkMatches = studentRinkMatches(slot, selectedRinks);
    const dateMatches = slot.date >= weekStart && slot.date < weekEnd;
    return !slot.booked && !slotOverlapsBlockedException(slot) && coachMatches && rinkMatches && dateMatches && getFittingLessonOptionsForStart(slot, selectedDuration).length > 0;
  });

  elements.studentDateFilter.value = selectedDate;
  renderStudentDatePendingState();
  renderStudentViewDateRange(selectedDate, weekStart);
  renderStudentDayAvailability(getStudentAvailableSlotsForDate(selectedDate, selectedCoaches, selectedRinks, selectedDuration));
  if (studentViewMode === "day") {
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
  return slots
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

function getSelectedStudentLessonDuration() {
  const value = elements.studentLessonDurationFilter?.value || "all";
  return value === "all" ? null : Number(value);
}

function getStudentLessonOptionsForCoach(coachId) {
  const profile = getProfile(coachId);
  return (Array.isArray(profile.lessonOptions) && profile.lessonOptions.length ? profile.lessonOptions : createDefaultLessonOptions(Number(profile.rate || 0)))
    .filter((lesson) => Number(lesson.duration) > 0)
    .sort((a, b) => Number(a.duration) - Number(b.duration));
}

function getFittingLessonOptionsForStart(slot, selectedDuration = null) {
  return getStudentLessonOptionsForCoach(slot.coachId).filter((lesson) => {
    const duration = Number(lesson.duration);
    return (!selectedDuration || duration === selectedDuration) && canFitLessonFromSlot(slot, duration);
  });
}

function canFitLessonFromSlot(startSlot, duration) {
  const startMinutes = minutesFromTime(startSlot.start);
  const endMinutes = startMinutes + Number(duration);
  const availabilityLocation = getAvailabilityLocation(startSlot);
  if (!Number.isFinite(endMinutes) || endMinutes > minutesFromTime(fullDayEnd)) return false;

  for (let minutes = startMinutes; minutes < endMinutes; minutes += calendarStep) {
    const coveringSlot = slots.find((slot) => {
      return (
        slot.coachId === startSlot.coachId &&
        slot.date === startSlot.date &&
        !slot.booked &&
        !slotOverlapsBlockedException(slot) &&
        getAvailabilityLocation(slot) === availabilityLocation &&
        minutesFromTime(slot.start) <= minutes &&
        minutesFromTime(slot.end) >= Math.min(minutes + calendarStep, endMinutes)
      );
    });
    if (!coveringSlot) return false;
  }

  return true;
}

function renderStudentDayAvailability(daySlots) {
  if (!elements.studentDayAvailability) return;

  renderStudentViewModeButtons();
  elements.studentDayAvailability.classList.toggle("is-hidden", !studentHasFullAccess || studentViewMode !== "day");

  if (!studentHasFullAccess || studentViewMode !== "day") {
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
    const isActive = button.dataset.viewMode === studentViewMode;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

function renderStudentViewDateRange(selectedDate, weekStart = startOfWeekIso(selectedDate)) {
  if (!elements.studentViewDateRange) return;
  const text = studentViewMode === "week"
    ? `${formatDate(weekStart)} - ${formatDate(addDaysIso(weekStart, 6))}`
    : formatDate(selectedDate);
  elements.studentViewDateRange.textContent = text;
}

function renderStudentDatePendingState() {
  if (!elements.studentDateFilter) return;
  const hasPendingDate = Boolean(studentSelectedDate && elements.studentDateFilter.value && elements.studentDateFilter.value !== studentSelectedDate);
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

function updateStudentFilterSummaries() {
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

function renderStudentFilterChips() {
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
        .map((input) => `<button class="student-filter-chip" type="button" data-action="remove-student-filter" data-filter-name="${name}" data-filter-value="${input.value}">${input.closest("label")?.textContent.trim()} <span aria-hidden="true">×</span></button>`)
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

function renderStudentOwnBookings() {
  if (!elements.studentOwnBookings) return;

  if (!studentHasFullAccess) {
    elements.studentOwnBookings.innerHTML = `
      <p class="empty-state">登录 / 注册后可以查看自己的预约记录。</p>
      <a class="primary-button public-login-link" href="login/index.html">登录 / 注册</a>
    `;
    return;
  }

  const bookings = slots
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

function isPastStudentBooking(slot) {
  return new Date(`${slot.date}T${slot.end}`) < new Date();
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
        <strong>${formatDate(slot.date)} · ${slot.start}-${slot.end}</strong>
        <span>${coach.name} · ${formatLocationLabel(slot.location)}</span>
      </div>
      <div class="student-mini-booking-actions">
        <small>$${slot.lessonPrice}</small>
        ${
          isCompleted
            ? ""
            : `
              <button class="ghost-button" type="button" data-action="modify-student-booking" data-id="${slot.id}">修改</button>
              <button class="danger-button" type="button" data-action="cancel-student-booking" data-id="${slot.id}">取消</button>
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
    const hasOpenSlot = slots.some((slot) => {
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
    ? `可去其他冰场 · 附加费 $${profile.travelFee || 0}`
    : `可授课冰场：${(profile.servedRinks || [profile.homeRink]).map(formatLocationLabel).join(", ")} 或 Zoom`;

  return `
    <article class="slot-card">
      <div class="slot-top">
        <div>
          <div class="slot-time">${slot.start} - ${slot.end}</div>
          <div class="slot-meta">${formatDate(slot.date)} · ${slot.location}</div>
        </div>
        <span class="pill">$${slot.lessonPrice}</span>
      </div>
      <p class="slot-note"><strong>${coach.name}</strong> · ${coach.subject}<br>${slot.lessonName || "私教课"} · ${slot.lessonDuration || ""} 分钟<br>${travelText}<br>${slot.note || "可预约一节滑冰私教课。"}</p>
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
    const isRecurringEdit = unsavedRecurringCellKeys.has(cellKey(date, minutes));
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
    delete cell.dataset.slotId;
    cell.style.removeProperty("--rink-color");
    cell.style.removeProperty("--booked-rink-color");
    if (slot && !block) {
      cell.style.setProperty("--rink-color", getRinkColor(slot.location));
      cell.style.setProperty("--booked-rink-color", getBookedRinkColor(slot.location));
    }
    cell.classList.toggle("has-slot", Boolean(slot && !block));
    cell.classList.toggle("has-booking", Boolean(slot && slot.booked));
    if (slot && slot.booked && !block) {
      cell.dataset.slotId = slot.id;
    }
    cell.classList.toggle("has-blocked", !slot || Boolean(block));
    cell.classList.toggle("is-editing", isUnsavedBlock);
    cell.classList.toggle("booking-start", isBookingStart);
    if (isBookingStart) {
      cell.innerHTML = `<span class="calendar-cell-label">${studentName}</span>`;
    }
    cell.title = block ? `${block.start}-${block.end} 不可预约` : slot ? `${slot.start}-${slot.end} ${formatLocationLabel(slot.location)}${studentName ? ` · ${studentName}` : ""}` : "不可预约";
    cell.setAttribute("aria-label", cell.title);
  });
}
