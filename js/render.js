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
  elements.studentCoachFilter.innerHTML = coachOptions(true);
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
  const rows = profile.lessonOptions
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
  elements.lessonOptionsList.innerHTML = `
    <div class="lesson-option-header" aria-hidden="true">
      <span>课程名称</span>
      <span>时长（分钟）</span>
      <span>价格</span>
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
      ? `${slot.start}-${slot.end} ${formatLocationLabel(getAvailabilityLocation(slot))}${slot.booked ? ` · 已预约${slot.student?.name ? `：${slot.student.name}` : ""} · ${formatLocationLabel(slot.location)}` : " · 可预约"}${isPast ? " · 已过去" : ""}`
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
