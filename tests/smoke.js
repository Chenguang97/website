const fs = require("fs");
const path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function calendarMenuLabel(node) { return node.querySelector('.coach-open-menu-label')?.textContent || node.textContent; }

const testPages = new Set();
async function loadPage(fileName, options = {}) {
  const [filePathPart, query = ""] = fileName.split("?");
  const filePath = path.resolve(filePathPart);
  let html = fs.readFileSync(filePath, "utf8");
  const { build } = await import("./fixtures/owner-build.mjs");
  for (const match of [...html.matchAll(/<script\s+type="module"\s+src="([^"]+)"\s*><\/script>/g)]) {
    const source = match[1];
    const entryPoint = path.resolve(path.dirname(filePath), source.split("?")[0]);
    const isAppEntry = /(?:admin|coach|student)-entry\.js$/.test(entryPoint);
    const testBridge = isAppEntry ? `
      import ${JSON.stringify(entryPoint)};
      import { readProfileState, replaceCoachProfileDraft } from ${JSON.stringify(path.resolve("js/core/state.js"))};
      Object.assign(globalThis, { readProfileState, replaceCoachProfileDraft });
      import { fixture, readScheduleState, publishAvailabilityDraft, publishBookingRequests, publishCoachProfileDraft, setSchedulingConfig, getSchedulingConfig } from ${JSON.stringify(path.resolve("js/core/state.js"))};
      import { createSchedulingConfig } from ${JSON.stringify(path.resolve("js/domain/scheduling-config.mjs"))};
      import { acceptCoachBookingRequest } from ${JSON.stringify(path.resolve("js/core/booking-requests.js"))};
      import { cancelBooking } from ${JSON.stringify(path.resolve("js/core/bookings.js"))};
      import { resetSchedulingSettingsEditor as renderSchedulingSettings } from ${JSON.stringify(path.resolve("js/coach/availability/planner-render.js"))};
      import { openBookingDetails } from ${JSON.stringify(path.resolve("js/ui/booking-details.js"))};
      import { openBookingDialog, openModifyBookingDialog, syncBookingForSelf } from ${JSON.stringify(path.resolve("js/student/booking-actions.js"))};
      import { formatCoachWelcome } from ${JSON.stringify(path.resolve("js/coach/welcome.js"))};
      import { renderCoachPage } from ${JSON.stringify(path.resolve("js/coach/render.js"))};
      import { renderDragCalendar } from ${JSON.stringify(path.resolve("js/coach/availability/render.js"))};
      import { renderExceptionDragCalendar } from ${JSON.stringify(path.resolve("js/coach/bookings/calendar-render.js"))};
      import { renderStudentPage } from ${JSON.stringify(path.resolve("js/student/render.js"))};
      import { renderStudentOwnBookings } from ${JSON.stringify(path.resolve("js/student/history-render.js"))};
      import { undoAvailabilityChange } from ${JSON.stringify(path.resolve("js/coach/availability/undo.js"))};
      import { captureAvailabilitySnapshot as captureAvailabilityUndoState, recordAvailabilityUndo as pushAvailabilityUndoState } from ${JSON.stringify(path.resolve("js/core/state.js"))};
      import { shiftScheduleWeek } from ${JSON.stringify(path.resolve("js/coach/bookings/actions.js"))};
      import { prepareCoachBookingCancellation } from ${JSON.stringify(path.resolve("js/coach/bookings/details-actions.js"))};
      import { getCoachBookingStudentKey } from ${JSON.stringify(path.resolve("js/coach/bookings/student-identity.js"))};
      import { receiveCoachBookingRequests as renderCoachBookingRequests } from ${JSON.stringify(path.resolve("js/coach/bookings/request-editor.js"))};
      import { synchronizeBookingRequestConflictsResult, synchronizeExpiredBookingRequestsResult } from ${JSON.stringify(path.resolve("js/core/booking-requests.js"))};
      import { ensureLocationChangeDemoBookings } from ${JSON.stringify(path.resolve("js/core/demo-data.js"))};
      import { addDaysIso, minutesFromTime, nextWeekdayIso, startOfWeekIso, todayIso, weekdayIndex } from ${JSON.stringify(path.resolve("js/core/utils-data.js"))};
      // Fixture replacement establishes published facts; editor changes use real UI actions.
      const replaceSlots = (slots) => { fixture.installDraftSlots(slots); publishAvailabilityDraft(); };
      Object.defineProperty(globalThis, "slots", { configurable: true, get: () => fixture.inspect().slots, set: replaceSlots });
      Object.defineProperty(globalThis, "blockedExceptions", { configurable: true, get: () => fixture.inspect().blockedExceptions, set: fixture.installDraftBlocked });
      Object.defineProperty(globalThis, "bookingRequests", { configurable: true, get: () => fixture.inspect().bookingRequests, set: fixture.installRequests });
      Object.defineProperty(globalThis, "hasUnsavedProfileChanges", { configurable: true, get: () => fixture.inspect().hasUnsavedProfileChanges });
      const render = () => document.body.dataset.page === "coach" ? renderCoachPage() : renderStudentPage();
      Object.assign(globalThis, {
        formatCoachWelcome, addDaysIso, readProfileState, publishCoachProfileDraft, nextWeekdayIso, openBookingDetails, openBookingDialog,
        openModifyBookingDialog, render, renderCoachBookingRequests, renderDragCalendar, renderExceptionDragCalendar,
        getCoachBookingStudentKey, minutesFromTime, renderStudentOwnBookings, replaceSlots,
        captureAvailabilityUndoState, prepareCoachBookingCancellation, shiftScheduleWeek, startOfWeekIso,
        syncBookingForSelf, synchronizeBookingRequestConflictsResult, synchronizeExpiredBookingRequestsResult, ensureLocationChangeDemoBookings, todayIso, weekdayIndex,
        createSchedulingConfig, setSchedulingConfig, getSchedulingConfig, publishAvailabilityDraft, publishBookingRequests, renderSchedulingSettings, acceptCoachBookingRequest,
        cancelBooking, pushAvailabilityUndoState, undoAvailabilityChange,
        setTestAvailabilityDraft: fixture.installDraftSlots,
        getTestPublishedSchedule: () => JSON.parse(JSON.stringify({ slots: fixture.inspect().publishedSlots, planning: fixture.inspect().publishedScheduling })),
      });
    ` : `import ${JSON.stringify(entryPoint)};`;
    const bundled = (await build({
      stdin: {
        contents: testBridge,
        resolveDir: path.dirname(entryPoint),
        sourcefile: "smoke-test-entry.js",
      },
      bundle: true,
      format: "iife",
      platform: "browser",
      write: false,
    })).outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
    html = html.replace(match[0], () => `<script>${bundled}</script>`);
  }
  const errors = [];
  const virtualConsole = new VirtualConsole();

  virtualConsole.on("error", (message) => errors.push(String(message)));
  virtualConsole.on("jsdomError", (error) => {
    const message = error.stack || error.message;
    if (!String(message).includes("Could not parse CSS stylesheet")) {
      errors.push(message);
    }
  });

  const dom = new JSDOM(html, {
    url: `file://${filePath}${query ? `?${query}` : ""}`,
    runScripts: "dangerously",
    resources: "usable",
    pretendToBeVisual: true,
    virtualConsole,
    beforeParse(window) {
      if (options.now) {
        const NativeDate = window.Date;
        window.Date = class extends NativeDate {
          constructor(...args) { super(...(args.length ? args : [options.now])); }
          static now() { return new NativeDate(options.now).getTime(); }
        };
      }
      const storage = { ...(options.localStorage || {}) };
      Object.defineProperty(window, "localStorage", {
        value: {
          getItem(key) {
            return Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : null;
          },
          setItem(key, value) {
            storage[key] = String(value);
          },
          removeItem(key) {
            delete storage[key];
          },
          key(index) {
            return Object.keys(storage)[index] || null;
          },
          get length() {
            return Object.keys(storage).length;
          },
        },
      });
      if (window.HTMLDialogElement) {
        window.HTMLDialogElement.prototype.showModal = function showModal() {
          this.open = true;
        };
        window.HTMLDialogElement.prototype.close = function close() {
          this.open = false;
        };
      }
      window.HTMLElement.prototype.scrollIntoView = () => {};
      window.confirm = () => true;
    },
  });

  testPages.add(dom);
  await new Promise((resolve) => setTimeout(resolve, 900));
  return { dom, errors };
}

function dumpLocalStorage(window) {
  return Array.from({ length: window.localStorage.length }).reduce((entries, _, index) => {
    const key = window.localStorage.key(index);
    entries[key] = window.localStorage.getItem(key);
    return entries;
  }, {});
}

function submit(form) {
  form.dispatchEvent(new form.ownerDocument.defaultView.Event("submit", { bubbles: true, cancelable: true }));
}

function nextWeekdayByIndex(window, weekday) {
  let date = window.todayIso(1);
  while (window.weekdayIndex(date) !== weekday) {
    date = window.addDaysIso(date, 1);
  }
  return date;
}

function assertNoRuntimeErrors(fileName, errors) {
  assert(errors.length === 0, `${fileName} runtime errors:\n${errors.join("\n")}`);
}

async function testLandingPage() {
  const { dom, errors } = await loadPage("index.html");
  const { document } = dom.window;

  assertNoRuntimeErrors("index.html", errors);
  assert(!document.querySelector('a[href^="admin"]'), "Landing page should not expose an admin link.");
  assert(document.querySelector('a[href="coach/login/index.html"]'), "Landing page is missing the coach login link.");
  assert(document.querySelector('a[href="student/login/index.html"]'), "Landing page is missing the student login link.");
  const coachEntryIcon = document.querySelector('a[href="coach/login/index.html"] .check-icon svg');
  assert(coachEntryIcon?.querySelector("rect") && coachEntryIcon.querySelector("path")?.getAttribute("d") === "m7.5 12.25 3 3 6-6", "The coach entry is missing its centered complete check icon.");
  assert(!document.querySelector(".view"), "Landing page should not render the full app views.");
}

async function testLoginPages() {
  const coachLogin = await loadPage("coach/login/index.html");
  const studentLogin = await loadPage("student/login/index.html");

  assertNoRuntimeErrors("coach/login/index.html", coachLogin.errors);
  assertNoRuntimeErrors("student/login/index.html", studentLogin.errors);
  assert(coachLogin.dom.window.document.querySelector('a[href="../index.html"]'), "Coach login page is missing the demo dashboard link.");
  assert(coachLogin.dom.window.document.body.textContent.includes("申请教练账号"), "Coach login page is missing the coach account request action.");
  assert(studentLogin.dom.window.document.querySelector('a.public-preview-button[href="../index.html?view=public"]'), "Student login must link explicitly to the public-only timetable.");
  assert(studentLogin.dom.window.document.querySelector('a[href="../index.html?access=full"]'), "Student login page is missing the full-access booking link.");
}

async function testAdminPage() {
  const { dom, errors } = await loadPage("admin/index.html");
  const { document } = dom.window;

  assertNoRuntimeErrors("admin/index.html", errors);
  assert(document.querySelector(".view.active")?.id === "adminView", "Admin page did not open on the admin view.");
  assert(document.querySelector(".role-page-nav")?.textContent.includes("管理员页面"), "Admin page navigation label is missing.");
  assert(document.querySelectorAll(".admin-card").length === 3, "Admin dashboard cards did not render.");
}

async function testCoachPage() {
  const { dom, errors } = await loadPage("coach/index.html");
  const { document } = dom.window;
  const window = dom.window;

  assertNoRuntimeErrors("coach/index.html", errors);
  assert(document.querySelector(".view.active")?.id === "coachView", "Coach page did not open on the coach view.");
  assert(document.querySelector('.coach-global-home[href="../index.html"]')?.textContent === "切换入口" && document.querySelectorAll(".coach-global-home svg rect").length === 4 && !document.querySelector(".coach-header-identity a"), "Portal switching must keep its destination and use an independent four-grid tool entry.");
  assert(document.querySelectorAll('.coach-global-home svg').length === 1 && !document.querySelector('.coach-portal-arrow'), "The global entry must retain just its four-grid icon without adding an arrow.");
  assert(document.querySelector("#coachHeading")?.textContent === dom.window.formatCoachWelcome("Maya Chen", new Date().getHours()), "Coach welcome must greet the current account using local time.");
  for (const [hour, greeting] of [[0, "Good evening"], [4, "Good evening"], [5, "Good morning"], [11, "Good morning"], [12, "Good afternoon"], [17, "Good afternoon"], [18, "Good evening"], [23, "Good evening"]]) {
    assert(dom.window.formatCoachWelcome("小明", hour) === `${greeting}, 小明!`, `Wrong greeting at ${hour}:00.`);
  }
  const profile = dom.window.readProfileState("maya").saved;
  dom.window.publishCoachProfileDraft("maya", { ...profile, name: "Taylor Lee" }); dom.window.dispatchEvent(new dom.window.Event("focus"));
  assert(document.getElementById("coachHeading").textContent === dom.window.formatCoachWelcome("Taylor Lee", new Date().getHours()), "Welcome must read the current saved profile name.");
  dom.window.publishCoachProfileDraft("maya", profile);
  dom.window.dispatchEvent(new dom.window.Event("focus"));
  assert(document.querySelector(".coach-header-identity img")?.getAttribute("src") === "../assets/snowball-welcome.png", "Welcome must use the approved snowball image.");
  assert(!document.querySelector('#addCoachScheduleLock, #coachPlanningLockDialog, [data-planner-action="new-lock"], [data-planner-action="edit-lock"], [data-planner-action="unlock"]') && !document.getElementById('coachSchedulerConfig').textContent.includes('锁定安排'), "Lock settings, dialogs and actions must not be offered in this version.");
  assert(document.getElementById('generateCoachSchedule') && document.getElementById('coachSchedulePreview'), "Removing locks must preserve generation and explicit preview application.");
  assert(!document.body.textContent.includes("更新学生在预约页面看到的信息"), "The profile-only subtitle remained on the coach workspace.");
  const workspaceContainer = document.querySelector(".coach-workspace-container");
  assert(document.querySelector(".coach-global-home")?.parentElement === workspaceContainer && workspaceContainer.contains(document.querySelector("#coachView")), "The home entry must anchor to the common frame outside the content view.");

  document.querySelector('[data-coach-panel="bookingsPanel"]').click();
  assert(
    document.querySelector(".coach-panel.active")?.dataset.coachContent === "bookingsPanel",
    "Schedule tab did not activate.",
  );
  assert(document.querySelectorAll("#exceptionDragCalendar .calendar-cell").length > 0, "Schedule calendar did not render cells.");

  const liquid = document.querySelector(".booking-view-switch .booking-view-liquid");
  const liquidPath = liquid?.querySelector("path");
  assert(liquidPath?.getAttribute("d") && liquid.querySelectorAll("ellipse").length === 3, "Coach page must mount the confirmed liquid, including its trailing droplets.");
  const settledLiquid = liquidPath.getAttribute("d");
  document.querySelector('[data-booking-section="bookingListSection"]').click();
  assert(document.querySelector("#bookingListSection").classList.contains("active"), "Booking content must switch immediately without waiting for the liquid.");
  await new Promise((resolve) => dom.window.requestAnimationFrame(resolve));
  assert(liquidPath.getAttribute("d") !== settledLiquid, "The real booking-view click handler must advance the liquid outline, not just change the active class.");
  const reversingLiquid = liquidPath.getAttribute("d");
  document.querySelector('[data-booking-section="bookingCalendarSection"]').click();
  assert(liquidPath.getAttribute("d") === reversingLiquid, "Reversing through the real page must retain the currently drawn liquid.");
  assert(document.querySelector("#bookingCalendarSection").classList.contains("active"), "Reversing must restore calendar content immediately.");


  document.querySelector('[data-coach-panel="availabilityPanel"]').click();
  assert(
    document.querySelector(".coach-panel.active")?.dataset.coachContent === "availabilityPanel",
    "Weekly availability tab did not activate.",
  );
  assert(
    document.querySelectorAll(".coach-panel.active").length === 1
      && dom.window.getComputedStyle(document.querySelector('[data-coach-content="bookingsPanel"]')).display === "none",
    "Inactive coach panels must not remain visible below the selected tab.",
  );
  assert(document.querySelectorAll("#calendarRinkOptions .rink-option").length > 0, "Rink options did not render.");
  assert(document.querySelectorAll("#dragCalendar .calendar-cell").length > 0, "Availability calendar did not render cells.");
  for (const panel of ["profilePanel", "bookingsPanel", "availabilityPanel", "bookingsPanel"]) {
    document.querySelector(`[data-coach-panel="${panel}"]`).click();
    assert(document.querySelector("#saveProfileChanges").disabled && document.querySelector("#coachSaveToolbar").hidden === (panel === "bookingsPanel") && document.querySelector(".header-actions").children.length === 1, "The clean editing tabs must show the floating save area; booking management must show only its pending reminder in the header.");
  }
  let viewportWidth = 1700;
  Object.defineProperty(document.documentElement, "clientWidth", { configurable: true, get: () => viewportWidth });
  workspaceContainer.getBoundingClientRect = () => ({ left: 240, right: 1400, width: 1160 });
  const frameStyle = workspaceContainer.getAttribute("style");
  dom.window.dispatchEvent(new dom.window.Event("resize"));
  const saveToolbar = document.querySelector("#coachSaveToolbar");
  assert(saveToolbar.dataset.layout === "side" && Number.parseFloat(saveToolbar.style.getPropertyValue("--coach-save-side-left")) === 1424, "Sufficient right-side space must place save controls 24px beyond the shared card edge.");
  viewportWidth = 1500;
  dom.window.dispatchEvent(new dom.window.Event("resize"));
  assert(saveToolbar.dataset.layout === "bottom" && !saveToolbar.style.getPropertyValue("--coach-save-side-left"), "Insufficient right-side space must restore the bottom fallback without retaining a side offset.");
  assert(dom.window.getComputedStyle(saveToolbar).gridTemplateColumns === "minmax(0, 1fr)", "Desktop controls must stay vertically stacked when side space is insufficient, rather than reverting to the old horizontal bar.");
  viewportWidth = 1700;
  dom.window.dispatchEvent(new dom.window.Event("resize"));
  assert(saveToolbar.dataset.layout === "side" && workspaceContainer.getAttribute("style") === frameStyle, "Growing the window must restore side controls without changing the main frame width or position.");
  dom.window.close();
}

async function testBlockedTimeDialogFlow() {
  const { dom, errors } = await loadPage("coach/index.html");
  const { document } = dom.window;
  document.querySelector('[data-coach-panel="bookingsPanel"]').click();

  const studentTrigger = document.querySelector("#coachBookingStudentTrigger");
  const studentResults = document.querySelector("#coachBookingStudentResults");
  const openButton = document.querySelector("#openBlockDialog");
  const dialog = document.querySelector("#blockDialog");
  const form = document.querySelector("#blockDialogForm");
  const currentWeek = dom.window.startOfWeekIso(dom.window.todayIso());
  document.querySelector("#exceptionCalendarWeekStart").value = currentWeek;
  assert(document.querySelector("#coachSaveToolbar").hidden, "Clean booking management must not display an inactive save area.");
  assert(document.querySelector("#blockRepeatWeekly").parentElement.textContent.includes("每周重复") && document.querySelector("#cancelBlockDialog").textContent === "取消" && form.querySelector('button[type="submit"]').textContent === "添加不可预约时间" && form.querySelector('button[type="submit"]').classList.contains("primary-button"), "Blocked-time setup must use the standard primary action and an explicit action label.");
  openButton.click();
  assert(document.querySelector("#blockDialogDate").value === dom.window.todayIso(), "Opening blocked-time setup for the current week must default to today.");
  const dialogEscape = new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
  document.querySelector("#blockDialogDate").dispatchEvent(dialogEscape);
  assert(!dialogEscape.defaultPrevented, "A closed student picker must not intercept Escape from the modal dialog.");
  document.querySelector("#blockDialogDate").value = "";
  submit(form);
  assert(dialog.open && !document.querySelector("#blockDialogDateMessage").hidden && document.querySelector("#blockDialogDate").getAttribute("aria-invalid") === "true" && document.activeElement.id === "blockDialogDate" && document.querySelector("#blockDialogMessage").hidden, "A missing date must keep the dialog open and explain the problem beside the date field.");
  document.querySelector("#blockDialogDate").value = dom.window.todayIso();
  document.querySelector("#blockDialogDate").dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  assert(document.querySelector("#blockDialogDateMessage").hidden && !document.querySelector("#blockDialogDate").hasAttribute("aria-invalid"), "Editing a date must clear stale date errors.");
  const invalidEnd = document.createElement("option");
  invalidEnd.value = "05:30";
  document.querySelector("#blockDialogEnd").append(invalidEnd);
  document.querySelector("#blockDialogEnd").value = "05:30";
  submit(form);
  assert(dialog.open && document.querySelector("#blockDialogMessage").textContent.includes("晚于开始时间") && document.querySelector("#blockDialogEnd").getAttribute("aria-invalid") === "true" && document.activeElement.id === "blockDialogEnd", "An invalid time range must focus and identify the end-time field, without adding a blocked time.");
  document.querySelector("#cancelBlockDialog").click();
  const otherWeek = dom.window.addDaysIso(currentWeek, 7);
  document.querySelector("#exceptionCalendarWeekStart").value = otherWeek;
  openButton.click();
  assert(document.querySelector("#blockDialogDate").value === otherWeek, "Opening blocked-time setup for another week must default to that viewed week.");
  document.querySelector("#blockDialogDate").value = dom.window.addDaysIso(otherWeek, 2);
  assert(document.querySelector("#blockDialogDate").value === dom.window.addDaysIso(otherWeek, 2), "The blocked-time default date must remain editable.");
  document.querySelector("#cancelBlockDialog").click();
  studentTrigger.click();
  assert(!studentResults.hidden, "Student picker did not open for the blocked-time interaction check.");
  openButton.click();
  assert(dialog.open && studentResults.hidden, "Blocked-time dialog must open while safely closing the student picker.");
  document.querySelector("#cancelBlockDialog").click();
  assert(!dialog.open, "Cancelling blocked-time setup must close without changing the draft.");

  const booked = dom.window.slots.find((slot) => slot.coachId === "maya" && slot.booked);
  openButton.click();
  document.querySelector("#blockDialogDate").value = booked.date;
  document.querySelector("#blockDialogStart").value = booked.start;
  document.querySelector("#blockDialogStart").dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  document.querySelector("#blockDialogEnd").value = booked.end;
  submit(form);
  assert(dialog.open && !document.querySelector("#blockDialogMessage").hidden && document.querySelector("#blockDialogMessage").textContent.includes("已有预约冲突"), "Existing appointments must prevent a conflicting blocked time and show an inline reason.");
  assert(document.querySelector("#blockDialogStart").getAttribute("aria-invalid") === "true" && document.querySelector("#blockDialogEnd").getAttribute("aria-invalid") === "true", "Appointment conflicts must mark the affected time range beside its inline explanation.");

  const weekStart = document.querySelector("#exceptionCalendarWeekStart").value;
  const blockDate = dom.window.addDaysIso(weekStart, 6);
  document.querySelector("#blockDialogDate").value = blockDate;
  document.querySelector("#blockDialogStart").value = "14:00";
  document.querySelector("#blockDialogStart").dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  document.querySelector("#blockDialogEnd").value = "14:30";
  submit(form);
  assert(!dialog.open && dom.window.blockedExceptions.some((block) => block.date === blockDate && block.start === "14:00" && block.end === "14:30"), "Valid blocked time must enter the availability draft and close the dialog.");
  assert(document.querySelector('#exceptionDragCalendar [data-day-index="6"][data-minutes="840"]').classList.contains("is-editing"), "New blocked time must appear immediately as an unsaved calendar edit.");
  assert(document.querySelector("#coachBookingActionStatus").textContent.includes("开放时间") && !document.querySelector("#coachBookingActionStatus").hidden, "Appointment view must explain where the blocked-time draft is saved.");

  assert(!document.querySelector("#saveProfileChanges").disabled && !document.querySelector("#coachSaveToolbar").hidden, "Unsaved blocked time must reveal and enable the existing shared save action.");
  document.querySelector("#saveProfileChanges").click();
  assert(document.querySelector("#saveProfileChanges").disabled && document.querySelector("#profileSaveStatus").textContent === "已保存", "The header save must commit the scheduling draft and return to its saved state.");
  const savedStorage = dumpLocalStorage(dom.window);
  const savedSlots = savedStorage["ice-skating-coach-booking-slots-v12"];
  assert(document.querySelector("#availabilitySaveMessage").textContent.includes("已保存"), "Blocked-time draft must use the existing availability save action.");
  assert(JSON.parse(savedSlots).version === 2 && savedSlots.length < 5_000_000, "Availability persistence must use the compact, backward-compatible slot format instead of exceeding browser storage quota.");
  assertNoRuntimeErrors("Blocked-time dialog flow", errors);
  dom.window.close();

  const reloaded = await loadPage("coach/index.html", { localStorage: savedStorage });
  assert(reloaded.dom.window.blockedExceptions.some((block) => block.date === blockDate && block.start === "14:00" && block.end === "14:30"), "Saved blocked time must survive a page reload.");
  assertNoRuntimeErrors("Reloaded blocked-time flow", reloaded.errors);
  reloaded.dom.window.close();
}

async function testStudentPage() {
  const { dom, errors } = await loadPage("student/index.html");
  const { document } = dom.window;

  assertNoRuntimeErrors("student/index.html", errors);
  assert(document.querySelector(".view.active")?.id === "studentView", "Student page did not open on the student view.");
  assert(document.querySelector('.role-page-nav a[href="../index.html"]')?.textContent.includes("返回首页"), "Student page home navigation is missing.");
  assert(!document.querySelector(".sidebar"), "Student page should use the layout without a sidebar.");
  assert(document.querySelectorAll(".student-page-tab").length === 3, "Student page tabs did not render.");
  assert(document.querySelector("#studentControls")?.classList.contains("is-hidden"), "Public student page should hide full filters.");
  assert(document.querySelector("#studentSlots .public-calendar-card"), "Public student calendar did not render.");
  assert(!document.querySelector("#studentSlots").textContent.includes("Maya Chen"), "Public student preview should not show coach names.");
  assert(!document.querySelector('#studentSlots [data-action="book"]'), "Public student preview should not show booking buttons.");
}

async function testPublicCoachProfile() {
  for (const [id, name, lessonCount] of [["maya", "Maya Chen", 3], ["alex", "Alex Rivera", 2], ["sam", "Sam Patel", 2]]) {
    const { dom, errors } = await loadPage(`coach/profile.html?coach=${id}`);
    const document = dom.window.document;
    assertNoRuntimeErrors(`coach/profile.html?coach=${id}`, errors);
    assert(document.querySelector("#coachName").textContent === name, "Public profile displayed the wrong coach.");
    assert(document.querySelectorAll("#publicLessons li").length === lessonCount, "Profile courses do not match existing data.");
    assert(document.querySelector("#dataNote").textContent.includes("示例资料"), "Default data must be labelled as sample data.");
    assert(document.querySelector("#aboutCoach").hidden && document.querySelector("#teachingSpecialties").hidden, "Empty demo biography or specialties must not leave public placeholders.");
    assert(document.querySelector("#coachDisciplines").hidden && !document.querySelector("#coachSkatingExperience") && !document.querySelector("#coachCoachingExperience"), "Removed experience details left public placeholders.");
    assert(!document.querySelector("#coachSubject") && !document.body.textContent.includes("花样滑冰教练"), "The public identity must not fabricate a generic skating discipline.");
    assert(!document.querySelector("#travelNote").textContent.includes("暂未提供"), "Empty travel conditions left a public placeholder.");
    const photoSource = document.querySelector("#coachPhoto").getAttribute("src") || "";
    assert(photoSource.includes(`/assets/coaches/${id === "maya" ? "maya-chen" : id === "alex" ? "alex-rivera" : "sam-patel"}.jpg`), "Default coach profile did not load its demo portrait.");
    const bookingUrl = new URL(document.querySelector("#bookCoach").href);
    assert(bookingUrl.searchParams.get("coach") === id, "Booking link lost the coach selection.");
    assert(!bookingUrl.searchParams.has("access"), "Public profile must not grant full booking access.");
    dom.window.close();
  }
  const savedProfile = { maya: {
    bio: '<img src=x onerror="alert(1)">Saved introduction\nSecond line',
    teachingDisciplines: ["singles", "ice-dance"],
    skatingStartYear: 2010,
    coachingStartYear: 2018,
    specialties: ["edges", "jumps", "unknown"],
    customSpecialties: ["成人零基础", '<img src=x onerror="alert(2)">'],
    selectedCustomSpecialties: ["成人零基础"],
    servedRinks: ["Arcadia Ice Arena"],
    travelsToOtherRinks: true,
    travelConditions: "限市区范围，交通费用另议。",
    lessonOptions: [{ id: "lesson-30", name: "Custom lesson", duration: 30, price: 77 }, { id: "lesson-45", duration: 45, price: null }, { id: "lesson-60", duration: 60, price: 0 }],
    photoUrl: "javascript:alert(1)",
  } };
  const saved = await loadPage("coach/profile.html?coach=maya", { localStorage: { "ice-skating-coach-profiles-v2": JSON.stringify(savedProfile) } });
  assertNoRuntimeErrors("Saved public profile", saved.errors);
  const savedDocument = saved.dom.window.document;
  assert(savedDocument.querySelector("#publicLessons").textContent.includes("77"), "Saved lesson price was not used.");
  assert(savedDocument.querySelector("#publicLessons").textContent.includes("价格待提供"), "Missing price was fabricated.");
  assert(savedDocument.querySelectorAll("#coachRinks li").length === 1, "Saved teaching rinks were not used.");
  assert(savedDocument.querySelector("#coachBio").textContent === savedProfile.maya.bio && !savedDocument.querySelector("#coachBio img"), "Profile text must not execute HTML.");
  assert(!savedDocument.querySelector("#aboutCoach").hidden && !savedDocument.querySelector("#teachingSpecialties").hidden, "Saved biography and specialties were hidden from the public profile.");
  assert(savedDocument.querySelectorAll("#coachSpecialties span").length === 3 && savedDocument.querySelector("#coachSpecialties").textContent.includes("Edges") && savedDocument.querySelector("#coachSpecialties").textContent.includes("成人零基础"), "Saved selected preset and custom specialties were not rendered together.");
  assert(savedDocument.querySelector("#coachDisciplines").textContent === "单人滑、冰舞", "Saved teaching disciplines were not rendered separately in the public identity.");
  assert(!savedDocument.querySelector("#coachSkatingExperience") && !savedDocument.querySelector("#coachCoachingExperience") && !savedDocument.body.textContent.includes("滑冰经历") && !savedDocument.body.textContent.includes("执教经验"), "Saved legacy years were exposed on the public profile.");
  assert(!savedDocument.querySelector("#coachSpecialties").textContent.includes("onerror"), "An unselected custom specialty appeared on the public profile.");
  assert(!savedDocument.querySelector("#coachSpecialties img"), "Custom specialty text executed as HTML on the public profile.");
  assert(savedDocument.querySelector("#travelNote").textContent === "其他冰场授课：可协商。 限市区范围，交通费用另议。", "Public profile did not show the negotiable travel setting and condition text.");
  assert(!savedDocument.querySelector("#coachPhoto").hasAttribute("src"), "Unsafe photo URL must be rejected.");
  saved.dom.window.close();
  const missing = await loadPage("coach/profile.html?coach=unknown");
  assertNoRuntimeErrors("Unknown public coach", missing.errors);
  assert(!missing.dom.window.document.querySelector("#profileError").hidden, "Unknown coach should show a clear error.");
  assert(missing.dom.window.document.querySelector("#profileLayout").hidden, "Unknown coach must not silently show Maya.");
  missing.dom.window.close();

  const login = await loadPage("student/login/index.html?coach=alex");
  assertNoRuntimeErrors("Profile login context", login.errors);
  assert(login.dom.window.document.querySelectorAll("a.auth-button[href]").length > 0, "Explicit demo booking link must retain the profile context.");
  assert(login.dom.window.document.querySelector("[data-auth-submit][type=submit]") && login.dom.window.document.querySelector("input[name=email]") && login.dom.window.document.querySelector("input[name=password]"), "Real login must submit credentials rather than navigate a fake authentication link.");
  for (const link of login.dom.window.document.querySelectorAll("a.auth-button[href]")) {
    assert(new URL(link.href).searchParams.get("coach") === "alex", "Login or signup lost the profile coach.");
  }
  login.dom.window.close();
  const booking = await loadPage("student/index.html?coach=alex&access=full", { localStorage: { "ice-skating-student-active-panel-v1": "studentAccountPanel" } });
  assertNoRuntimeErrors("Profile booking context", booking.errors);
  const bookingDocument = booking.dom.window.document;
  assert(bookingDocument.querySelector('[data-student-content="studentBookPanel"]').classList.contains("active"), "Profile booking must open the booking tab.");
  const checked = [...bookingDocument.querySelectorAll('input[name="studentCoachFilter"]:checked')];
  assert(checked.length === 1 && checked[0].value === "alex", "Profile booking must filter to the chosen coach.");
  assert(bookingDocument.querySelector("#studentCoachChips").textContent.includes("Alex Rivera"), "Chosen coach must be visible in the booking filter.");
  assert(bookingDocument.querySelector('[data-action="choose-time"]'), "Chosen coach must still have selectable booking times.");
  booking.dom.window.close();
  const publicBooking = await loadPage("student/index.html?coach=sam");
  assertNoRuntimeErrors("Public profile calendar context", publicBooking.errors);
  assert(publicBooking.dom.window.document.querySelector("#studentControls").classList.contains("is-hidden"), "Profile entry must preserve public calendar access rules.");
  assert(new URL(publicBooking.dom.window.document.querySelector("#studentLoginPrompt").href).searchParams.get("coach") === "sam", "Public calendar login link lost the coach.");
  publicBooking.dom.window.close();
}

async function testFullStudentPage() {
  const { dom, errors } = await loadPage("student/index.html?access=full");
  const { document } = dom.window;

  assertNoRuntimeErrors("student/index.html?access=full", errors);
  assert(!document.querySelector("#studentControls")?.classList.contains("is-hidden"), "Full student page should show filters.");
  assert(document.querySelectorAll('input[name="studentCoachFilter"]').length > 1, "Full student page should use coach checkbox filters.");
  assert(!document.querySelector("#studentCoachFilter"), "Full student page should not use the old coach dropdown.");
  assert(document.querySelector("#studentCoachChips")?.textContent.includes("全部教练"), "Coach filter chips should summarize selected coaches.");
  assert(document.querySelector("#studentSlots .student-calendar-card"), "Full student booking calendar did not render.");
  assert(document.querySelector('#studentSlots .student-time-option[data-action="choose-time"]'), "Full student page should show selectable calendar time slots.");
  assert(document.querySelector("#studentSlots .student-time-option")?.getAttribute("title").includes("3 位教练"), "Default student calendar should expose all selected coaches in hover details.");
  assert([...document.querySelector("#multiCoachRequestTargets").options].map((option) => option.textContent).join(",") === "Maya Chen,Alex Rivera,Sam Patel", "Multi-coach request options drifted from shared coach data.");
  document.querySelector('input[name="studentCoachFilter"][value="maya"]').click();
  assert(!document.querySelector('input[name="studentCoachFilter"][value="alex"]').checked, "Choosing one coach should narrow the checked coach list.");
  document.querySelector('[data-student-filter-panel="coach"]').click();
  assert(document.querySelector("#studentCoachChips")?.textContent.includes("Maya Chen"), "Coach filter confirmation should show the selected coach chip.");
  assert(
    document.querySelector("#studentSlots .student-time-option")?.getAttribute("title").includes("1 位教练"),
    "Coach filter did not update the calendar coach count in hover details.",
  );
  document.querySelector('input[name="studentCoachFilter"][value="all"]').click();
  assert(document.querySelector('input[name="studentCoachFilter"][value="alex"]').checked, "Choosing all coaches should check every coach.");
  document.querySelector('[data-student-panel="studentBookingsPanel"]').click();
  assert(
    document.querySelector(".student-tab-panel.active")?.dataset.studentContent === "studentBookingsPanel",
    "Student bookings tab did not activate.",
  );
  assert(document.querySelector("#studentOwnBookings")?.textContent.includes("还没有进行的课"), "Student bookings should show upcoming lessons.");
  assert(document.querySelector("#studentOwnBookings")?.textContent.includes("已经上完的课"), "Student bookings should show completed lessons.");
  document.querySelector('[data-student-panel="studentAccountPanel"]').click();
  const accountText = document.querySelector('[data-student-content="studentAccountPanel"]')?.textContent || "";
  assert(accountText.includes("联系方式"), "Student account should include contact information.");
  assert(accountText.includes("滑冰资料"), "Student account should include skating profile information.");
  assert(accountText.includes("预约默认偏好"), "Student account should include booking preferences.");
  assert(accountText.includes("监护人与安全"), "Student account should include guardian and safety information.");
}

async function testDesktopPageContracts() {
  const cases = [
    ["admin/index.html", "adminView", ".app-shell", ["coachView", "studentView"]],
    ["coach/index.html", "coachView", ".coach-app-shell", ["adminView", "studentView"]],
    ["student/index.html", "studentView", ".student-app-shell", ["adminView", "coachView"]],
  ];

  for (const [fileName, activeView, shellSelector, foreignViews] of cases) {
    const { dom, errors } = await loadPage(fileName);
    const { document } = dom.window;
    assertNoRuntimeErrors(`${fileName} desktop contract`, errors);
    assert(document.querySelector(shellSelector), `${fileName} lost its desktop application shell.`);
    assert(document.querySelector(".view.active")?.id === activeView, `${fileName} opened the wrong role view.`);
    foreignViews.forEach((viewId) => assert(!document.getElementById(viewId), `${fileName} still contains the foreign ${viewId} DOM.`));
    assert(document.querySelector('.role-home-link[href="../index.html"]'), `${fileName} lost its home navigation.`);
    assert(!document.documentElement.classList.contains("is-mobile"), `${fileName} unexpectedly entered a mobile-only layout.`);
    dom.window.close();
  }
}

function overviewDate(doc, date) {
  const win = doc.defaultView;
  const field = doc.getElementById('calendarWeekStart');
  field.value = date;
  field.dispatchEvent(new win.Event('change', { bubbles: true }));
  return doc.querySelector(`#dropdownOpenSlots [data-work-day="${date}"]`);
}
function addOverviewRange(doc, date, start, end, location) {
  if (doc.getElementById('coachWorkTimeDialog').open) doc.getElementById('cancelCoachWorkTime').click();
  overviewDate(doc, date).querySelector('[data-planner-action="add-work-range"]').click();
  doc.getElementById('coachWorkTimeStart').value = start;
  doc.getElementById('coachWorkTimeEnd').value = end;
  doc.getElementById('coachWorkTimeLocation').value = location;
  submit(doc.getElementById('coachWorkTimeForm'));
}

async function testAvailabilityConflictActions() {
  const emptyStorage = {
    "ice-skating-coach-booking-slots-v12": "[]",
    "ice-skating-coach-blocked-exceptions-v1": "[]",
  };
  const { dom, errors } = await loadPage("coach/index.html", { localStorage: emptyStorage });
  const win = dom.window;
  const doc = win.document;
  const date = nextWeekdayByIndex(win, 6);
  assertNoRuntimeErrors("coach availability conflict setup", errors);
  doc.querySelector('[data-coach-panel="availabilityPanel"]').click();
  addOverviewRange(doc, date, '12:00', '13:00', 'Polar Ice Rink');

  const beforeConflict = JSON.stringify(win.slots);
  addOverviewRange(doc, date, '12:30', '13:30', 'Arcadia Ice Arena');
  assert(doc.querySelector('#coachWorkTimeMessage').textContent.includes('冲突'), 'Overview overlaps must use the same atomic rejection as the calendar editor.');
  assert(JSON.stringify(win.slots) === beforeConflict, 'A rejected overlap must leave the entire draft unchanged.');
  assertNoRuntimeErrors("coach availability conflict actions", errors);
  dom.window.close();
}

async function testCoachProfileDraftAndSave() {
  const { dom, errors } = await loadPage("coach/index.html");
  const win = dom.window;
  const doc = win.document;
  const originalProfile = JSON.parse(JSON.stringify(win.readProfileState("maya").effective));
  const rinkInput = [...doc.querySelectorAll('input[name="servedRinks"]')].find((input) => input.value !== originalProfile.homeRink);

  assertNoRuntimeErrors("coach profile draft setup", errors);
  assert(doc.querySelectorAll("#saveProfileChanges").length === 1, "Coach profile must have exactly one save button.");
  assert(doc.querySelector("#coachSaveToolbar #saveProfileChanges")?.type === "button" && !doc.querySelector(".coach-action-bar #saveProfileChanges"), "Editing actions must live in the floating area and retain their save dispatch.");
  assert(doc.querySelector("#profileSaveStatus").parentElement.nextElementSibling.id === "previewCoachProfile" && doc.querySelector("#previewCoachProfile").nextElementSibling.id === "saveProfileChanges", "The fixed-width status must sit before preview and save.");
  const previewProfileButton = doc.querySelector("#previewCoachProfile");
  const saveProfileButton = doc.querySelector("#saveProfileChanges");
  const pendingButton = doc.querySelector("#coachPendingTrigger");
  const previewProfileButtonStyle = win.getComputedStyle(previewProfileButton);
  const saveProfileButtonStyle = win.getComputedStyle(saveProfileButton);
  const pendingButtonStyle = win.getComputedStyle(pendingButton);
  assert(previewProfileButton.classList.contains("coach-header-action") && saveProfileButton.classList.contains("coach-header-action"), "Coach preview and save actions must reuse the shared header button geometry.");
  assert(["height", "minHeight", "borderRadius", "fontSize", "fontWeight", "lineHeight", "paddingLeft", "paddingRight"].every((property) => previewProfileButtonStyle[property] === saveProfileButtonStyle[property]), "Coach preview and save actions must have matching dimensions, typography and horizontal padding.");
  assert(pendingButton.querySelector("svg") && !pendingButton.closest("#coachSaveToolbar"), "The pending reminder must retain its inbox icon and independent header placement.");
  assert(previewProfileButton.classList.contains("ghost-button") && saveProfileButton.classList.contains("primary-button"), "Coach header actions must retain secondary preview and primary save hierarchy.");
  assert(doc.querySelectorAll(".coach-action-bar").length === 1 && doc.querySelector("#profileSaveStatus").textContent.trim() === "已保存", "The coach page must expose one initialized welcome action bar.");
  assert(doc.querySelector("#previewCoachProfile").target === "_blank" && doc.querySelector("#previewCoachProfile span").textContent === "预览" && !doc.querySelector("#profilePreviewNote"), "Preview must preserve the editing tab and omit its former permanent second line.");
  let cleanPreviewConfirmations = 0;
  const defaultConfirm = win.confirm;
  win.confirm = () => { cleanPreviewConfirmations++; return true; };
  const cleanPreview = new win.MouseEvent("click", { bubbles: true, cancelable: true });
  doc.querySelector("#previewCoachProfile").dispatchEvent(cleanPreview);
  assert(!cleanPreview.defaultPrevented && cleanPreviewConfirmations === 0, "A clean preview must open its saved destination directly.");
  win.confirm = defaultConfirm;
  assert(!doc.querySelector('[data-coach-panel="photoPanel"]') && !doc.querySelector("#coachPhotoForm"), "Photo editing must not remain as a second profile editor.");
  assert(!doc.querySelector("#coachProfileForm").contains(doc.querySelector("#coachPhotoFile")), "Photo controls must not remain as an always-visible profile form.");
  assert(doc.querySelector("#coachPhotoDialog").contains(doc.querySelector("#coachPhotoFile")), "Photo upload must be contained in the avatar dialog.");
  assert(!doc.body.textContent.includes("编辑公开资料"), "The ambiguous public-profile edit entry was not removed.");
  const profileSections = [...doc.querySelectorAll("#coachProfileForm > section")];
  assert(profileSections[0].classList.contains("profile-photo-panel"), "Personal details must be the first profile section.");
  assert(profileSections[1].classList.contains("teaching-location-panel"), "Teaching locations must follow personal details and photos.");
  assert(profileSections[2].classList.contains("lesson-rate-panel"), "Lesson rates must be the last profile section.");
  assert(profileSections.map((section) => section.querySelector(":scope > .panel-heading h3")?.textContent.trim()).join("|") === "个人资料|授课地点|课程时长和价格", "Profile section titles must share the same heading structure.");
  const personalLayout = doc.querySelector(".profile-personal-layout");
  assert([...personalLayout.children].every((row) => row.classList.contains("profile-form-row")), "Personal details do not use one shared form-row layout.");
  assert(personalLayout.children[0].classList.contains("profile-avatar-row") && personalLayout.children[0].querySelector(":scope > .profile-row-label").textContent.trim() === "头像" && personalLayout.children[0].querySelector(".profile-identity-control > .profile-avatar-action + .profile-identity-copy"), "Avatar and identity are not aligned in the right form column.");
  assert(personalLayout.children[1].querySelector("#coachTeachingDisciplines") && personalLayout.children[1].querySelector(".profile-row-label").textContent.trim() === "教学项目", "Teaching disciplines are not placed after the identity row.");
  assert(personalLayout.children[2].querySelector("label[for='coachBio']").textContent.trim() === "个人介绍" && personalLayout.children[2].querySelector(":scope > .profile-row-control > #coachBio"), "Biography is not placed in the shared form layout.");
  assert(personalLayout.children[3].classList.contains("profile-specialties-field") && personalLayout.children[3].querySelector(".profile-row-label").textContent.trim() === "教学专长" && personalLayout.children[3].querySelector(".profile-row-hint").textContent.trim() === "选填，可多选", "Teaching specialties and helper copy are not placed in the shared form layout.");
  assert(doc.querySelector("#coachBio").rows === 4, "Biography did not retain its resizable four-row initial height.");
  assert(!doc.querySelector("#coachCity") && !doc.querySelector(".profile-city-field"), "The removed city field is still present in the profile editor.");
  assert(!doc.querySelector("#coachBioHint") && !doc.querySelector("#coachBio").hasAttribute("aria-describedby") && doc.querySelector("#coachBio").placeholder === "介绍你擅长帮助哪些学员、通常如何开展教学，也可以分享相关经历。", "The biography field guidance is missing or duplicated.");
  assert(doc.querySelector(".profile-specialties-field").getAttribute("aria-describedby") === "coachSpecialtiesHint", "The specialty helper copy is not associated with the group.");
  assert(!doc.querySelector(".profile-specialties-field").textContent.includes("用刀"), "The edge specialty contains the incorrect blade wording.");
  const locationSections = [...doc.querySelector(".teaching-location-grid").children];
  assert(locationSections[0].classList.contains("profile-field-rinks") && locationSections[1].classList.contains("profile-field-travel"), "Other-rink settings must follow the served-rink list.");
  assert([...doc.querySelectorAll('input[name="servedRinks"]')].map((input) => input.value).join("|") === "Arcadia Ice Arena|Oceanside Ice Arena|Polar Ice Rink", "Teaching rinks must remain in A-Z display order.");
  assert(doc.querySelector('label[for="travelsToOtherRinks"]').textContent.trim() === "接受在其他冰场授课" && !doc.querySelector("#otherRinksHint"), "Other-rink teaching control retained redundant guidance.");
  assert([...doc.querySelector("#travelsToOtherRinks").options].map((option) => option.textContent.trim()).join("|") === "不接受|可协商", "Other-rink willingness is still coupled to an automatic fee choice.");
  assert(doc.querySelector("#travelConditionsLabel").classList.contains("is-hidden") && !doc.querySelector("#travelFee"), "Travel conditions should be optional and hidden until negotiation is selected.");
  assert(!doc.querySelector(".profile-field-rate .field-hint") && !doc.querySelector("#rateCalculationHelp"), "The base-price control retained redundant explanatory copy.");
  assert(!doc.querySelector(".lesson-options-area > .default-note"), "The duplicate always-visible price formula was not removed.");
  assert(doc.querySelectorAll("#coachProfileForm .avatar-preview").length === 1 && !doc.querySelector("#coachProfileForm .mini-avatar"), "The profile layout must not duplicate the coach avatar.");
  assert(doc.querySelector(".profile-photo-panel .profile-identity-copy")?.textContent.includes("Maya Chen"), "Coach identity must stay grouped with the profile photo.");
  assert(!doc.querySelector(".profile-photo-panel").textContent.includes("花样滑冰教练"), "The undifferentiated fixed coach title was not removed from personal details.");
  assert(doc.querySelector(".coach-role-badge")?.textContent.trim() === "教练" && doc.querySelector(".coach-role-badge svg") && !doc.querySelector(".coach-role-badge").textContent.includes("●"), "Coach identity badge is missing or uses an online-status dot.");
  assert(doc.querySelectorAll('#coachTeachingDisciplines input[name="coachTeachingDisciplines"][type="checkbox"]').length === 4, "Teaching discipline checkbox controls are missing.");
  assert(!doc.querySelector("#skatingStartYear") && !doc.querySelector("#coachingStartYear") && !doc.querySelector(".profile-years-row") && !doc.body.textContent.includes("开始滑冰年份") && !doc.body.textContent.includes("开始执教年份"), "Removed start-year controls remain in the profile editor.");
  assert(!doc.querySelector("#coachIdentityDisciplines") && !doc.querySelector("#coachIdentityExperience"), "The editor identity row still duplicates editable project or experience summaries.");
  assert(doc.querySelector("#coachBio") && doc.querySelectorAll('#coachSpecialtyOptions input[name="coachSpecialties"][type="checkbox"]').length === 5, "Biography or shared specialty checkbox controls are missing.");
  assert([...doc.querySelectorAll("#coachSpecialtyOptions .coach-specialty-checkbox")].every((label) => label.tagName === "LABEL" && label.contains(label.querySelector('input[type="checkbox"]'))), "Preset specialty text is not wrapped in a fully clickable checkbox label.");
  assert(doc.querySelector("#customSpecialtyInput").maxLength === 30 && doc.querySelector("#toggleCustomSpecialty").textContent.trim() === "＋ 添加专长" && doc.querySelector("#toggleCustomSpecialty").getAttribute("aria-controls") === "customSpecialtyEditor", "Inline custom specialty controls or length limit are missing.");
  assert([...doc.querySelectorAll(".lesson-option-header span")].map((node) => node.textContent.trim()).join("|") === "课程名称|时长（分钟）|价格（美元）|操作", "Existing lesson columns do not use the required labels.");
  assert(doc.querySelector(".lesson-options-list > .lesson-option-header") && doc.querySelector(".lesson-options-list > #lessonOptionsList") && doc.querySelector(".lesson-options-list > .lesson-add-section"), "The header, existing rows, and add interaction are not integrated into one lesson table.");
  assert(doc.querySelector("#openLessonOptionEditor").textContent.trim() === "＋ 添加课程" && doc.querySelector("#lessonOptionEditor").hidden, "The lesson table did not initialize with the low-emphasis add entry.");
  assert(!doc.querySelector(".lesson-add-card") && !doc.body.textContent.includes("添加课程选项"), "The detached dashed lesson form or duplicate title remains.");
  assert(doc.querySelector(".lesson-option-new-row").children.length === 4 && doc.querySelector(".lesson-option-header").children.length === 4, "The new lesson row does not share the table's four-column structure.");
  assert(!doc.querySelector(".profile-photo-panel .current-coach-card") && !doc.querySelector(".profile-photo-panel .eyebrow"), "The personal profile card retained duplicate nested card or heading chrome.");
  assert(!doc.querySelector(".profile-photo-panel").textContent.includes("展示照片"), "The always-visible photo editor heading was not removed.");
  assert(doc.querySelector("#coachPhotoPreview").style.backgroundImage.includes("/assets/coaches/maya-chen.jpg"), "The coach editor did not load Maya's demo portrait.");
  assert(doc.querySelectorAll("#openCoachPhotoDialog").length === 1 && !doc.querySelector("#openCoachPhotoDialogText"), "The duplicate change-avatar text action was not removed.");
  assert(doc.querySelector("#openCoachPhotoDialog").getAttribute("aria-label") === "更换头像" && doc.querySelector("#openCoachPhotoDialog").title === "更换头像", "The avatar button is missing its accessible name or hover hint.");
  assert(!doc.querySelector("#coachPhotoUrl") && !doc.body.textContent.includes("使用图片链接"), "The removed image-link editor is still present.");

  const photoDialog = doc.querySelector("#coachPhotoDialog");
  const originalPhotoUrl = originalProfile.photoUrl;
  const uploadedPhotoUrl = "data:image/jpeg;base64,dGVzdC1waG90bw==";
  const NativeImage = win.Image;
  const nativeGetContext = win.HTMLCanvasElement.prototype.getContext;
  const nativeToDataUrl = win.HTMLCanvasElement.prototype.toDataURL;
  win.Image = class TestImage {
    constructor() {
      this.listeners = {};
      this.width = 640;
      this.height = 480;
    }
    addEventListener(type, listener) {
      this.listeners[type] = listener;
    }
    removeEventListener(type, listener) {
      if (this.listeners[type] === listener) delete this.listeners[type];
    }
    set src(value) {
      this.value = value;
      this.listeners.load?.();
    }
  };
  win.HTMLCanvasElement.prototype.getContext = () => ({ drawImage() {} });
  win.HTMLCanvasElement.prototype.toDataURL = () => uploadedPhotoUrl;
  const photoFileInput = doc.querySelector("#coachPhotoFile");
  async function selectPhoto(fileName = "coach.png", type = "image/png") {
    Object.defineProperty(photoFileInput, "files", {
      configurable: true,
      value: [new win.File(["photo"], fileName, { type })],
    });
    photoFileInput.dispatchEvent(new win.Event("change", { bubbles: true }));
    assert(doc.querySelector("#confirmCoachPhoto").disabled, "Photo confirmation was enabled while the image was processing.");
    assert(doc.querySelector("#chooseCoachPhoto").disabled && doc.querySelector("#chooseCoachPhoto").textContent === "处理中…", "The file action did not expose its processing state.");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  doc.querySelector("#openCoachPhotoDialog").click();
  assert(photoDialog.open, "The change-avatar text action did not open the photo dialog.");
  assert(doc.activeElement === doc.querySelector("#chooseCoachPhoto"), "Opening the photo dialog did not move focus to its primary control.");
  assert(doc.querySelector("#confirmCoachPhoto").disabled, "The photo dialog allowed confirmation before a valid photo was selected.");
  assert(doc.querySelector("#confirmCoachPhoto").textContent === "确定" && doc.querySelector("#chooseCoachPhoto").textContent === "选择照片", "The compact photo dialog actions have incorrect initial labels.");
  await selectPhoto("not-an-image.txt", "text/plain");
  assert(doc.querySelector("#confirmCoachPhoto").disabled && doc.querySelector("#photoMessage").textContent.includes("图片文件"), "An invalid photo format did not keep confirmation disabled or show an error.");
  await selectPhoto();
  assert(!doc.querySelector("#confirmCoachPhoto").disabled, "A valid uploaded photo did not enable confirmation.");
  assert(doc.querySelector("#chooseCoachPhoto").textContent === "重新选择", "The file action did not change to reselect after a valid upload.");
  assert(doc.querySelector("#photoMessage").textContent === "", "A successful photo selection left an unnecessary persistent message.");
  assert(doc.querySelector("#coachPhotoDialogPreview").style.backgroundImage.includes("data:image/jpeg"), "The uploaded photo was not previewed.");
  doc.querySelector("#cancelCoachPhotoDialog").click();
  assert(!photoDialog.open, "Cancel did not close the photo dialog.");
  assert(win.readProfileState("maya").effective.photoUrl === originalPhotoUrl, "Cancel changed the profile photo draft.");
  assert(doc.activeElement === doc.querySelector("#openCoachPhotoDialog"), "Closing the photo dialog did not restore focus to its opener.");

  doc.querySelector("#openCoachPhotoDialog").click();
  await selectPhoto("escaped.png");
  photoDialog.dispatchEvent(new win.Event("cancel", { cancelable: true }));
  photoDialog.close();
  assert(win.readProfileState("maya").effective.photoUrl === originalPhotoUrl, "Esc cancellation changed the profile photo draft.");
  doc.querySelector("#openCoachPhotoDialog").click();
  assert(doc.querySelector("#confirmCoachPhoto").disabled, "Reopening the photo dialog retained an unconfirmed candidate.");
  assert(doc.querySelector("#chooseCoachPhoto").textContent === "选择照片", "Reopening the photo dialog retained the reselect label.");
  doc.querySelector("#closeCoachPhotoDialog").click();

  doc.querySelector("#openCoachPhotoDialog").click();
  await selectPhoto("confirmed.png");
  doc.querySelector("#confirmCoachPhoto").click();
  assert(win.readProfileState("maya").effective.photoUrl.startsWith("data:image/jpeg"), "Confirming an uploaded photo did not update the profile draft.");
  assert(win.readProfileState("maya").saved.photoUrl === originalPhotoUrl, "Confirming an uploaded photo persisted it before the unified page save.");
  doc.querySelector('[data-coach-panel="bookingsPanel"]').click();
  doc.querySelector('[data-coach-panel="profilePanel"]').click();
  assert(win.readProfileState("maya").effective.photoUrl === originalPhotoUrl, "Discarding an uploaded photo draft changed the saved profile.");
  assert(doc.querySelector("#coachRate").value === "60", "Maya's default base price must be $60 per 30 minutes.");
  assert(doc.querySelector("#coachRate").min === "1" && doc.querySelector("#coachRate").step === "1", "Base price input must accept positive integers in increments of one.");
  assert(doc.querySelector("#coachRate").closest(".money-input").textContent.includes("/30分钟"), "Base price unit must be 30 minutes.");
  win.confirm = () => true;
  doc.querySelector("#coachBio").value = "这段介绍应被放弃。";
  doc.querySelector("#coachBio").dispatchEvent(new win.Event("input", { bubbles: true }));
  doc.querySelector('#coachTeachingDisciplines input[value="pairs"]').click();
  assert(doc.querySelector("#profileSaveStatus").textContent.trim() === "未保存更改", "Editing must show its pending state.");
  const draftBeforePreview = JSON.stringify(win.readProfileState("maya").effective);
  const savedBeforePreview = JSON.stringify(win.readProfileState("maya").saved);
  let previewWarning = "";
  win.confirm = (message) => { previewWarning = message; return false; };
  const cancelledPreview = new win.MouseEvent("click", { bubbles: true, cancelable: true });
  doc.querySelector("#previewCoachProfile").dispatchEvent(cancelledPreview);
  assert(cancelledPreview.defaultPrevented && previewWarning.includes("预览将显示已保存版本，不包含当前未保存修改"), "Cancelling preview with unsaved edits must keep editing after an explicit saved-version warning.");
  win.confirm = () => true;
  const approvedPreview = new win.MouseEvent("click", { bubbles: true, cancelable: true });
  doc.querySelector("#previewCoachProfile").dispatchEvent(approvedPreview);
  assert(!approvedPreview.defaultPrevented && JSON.stringify(win.readProfileState("maya").effective) === draftBeforePreview && JSON.stringify(win.readProfileState("maya").saved) === savedBeforePreview && win.readProfileState("maya").dirty, "Continuing preview must preserve both saved data and the unsaved editing draft without silently saving.");
  const beforeUnload = new win.Event("beforeunload", { cancelable: true });
  win.dispatchEvent(beforeUnload);
  assert(beforeUnload.defaultPrevented, "Leaving with an unsaved profile did not trigger the beforeunload guard.");
  const discardedSpecialty = doc.querySelector('#coachSpecialtyOptions input[value="spins"]');
  discardedSpecialty.closest("label").click();
  assert(discardedSpecialty.checked, "Clicking the preset specialty text did not toggle its square checkbox.");
  assert(win.readProfileState("maya").effective.bio && win.readProfileState("maya").effective.specialties.includes("spins") && win.readProfileState("maya").effective.teachingDisciplines.includes("pairs"), "Personal identity edits did not enter the profile draft.");
  assert(!win.readProfileState("maya").saved.bio && !win.readProfileState("maya").saved.specialties.length && !win.readProfileState("maya").saved.teachingDisciplines.length, "Personal detail edits mutated saved data before submit.");
  doc.querySelector('[data-coach-panel="bookingsPanel"]').click();
  doc.querySelector('[data-coach-panel="profilePanel"]').click();
  assert(doc.querySelector("#coachBio").value === "" && !doc.querySelector('#coachSpecialtyOptions input[value="spins"]').checked && !doc.querySelector('#coachTeachingDisciplines input[value="pairs"]').checked, "Discarding profile edits did not restore biography, disciplines, and specialties.");
  rinkInput.checked = false;
  rinkInput.dispatchEvent(new win.Event("change", { bubbles: true }));
  assert(win.readProfileState("maya").dirty, "Editing teaching rinks did not mark the profile draft as unsaved.");
  assert(JSON.stringify(win.readProfileState("maya").saved) === JSON.stringify(originalProfile), "Editing a profile draft mutated saved profile data before submit.");
  doc.querySelector('[data-coach-panel="bookingsPanel"]').click();
  assert(!win.readProfileState("maya").dirty, "Leaving the profile after confirming discard kept the dirty state.");
  assert(JSON.stringify(win.readProfileState("maya").effective) === JSON.stringify(originalProfile), "Discarding profile edits changed saved profile data.");

  doc.querySelector('[data-coach-panel="profilePanel"]').click();
  const rinkInputs = [...doc.querySelectorAll('input[name="servedRinks"]')];
  rinkInputs.forEach((input) => { input.checked = false; });
  submit(doc.querySelector("#coachProfileForm"));
  assert(doc.querySelector("#profileMessage").textContent.includes("至少选择一个"), "The unified save lost the teaching-rink validation.");
  assert(JSON.stringify(win.readProfileState("maya").saved) === JSON.stringify(originalProfile), "Invalid profile data was saved.");
  rinkInputs.forEach((input) => { input.checked = originalProfile.servedRinks.includes(input.value); });
  doc.querySelector("#coachRate").value = "47.5";
  submit(doc.querySelector("#coachProfileForm"));
  assert(doc.querySelector("#profileMessage").textContent.includes("整数"), "Base price validation accepted a decimal value.");
  assert(JSON.stringify(win.readProfileState("maya").saved) === JSON.stringify(originalProfile), "Invalid base price changed saved profile data.");

  doc.querySelector("#coachRate").value = "55";
  doc.querySelector("#coachRate").dispatchEvent(new win.Event("input", { bubbles: true }));
  const lessonCountBeforeCancel = win.readProfileState("maya").effective.lessonOptions.length;
  doc.querySelector("#openLessonOptionEditor").click();
  assert(!doc.querySelector("#lessonOptionEditor").hidden && doc.querySelector("#openLessonOptionEditor").hidden, "Add lesson did not expand an inline table row.");
  doc.querySelector("#lessonName").value = "不应添加的课程";
  doc.querySelector("#cancelLessonOption").click();
  assert(doc.querySelector("#lessonOptionEditor").hidden && !doc.querySelector("#openLessonOptionEditor").hidden && doc.querySelector("#lessonName").value === "", "Cancel did not clear and collapse the uncommitted lesson row.");
  assert(win.readProfileState("maya").effective.lessonOptions.length === lessonCountBeforeCancel, "Cancel changed the lesson draft collection.");
  doc.querySelector("#openLessonOptionEditor").click();
  doc.querySelector("#addLessonOption").click();
  assert(doc.querySelector("#lessonDurationError").textContent.includes("时长") && doc.querySelector("#lessonPriceError").textContent.includes("价格"), "Missing lesson fields did not show errors beside their inputs.");
  assert(!doc.querySelector("#lessonOptionEditor").hidden, "Validation failure collapsed the new lesson inputs.");
  doc.querySelector("#lessonDuration").value = "45";
  doc.querySelector("#lessonDuration").dispatchEvent(new win.Event("input", { bubbles: true }));
  assert(doc.querySelector("#lessonPrice").value === "82", "New lesson price did not discard the fractional result of 55 × 45 ÷ 30.");
  doc.querySelector("#lessonPrice").value = "82.75";
  doc.querySelector("#lessonPrice").dispatchEvent(new win.Event("input", { bubbles: true }));
  doc.querySelector("#coachRate").value = "56";
  doc.querySelector("#coachRate").dispatchEvent(new win.Event("input", { bubbles: true }));
  assert(doc.querySelector("#lessonPrice").value === "82.75", "Changing the base price overwrote a manually edited lesson price.");
  doc.querySelector("#lessonName").value = "45 分钟测试课";
  doc.querySelector("#addLessonOption").click();
  assert(win.readProfileState("maya").effective.lessonOptions.some((lesson) => lesson.name === "45 分钟测试课" && lesson.price === 82.75), "A manually edited lesson price was not retained.");
  assert(doc.querySelector("#lessonOptionEditor").hidden && !doc.querySelector("#openLessonOptionEditor").hidden, "Successful lesson addition did not restore the table add entry.");
  assert(doc.querySelector("#coachRate").value === "56", "Adding a lesson reset the unsaved base price.");

  const newRate = Number(originalProfile.rate) + 5;
  const newPhotoUrl = uploadedPhotoUrl;
  const savedBio = "多年冰上训练经验。\n注重基础滑行，并根据学生目标调整练习。";
  doc.querySelector("#coachRate").value = String(newRate);
  doc.querySelector("#coachRate").dispatchEvent(new win.Event("input", { bubbles: true }));
  doc.querySelector("#coachBio").value = savedBio;
  doc.querySelector("#coachBio").dispatchEvent(new win.Event("input", { bubbles: true }));
  for (const disciplineId of ["singles", "ice-dance"]) {
    doc.querySelector(`#coachTeachingDisciplines input[value="${disciplineId}"]`).click();
  }
  assert(doc.querySelector(".profile-identity-meta").textContent.trim() === "教练", "Editable identity values were duplicated beside the avatar.");
  for (const specialtyId of ["edges", "footwork"]) {
    doc.querySelector(`#coachSpecialtyOptions input[value="${specialtyId}"]`).closest("label").click();
  }
  doc.querySelector("#toggleCustomSpecialty").click();
  assert(!doc.querySelector("#customSpecialtyEditor").hidden && doc.querySelector("#toggleCustomSpecialty").getAttribute("aria-expanded") === "true", "Custom specialty editor did not expand.");
  doc.querySelector("#customSpecialtyInput").value = "  成人零基础  ";
  doc.querySelector("#customSpecialtyInput").dispatchEvent(new win.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  assert(win.readProfileState("maya").effective.customSpecialties.join("|") === "成人零基础" && doc.querySelector("#coachCustomSpecialties").textContent.includes("成人零基础"), "Enter did not trim and add a custom specialty to the profile draft.");
  assert(win.readProfileState("maya").effective.selectedCustomSpecialties.join("|") === "成人零基础", "New custom specialty was not selected by default.");
  assert(doc.querySelector("#customSpecialtyEditor").hidden && !doc.querySelector("#toggleCustomSpecialty").hidden, "Adding a custom specialty did not collapse the inline editor.");
  assert(doc.querySelector('#coachCustomSpecialties input[data-action="toggle-custom-specialty"]:checked')?.dataset.specialty === "成人零基础", "Custom specialty did not render as the same selected square checkbox control.");
  doc.querySelector("#toggleCustomSpecialty").click();
  doc.querySelector("#customSpecialtyInput").value = "成人零基础";
  doc.querySelector("#addCustomSpecialty").click();
  assert(win.readProfileState("maya").effective.customSpecialties.length === 1 && doc.querySelector("#customSpecialtyMessage").textContent.includes("已存在"), "Duplicate custom specialty was accepted.");
  doc.querySelector("#customSpecialtyInput").value = "冰舞";
  doc.querySelector("#addCustomSpecialty").click();
  const iceDanceInput = doc.querySelector('input[data-action="toggle-custom-specialty"][data-specialty="冰舞"]');
  iceDanceInput.click();
  assert(win.readProfileState("maya").effective.customSpecialties.includes("冰舞") && !win.readProfileState("maya").effective.selectedCustomSpecialties.includes("冰舞") && !iceDanceInput.checked, "Unchecking a custom specialty removed its option instead of only changing selection.");
  iceDanceInput.click();
  doc.querySelector('button[data-action="delete-custom-specialty"][data-specialty="冰舞"]').click();
  assert(!win.readProfileState("maya").effective.customSpecialties.includes("冰舞") && !win.readProfileState("maya").effective.selectedCustomSpecialties.includes("冰舞"), "Custom specialty trash action did not delete the option and selection state.");
  doc.querySelector("#toggleCustomSpecialty").click();
  doc.querySelector("#customSpecialtyInput").value = "待选专长";
  doc.querySelector("#addCustomSpecialty").click();
  doc.querySelector('input[data-action="toggle-custom-specialty"][data-specialty="待选专长"]').click();
  assert(win.readProfileState("maya").effective.customSpecialties.includes("待选专长") && !win.readProfileState("maya").effective.selectedCustomSpecialties.includes("待选专长"), "Unselected custom specialty was not retained in the draft.");
  doc.querySelector("#toggleCustomSpecialty").click();
  doc.querySelector("#customSpecialtyInput").value = "不应添加";
  doc.querySelector("#customSpecialtyInput").dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  assert(doc.querySelector("#customSpecialtyEditor").hidden && !win.readProfileState("maya").effective.customSpecialties.includes("不应添加"), "Escape did not cancel and collapse the custom specialty editor.");
  doc.querySelector("#toggleCustomSpecialty").click();
  doc.querySelector("#customSpecialtyInput").value = "同样不应添加";
  doc.querySelector("#cancelCustomSpecialty").click();
  assert(doc.querySelector("#customSpecialtyEditor").hidden && doc.querySelector("#customSpecialtyInput").value === "", "Cancel did not clear and collapse the custom specialty editor.");
  doc.querySelector("#travelsToOtherRinks").value = "negotiable";
  doc.querySelector("#travelsToOtherRinks").dispatchEvent(new win.Event("change", { bubbles: true }));
  assert(!doc.querySelector("#travelConditionsLabel").classList.contains("is-hidden"), "Negotiable travel selection did not reveal the optional conditions field.");
  doc.querySelector("#travelConditions").value = "限市区范围，交通费用另议。";
  doc.querySelector("#travelConditions").dispatchEvent(new win.Event("input", { bubbles: true }));
  assert(win.readProfileState("maya").effective.travelsToOtherRinks && win.readProfileState("maya").effective.travelConditions.includes("交通费用"), "Travel preference or conditions did not enter the profile draft.");
  doc.querySelector("#openCoachPhotoDialog").click();
  await selectPhoto("saved.png");
  doc.querySelector("#confirmCoachPhoto").click();
  assert(win.readProfileState("maya").effective.photoUrl === newPhotoUrl, "Confirming the photo did not update the profile draft.");
  assert(win.readProfileState("maya").saved.photoUrl === originalPhotoUrl, "Confirming the photo persisted it before the unified page save.");
  assert(doc.querySelector("#saveProfileChanges").classList.contains("has-unsaved"), "The header save button did not show the unsaved state.");
  doc.querySelector("#saveProfileChanges").click();
  assert(win.readProfileState("maya").effective.rate === newRate, "Saving the profile did not update the coach rate.");
  assert(win.readProfileState("maya").effective.basePriceUnitMinutes === 30, "Saving the profile lost the 30-minute pricing marker.");
  assert(win.readProfileState("maya").effective.photoUrl === newPhotoUrl, "The unified profile save did not update the coach photo.");
  assert(win.readProfileState("maya").effective.bio === savedBio && JSON.stringify(win.readProfileState("maya").effective.specialties) === JSON.stringify(["edges", "footwork"]), "The unified profile save did not retain biography and preset specialties.");
  assert(JSON.stringify(win.readProfileState("maya").effective.teachingDisciplines) === JSON.stringify(["singles", "ice-dance"]), "The unified profile save did not retain teaching disciplines.");
  assert(JSON.stringify(win.readProfileState("maya").effective.customSpecialties) === JSON.stringify(["成人零基础", "待选专长"]), "The unified profile save did not retain selected and unselected custom specialty options.");
  assert(JSON.stringify(win.readProfileState("maya").effective.selectedCustomSpecialties) === JSON.stringify(["成人零基础"]), "The unified profile save did not retain custom specialty selection state.");
  assert(win.readProfileState("maya").effective.travelsToOtherRinks && win.readProfileState("maya").effective.travelConditions === "限市区范围，交通费用另议。", "The unified profile save did not retain negotiable travel conditions.");
  assert(!win.readProfileState("maya").dirty, "Saving the profile did not clear the dirty state.");
  assert(doc.querySelector("#profileMessage").textContent.trim() === "已保存" && doc.querySelector("#profileSaveStatus").textContent.trim() === "已保存", "The unified profile save did not show success feedback in both status locations.");
  assert(doc.querySelector("#saveProfileChanges").disabled && !doc.querySelector("#saveProfileChanges").hasAttribute("aria-busy"), "Successful saving must disable the clean save action and clear its busy state.");
  assert(JSON.parse(win.localStorage.getItem("ice-skating-coach-profiles-v2")).maya.rate === newRate, "Saved profile data was not persisted.");
  const savedStorage = dumpLocalStorage(win);
  win.Image = NativeImage;
  win.HTMLCanvasElement.prototype.getContext = nativeGetContext;
  win.HTMLCanvasElement.prototype.toDataURL = nativeToDataUrl;
  assertNoRuntimeErrors("coach profile draft and save", errors);
  dom.window.close();

  const reloaded = await loadPage("coach/index.html", { localStorage: savedStorage });
  assertNoRuntimeErrors("coach profile reload", reloaded.errors);
  assert(reloaded.dom.window.readProfileState("maya").effective.rate === newRate, "Saved coach rate was lost after reload.");
  assert(reloaded.dom.window.readProfileState("maya").effective.lessonOptions.some((lesson) => lesson.name === "45 分钟测试课" && lesson.price === 82.75), "Saved lesson price was lost or recalculated after reload.");
  assert(reloaded.dom.window.readProfileState("maya").effective.photoUrl === newPhotoUrl, "Saved coach photo was lost after reload.");
  assert(!reloaded.dom.window.document.querySelector("#coachCity"), "The removed city field returned after reload.");
  assert(reloaded.dom.window.document.querySelector("#coachBio").value === savedBio, "Saved biography was lost after reload.");
  assert([...reloaded.dom.window.document.querySelectorAll('#coachTeachingDisciplines input[name="coachTeachingDisciplines"]:checked')].map((input) => input.value).join(",") === "singles,ice-dance", "Saved teaching disciplines were lost after reload.");
  assert([...reloaded.dom.window.document.querySelectorAll('#coachSpecialtyOptions input[name="coachSpecialties"]:checked')].map((input) => input.value).join(",") === "edges,footwork", "Saved preset specialties were lost after reload.");
  assert(reloaded.dom.window.document.querySelector("#coachCustomSpecialties").textContent.includes("成人零基础"), "Saved custom specialty was lost after reload.");
  assert(reloaded.dom.window.document.querySelector('input[data-specialty="成人零基础"]').checked && !reloaded.dom.window.document.querySelector('input[data-specialty="待选专长"]').checked, "Custom specialty checked states were lost after reload.");
  assert(reloaded.dom.window.document.querySelector("#travelsToOtherRinks").value === "negotiable" && reloaded.dom.window.document.querySelector("#travelConditions").value === "限市区范围，交通费用另议。", "Saved travel conditions were lost after reload.");
  assert(reloaded.dom.window.document.querySelector("#coachPhotoPreview").style.backgroundImage.includes(newPhotoUrl), "Reloaded photo data was not restored to the profile avatar.");
  reloaded.dom.window.close();
}

async function testLegacyBasePriceMigration() {
  const legacyProfiles = {
    maya: { coachId: "maya", rate: 120, travelsToOtherRinks: true, travelFee: 25, customSpecialties: ["旧自定义专长"], coachingStartYear: 2015, lessonOptions: [{ id: "maya-custom", name: "Maya legacy", duration: 30, price: 61 }] },
    alex: { coachId: "alex", rate: 95, skatingStartYear: 2012, showSkatingExperience: false, lessonOptions: [{ id: "alex-custom", name: "Alex legacy", duration: 60, price: 95 }] },
    sam: { coachId: "sam", rate: 110, coachingStartYear: 2014, showCoachingExperience: true, lessonOptions: [{ id: "sam-custom", name: "Sam legacy", duration: 45, price: 83 }] },
  };
  const firstLoad = await loadPage("coach/index.html", { localStorage: { "ice-skating-coach-profiles-v2": JSON.stringify(legacyProfiles) } });
  assertNoRuntimeErrors("legacy base price migration", firstLoad.errors);
  assert(firstLoad.dom.window.readProfileState("maya").effective.rate === 60, "Maya's hourly rate did not migrate to a 30-minute base price.");
  assert(firstLoad.dom.window.readProfileState("alex").effective.rate === 47, "Alex's hourly rate did not discard the fractional conversion.");
  assert(firstLoad.dom.window.readProfileState("sam").effective.rate === 55, "Sam's hourly rate did not migrate to a 30-minute base price.");
  assert(firstLoad.dom.window.readProfileState("sam").effective.lessonOptions.find((lesson) => lesson.id === "sam-custom").price === 83, "Migration recalculated an existing lesson price.");
  assert(firstLoad.dom.window.readProfileState("maya").effective.travelFee === 25 && firstLoad.dom.window.readProfileState("maya").effective.travelConditions.includes("额外出行费 $25/次"), "Legacy travel fee meaning was not preserved in the negotiable conditions migration.");
  assert(firstLoad.dom.window.readProfileState("maya").effective.selectedCustomSpecialties.join("|") === "旧自定义专长", "Legacy custom specialties were not selected during migration.");
  assert(!firstLoad.dom.window.readProfileState("maya").effective.teachingDisciplines.length && firstLoad.dom.window.readProfileState("maya").effective.skatingStartYear === null, "Legacy profiles fabricated missing skating identity details during migration.");
  assert(firstLoad.dom.window.readProfileState("maya").effective.coachingStartYear === 2015, "A legacy year without a visibility flag was not preserved.");
  assert(firstLoad.dom.window.readProfileState("alex").effective.skatingStartYear === 2012, "A formerly private retained year was discarded during migration.");
  assert(firstLoad.dom.window.readProfileState("sam").effective.coachingStartYear === 2014, "A formerly public year was lost during migration.");
  assert(firstLoad.dom.window.document.querySelector("#travelsToOtherRinks").value === "negotiable", "Legacy other-rink acceptance did not map to negotiable.");
  const migratedStorage = dumpLocalStorage(firstLoad.dom.window);
  const storedProfiles = JSON.parse(migratedStorage["ice-skating-coach-profiles-v2"]);
  assert(storedProfiles.alex.skatingStartYear === 2012 && storedProfiles.sam.coachingStartYear === 2014, "Legacy year data was not retained in migrated storage.");
  assert(["maya", "alex", "sam"].every((coachId) => storedProfiles[coachId].basePriceUnitMinutes === 30), "Migration marker was not persisted.");
  assert(storedProfiles.maya.demoPhotoVersion === 1 && storedProfiles.maya.photoUrl.endsWith("/assets/coaches/maya-chen.jpg"), "Stored demo data did not receive the default portrait migration.");
  firstLoad.dom.window.close();

  const secondLoad = await loadPage("coach/index.html", { localStorage: migratedStorage });
  assertNoRuntimeErrors("migrated base price reload", secondLoad.errors);
  assert(secondLoad.dom.window.readProfileState("alex").effective.rate === 47, "The migrated base price was converted a second time after reload.");
  assert(secondLoad.dom.window.readProfileState("sam").effective.lessonOptions.find((lesson) => lesson.id === "sam-custom").price === 83, "Reload changed an existing lesson price.");
  secondLoad.dom.window.close();
}

async function testLessonDeletionDraftAndSave() {
  const { dom, errors } = await loadPage("coach/index.html");
  const win = dom.window;
  const doc = win.document;
  const lessonName = "45 分钟私教";
  const initialButtons = [...doc.querySelectorAll('button[data-action="remove-lesson"]')];

  assert(initialButtons.length === win.readProfileState("maya").effective.lessonOptions.length, "Each lesson row must expose one delete action.");
  assert(initialButtons.every((button) => button.querySelector("svg") && !button.textContent.trim() && button.dataset.tooltip === "删除课程"), "Lesson delete actions must render a trash icon with a visible hover/focus tooltip.");
  assert(initialButtons.every((button) => button.getAttribute("aria-label") === `删除 ${button.closest(".lesson-option-row").querySelector(".lesson-name-input").value}`), "Lesson delete actions must include the course name in their accessible labels.");
  const findDeleteButton = () => [...doc.querySelectorAll(".lesson-option-row")]
    .find((row) => row.querySelector(".lesson-name-input").value === lessonName)
    ?.querySelector('button[data-action="remove-lesson"]');
  const savedLesson = JSON.parse(JSON.stringify(win.readProfileState("maya").saved.lessonOptions.find((lesson) => lesson.name.includes("45"))));
  const savedIndex = win.readProfileState("maya").saved.lessonOptions.findIndex((lesson) => lesson.id === savedLesson.id);

  findDeleteButton().click();
  assert(!win.readProfileState("maya").effective.lessonOptions.some((lesson) => lesson.id === savedLesson.id), "Deleting a lesson did not remove it immediately from the profile draft.");
  assert(win.readProfileState("maya").saved.lessonOptions.some((lesson) => lesson.id === savedLesson.id), "Deleting a lesson persisted before the unified save.");
  assert(doc.querySelector("#profileMessage").textContent.trim() === "已移除课程，保存后生效" && !doc.querySelector("#undoProfileChange").hidden, "Draft deletion did not expose the required pending-save feedback and undo action.");
  assert(doc.querySelector("#profileSaveStatus").textContent.trim() === "未保存更改", "Draft deletion did not update the floating unsaved state.");

  doc.querySelector("#undoProfileChange").click();
  assert(JSON.stringify(win.readProfileState("maya").effective.lessonOptions[savedIndex]) === JSON.stringify(savedLesson), "Undo did not restore the removed lesson content and original position.");
  assert(doc.querySelector("#profileMessage").textContent.trim() === "已恢复课程" && doc.querySelector("#undoProfileChange").hidden, "Undo feedback did not replace the removal action.");

  findDeleteButton().click();
  win.confirm = () => true;
  doc.querySelector('[data-coach-panel="bookingsPanel"]').click();
  doc.querySelector('[data-coach-panel="profilePanel"]').click();
  assert(win.readProfileState("maya").effective.lessonOptions.some((lesson) => lesson.id === savedLesson.id) && findDeleteButton(), "Discarding lesson deletion did not restore the saved course.");

  findDeleteButton().click();
  doc.querySelector("#saveProfileChanges").click();
  assert(!win.readProfileState("maya").saved.lessonOptions.some((lesson) => lesson.id === savedLesson.id), "Unified save did not persist lesson deletion.");
  assert(!JSON.parse(win.localStorage.getItem("ice-skating-coach-profiles-v2")).maya.lessonOptions.some((lesson) => lesson.id === savedLesson.id), "Persisted profile storage retained the deleted lesson.");
  const savedStorage = dumpLocalStorage(win);
  assertNoRuntimeErrors("lesson deletion draft and save", errors);
  dom.window.close();

  const reloaded = await loadPage("coach/index.html", { localStorage: savedStorage });
  assert(!reloaded.dom.window.readProfileState("maya").effective.lessonOptions.some((lesson) => lesson.id === savedLesson.id), "Refreshing restored a course that was formally deleted and saved.");
  assertNoRuntimeErrors("saved lesson deletion reload", reloaded.errors);
  reloaded.dom.window.close();
}

async function testProfileSaveFailureKeepsDraft() {
  const { dom, errors } = await loadPage("coach/index.html");
  const win = dom.window;
  const doc = win.document;
  const originalBio = win.readProfileState("maya").saved.bio;
  const nativeSetItem = win.localStorage.setItem;

  doc.querySelector("#coachBio").value = "保存失败时必须保留的草稿";
  doc.querySelector("#coachBio").dispatchEvent(new win.Event("input", { bubbles: true }));
  win.localStorage.setItem = () => { throw new win.DOMException("Storage unavailable", "QuotaExceededError"); };
  doc.querySelector("#saveProfileChanges").click();

  assert(win.readProfileState("maya").saved.bio === originalBio, "A failed save changed the saved profile.");
  assert(win.readProfileState("maya").effective.bio === "保存失败时必须保留的草稿" && win.readProfileState("maya").dirty, "A failed save discarded the profile draft or dirty state.");
  assert(doc.querySelector("#profileSaveStatus").textContent.trim() === "保存失败" && doc.querySelector("#profileMessage").textContent.includes("存储"), "A failed save did not explain the storage failure.");
  assert(!doc.querySelector("#coachSaveError").hidden && doc.querySelector("#coachSaveError").textContent.includes("存储"), "The floating save area must explain a failed save beside the retry action.");
  assert(!doc.querySelector("#saveProfileChanges").disabled && !doc.querySelector("#saveProfileChanges").hasAttribute("aria-busy"), "The save action remained locked after failure.");

  win.localStorage.setItem = nativeSetItem;
  doc.querySelector("#saveProfileChanges").click();
  assert(win.readProfileState("maya").saved.bio === "保存失败时必须保留的草稿" && doc.querySelector("#saveProfileChanges").disabled && doc.querySelector("#coachSaveError").hidden && doc.querySelector("#profileSaveStatus").textContent === "已保存", "Retrying from the floating action area must save the retained profile draft and clear its error.");
  assertNoRuntimeErrors("profile save failure", errors);
  dom.window.close();
}

async function testSafeDynamicRendering() {
  const { dom, errors } = await loadPage("coach/index.html");
  const win = dom.window;
  const doc = win.document;
  const unsafe = '<img src=x onerror="alert(1)">Unsafe';
  const profile = JSON.parse(JSON.stringify(win.readProfileState("maya").saved));
  profile.lessonOptions = [{ id: 'lesson" unsafe', name: unsafe, duration: 30, price: 60 }];
  win.replaceCoachProfileDraft("maya", profile);
  win.render();
  assert(!doc.querySelector("#lessonOptionsList img"), "Editable lesson names were interpreted as HTML.");
  assert(doc.querySelector("#lessonOptionsList .lesson-name-input").value === unsafe, "Escaped lesson text did not round-trip through the form.");

  const booking = {
    id: 'booking" unsafe',
    coachId: "maya",
    date: win.nextWeekdayIso(1),
    start: "08:00",
    end: "08:30",
    location: "Polar Ice Rink",
    availabilityLocation: "Polar Ice Rink",
    booked: true,
    lessonName: unsafe,
    lessonDuration: 30,
    lessonPrice: 60,
    student: { name: unsafe, email: "unsafe@example.com", note: unsafe },
  };
  win.replaceSlots([booking]);
  win.openBookingDetails(booking.id);
  assert(!doc.querySelector("#bookingDetailsBody img"), "Booking details interpreted student content as HTML.");
  assert(doc.querySelector("#bookingDetailsBody").textContent.includes(unsafe), "Booking details lost escaped student text.");
  assertNoRuntimeErrors("safe dynamic rendering", errors);
  dom.window.close();
}

async function testRecurringAvailabilityAcceptance() {
  const emptyStorage = {
    "ice-skating-coach-booking-slots-v12": "[]",
    "ice-skating-coach-blocked-exceptions-v1": "[]",
  };
  const coachPage = await loadPage("coach/index.html", { localStorage: emptyStorage });
  const { document, Event } = coachPage.dom.window;
  document.querySelector("#coachPlannerScope").value = "weekly";
  document.querySelector("#coachPlannerScope").dispatchEvent(new Event("change", { bubbles: true }));

  assertNoRuntimeErrors("coach/index.html recurring availability setup", coachPage.errors);
  const saturday = nextWeekdayByIndex(coachPage.dom.window, 6);
  const nextSaturday = coachPage.dom.window.addDaysIso(saturday, 7);
  document.querySelector('#coachPlannerTo').value = coachPage.dom.window.addDaysIso(saturday, 28);
  document.querySelector('#coachPlannerTo').dispatchEvent(new Event('change', { bubbles: true }));

  document.querySelector('[data-coach-panel="availabilityPanel"]').click();
  addOverviewRange(document, saturday, '17:00', '18:00', 'Polar Ice Rink');

  let createdSlots = coachPage.dom.window.slots.filter((slot) => slot.coachId === "maya" && slot.date === saturday && slot.start >= "17:00" && slot.end <= "18:00");
  let repeatedSlots = coachPage.dom.window.slots.filter((slot) => slot.coachId === "maya" && slot.date === nextSaturday && slot.start >= "17:00" && slot.end <= "18:00");
  assert(createdSlots.length === 1, "Recurring availability create did not add the selected date slots.");
  assert(repeatedSlots.length === 1, "Recurring availability create did not repeat on the following week.");
  assert(document.querySelector("#availabilitySaveMessage").textContent.includes("未保存"), "Create should mark availability as unsaved.");
  assert(!document.querySelector("#saveProfileChanges").disabled && document.querySelector("#profileSaveStatus").dataset.tone === "dirty", "Availability edits must enable the header save action and show its dirty state.");
  const scheduleBeforeUnload = new coachPage.dom.window.Event("beforeunload", { cancelable: true });
  coachPage.dom.window.dispatchEvent(scheduleBeforeUnload);
  assert(scheduleBeforeUnload.defaultPrevented, "Leaving via the home link must retain unsaved scheduling protection.");
  const originalScheduleStorage = coachPage.dom.window.localStorage.setItem;
  let sawScheduleBusy = false;
  coachPage.dom.window.localStorage.setItem = () => {
    sawScheduleBusy ||= document.querySelector("#saveProfileChanges").disabled && document.querySelector("#saveProfileChanges").getAttribute("aria-busy") === "true" && document.querySelector("#coachSaveLabel").textContent === "保存中…";
    throw new coachPage.dom.window.DOMException("Storage unavailable", "QuotaExceededError");
  };
  document.querySelector("#saveProfileChanges").click();
  assert(sawScheduleBusy && !document.querySelector("#saveProfileChanges").disabled && document.querySelector("#profileSaveStatus").textContent === "保存失败" && !document.querySelector("#coachSaveError").hidden && document.querySelector("#availabilitySaveMessage").textContent.includes("未保存"), `A failed schedule save must expose busy feedback, retain edits, and allow retry beside its reason: ${JSON.stringify({busy: sawScheduleBusy, disabled: document.querySelector("#saveProfileChanges").disabled, status: document.querySelector("#profileSaveStatus").textContent, error: document.querySelector("#coachSaveError").textContent, hidden: document.querySelector("#coachSaveError").hidden, availability: document.querySelector("#availabilitySaveMessage").textContent})}`);
  coachPage.dom.window.localStorage.setItem = originalScheduleStorage;
  document.querySelector("#saveProfileChanges").click();
  assert(document.querySelector("#saveProfileChanges").disabled && document.querySelector("#profileSaveStatus").textContent === "已保存", "Header saving must commit availability through the existing save behavior.");
  assert(document.querySelector("#availabilitySaveMessage").textContent.includes("已保存"), "Save button did not save availability changes.");

  const savedAfterCreate = dumpLocalStorage(coachPage.dom.window);
  const reloadedCoachPage = await loadPage("coach/index.html", { localStorage: savedAfterCreate });
  reloadedCoachPage.dom.window.document.querySelector('#coachPlannerTo').value = coachPage.dom.window.addDaysIso(saturday, 28);
  reloadedCoachPage.dom.window.document.querySelector('#coachPlannerTo').dispatchEvent(new reloadedCoachPage.dom.window.Event('change', { bubbles: true }));
  assertNoRuntimeErrors("coach/index.html recurring availability reload", reloadedCoachPage.errors);
  createdSlots = reloadedCoachPage.dom.window.slots.filter((slot) => slot.coachId === "maya" && slot.date === saturday && slot.start >= "17:00" && slot.end <= "18:00");
  repeatedSlots = reloadedCoachPage.dom.window.slots.filter((slot) => slot.coachId === "maya" && slot.date === nextSaturday && slot.start >= "17:00" && slot.end <= "18:00");
  assert(createdSlots.length === 1 && repeatedSlots.length === 1, "Saved recurring availability did not persist after reload.");

  const editDocument = reloadedCoachPage.dom.window.document;
  editDocument.querySelector("#coachPlannerScope").value = "weekly";
  editDocument.querySelector("#coachPlannerScope").dispatchEvent(new reloadedCoachPage.dom.window.Event("change", { bubbles: true }));
  overviewDate(editDocument, saturday);
  const editRow = [...editDocument.querySelectorAll('#dropdownOpenSlots [data-work-day]')].find((node) => node.dataset.workDay === saturday);
  editRow.querySelector('[data-planner-action="edit-work-range"]').click();
  editDocument.querySelector('#coachWorkTimeLocation').value = 'Zoom';
  submit(editDocument.querySelector('#coachWorkTimeForm'));
  editDocument.querySelector("#saveAvailability").click();

  const editedSlots = reloadedCoachPage.dom.window.slots.filter((slot) => slot.coachId === "maya" && [saturday, nextSaturday].includes(slot.date) && slot.start >= "17:00" && slot.end <= "18:00");
  assert(editedSlots.length === 2 && editedSlots.every((slot) => slot.location === "Zoom"), "Recurring availability edit did not update existing weekly slots.");

  const studentPage = await loadPage("student/index.html?access=full", { localStorage: dumpLocalStorage(reloadedCoachPage.dom.window) });
  assertNoRuntimeErrors("student/index.html recurring availability", studentPage.errors);
  const studentDocument = studentPage.dom.window.document;
  studentDocument.querySelector("#studentDateFilter").value = saturday;
  studentDocument.querySelector("#studentDateFilter").dispatchEvent(new studentPage.dom.window.Event("change", { bubbles: true }));
  const studentSlot = studentPage.dom.window.slots.find((slot) => slot.coachId === "maya" && slot.date === saturday && slot.start === "17:00" && slot.location === "Zoom" && !slot.booked);
  assert(studentSlot, "Student page did not receive a slot generated from recurring availability.");
  assert([...studentDocument.querySelectorAll(".student-time-option")].some((button) => button.dataset.ids.split(",").includes(studentSlot.id)), "Student calendar did not show the generated bookable time.");

  studentPage.dom.window.openBookingDialog(studentSlot.id);
  studentDocument.querySelector("#studentEmail").value = "acceptance@example.com";
  studentDocument.querySelector("#studentNote").value = "Acceptance booking";
  submit(studentDocument.querySelector("#bookingForm"));
  const bookedSlot = studentPage.dom.window.slots.find((slot) => slot.id === studentSlot.id);
  const futureRuleSlot = studentPage.dom.window.slots.find((slot) => slot.coachId === "maya" && slot.date === nextSaturday && slot.start === "17:00");
  assert(bookedSlot.booked, "Booking did not occupy the selected date slot.");
  assert(futureRuleSlot && !futureRuleSlot.booked && futureRuleSlot.location === "Zoom", "Booking a single date changed the following weekly availability.");

  const deletePage = await loadPage("coach/index.html", { localStorage: dumpLocalStorage(studentPage.dom.window) });
  deletePage.dom.window.document.querySelector('#coachPlannerTo').value = coachPage.dom.window.addDaysIso(saturday, 28);
  deletePage.dom.window.document.querySelector('#coachPlannerTo').dispatchEvent(new deletePage.dom.window.Event('change', { bubbles: true }));
  assertNoRuntimeErrors("coach/index.html recurring availability delete", deletePage.errors);
  const deleteDocument = deletePage.dom.window.document;
  deleteDocument.querySelector("#coachPlannerScope").value = "weekly";
  deleteDocument.querySelector("#coachPlannerScope").dispatchEvent(new deletePage.dom.window.Event("change", { bubbles: true }));
  overviewDate(deleteDocument, saturday);
  const deleteButton = deleteDocument.querySelector(`#dropdownOpenSlots [data-work-day="${saturday}"] [data-planner-action="edit-work-range"]`);
  assert(deleteButton, 'Recurring availability delete action must be available.');
  deleteButton.click();
  deleteDocument.querySelector('#deleteCoachWorkTime').click();
  deleteDocument.querySelector("#saveAvailability").click();

  const afterDelete = deletePage.dom.window.slots.filter((slot) => slot.coachId === "maya" && slot.date >= saturday && deletePage.dom.window.weekdayIndex(slot.date) === 6 && slot.start >= "17:00" && slot.end <= "18:00");
  assert(afterDelete.every((slot) => slot.booked), "Recurring availability delete left unbooked weekly availability behind.");
}

async function testTicketAcceptanceCoverage() {
  const findings = [];
  const ticketNow = "2026-11-18T05:00:00-07:00";
  const addFinding = (ticket, message) => findings.push(`${ticket}: ${message}`);
  const hasText = (document, text) => document.body.textContent.includes(text);
  const studentPage = await loadPage("student/index.html?access=full", { now: ticketNow });
  const coachPage = await loadPage("coach/index.html", { now: ticketNow });
  const adminPage = await loadPage("admin/index.html", { now: ticketNow });
  const { document: studentDocument } = studentPage.dom.window;
  const { document: coachDocument } = coachPage.dom.window;
  const { document: adminDocument } = adminPage.dom.window;

  const studentLoginLink = studentDocument.querySelector("#studentLoginPrompt");
  assert(studentLoginLink && new URL(studentLoginLink.href).pathname.endsWith("/student/login/index.html"), "Student entry must link to the real login page.");
  assert(!studentDocument.querySelector("#studentSignupForm"), "Student home must not retain a fake authentication form.");
  const studentLogin = await loadPage("student/login/index.html", { now: ticketNow });
  assertNoRuntimeErrors("student/login/index.html ticket auth contract", studentLogin.errors);
  const studentLoginDocument = studentLogin.dom.window.document;
  const studentAuthForm = studentLoginDocument.querySelector("form#studentSignupForm[data-auth-form]");
  assert(studentAuthForm && studentAuthForm.getAttribute("method").toLowerCase() === "post" && studentAuthForm.getAttribute("action") === "/api/auth/login", "Student authentication must use the real POST login contract.");
  assert(studentAuthForm.querySelector('input[name="email"][type="email"][required]') && studentAuthForm.querySelector('input[name="password"][type="password"][required][autocomplete="current-password"]'), "Real student login must retain required named credentials.");
  assert(studentAuthForm.querySelector('button[type="submit"][data-auth-submit]') && studentAuthForm.querySelector('[data-auth-register]') && studentAuthForm.querySelector('input[name="remember"][type="checkbox"]'), "Real student auth must retain login, registration and persisted-session controls.");
  assert(fs.readFileSync("student/login/index.html", "utf8").includes('<script type="module" src="../../js/student-login-entry.js"></script>'), "Real student login must load its authentication entry module.");
  assert(studentAuthForm.querySelector("[data-auth-submit]").disabled && !studentAuthForm.querySelector("[data-demo-only]").hidden, "The real auth controller must initialize honest static-demo mode without claiming an authenticated session.");

  studentLogin.dom.window.close();
  testPages.delete(studentLogin.dom);

  const coachLogin = await loadPage("coach/login/index.html", { now: ticketNow });
  const coachLoginDocument = coachLogin.dom.window.document;
  if (!coachLoginDocument.querySelector("form[action], form#coachLoginForm, input[type='password']")) {
    addFinding("准备可测试的教练账号与教练资料", "No real coach test-account sign-in form is implemented; coach access is only a demo link.");
  }

  studentDocument.querySelector('[data-student-panel="studentAccountPanel"]').click();
  const accountText = studentDocument.querySelector('[data-student-content="studentAccountPanel"]')?.textContent || "";
  if (/冰鞋|skate ownership/i.test(accountText)) {
    addFinding("移除学生账户冰鞋字段", "Student account still displays skate ownership wording.");
  }

  const firstOpenSlot = studentPage.dom.window.slots.find((slot) => {
    return slot.coachId === "maya" && !slot.booked && new Date(`${slot.date}T${slot.end}`) > new Date(ticketNow);
  });
  studentPage.dom.window.openBookingDialog(firstOpenSlot.id);
  if (!studentDocument.querySelector("#bookingForSelf")) {
    addFinding("支持为本人或他人预约", "Booking dialog does not expose a self/another-student control.");
  }
  studentDocument.querySelector("#bookingForSelf").checked = true;
  studentPage.dom.window.syncBookingForSelf();
  if (studentDocument.querySelector("#studentName").value !== "本人") {
    addFinding("支持为本人或他人预约", "Selecting Self does not fill the student name from an account profile; it only hides and clears the field.");
  }

  studentDocument.querySelector("#bookingForSelf").checked = false;
  studentPage.dom.window.syncBookingForSelf();
  if (!studentDocument.querySelector("#studentName").required) {
    addFinding("支持为本人或他人预约", "Selecting Another student does not require a student name.");
  }
  studentDocument.querySelector("#studentName").value = "QA Student";
  studentDocument.querySelector("#studentEmail").value = "qa@example.com";
  submit(studentDocument.querySelector("#bookingForm"));
  const bookedSlot = studentPage.dom.window.slots.find((slot) => slot.id === firstOpenSlot.id);
  if (!bookedSlot?.booked || bookedSlot.student?.name !== "QA Student") {
    addFinding("已发布时段支持直接预约并自动确认", "Submitting a booking did not mark the selected slot as booked with the entered student.");
  }
  if (!("status" in bookedSlot) || bookedSlot.status !== "Booked") {
    addFinding("已发布时段支持直接预约并显示预约成功", "Booked slots do not store the explicit successful booking status.");
  }
  if (studentDocument.querySelector("#bookingSubmitButton")?.textContent !== "确认预约") {
    addFinding("已发布时段支持直接预约并自动确认", "Booking dialog does not clearly remain in direct-confirm mode.");
  }

  studentPage.dom.window.renderStudentOwnBookings();
  studentDocument.querySelector('[data-student-panel="studentBookingsPanel"]').click();
  if (!studentDocument.querySelector("#studentOwnBookings")?.textContent.includes("QA Student")) {
    addFinding("学生查看、修改和取消预约", "My Bookings does not show the attending student name after booking.");
  }
  const persistedStudentState = dumpLocalStorage(studentPage.dom.window);
  const studentNavReload = await loadPage("student/index.html?access=full", { now: ticketNow, localStorage: persistedStudentState });
  if (!studentNavReload.dom.window.document.querySelector('[data-student-content="studentBookingsPanel"]')?.classList.contains("active")) {
    addFinding("学生端导航状态持久化", "Student tab navigation does not persist the last selected booking panel.");
  }
  persistedStudentState["ice-skating-student-active-panel-v1"] = "missingPanel";
  const invalidNavReload = await loadPage("student/index.html?access=full", { now: ticketNow, localStorage: persistedStudentState });
  if (!invalidNavReload.dom.window.document.querySelector('[data-student-content="studentBookPanel"]')?.classList.contains("active")) {
    addFinding("学生端导航状态持久化", "Invalid persisted student tab state does not fall back to the default booking panel.");
  }
  studentPage.dom.window.openModifyBookingDialog(bookedSlot.id);
  if (!studentDocument.querySelector("#bookingLocationLabel")?.classList.contains("is-hidden") || !studentDocument.querySelector("#studentEmailLabel")?.classList.contains("is-hidden")) {
    addFinding("学生查看、修改和取消预约", "Modify booking dialog exposes fields outside student name and coach note.");
  }

  coachPage.dom.window.slots = [bookedSlot];
  coachPage.dom.window.render();
  coachDocument.querySelector('[data-coach-panel="bookingsPanel"]').click();
  const coachBookingsText = coachDocument.querySelector("#coachSlots")?.textContent || "";
  if (!coachBookingsText.includes("QA Student") || !coachBookingsText.includes(bookedSlot.location) || !coachBookingsText.includes(String(bookedSlot.lessonDuration))) {
    addFinding("教练端查看已确认预约", "Coach bookings list does not show confirmed booking student, rink, and duration.");
  }
  const bookingStatusNow = new Date(ticketNow);
  const bookingEnded = new Date(`${bookedSlot.date}T${bookedSlot.end}`) < bookingStatusNow;
  if (bookingEnded && !coachBookingsText.includes("已结束")) {
    addFinding("教练端查看预约", "Coach bookings list does not display the ended status.");
  }
  if (!bookingEnded && (!coachBookingsText.includes("预约成功") || coachBookingsText.includes("已确认"))) {
    addFinding("教练端查看预约", "Upcoming normal bookings do not show the explicit successful-booking status.");
  }

  const profile = coachPage.dom.window.readProfileState("maya").effective;
  if (!profile.servedRinks?.length || !profile.lessonOptions?.length) {
    addFinding("准备可测试的教练账号与教练资料", "Default coach profile is missing teaching rinks or lesson pricing.");
  }
  if (!hasText(studentDocument, "Maya Chen")) {
    addFinding("准备可测试的教练账号与教练资料", "Student experience does not display coach profile data.");
  }

  if (!/批准|approve|suspend|暂停|remove|移除/i.test(adminDocument.body.textContent)) {
    addFinding("Admin 配置并批准教练可授课冰场", "Admin page has no approval/suspension workflow for teaching rinks.");
  }

  coachDocument.querySelector('[data-coach-panel="availabilityPanel"]').click();
  if (!coachDocument.querySelector("#coachWorkTimeLocation") || !coachDocument.querySelector("#coachWorkTimeStart") || !coachDocument.querySelector("#coachWorkTimeEnd")) {
    addFinding("可用时间手动输入", "Overview editor is missing rink/start/end fields.");
  }
  const date = coachPage.dom.window.nextWeekdayIso();
  addOverviewRange(coachDocument, date, '10:00', '09:30', 'Polar Ice Rink');
  if (!coachDocument.querySelector("#coachWorkTimeMessage")?.textContent.includes("结束时间需晚于开始时间")) {
    addFinding("可用时间手动输入", "Invalid manual time range does not show clear validation feedback.");
  }
  const beforeOverlap = coachPage.dom.window.slots.length;
  addOverviewRange(coachDocument, date, '12:00', '13:00', 'Polar Ice Rink');
  const beforeConflict = JSON.stringify(coachPage.dom.window.slots);
  addOverviewRange(coachDocument, date, '12:00', '13:00', 'Arcadia Ice Arena');
  if (!coachDocument.querySelector('#coachWorkTimeMessage').textContent.includes('冲突') || JSON.stringify(coachPage.dom.window.slots) !== beforeConflict) {
    addFinding("可用时间冲突处理", "Cross-rink overlap must be rejected atomically with clear feedback.");
  }
  coachDocument.getElementById('cancelCoachWorkTime').click();
  if (coachPage.dom.window.slots.length < beforeOverlap) {
    addFinding("可用时间冲突处理", "Overlap handling removed existing slots.");
  }

  if (!coachDocument.querySelector("#dragCalendar .calendar-cell")) {
    addFinding("可用时间日历界面", "Coach availability calendar cells did not render.");
  }
  if (!coachDocument.querySelector("#toggleCalendarHours")) {
    addFinding("可用时间日历界面", "Calendar does not provide a Show Full Day control.");
  }
  coachPage.dom.window.slots = [{
    id: "booked-privacy",
    coachId: "maya",
    date,
    start: "08:00",
    end: "08:30",
    location: "Polar Ice Rink",
    availabilityLocation: "Polar Ice Rink",
    lessonName: "30 min private lesson",
    lessonDuration: 30,
    lessonPrice: 60,
    booked: true,
    student: { name: "Private Student", email: "private@example.com", note: "" },
  }];
  coachPage.dom.window.renderDragCalendar();
  if ([...coachDocument.querySelectorAll("#dragCalendar .calendar-cell")].some((cell) => cell.title.includes("Private Student"))) {
    addFinding("可用时间日历界面", "Availability calendar exposes student information in booked-cell title text.");
  }

  if (!studentDocument.querySelector("#studentCoachSearch") || !studentDocument.querySelector("#studentRinkSearch")) {
    addFinding("学生端 Calendar：按教练查看并按冰场筛选可预约时间", "Student calendar is missing coach or rink search filters.");
  }
  if (!studentDocument.querySelector("select#studentLessonDurationFilter")) {
    addFinding("学生端 Calendar：按教练查看并按冰场筛选可预约时间", "Student calendar has no lesson-duration filter.");
    addFinding("按课程时长计算可预约时段", "Students cannot select lesson duration while viewing availability.");
  }

  const appText = `${studentDocument.body.textContent} ${coachDocument.body.textContent} ${adminDocument.body.textContent}`;
  if (!/Freestyle Session/i.test(appText)) {
    addFinding("导入并维护 Freestyle Session 场次", "No Freestyle Session data maintenance UI or data model is present.");
    addFinding("根据教练时间和 Freestyle 场次生成可预约时段", "No Freestyle Session intersection logic is present.");
    addFinding("禁止私教课跨越两个 Freestyle Session", "No Freestyle Session boundary rule is present.");
    addFinding("同一冰场的连续课程不强制留休息时间", "Same-rink continuity cannot be fully validated because Freestyle Session boundary data is not implemented.");
    addFinding("支持按冰场查看可预约教练", "Rink-first view is not organized by Freestyle Session.");
    addFinding("显示对应 Freestyle Session，并提示冰票另购", "Booking flow does not show a related Freestyle Session or ticket-purchase notice.");
  }

  if (!/transition|切换时间|travel buffer|Google Maps/i.test(appText)) {
    addFinding("添加固定的跨冰场切换时间", "No standard cross-rink transition-time setting exists.");
    addFinding("支持不同冰场组合和方向的切换时间", "No rink-pair or direction-specific transition-time settings exist.");
    addFinding("使用 Google Maps 推荐场馆切换时间", "No Google Maps based transition recommendation exists.");
  }

  if (!/notification|通知/i.test(appText)) {
    addFinding("预约成功后通知教练", "No coach notification workflow is implemented for booking, cancellation, or reschedule.");
  }
  if (!studentDocument.querySelector("[data-notification], [data-coach-notification], [data-action*='notify' i]") && !coachDocument.querySelector("[data-notification], [data-coach-notification]")) {
    addFinding("预约成功后通知教练", "Booking success has no persisted or visible coach notification record.");
  }
  if (!/waitlist|候补|临时空位/i.test(appText)) {
    addFinding("增加取消候补与临时空位提醒", "No waitlist or last-minute opening subscription feature is implemented.");
  }
  if (!studentDocument.querySelector("[data-waitlist], [data-action*='waitlist' i], [data-action*='subscribe-opening' i]")) {
    addFinding("增加取消候补与临时空位提醒", "Account notification preference exists, but no waitlist or opening-subscription workflow exists.");
  }
  if (!/manual confirmation|手动确认/i.test(appText)) {
    addFinding("增加需要教练手动确认的预约模式", "No optional manual-confirmation booking mode is implemented.");
  }
  if (!/年龄|age|语言|language|风格|style|专项|specialty/i.test(studentDocument.body.textContent)) {
    addFinding("增加高级教练筛选条件", "No advanced coach filters for age, level/specialty, language, or style are implemented.");
  }
  if (!/提前|lead time|cutoff|advance/i.test(appText)) {
    addFinding("增加最短预约提前时间设置", "No minimum booking lead-time setting or booking-time cutoff validation is present.");
  }
  if (!studentDocument.querySelector("select[multiple], input[type='checkbox'][name*='coach' i]")) {
    addFinding("一次向多个教练发送约课请求", "Booking flow only targets one selected coach slot and has no multi-coach lesson request workflow.");
  }

  if (!("locks" in studentPage.dom.window.navigator) && !/atomic|transaction|version/i.test(appText)) {
    addFinding("防止多个学生同时抢到同一冲突时段", "Booking uses client-side localStorage state and has no atomic server-side conflict write.");
    addFinding("提交预约时重新校验可用性", "Booking submit does not recheck all availability, Freestyle, duration, existing booking, and transition rules server-side.");
  }

  if (findings.length) {
    throw new Error(`Ticket acceptance failures:\n${findings.map((finding) => `- ${finding}`).join("\n")}`);
  }
}

async function testCoachScheduleFilters() {
  const { dom, errors } = await loadPage("coach/index.html", { now: "2026-11-16T12:00:00-07:00" });
  const win = dom.window;
  const doc = win.document;
  doc.querySelector('[data-coach-panel="bookingsPanel"]').click();
  const demoFixtureEmails = new Set(["lena.special@example.com", "alexandria.special@example.com", "any-rink.special@example.com"]);
  const demoSpecialCases = win.slots.filter((slot) => slot.booked && demoFixtureEmails.has(slot.student?.email));
  const concreteLocationChanges = demoSpecialCases.filter((slot) => slot.availabilityLocation !== "Any served rink" && slot.availabilityLocation !== slot.location);
  const flexibleLocationControl = demoSpecialCases.find((slot) => slot.availabilityLocation === "Any served rink");
  assert(demoSpecialCases.length === 3 && concreteLocationChanges.length === 2 && flexibleLocationControl?.location === "Polar Ice Rink" && demoSpecialCases.every((slot) => slot.student.note.startsWith("Demo 验证")), "Demo data must include two visible alternate-venue cases, one Any served rink control, and keep test descriptions out of student names.");
  assert(demoSpecialCases.map((slot) => slot.student.name).sort().join("|") === ["Alexandria Catherine Montgomery", "Lena Wu", "Sofia Martinez"].sort().join("|"), "Demo fixtures must use normal student names instead of exposing test labels in the calendar.");
  const demoSlotIds = new Set(demoSpecialCases.map((slot) => slot.id));
  const demoSpecialCards = [...doc.querySelectorAll("#exceptionDragCalendar .coach-calendar-booking")].filter((card) => demoSlotIds.has(card.dataset.slotId));
  assert(demoSpecialCards.length === 3 && demoSpecialCards.filter((card) => card.querySelector(".coach-calendar-location-change")).length === 2, "The demo calendar must label only the two concrete-rink Special Case bookings as location changes.");
  const flexibleLocationCard = demoSpecialCards.find((card) => card.dataset.slotId === flexibleLocationControl.id);
  const flexibleLocationCell = doc.querySelector(`#exceptionDragCalendar .calendar-cell[data-slot-id="${flexibleLocationControl.id}"]`);
  assert(flexibleLocationCard.querySelector("strong")?.textContent === "Sofia Martinez" && flexibleLocationCard.querySelector(".coach-calendar-booking-rink")?.textContent === "Polar Ice" && !flexibleLocationCard.querySelector(".coach-calendar-location-change"), "The Any served rink control must show a normal student name and final Polar rink without an alternate-venue label.");
  assert(flexibleLocationCell.style.getPropertyValue("--rink-color") === "#ddd6fe" && flexibleLocationCard.style.getPropertyValue("--booking-accent") === "#22c55e", "The Any served rink control must retain the flexible purple availability background while coloring the booking card by its final Polar rink.");
  const legacyFixtureCopies = demoSpecialCases.map((slot) => ({ ...slot, student: { ...slot.student, name: `Special Case · ${slot.student.name}`, note: "旧说明" } }));
  assert(win.ensureLocationChangeDemoBookings(legacyFixtureCopies) && legacyFixtureCopies.every((slot) => !slot.student.name.startsWith("Special Case ·") && slot.student.note.startsWith("Demo 验证")), "Existing local demo fixtures must migrate to normal names and current notes by stable email.");
  // Keep the cancellable fixture beyond the policy window, including on Sunday.
  const future = win.addDaysIso(win.nextWeekdayIso(1), 7);
  const past = win.todayIso(-2);
  const booking = (id, date, start, end, name, email, extra = {}) => ({
    id, coachId: "maya", date, start, end, location: "Polar Ice Rink", availabilityLocation: "Polar Ice Rink",
    booked: true, lessonName: "私教课", lessonDuration: win.minutesFromTime(end) - win.minutesFromTime(start), lessonPrice: 60,
    status: "Confirmed", student: { name, email, note: "Review edges" }, ...extra,
  });
  const adaNear = booking("ada-near", future, "08:00", "09:30", "Ada", "ada@example.com");
  const beaNear = booking("bea-near", future, "10:00", "11:30", "Bea", "bea@example.com", { lessonName: "90 min private lesson" });
  const adaFar = booking("ada-far", win.addDaysIso(future, 7), "09:00", "10:00", "Ada", "ada@example.com", { location: "Arcadia Ice Arena", status: "Pending" });
  const sameName = booking("other-ada", win.addDaysIso(future, 14), "14:00", "14:30", "Ada", "another@example.com", { location: "Zoom" });
  const adaPast = booking("ada-past", past, "14:00", "14:30", "Ada", "ada@example.com", { note: "每周开放时间生成", student: { name: "Ada", email: "ada@example.com", note: "<img src=x onerror=alert(1)>" } });
  const adaOlder = booking("ada-older", win.addDaysIso(past, -14), "14:00", "14:30", "Ada", "ada@example.com", { status: "Cancelled" });
  const openSlot = { ...booking("open", future, "12:00", "12:30", "", ""), booked: false, student: null };
  const blockedSlot = { ...openSlot, id: "blocked-open", start: "13:00", end: "13:30" };
  const otherCoach = { ...adaNear, id: "other-coach", coachId: "alex" };
  win.slots = [adaFar, adaOlder, beaNear, sameName, adaNear, adaPast, openSlot, blockedSlot, otherCoach];
  win.blockedExceptions = [{ id: "block", coachId: "maya", date: future, start: "13:00", end: "13:30", reason: "Unavailable" }];
  doc.querySelector("#exceptionCalendarWeekStart").value = win.startOfWeekIso(future);
  win.renderExceptionDragCalendar();
  win.render();
  assertNoRuntimeErrors("Coach schedule setup", errors);
  const search = doc.querySelector("#coachBookingStudentSearch");
  const pickerTrigger = doc.querySelector("#coachBookingStudentTrigger");
  const pickerSummary = doc.querySelector("#coachBookingStudentSummary");
  const pickerCaret = doc.querySelector(".coach-student-picker-caret");
  const results = doc.querySelector("#coachBookingStudentResults");
  const optionFor = (key) => [...results.querySelectorAll("[data-student-key]")].find((option) => option.dataset.studentKey === key);
  const rows = () => [...doc.querySelectorAll("#coachSlots .coach-booking-card")];
  const rowIds = () => rows().map((row) => row.dataset.slotId).join(",");
  const listTab = doc.querySelector('[data-booking-section="bookingListSection"]');
  const calendarTab = doc.querySelector('[data-booking-section="bookingCalendarSection"]');
  assert(listTab.textContent === "预约列表", "Coach list tab must use the appointment-list label.");
  const calendarViewIcon = calendarTab.querySelector(".booking-view-icon");
  const listViewIcon = listTab.querySelector(".booking-view-icon");
  assert(calendarViewIcon?.querySelector("rect") && listViewIcon?.querySelectorAll("circle").length === 3 && listViewIcon.querySelector("path"), "Booking view options must use matching line calendar and bulleted-list icons.");
  const bookingViewSwitchStyle = win.getComputedStyle(doc.querySelector(".booking-view-switch"));
  assert(calendarViewIcon.getAttribute("viewBox") === listViewIcon.getAttribute("viewBox") && win.getComputedStyle(calendarViewIcon).width === "17px" && win.getComputedStyle(listViewIcon).width === "17px", "Booking view icons must share the original compact 17px geometry.");
  assert(bookingViewSwitchStyle.width === "204px" && win.getComputedStyle(listTab).justifyContent === "center" && win.getComputedStyle(listTab).gap === "8px", "The calendar/list capsule must retain the original compact proportions and centered icon-label units.");
  listViewIcon.dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
  assert(doc.querySelector("#bookingListSection").classList.contains("active"), "Clicking the list icon must activate the same option as clicking its text.");
  listTab.dispatchEvent(new win.Event("pointerdown", { bubbles: true }));
  listTab.focus();
  assert(doc.documentElement.dataset.inputModality === "pointer" && win.getComputedStyle(listTab).outlineStyle === "none", "Pointer selection must not leave the liquid option inside a second outlined capsule.");
  doc.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
  const modalityCss = fs.readFileSync(path.resolve("css/design-system.css"), "utf8");
  assert(doc.documentElement.dataset.inputModality === "keyboard" && /\.liquid-switch > \.method-button:focus[\s\S]*?outline:\s*0 !important/s.test(modalityCss), "Focused liquid options must never render an external outline capsule.");
  assert(/html\[data-input-modality="keyboard"\] \.liquid-switch > \.method-button:focus\s*\{[^}]*box-shadow:\s*inset/s.test(modalityCss), "Keyboard navigation must retain an internal focus indicator without recreating an outer capsule.");
  calendarViewIcon.dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
  assert(doc.querySelector("#bookingCalendarSection").classList.contains("active"), "Clicking the calendar icon must activate the same option as clicking its text.");
  assert(!doc.querySelector("#coachBookingStudentFilter") && pickerTrigger.tagName === "BUTTON" && pickerSummary.textContent === "全部学生" && search.placeholder === "搜索姓名或邮箱", "Student filtering must keep a read-only summary trigger separate from the panel search field.");
  assert(doc.querySelector("#openBlockDialog").parentElement.classList.contains("coach-booking-calendar-actions") && doc.querySelector("#toggleExceptionCalendarHours").parentElement === doc.querySelector("#openBlockDialog").parentElement, "Calendar actions must share the feedback bar without duplicate buttons.");
  assert(doc.querySelector(".bookings-panel").contains(doc.querySelector("#exceptionDragCalendar")) && !doc.querySelector(".bookings-panel .calendar-panel"), "Appointment heading, tools and calendar must remain in one outer card without a nested calendar card.");
  assert(doc.querySelector(".bookings-panel .heading-note").textContent === "查看已成立的预约与安排不可预约时间" && doc.querySelector("#coachBookingStudentLabel").textContent === "查看学生" && doc.querySelector(".bookings-panel .coach-booking-date-filter > .coach-booking-filter-label").textContent === "查看日期", "Appointment heading or aligned filter labels are missing.");
  const bookingPanelHeading = doc.querySelector(".coach-booking-schedule-workspace > .coach-panel-heading");
  const availabilityPanelHeading = doc.querySelector(".availability-panel > .coach-panel-heading");
  assert(bookingPanelHeading && availabilityPanelHeading && !availabilityPanelHeading.querySelector(".eyebrow"), "Coach schedule cards must share one header structure without the repeated availability eyebrow.");
  assert(!doc.querySelector("#availabilityScheduleLegend") && doc.querySelector("#scheduleLegend .schedule-legend-row"), "Availability must remove its duplicate legend while preserving the booking-management legend.");
  assert(bookingPanelHeading.children[0].tagName === "H3" && bookingPanelHeading.children[1].classList.contains("heading-note") && bookingPanelHeading.nextElementSibling.classList.contains("coach-booking-content-nav") && availabilityPanelHeading.children[0].tagName === "H3" && availabilityPanelHeading.children[1].classList.contains("liquid-switch") && availabilityPanelHeading.children[2].classList.contains("heading-note"), "Coach schedule headers must keep their content navigation in the intended hierarchy.");
  assert(!doc.querySelector(".bookings-panel .calendar-help") && !doc.querySelector(".coach-booking-filters"), "Removed appointment help or filter panels remain visible.");
  assert(doc.querySelector(".bookings-panel").dataset.bookingView === "calendar" && win.getComputedStyle(doc.querySelector(".bookings-panel .coach-booking-date-filter")).display !== "none" && win.getComputedStyle(doc.querySelector("#toggleExceptionCalendarHours")).display !== "none", "Calendar view must retain its week navigation and display settings.");
  assert(rowIds() === "ada-near,bea-near,ada-far,other-ada", "Upcoming appointments must be chronological across weeks and limited to this coach.");
  assert(!doc.querySelector("#coachSlots .student-booking-group"), "Coach list must not group students or rinks.");
  assert(doc.querySelectorAll("#coachSlots .coach-booking-date-group").length === 3 && doc.querySelector('[data-booking-date="' + future + '"] .coach-booking-date-list').children.length === 2, "Coach appointments on the same day must share one date heading.");
  const dateHeading = doc.querySelector('[data-booking-date="' + future + '"] .coach-booking-date-heading');
  const headingDay = new Date(`${future}T00:00:00`);
  const expectedHeadingDate = new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric" }).format(headingDay);
  const expectedHeadingWeekday = new Intl.DateTimeFormat("zh-CN", { weekday: "short" }).format(headingDay);
  assert(dateHeading.querySelector("time").textContent === `${expectedHeadingDate} · ${expectedHeadingWeekday}` && dateHeading.querySelector("time").dateTime === future && dateHeading.querySelector("span").textContent === "2 节", "Each date heading must show the full local date, weekday and the current group's appointment count.");
  assert(rows()[0].querySelector(".coach-booking-start-time").textContent === "08:00" && rows()[0].querySelector(".coach-booking-end-time").textContent.includes("09:30") && rows()[0].querySelector(".coach-booking-info h4").textContent === "Ada" && doc.querySelector("#coachSlots .coach-booking-date-heading").textContent.includes(future.slice(0, 4)), "Appointment groups must show the date once while separating start time, end time and student name hierarchy.");
  const firstBookingSide = rows()[0].querySelector(".coach-booking-side");
  const firstDetailAction = firstBookingSide.querySelector('[data-action="coach-booking-details"]');
  const firstCancelAction = firstBookingSide.querySelector('[data-action="coach-cancel-booking"]');
  assert(win.getComputedStyle(rows()[0].querySelector(".coach-booking-time-block")).borderRightStyle === "solid", "Appointment time and course information must be separated by a subtle vertical rule.");
  assert(firstBookingSide.children[0].classList.contains("coach-booking-price") && firstDetailAction && firstCancelAction && !firstDetailAction.classList.contains("ghost-button") && !firstCancelAction.classList.contains("danger-button"), "Price, details and cancellation must share the unframed vertical action column in that order.");
  assert(firstDetailAction.classList.contains("coach-booking-text-action") && firstCancelAction.classList.contains("coach-booking-text-action"), "Details and cancellation must reuse one text-action geometry.");
  assert(rows()[0].textContent.includes("90 分钟") && rows()[0].textContent.includes("$60") && rows()[0].textContent.includes("Review edges"), "Appointment row must retain course, price and note details.");
  assert(!rows()[0].textContent.includes("ada@example.com") && rows()[0].querySelectorAll(".coach-booking-meta").length === 1 && rows()[0].querySelector(".coach-booking-location-icon--pin"), "List rows must move email to details and render in-person locations with a pin icon.");
  assert(doc.querySelector('[data-slot-id="bea-near"] .coach-booking-course').textContent.includes("90 min private lesson") && !doc.querySelector('[data-slot-id="bea-near"] .coach-booking-course').textContent.includes("90 分钟"), "Course names that already contain duration must not repeat duration metadata.");
  assert(doc.querySelector('[data-slot-id="other-ada"] .coach-booking-location-icon--video'), "Zoom appointments must use the video location icon.");
  assert(doc.querySelector('[data-slot-id="ada-far"] .coach-booking-student-line .coach-booking-status')?.textContent === "预约成功", "Upcoming normal appointments must show the successful-booking status beside the student name.");
  const snapshot = JSON.stringify(win.slots);
  pickerTrigger.click();
  assert(!results.hidden && pickerTrigger.getAttribute("aria-expanded") === "true" && doc.activeElement === search, "Clicking blank space in the student control must open the picker once and focus its search field.");
  pickerTrigger.click();
  assert(results.hidden && pickerTrigger.getAttribute("aria-expanded") === "false", "Clicking the unified student control again must close the picker once.");
  pickerCaret.dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
  assert(!results.hidden && pickerTrigger.getAttribute("aria-expanded") === "true", "Clicking the student caret must open the same picker.");
  pickerCaret.dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
  assert(results.hidden && pickerTrigger.getAttribute("aria-expanded") === "false", "Clicking the student caret must not double-toggle the picker.");
  pickerTrigger.click();
  assert(!results.hidden && [...results.querySelectorAll('input[type="checkbox"]')].every((checkbox) => checkbox.checked), "Opening an unfiltered picker must represent the dynamic all-students state with every current student checked.");
  const allStudentOptionCount = results.querySelectorAll(".coach-student-option").length;
  search.value = "bea@example.com";
  search.dispatchEvent(new win.Event("input", { bubbles: true }));
  assert(!results.hidden && results.textContent.includes("Bea") && !results.textContent.includes("bea@example.com"), "Unique-name results should stay concise while email search remains supported.");
  const clearSearch = results.querySelector('[data-student-action="clear-search"]');
  assert(!clearSearch.hidden && pickerSummary.textContent === "全部学生", "Searching must not replace the applied-filter summary.");
  clearSearch.click();
  assert(search.value === "" && clearSearch.hidden && results.querySelectorAll(".coach-student-option").length === allStudentOptionCount && [...results.querySelectorAll('input[type="checkbox"]')].every((checkbox) => checkbox.checked), "Clearing panel search must restore all candidates without changing the draft selection.");
  search.value = "bea@example.com";
  search.dispatchEvent(new win.Event("input", { bubbles: true }));
  results.querySelector('[data-student-action="clear-draft"]').click();
  assert(results.querySelector('[data-student-action="apply"]').disabled && doc.querySelector("#coachBookingStudentDraftCount").textContent === "已选 0 位学生" && !doc.querySelector("#coachBookingStudentValidation").hidden && doc.querySelector("#coachBookingStudentValidation").textContent === "请选择至少一位学生", "An empty draft must disable apply and explain how to select students without clearing the applied filter.");
  assert([...results.querySelectorAll(".coach-student-option")].every((option) => option.getAttribute("aria-selected") === "false" && !option.querySelector('input[type="checkbox"]').checked), "Clearing the draft must remove both selected-row state and every checkbox check.");
  assert(!results.querySelector(".coach-student-option.is-active") && !search.getAttribute("aria-activedescendant"), "Clearing the draft must not leave the first student visually active.");
  assert(!results.querySelector('[data-student-action="reset-filter"]') && !results.textContent.includes("重置筛选"), "The student picker must not expose a separate reset-filter action.");
  clearSearch.click();
  results.querySelector('[data-student-action="select-matches"]').click();
  assert([...results.querySelectorAll(".coach-student-option")].every((option) => option.getAttribute("aria-selected") === "true" && option.querySelector('input[type="checkbox"]').checked) && doc.querySelector("#coachBookingStudentDraftCount").textContent === `已选 ${allStudentOptionCount} 位学生`, "Select all must keep row fill, checkboxes and the selected count synchronized.");
  results.querySelector('[data-student-action="clear-draft"]').click();
  const firstStudentKey = results.querySelector(".coach-student-option").dataset.studentKey;
  search.dispatchEvent(new win.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
  const firstActive = results.querySelector(".coach-student-option.is-active");
  assert(firstActive?.dataset.studentKey === firstStudentKey && firstActive.getAttribute("aria-selected") === "false" && !firstActive.querySelector('input[type="checkbox"]').checked && win.getComputedStyle(firstActive).backgroundColor === "rgba(0, 0, 0, 0)", "The first ArrowDown after clearing must focus the first row without selecting or filling it.");
  search.dispatchEvent(new win.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
  const secondActiveKey = results.querySelector(".coach-student-option.is-active").dataset.studentKey;
  assert(secondActiveKey !== firstStudentKey, "A subsequent ArrowDown must move the neutral keyboard focus indicator.");
  search.dispatchEvent(new win.KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
  assert(results.querySelector(".coach-student-option.is-active").dataset.studentKey === firstStudentKey, "ArrowUp must move the keyboard focus indicator back without changing selection.");
  search.value = "bea@example.com";
  search.dispatchEvent(new win.Event("input", { bubbles: true }));
  search.dispatchEvent(new win.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
  search.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  assert(!results.hidden && rowIds() === "ada-near,bea-near,ada-far,other-ada" && optionFor(win.getCoachBookingStudentKey(beaNear)).getAttribute("aria-selected") === "true" && optionFor(win.getCoachBookingStudentKey(beaNear)).querySelector('input[type="checkbox"]').checked && doc.querySelector("#coachBookingStudentDraftCount").textContent === "已选 1 位学生" && !results.querySelector('[data-student-action="apply"]').disabled && doc.querySelector("#coachBookingStudentValidation").hidden, "Selecting any student must synchronize row fill, checkbox, count and apply availability while keeping changes in the draft.");
  results.querySelector('[data-student-action="apply"]').click();
  assert(results.hidden && pickerSummary.textContent === "Bea" && search.value === "" && rowIds() === "bea-near", "Applying must update the read-only summary once, clear panel search and close the picker.");
  pickerTrigger.click();
  search.value = "ADA@EXAMPLE.COM";
  search.dispatchEvent(new win.Event("input", { bubbles: true }));
  assert([...results.querySelectorAll(".coach-student-option")].length === 1 && results.textContent.includes("ada@example.com"), "Case-insensitive email search must work, and duplicate names must show disambiguating email only when needed.");
  assert(rowIds() === "bea-near", "Typing a new search query must preserve existing selected students.");
  results.querySelector('[data-student-action="select-matches"]').click();
  assert(!results.hidden && rowIds() === "bea-near" && doc.querySelector("#coachBookingStudentDraftCount").textContent === "已选 2 位学生" && optionFor(win.getCoachBookingStudentKey(adaNear)).querySelector('input[type="checkbox"]').checked, "Selecting search results must add matches without clearing students selected outside the search.");
  results.querySelector('[data-student-action="apply"]').click();
  assert(rowIds() === "ada-near,bea-near,ada-far" && pickerSummary.textContent === "已选 2 位学生", "Applying a multi-student draft must update both views and use the compact count label.");
  assert(results.querySelector('[data-student-action="apply"]').textContent === "应用筛选" && doc.querySelector("#coachSaveToolbar").hidden && doc.querySelector("#saveProfileChanges").disabled, "Applying the list filter must take effect immediately without creating a manual-save draft.");
  assert(doc.querySelector("#coachCalendarFilterSummary").textContent.includes("正在查看2位学生的预约") && doc.querySelector("#coachCalendarFilterSummary").textContent.includes("本周 2 条"), `Applied multi-select feedback must show the combined weekly appointments: ${doc.querySelector("#coachCalendarFilterSummary").textContent}`);
  pickerTrigger.click();
  results.querySelector('[data-student-action="clear-draft"]').click();
  results.querySelector('[data-student-action="cancel"]').click();
  assert(rowIds() === "ada-near,bea-near,ada-far" && pickerSummary.textContent === "已选 2 位学生", "Cancel must discard an un-applied draft.");
  pickerTrigger.click();
  results.querySelector('[data-student-action="clear-draft"]').click();
  doc.body.click();
  assert(results.hidden && rowIds() === "ada-near,bea-near,ada-far" && pickerSummary.textContent === "已选 2 位学生", "Clicking outside must close the picker and discard its draft without changing the applied filter.");
  pickerTrigger.click();
  results.querySelector('[data-student-action="clear-draft"]').click();
  results.querySelector('[data-student-action="apply"]').click();
  assert(!results.hidden && rowIds() === "ada-near,bea-near,ada-far" && pickerSummary.textContent === "已选 2 位学生", "Clear selection must remain a draft, and its disabled apply action must preserve the previously applied students.");
  search.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  assert(results.hidden && doc.activeElement === pickerTrigger && pickerSummary.textContent === "已选 2 位学生" && rowIds() === "ada-near,bea-near,ada-far", "Escape must discard pending checkbox edits, restore trigger focus and preserve the applied filter.");
  pickerTrigger.click();
  search.value = "bea@example.com";
  search.dispatchEvent(new win.Event("input", { bubbles: true }));
  optionFor(win.getCoachBookingStudentKey(beaNear)).querySelector('input[type="checkbox"]').click();
  results.querySelector('[data-student-action="apply"]').click();
  assert(rowIds() === "ada-near,ada-far", "Applying after unchecking one student must retain the remaining selection.");
  listTab.click();
  assert(rowIds() === "ada-near,ada-far", "Selected student must display continuously across rinks and weeks, without matching same-name students.");
  assert(doc.querySelector(".bookings-panel").dataset.bookingView === "list" && win.getComputedStyle(doc.querySelector(".bookings-panel .coach-booking-date-filter")).display === "none" && win.getComputedStyle(doc.querySelector("#toggleExceptionCalendarHours")).display === "none", "List view must hide week navigation and calendar-only display settings.");
  assert(!doc.querySelector("#bookingCalendarSection").classList.contains("active") && doc.querySelector("#bookingListSection").classList.contains("active") && doc.querySelector("#scheduleLegend").closest(".booking-section") === doc.querySelector("#bookingCalendarSection"), "List view must hide the calendar and its dedicated legend while keeping the list active.");
  assert(doc.querySelector("#coachBookingListSummary").textContent === "共 2 节预约" && doc.querySelector("#coachBookingListSort").textContent === "按上课时间由近到远", "List count must reflect the applied student filter across weeks, with its chronological sort described separately.");
  assert(doc.querySelector('[data-booking-date="' + future + '"] .coach-booking-date-heading span').textContent === "1 节", "Filtering students must update the date heading's count along with the visible appointments.");
  assert(doc.querySelector("#coachBookingContentNote").textContent === "查看即将开始和历史预约", "The list must describe upcoming and historical appointments.");
  assert(pickerTrigger === doc.querySelector("#coachListStudentFilterMount #coachBookingStudentTrigger") && doc.querySelector("#coachBookingStudentLabel").textContent === "学生：", "The list's secondary filter row must reuse the existing picker and its applied selection.");
  assert(win.getComputedStyle(pickerTrigger).display !== "none" && !doc.querySelector("#saveProfileChanges").hidden, "List view must retain student filtering and the common header save entry.");
  calendarTab.click();
  assert(pickerSummary.textContent === "Ada" && doc.querySelector(".bookings-panel").dataset.bookingView === "calendar" && win.getComputedStyle(doc.querySelector(".bookings-panel .coach-booking-date-filter")).display !== "none", "Calendar/list switching must preserve the selected student and restore calendar controls.");
  assert(doc.querySelector("#coachBookingContentNote").textContent === "查看已成立的预约与安排不可预约时间", "Returning to the calendar must restore its existing description.");
  assert(pickerTrigger === doc.querySelector("#coachScheduleStudentFilterMount #coachBookingStudentTrigger") && doc.querySelector("#coachBookingStudentLabel").textContent === "查看学生", "Returning to the calendar must restore the original picker placement and label without duplicating it.");
  const dayIndex = (win.weekdayIndex(future) + 6) % 7;
  const cellAt = (time) => doc.querySelector(`#exceptionDragCalendar [data-day-index="${dayIndex}"][data-minutes="${win.minutesFromTime(time)}"]`);
  assert(cellAt("08:00").dataset.slotId === "ada-near", "Selected student booking must retain calendar details actions.");
  assert(cellAt("09:00").classList.contains("has-booking"), "A long lesson must occupy all covered calendar cells.");
  for (const time of ["10:00", "10:30", "11:00"]) {
    const cell = cellAt(time);
    assert(cell.classList.contains("has-booking") && cell.classList.contains("is-filtered-booking"), "Other students' lessons must remain visibly occupied for their whole duration.");
    assert(!cell.dataset.slotId && cell.title.includes("已占用") && !cell.title.includes("Bea"), "Excluded bookings must hide their details without appearing free.");
  }
  assert(cellAt("12:00").classList.contains("has-slot") && !cellAt("12:00").classList.contains("has-booking"), "Student filtering must preserve real availability.");
  assert(cellAt("13:00").classList.contains("has-blocked"), "Student filtering must preserve unavailable time.");
  cellAt("10:00").click();
  assert(!doc.querySelector("#bookingDetailsDialog").open, "Filtered occupied placeholders must not open another student's details.");
  cellAt("08:00").click();
  assert(doc.querySelector("#bookingDetailsDialog").open && doc.querySelector("#bookingDetailsBody").textContent.includes("Ada"), "Matching calendar appointments must still open details.");
  doc.querySelector("#closeBookingDetails").click();
  listTab.click();
  doc.querySelector('[data-coach-booking-period="past"]').click();
  assert(rowIds() === "ada-past,ada-older", "History must be newest first across all weeks.");
  assert(doc.querySelector("#coachBookingListSummary").textContent === "共 2 节预约" && doc.querySelector("#coachBookingListSort").textContent === "按上课时间从新到旧", "History count and descending sort must match the actual filtered appointment records.");
  assert(!doc.querySelector("#coachSlots img") && doc.querySelector("#coachSlots").textContent.includes("<img"), "Booking notes must render safely as text.");
  assert(!doc.querySelector('#coachSlots [data-action="coach-cancel-booking"]'), "Ended or cancelled history rows must not show cancellation actions.");
  assert(doc.querySelector('[data-slot-id="ada-past"] .coach-booking-student-line .coach-booking-status').textContent === "已结束" && !doc.querySelector('[data-slot-id="ada-past"]').textContent.includes("已确认"), "Ended history must show one current ended status beside the student name.");
  assert(doc.querySelector('[data-slot-id="ada-older"] .coach-booking-student-line .coach-booking-status').textContent === "已取消", "Cancelled history must keep its cancelled status beside the student name.");
  assert(!doc.querySelector('[data-slot-id="ada-past"]').textContent.includes("ada@example.com") && !doc.querySelector('[data-slot-id="ada-past"]').textContent.includes("每周开放时间生成"), "Email and scheduling notes must stay out of compact list rows.");
  doc.querySelector('[data-slot-id="ada-past"] [data-action="coach-booking-details"]').click();
  assert(doc.querySelector("#bookingDetailsDialog").open && doc.querySelector("#removeBookingDetails").hidden && doc.querySelector("#bookingDetailsBody").textContent.includes("ada@example.com") && doc.querySelector("#bookingDetailsBody").textContent.includes("每周开放时间生成"), "Ended details must contain full contact and scheduling notes without offering cancellation.");
  doc.querySelector("#closeBookingDetails").click();
  let historyCancelConfirmCalls = 0;
  win.confirm = () => { historyCancelConfirmCalls++; return true; };
  win.prepareCoachBookingCancellation("ada-past");
  assert(historyCancelConfirmCalls === 0 && adaPast.booked, "Cancellation execution must reject ended appointments even when invoked outside the visible list action.");
  calendarTab.click();
  win.shiftScheduleWeek(5);
  const emptyWeekSummary = doc.querySelector("#coachCalendarFilterSummary").textContent;
  assert(emptyWeekSummary === "正在查看Ada的预约 · 本周暂无预约", `Calendar must explain when the selected student has no bookings that week: ${emptyWeekSummary}`);
  listTab.click();
  assert(rowIds() === "ada-past,ada-older" && doc.querySelector('[data-coach-booking-period="past"]').classList.contains("active"), "List dates and selected range must survive calendar week navigation and view switching.");
  assert(JSON.stringify(win.slots) === snapshot, "Filtering and changing views must not mutate booking data.");
  pickerTrigger.click();
  search.value = "not-a-student";
  search.dispatchEvent(new win.Event("input", { bubbles: true }));
  assert(results.textContent.includes("未找到匹配学生"), "Unmatched student searches need a clear message.");
  assert(rowIds() === "ada-past,ada-older", "Unmatched searches must not silently clear an active student filter.");
  clearSearch.click();
  results.querySelector('[data-student-action="select-matches"]').click();
  results.querySelector('[data-student-action="apply"]').click();
  assert(pickerSummary.textContent === "全部学生" && search.value === "" && results.hidden, "Selecting every student and applying must restore the dynamic all-students state and close the panel.");
  calendarTab.click();
  doc.querySelector("#exceptionCalendarWeekStart").value = win.startOfWeekIso(future);
  win.renderExceptionDragCalendar();
  assert(cellAt("10:00").dataset.slotId === "bea-near" && !cellAt("10:00").classList.contains("is-filtered-booking"), "Clearing must restore all students' calendar detail actions.");
  pickerTrigger.click();
  search.value = "ada@example.com";
  search.dispatchEvent(new win.Event("input", { bubbles: true }));
  results.querySelector('[data-student-action="clear-draft"]').click();
  optionFor(win.getCoachBookingStudentKey(adaNear)).querySelector('input[type="checkbox"]').click();
  results.querySelector('[data-student-action="apply"]').click();
  listTab.click();
  doc.querySelector('[data-coach-booking-period="upcoming"]').click();
  doc.querySelector('[data-slot-id="ada-near"] [data-action="coach-booking-details"]').click();
  assert(doc.querySelector("#bookingDetailsDialog").open && !doc.querySelector("#removeBookingDetails").hidden && !doc.querySelector("#removeBookingDetails").disabled, "Future booking details must retain the existing eligible cancellation action.");
  doc.querySelector("#closeBookingDetails").click();
  let confirmCalls = 0;
  win.confirm = () => { confirmCalls++; return false; };
  doc.querySelector('[data-slot-id="ada-near"] [data-action="coach-cancel-booking"]').click();
  assert(confirmCalls === 1 && adaNear.booked, `Declining cancellation must preserve the booking: confirmCalls=${confirmCalls}, booked=${adaNear.booked}`);
  win.confirm = () => true;
  doc.querySelector('[data-slot-id="ada-near"] [data-action="coach-cancel-booking"]').click();
  const cancelledAda = win.slots.find((slot) => slot.id === "ada-near");
  assert(cancelledAda.booked && cancelledAda.status === "Cancelled" && cancelledAda.cancellation?.actorRole === "coach" && cancelledAda.cancellation?.at && beaNear.booked, "Cancellation must preserve an audited cancelled record and leave other students' bookings intact.");
  assert(win.slots.some((slot) => slot.id !== "ada-near" && slot.date === future && slot.start === "08:00" && !slot.booked), "Cancellation must reopen the original availability without deleting the cancelled record.");
  assert(pickerSummary.textContent === "Ada" && rowIds() === "ada-far", `Cancellation must refresh the list while preserving the student filter: summary=${pickerSummary.textContent}, rows=${rowIds()}`);
  doc.querySelector('[data-slot-id="ada-far"] [data-action="coach-cancel-booking"]').click();
  assert(doc.querySelector("#coachSlots .empty-state") && !doc.querySelector('#coachSlots [data-action="clear-coach-booking-student"]'), "Empty filtered lists must keep filter changes in the student picker without a duplicate clear action.");
  pickerTrigger.click();
  results.querySelector('[data-student-action="select-matches"]').click();
  results.querySelector('[data-student-action="apply"]').click();
  assert(pickerSummary.textContent === "全部学生" && rowIds().includes("bea-near"), "Selecting all and applying must restore other students' appointments.");
  assertNoRuntimeErrors("Coach schedule interactions", errors);
  dom.window.close();
}

async function testCoachStudentPickerViewportPlacement() {
  const { dom, errors } = await loadPage("coach/index.html");
  const win = dom.window, doc = win.document;
  doc.querySelector('[data-coach-panel="bookingsPanel"]').click();
  doc.querySelector('[data-booking-section="bookingListSection"]').click();
  const trigger = doc.querySelector("#coachBookingStudentTrigger");
  const panel = doc.querySelector("#coachBookingStudentResults");
  const options = doc.querySelector("#coachBookingStudentOptions");
  let bounds = { left: 80, top: 100, bottom: 136, width: 180, height: 36 };
  win.innerHeight = 800;
  win.innerWidth = 1200;
  Object.defineProperty(doc.documentElement, "clientHeight", { configurable: true, get: () => win.innerHeight });
  Object.defineProperty(doc.documentElement, "clientWidth", { configurable: true, get: () => win.innerWidth });
  trigger.getBoundingClientRect = () => bounds;
  panel.getBoundingClientRect = () => ({ width: Math.min(420, win.innerWidth - 32) });
  doc.querySelector(".coach-action-bar").getBoundingClientRect = () => ({ bottom: 67 });
  trigger.click();
  assert(panel.dataset.placement === "below" && panel.style.getPropertyValue("--coach-student-panel-max-height") === "480px", "A picker with enough room below must stay anchored beneath its trigger with a bounded height.");
  assert(win.getComputedStyle(options).overflowY === "auto" && Number.parseFloat(win.getComputedStyle(options).minHeight) === 0 && options.nextElementSibling.classList.contains("coach-student-panel-footer"), "Only options may scroll; the confirmation footer must remain a separate final panel row.");
  options.dispatchEvent(new win.Event("scroll"));
  assert(!panel.hidden, "Scrolling inside the options must not dismiss the draft or its footer.");
  bounds = { ...bounds, top: 650, bottom: 686 };
  win.dispatchEvent(new win.Event("resize"));
  assert(panel.dataset.placement === "above" && panel.style.getPropertyValue("--coach-student-panel-bottom") === "156px", "When the trigger is near the viewport bottom, the same panel must open above it instead of clipping its confirmation buttons.");
  win.innerHeight = 360;
  win.innerWidth = 375;
  bounds = { ...bounds, left: 180, top: 160, bottom: 196 };
  win.dispatchEvent(new win.Event("resize"));
  assert(panel.dataset.placement === "viewport" && panel.style.getPropertyValue("--coach-student-panel-top") === "79px" && panel.style.getPropertyValue("--coach-student-panel-max-height") === "269px" && panel.style.getPropertyValue("--coach-student-panel-left") === "20px", "A shallow viewport must reserve the visible space beneath the fixed header and keep the whole panel inside both horizontal edges.");
  panel.querySelector('[data-student-action="clear-draft"]').click();
  win.innerHeight = 800;
  bounds = { ...bounds, top: 10, bottom: 46 };
  doc.dispatchEvent(new win.Event("scroll"));
  assert(panel.hidden && doc.querySelector("#coachBookingStudentSummary").textContent === "全部学生", "Scrolling the trigger behind the fixed header must discard its un-applied draft without changing the active filter.");
  win.innerWidth = 1512;
  win.innerHeight = 724;
  bounds = { left: 263, top: 170, bottom: 206, width: 327, height: 36 };
  doc.querySelector("#coachRequestSectionTrigger").click();
  for (const scope of ["current", "history"]) {
    if (scope === "history") doc.querySelector("#coachRequestHistoryTrigger").click();
    trigger.click();
    assert(!panel.hidden && panel === doc.querySelector("#coachBookingStudentResults") && doc.querySelector("#coachBookingStudentPicker").parentElement.id === "coachRequestStudentFilterMount", `The ${scope} request scope must reuse the same student picker and confirmation footer.`);
    assert(panel.dataset.placement === "below" && panel.style.getPropertyValue("--coach-student-panel-max-height") === "480px", `The ${scope} request picker must reserve viewport space for its footer at the scrolled desktop position.`);
    const originalCount = doc.querySelector("#coachBookingStudentDraftCount").textContent;
    panel.querySelector('[data-student-action="clear-draft"]').click();
    assert(panel.querySelector('[data-student-action="apply"]').disabled && !doc.querySelector("#coachBookingStudentValidation").hidden && doc.querySelector("#coachBookingStudentSummary").textContent === "全部学生", `Clearing students in ${scope} requests must stay a draft and keep the applied request scope unchanged.`);
    options.dispatchEvent(new win.Event("scroll"));
    assert(!panel.hidden && !panel.querySelector(".coach-student-panel-footer").hidden, `Scrolling ${scope} request students must keep confirmation controls available.`);
    panel.querySelector('[data-student-action="cancel"]').click();
    trigger.click();
    assert(doc.querySelector("#coachBookingStudentDraftCount").textContent === originalCount && !panel.querySelector('[data-student-action="apply"]').disabled, `Cancelling ${scope} request checkbox changes must restore the applied selection on reopen.`);
    panel.querySelector('[data-student-action="cancel"]').click();
  }
  assertNoRuntimeErrors("Coach student picker viewport placement", errors);
  dom.window.close();
}

async function testCoachScheduleWeekNavigation() {
  const { dom, errors } = await loadPage("coach/index.html");
  const win = dom.window;
  const doc = win.document;
  doc.querySelector('[data-coach-panel="bookingsPanel"]').click();
  const input = doc.querySelector("#exceptionCalendarWeekStart");
  const range = doc.querySelector("#coachScheduleWeekRange");
  const trigger = doc.querySelector("#coachScheduleDateTrigger");
  const popover = doc.querySelector("#coachScheduleDatePopover");
  const bookingSnapshot = JSON.stringify(win.slots);
  assert(doc.querySelector('[data-coach-panel="bookingsPanel"]').textContent === "预约管理", "Coach navigation must use the appointment management name.");
  assert(doc.querySelector('.bookings-panel h3').textContent === "预约记录" && !doc.querySelector('.bookings-panel .panel-heading .eyebrow'), "Appointment title must describe established booking records.");
  assert(doc.querySelectorAll('#previousScheduleWeek').length === 1 && doc.querySelectorAll('#nextScheduleWeek').length === 1, "Week arrows must not be duplicated.");
  assert(doc.querySelector('#previousScheduleWeek').parentElement === trigger.parentElement && doc.querySelector('#nextScheduleWeek').parentElement === trigger.parentElement, "Both arrows must stay immediately around the date-range control.");
  assert(input.type === "hidden" && trigger.getAttribute("aria-haspopup") === "dialog" && popover.hidden && !doc.body.textContent.includes("跳转到日期"), "The week range must directly expose one themed date panel without an intermediate input popover.");
  trigger.click();
  assert(!popover.hidden && doc.querySelectorAll("#coachScheduleDateGrid [data-date]").length === 42 && doc.querySelector("#coachScheduleDateGrid .is-selected"), "Opening the range must show one accessible Monday-first calendar grid.");
  doc.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  assert(popover.hidden && doc.activeElement === trigger, "Escape must close the date panel and restore focus to its trigger.");
  trigger.click();
  doc.body.click();
  assert(popover.hidden && doc.activeElement === trigger, "Clicking outside must close the date panel and restore focus to its trigger.");
  function assertWeek(start, end, text) {
    assert(input.value === start, "Selected date must normalize to the existing Monday week start.");
    assert(range.textContent === text, "Week range must show the correct months and years: " + text);
    const headers = [...doc.querySelectorAll('#exceptionDragCalendar .calendar-day')];
    assert(headers.length === 7 && headers[0].dataset.date === start && headers[6].dataset.date === end, "Range must match the actual seven calendar dates.");
    headers.forEach((header, index) => assert(header.dataset.date === win.addDaysIso(start, index), "Calendar days must be consecutive."));
  }
  function choose(date) {
    trigger.click();
    const [year, month] = date.split("-").map(Number);
    const yearSelect = doc.querySelector("#coachScheduleYear");
    const monthSelect = doc.querySelector("#coachScheduleMonth");
    yearSelect.value = String(year);
    yearSelect.dispatchEvent(new win.Event("change", { bubbles: true }));
    monthSelect.value = String(month - 1);
    monthSelect.dispatchEvent(new win.Event("change", { bubbles: true }));
    doc.querySelector(`#coachScheduleDateGrid [data-date="${date}"]`).click();
    assert(popover.hidden && doc.activeElement === trigger, "Choosing a date must close the panel and return focus to the range trigger.");
  }
  choose("2026-10-29");
  assertWeek("2026-10-26", "2026-11-01", "2026年10月26日—11月1日");
  doc.querySelector('#nextScheduleWeek').click();
  assertWeek("2026-11-02", "2026-11-08", "2026年11月2日—11月8日");
  doc.querySelector('#previousScheduleWeek').click();
  assertWeek("2026-10-26", "2026-11-01", "2026年10月26日—11月1日");
  choose("2027-01-03"); // Sunday belongs to the preceding year's Monday.
  assertWeek("2026-12-28", "2027-01-03", "2026年12月28日—2027年1月3日");
  doc.querySelector('#nextScheduleWeek').click();
  assertWeek("2027-01-04", "2027-01-10", "2027年1月4日—1月10日");
  doc.querySelector('#previousScheduleWeek').click();
  assertWeek("2026-12-28", "2027-01-03", "2026年12月28日—2027年1月3日");
  choose("2028-02-29");
  assertWeek("2028-02-28", "2028-03-05", "2028年2月28日—3月5日");
  assert(!doc.querySelector('#exceptionDragCalendar [aria-current="date"]'), "A week away from today must not highlight a different day as today.");
  const currentWeekButton = doc.querySelector('#todayScheduleWeek');
  assert(currentWeekButton.textContent === "本周", "Return button must say current week.");
  currentWeekButton.click();
  const today = win.todayIso();
  const start = win.startOfWeekIso(today);
  assert(input.value === start && doc.querySelectorAll('#exceptionDragCalendar [aria-current="date"]').length === 1, "Returning to this week must highlight exactly today.");
  assert(doc.querySelector('#exceptionDragCalendar .calendar-day.is-today').dataset.date === today, "Today highlight must use the actual local date.");
  assert(JSON.stringify(win.slots) === bookingSnapshot, "Date navigation must never change appointments or availability.");
  assertNoRuntimeErrors("Coach week navigation", errors);
  dom.window.close();
}

async function testCoachPendingRequestFlow() {
  const { dom, errors } = await loadPage("coach/index.html");
  const win = dom.window;
  const doc = win.document;
  const date = win.todayIso(5);
  const booked = {
    id: "request-conflict-booking", coachId: "maya", date, start: "10:00", end: "10:30", location: "Polar Ice Rink",
    booked: true, status: "Booked", lessonName: "30 min private lesson", lessonDuration: 30, lessonPrice: 60,
    student: { name: "Existing Student", email: "existing@example.com" },
  };
  const open = { ...booked, id: "request-open-slot", start: "12:00", end: "12:30", booked: false, status: undefined, student: null };
  win.slots = [booked, open];
  const proposal = (version, start, end) => ({ version, date, start, end, location: "Polar Ice Rink", lessonName: "30 min private lesson", duration: 30, price: 60 });
  const expiresAt = new Date(`${date}T09:00`).toISOString();
  const createdAt = new Date().toISOString();
  win.bookingRequests = [
    { id: "request-open", type: "new-booking", coachId: "maya", student: { name: "Lena" }, status: "negotiating", waitingFor: "coach", proposerRole: "student", acceptedBy: ["student"], proposal: proposal(1, "12:00", "12:30"), expiresAt, createdAt, events: [{ type: "note" }, { type: "note" }] },
    { id: "request-conflict", type: "new-booking", coachId: "maya", student: { name: "Mia" }, status: "negotiating", waitingFor: "coach", proposerRole: "student", acceptedBy: ["student"], proposal: proposal(1, "10:00", "10:30"), expiresAt, createdAt, events: [] },
    { id: "request-waiting", type: "new-booking", coachId: "maya", student: { name: "Noah" }, status: "negotiating", waitingFor: "student", proposerRole: "coach", acceptedBy: ["coach"], proposal: proposal(1, "14:00", "14:30"), expiresAt, createdAt, events: [{ type: "message", actorRole: "coach", actorName: "Maya", message: "请确认这个时间。", at: new Date(Date.now() + 60_000).toISOString() }] },
    { id: "request-change", type: "booking-change", bookingId: booked.id, coachId: "maya", student: { name: "Existing Student" }, status: "negotiating", waitingFor: "student", proposerRole: "coach", acceptedBy: ["coach"], proposal: { ...proposal(1, "10:00", "10:30"), location: "Arcadia Ice Arena" }, expiresAt, createdAt, events: [] },
    { id: "request-expired", type: "new-booking", coachId: "maya", student: { name: "Past" }, status: "negotiating", waitingFor: "coach", proposerRole: "student", acceptedBy: ["student"], proposal: proposal(1, "15:00", "15:30"), expiresAt: new Date(Date.now() - 60_000).toISOString(), createdAt, events: [] },
  ];
  win.synchronizeExpiredBookingRequestsResult();
  win.synchronizeBookingRequestConflictsResult();
  win.renderCoachBookingRequests();
  win.render();
  const changeBookingRow = doc.querySelector('#coachSlots [data-slot-id="request-conflict-booking"]');
  assert(changeBookingRow.querySelector(".coach-booking-status")?.textContent === "预约成功" && changeBookingRow.querySelector(".coach-booking-request-status")?.textContent === "地点修改商议中" && !changeBookingRow.querySelector(".coach-booking-request-action"), `An unagreed modification must keep the original successful-booking status and separately show that the location change awaits the student: status=${changeBookingRow.querySelector(".coach-booking-status")?.textContent}, request=${changeBookingRow.querySelector(".coach-booking-request-status")?.textContent}, action=${changeBookingRow.querySelector(".coach-booking-request-action")?.textContent}, errors=${errors.join(" | ")}`);
  assert(doc.querySelector("#coachPendingBadge").textContent === "2", "Pending badge must count actionable request IDs, not events or waiting-on-student requests.");
  assert(win.bookingRequests.find((request) => request.id === "request-expired").status === "expired", "Expired negotiations must be closed by the explicit deadline.");

  doc.querySelector('[data-coach-panel="bookingsPanel"]').click();
  doc.querySelector("#coachRequestSectionTrigger").click();
  assert(!doc.querySelector("#coachRequestWorkspace").hidden && !doc.querySelector("#bookingCalendarSection").classList.contains("active") && !doc.querySelector("#bookingListSection").classList.contains("active"), "The top-level special-request entry must show only the shared request workspace.");
  assert(doc.querySelector('.bookings-panel h3').textContent === "特殊请求" && doc.querySelector("#coachRequestSectionTrigger").classList.contains("active") && !doc.querySelector("#coachBookingRecordsTrigger").classList.contains("active") && win.getComputedStyle(doc.querySelector(".coach-booking-content-nav")).display === "none" && doc.querySelector('[data-request-filter="all"]').classList.contains("active"), "Special requests must select the side entry, name the content, and hide record view controls.");
  assert(doc.querySelector("#coachBookingContentNote").hidden && doc.querySelector("#coachBookingStudentLabel").textContent === "学生", "Special requests must keep one page title and a compact auxiliary student label.");
  assert(win.getComputedStyle(doc.querySelector("#coachBookingStudentPicker")).display === "flex" && win.getComputedStyle(doc.querySelector("#coachBookingStudentTrigger")).height === "36px" && ["400", "normal"].includes(win.getComputedStyle(doc.querySelector("#coachBookingStudentTrigger")).fontWeight), "The shared student picker must render as a compact secondary filter in the request workspace without inheriting its wider calendar presentation.");
  assert(doc.querySelector("#coachRequestScopeCount").textContent === "4" && doc.querySelector("#coachRequestAllCount").textContent === "4" && doc.querySelector("#coachRequestFilterBadge").textContent === "2" && doc.querySelector("#coachRequestStudentCount").textContent === "2", "Current request and status counts must describe the same student-filtered ongoing scope.");
  assert(doc.querySelector("#coachBookingStudentPicker").parentElement.id === "coachRequestStudentFilterMount", "Special requests must move the single student filter into the request master column.");
  assert(doc.querySelector(".bookings-panel").dataset.bookingView === "requests", "Special requests must be a peer booking view rather than a list category.");
  const requestEntryStyle = win.getComputedStyle(doc.querySelector("#coachRequestSectionTrigger"));
  assert(doc.querySelectorAll(".coach-booking-side-nav > button").length === 2 && requestEntryStyle.borderTopWidth === "0px", "Two independent side entries must replace the former top-level view row.");
  const requestControlCss = fs.readFileSync(path.resolve("css/coach-workspace.css"), "utf8");
  assert(/\.coach-request-section-trigger\.active\s*\{[^}]*background:\s*linear-gradient/s.test(requestControlCss) && /\.coach-request-filter\.active\s*\{[^}]*background:\s*var\(--brand-soft\)/s.test(requestControlCss), "The primary request entry must use its soft sage gradient while active secondary filters remain quieter.");
  assert(doc.querySelectorAll('#coachRequestRecords [data-request-id]').length === 4 && !doc.querySelector('#coachRequestRecords [data-request-id="request-expired"]'), "The special-request workspace must contain only active negotiations.");
  doc.querySelector('[data-booking-section="bookingListSection"]').click();
  doc.querySelector('[data-coach-booking-period="past"]').click();
  assert(!doc.querySelector("#coachHistoricalRequests") && doc.querySelector("#coachAppointmentRecordsHeading").textContent === "课程记录", "Appointment history must not include a duplicate special-request history group.");
  doc.querySelector("#coachRequestSectionTrigger").click();
  doc.querySelector('[data-request-filter="coach"]').click();
  doc.querySelector('#coachRequestRecords [data-request-id="request-conflict"]').click();
  doc.querySelector('[data-request-filter="history"]').click();
  assert(doc.querySelector("#coachRequestScopeTitle").textContent === "请求历史" && !doc.querySelector("#coachRequestReturnCurrent").hidden && doc.querySelector("#coachRequestCurrentFilters").hidden && doc.querySelector("#coachRequestHistoryTrigger").hidden && win.getComputedStyle(doc.querySelector("#coachRequestCurrentFilters")).display === "none", "History must explicitly name its mode, expose a return action and hide active-request filters and the duplicate history entry.");
  doc.querySelector('#coachRequestRecords [data-request-id="request-expired"]').click();
  assert(doc.querySelector("#coachRequestStatus").textContent === "商议已到期" && !doc.querySelector(".coach-request-rule-note"), "Request history must open terminal details in the same workspace without active hold rules.");
  doc.querySelector("#coachRequestReturnCurrent").click();
  assert(doc.querySelector('[data-request-filter="coach"]').classList.contains("active") && doc.querySelector("#coachRequestId").value === "request-conflict" && doc.querySelector("#coachRequestScopeTitle").textContent === "当前请求" && doc.querySelector("#coachRequestReturnCurrent").hidden && !doc.querySelector("#coachRequestCurrentFilters").hidden && !doc.querySelector("#coachRequestHistoryTrigger").hidden, "Returning must restore the previous active filter and selected current request with matching navigation.");
  assert(doc.querySelector("#coachRequestHistoryTrigger").parentElement === doc.querySelector("#coachRequestScopeHeading") && doc.querySelector("#coachRequestScopeHeading").nextElementSibling.id === "coachRequestStudentFilterMount" && !doc.querySelector("#coachRequestHistoryTrigger").classList.contains("coach-request-filter") && doc.querySelectorAll("#coachRequestHistoryTrigger").length === 1, "The single compact history link must belong to the scope heading above student filtering, never the list footer or ongoing-filter row.");
  doc.querySelector('[data-request-filter="all"]').click();

  doc.querySelector("#coachBookingStudentTrigger").click();
  const studentResults = doc.querySelector("#coachBookingStudentResults");
  studentResults.querySelector('[data-student-action="clear-draft"]').click();
  const existingStudentOption = [...studentResults.querySelectorAll('[data-student-key]')].find((option) => option.textContent.includes("Existing Student"));
  existingStudentOption.querySelector('input[type="checkbox"]').click();
  studentResults.querySelector('[data-student-action="apply"]').click();
  assert(doc.querySelector("#coachBookingStudentSummary").textContent === "Existing Student", "The setup must apply a student filter before testing the shortcut reset.");
  const currentRequestBeforeHistory = doc.querySelector("#coachRequestId").value;
  doc.querySelector("#coachRequestHistoryTrigger").click();
  assert(doc.querySelector("#coachBookingStudentSummary").textContent === "Existing Student" && !doc.querySelector("#coachRequestRecords [data-request-id]") && doc.querySelector("#coachRequestEmpty strong").textContent === "暂无请求历史", "History must inherit the current student filter and explain an empty history without exposing ongoing filters.");
  doc.querySelector("#coachBookingStudentTrigger").click();
  studentResults.querySelector('[data-student-action="clear-draft"]').click();
  const historyStudentOption = [...studentResults.querySelectorAll('[data-student-key]')].find((option) => option.textContent.includes("Past"));
  historyStudentOption.querySelector('input[type="checkbox"]').click();
  studentResults.querySelector('[data-student-action="apply"]').click();
  assert(doc.querySelector("#coachRequestId").value === "request-expired", "The retained student picker must filter historical requests in place.");
  doc.querySelector("#coachRequestReturnCurrent").click();
  assert(doc.querySelector("#coachBookingStudentSummary").textContent === "Existing Student" && doc.querySelector("#coachRequestId").value === currentRequestBeforeHistory, "Changing students in history must not overwrite the current workspace's student filter or selected request.");
  const preservedRequestId = doc.querySelector("#coachRequestId").value;
  const preservedWeek = doc.querySelector("#exceptionCalendarWeekStart").value;
  let pageScroll = 430;
  Object.defineProperty(win, "scrollY", { configurable: true, get: () => pageScroll });
  win.scrollTo = ({ top }) => { pageScroll = top; };
  doc.querySelector("#coachRequestConversation").scrollTop = 71;
  doc.querySelector("#coachBookingRecordsTrigger").click();
  assert(doc.querySelector("#coachBookingStudentSummary").textContent === "全部学生" && doc.querySelector(".bookings-panel").dataset.bookingView === "list" && doc.querySelector('[data-coach-booking-period="past"]').classList.contains("active"), "Returning to booking records must restore its own student filter, view and history selection.");
  pageScroll = 200;
  doc.querySelector("#coachRequestSectionTrigger").click();
  assert(doc.querySelector("#coachBookingStudentSummary").textContent === "Existing Student" && doc.querySelector("#coachRequestId").value === preservedRequestId && pageScroll === 430 && doc.querySelector("#coachRequestConversation").scrollTop === 71 && doc.querySelector("#exceptionCalendarWeekStart").value === preservedWeek, "Switching workspaces must preserve their independent filters, selected request, week and scroll positions.");
  assert(doc.querySelector("#coachRequestFilterBadge").textContent === "0" && !doc.querySelector("#coachRequestFilterBadge").classList.contains("has-action") && doc.querySelector("#coachPendingBadge").textContent === "2" && doc.querySelector("#coachRequestNavBadge").textContent === "2", "A zero local response count must stay readable and quiet while global entry badges retain the global actionable count.");
  doc.querySelector("#coachPendingTrigger").click();
  assert(!doc.querySelector("#coachRequestWorkspace").hidden && !doc.querySelector("#coachBookingScheduleWorkspace").hidden, "The header entry must reuse the embedded request workspace without replacing appointment management.");
  assert(!doc.querySelector("#coachPendingPanel") && !doc.querySelector("#coachRequestDialog") && !doc.querySelector(".coach-request-records"), "Superseded duplicate pending and request surfaces must be removed.");
  assert(doc.querySelector("#coachBookingStudentSummary").textContent === "全部学生" && doc.querySelector('[data-request-filter="coach"]').classList.contains("active") && doc.querySelector("#coachRequestSectionTrigger").classList.contains("active") && !doc.querySelector('[data-booking-section="bookingCalendarSection"]').classList.contains("active") && !doc.querySelector('[data-booking-section="bookingListSection"]').classList.contains("active"), "The pending shortcut must restore all students and select the top-level special-request view and waiting-for-me.");
  const initiallySelectedRequest = win.bookingRequests.find((request) => request.id === doc.querySelector('#coachRequestRecords .is-selected')?.dataset.requestId);
  assert(doc.querySelectorAll('#coachRequestRecords [data-request-id]').length === 2 && initiallySelectedRequest?.waitingFor === "coach", "The shortcut must show only actionable requests in the shared workspace.");
  assert(doc.querySelector("#coachRequestFilterBadge").textContent === "2" && doc.querySelector("#coachPendingBadge").textContent === "2" && doc.querySelector("#coachRequestNavBadge").textContent === "2", "The workspace, top-level entry, and header must share the actionable-request count.");
  const topPendingBadgeStyle = win.getComputedStyle(doc.querySelector("#coachPendingBadge"));
  assert(topPendingBadgeStyle.position === "absolute" && Number.parseFloat(topPendingBadgeStyle.top) < 0 && Number.parseFloat(topPendingBadgeStyle.right) < 0, "The header pending count must hang from the button corner without entering its text flow.");

  doc.querySelector('[data-request-filter="coach"]').click();
  assert(doc.querySelectorAll('#coachRequestRecords [data-request-id]').length === 2, "The waiting-for-me filter must contain only actionable negotiations.");
  doc.querySelector('[data-request-filter="student"]').click();
  assert(doc.querySelectorAll('#coachRequestRecords [data-request-id]').length === 2, "The waiting-for-the-other-party filter must contain only active student turns.");
  doc.querySelector('[data-request-filter="all"]').click();
  assert(doc.querySelectorAll('#coachRequestRecords [data-request-id]').length === 4, "The all filter must include every active request and no terminal history.");
  doc.querySelector('#coachRequestRecords [data-request-id="request-open"]').click();
  assert(doc.querySelector(".coach-request-rule-note").textContent === "尚未形成预约，拟预约时段不保留。" && !doc.querySelector(".coach-request-hold-note"), "New special requests must show one concise in-card hold rule without a duplicate yellow strip.");
  assert(doc.querySelector("#coachRequestConflict").hidden && win.getComputedStyle(doc.querySelector("#coachRequestConflict")).display === "none", "A request without a conflict must not retain an empty warning region.");

  doc.querySelector("#coachRequestReply").value = "   ";
  doc.querySelector("#sendCoachRequestReply").click();
  assert(doc.querySelector("#coachRequestMessage").textContent === "请输入回复内容。", "Blank replies must be rejected inline.");
  doc.querySelector("#coachRequestReply").value = "请确认场地是否允许外教授课。";
  doc.querySelector("#sendCoachRequestReply").click();
  const replied = win.bookingRequests.find((request) => request.id === "request-open");
  assert(replied.waitingFor === "student" && replied.acceptedBy.join(",") === "student" && replied.events.at(-1).message === "请确认场地是否允许外教授课。", "A saved reply must persist, hand the turn to the student, and preserve proposal acceptance.");
  assert(doc.querySelector("#coachPendingBadge").textContent === "1" && doc.querySelector("#coachRequestConversation").textContent.includes("请确认场地是否允许外教授课。"), "Replying must refresh both pending counts and the visible conversation.");
  assert(doc.querySelector("#coachSaveToolbar").hidden && doc.querySelector("#saveProfileChanges").disabled, "An immediately saved request reply must not show a redundant save area.");

  doc.querySelector('#coachRequestRecords [data-request-id="request-conflict"]').click();
  assert(!doc.querySelector("#coachRequestConflict").hidden && doc.querySelector("#coachRequestConflict").textContent.includes("暂时不能接受") && doc.querySelector("#coachRequestConflict").textContent.includes("调整方案") && doc.querySelector("#acceptCoachRequest").disabled, "Occupied proposals must retain one explicit red warning and disable acceptance.");
  doc.querySelector("#openCoachRequestProposal").click();
  assert(!doc.querySelector("#coachRequestProposalFields").hidden && doc.querySelector("#openCoachRequestProposal").hidden && win.getComputedStyle(doc.querySelector("#openCoachRequestProposal")).display === "none" && doc.activeElement === doc.querySelector("#coachRequestDate"), "The concrete-proposal action must reveal and focus the inline editor without leaving a duplicate trigger visible.");
  doc.querySelector("#cancelCoachRequestProposal").click();
  assert(doc.querySelector("#coachRequestProposalFields").hidden && !doc.querySelector("#openCoachRequestProposal").hidden && win.getComputedStyle(doc.querySelector("#openCoachRequestProposal")).display !== "none", "Cancelling the proposal editor must restore its single entry action.");
  doc.querySelector("#openCoachRequestProposal").click();
  doc.querySelector("#coachRequestStart").value = "13:00";
  doc.querySelector("#coachRequestEnd").value = "13:30";
  doc.querySelector("#counterCoachRequest").click();
  const countered = win.bookingRequests.find((request) => request.id === "request-conflict");
  assert(countered.proposal.version === 2 && countered.waitingFor === "student" && countered.acceptedBy.join(",") === "coach" && doc.querySelector("#coachPendingBadge").hidden && doc.querySelector("#coachRequestNavBadge").hidden && doc.querySelector("#coachRequestFilterBadge").textContent === "0", "A counterproposal must update the current response count while hiding empty global reminder badges.");
  assert(["coachPendingBadge", "coachRequestNavBadge"].every((id) => doc.querySelector(`#${id}`).textContent === "" && win.getComputedStyle(doc.querySelector(`#${id}`)).display === "none") && !doc.querySelector("#coachRequestFilterBadge").hidden && !doc.querySelector("#coachRequestFilterBadge").classList.contains("has-action"), "Empty global reminders must disappear while the status filter explicitly displays a quiet zero.");

  doc.querySelector("#coachPendingTrigger").click();
  assert(doc.querySelector("#coachRequestSectionTrigger") && doc.querySelectorAll('#coachRequestRecords [data-request-id]').length === 0 && doc.querySelector('[data-request-filter="coach"]').classList.contains("active") && doc.querySelector("#coachRequestNavBadge").hidden, "The special-request entry must remain available without an empty badge when the pending count reaches zero.");
  doc.querySelector('[data-request-filter="student"]').click();
  assert(doc.querySelectorAll('#coachRequestRecords [data-request-id]').length === 4, "A zero pending count must not hide requests that are waiting for the other party.");
  doc.querySelector('[data-request-filter="all"]').click();

  doc.querySelector('#coachRequestRecords [data-request-id="request-waiting"]').click();
  const firstRequestBeforeExtension = doc.querySelector('#coachRequestRecords [data-request-id]')?.dataset.requestId;
  doc.querySelector("#extendCoachRequest").click();
  const extended = win.bookingRequests.find((request) => request.id === "request-waiting");
  assert(extended.waitingFor === "student" && extended.acceptedBy.join(",") === "coach", "Extending must not respond or alter proposal acceptance.");
  assert(doc.querySelector('#coachRequestRecords [data-request-id]')?.dataset.requestId === firstRequestBeforeExtension, "Extending a request must not move it ahead of newer messages or proposals.");
  doc.querySelector("#endCoachRequest").click();
  assert(win.bookingRequests.find((request) => request.id === "request-waiting").status === "ended", "Either party must be able to actively end a negotiation while retaining its record.");

  const originalSchedule = `${booked.date}|${booked.start}|${booked.end}|${booked.location}|${booked.lessonPrice}`;
  doc.querySelector('#coachRequestRecords [data-request-id="request-change"]').click();
  assert(doc.querySelector(".coach-request-rule-note").textContent === "原预约继续保留；新方案尚未生效，拟调整的时段不保留。" && !doc.querySelector("#coachRequestSummary").textContent.includes("尚未形成预约"), "Unagreed modification requests must distinguish the retained original booking from the unheld proposed time.");
  doc.querySelector("[data-request-booking-id]").click();
  assert(doc.querySelector("#bookingDetailsDialog").open && doc.querySelector('#bookingDetailsBody [data-request-id="request-change"]'), "A modification request must link back to the original booking and its related request.");
  doc.querySelector("#closeBookingDetails").click();
  doc.querySelector("#extendCoachRequest").click();
  assert(`${booked.date}|${booked.start}|${booked.end}|${booked.location}|${booked.lessonPrice}` === originalSchedule, "Reading or extending an unagreed change request must not mutate the original booking.");
  const changeRequest = win.bookingRequests.find((request) => request.id === "request-change");
  win.publishBookingRequests(win.bookingRequests.map(request => request === changeRequest ? { ...request, waitingFor: "coach", acceptedBy: ["student"] } : request));
  win.render();
  doc.querySelector('[data-booking-section="bookingListSection"]').click();
  doc.querySelector('[data-coach-booking-period="upcoming"]').click();
  assert(doc.querySelector('#coachSlots [data-slot-id="request-conflict-booking"] .coach-booking-request-action')?.textContent === "等你回应", "A modification waiting for the coach must add the action hint without replacing the booking status.");
  doc.querySelector("#coachRequestSectionTrigger").click();
  doc.querySelector('#coachRequestRecords [data-request-id="request-change"]').click();
  doc.querySelector("#acceptCoachRequest").click();
  assert(win.bookingRequests.find((request) => request.id === "request-change").status === "agreed" && win.slots.find((slot) => slot.id === booked.id).location === "Arcadia Ice Arena" && win.slots.find((slot) => slot.id === booked.id).availabilityLocation === "Polar Ice Rink", "An agreed same-time location change must update the actual rink only after acceptance while preserving the original availability rink for calendar comparison.");

  doc.querySelector('[data-booking-section="bookingListSection"]').click();
  doc.querySelector('[data-coach-booking-period="upcoming"]').click();
  assert(doc.querySelector("#coachRequestWorkspace").hidden && !doc.querySelector("#coachAppointmentsListContent").hidden && doc.querySelector(".bookings-panel").dataset.bookingView === "list" && doc.querySelector("#bookingListSection").classList.contains("active") && doc.querySelector("#coachBookingStudentPicker").parentElement.id === "coachListStudentFilterMount" && doc.querySelector('.bookings-panel h3').textContent === "预约记录", "List navigation must restore established booking records and its student filter.");
  doc.querySelector('[data-coach-booking-period="past"]').click();
  doc.querySelector("#coachRequestSectionTrigger").click();
  doc.querySelector('[data-request-filter="history"]').click();
  assert(doc.querySelectorAll("#coachRequestRecords [data-request-id]").length === 3 && doc.querySelector("#coachRequestRecords").textContent.includes("已达成") && doc.querySelector("#coachRequestRecords").textContent.includes("商议已结束"), "Special requests must retain agreed, expired, and ended request histories.");
  doc.querySelector("#coachBookingRecordsTrigger").click();
  win.openBookingDetails(booked.id);
  doc.querySelector('#bookingDetailsBody [data-request-id="request-change"]').click();
  assert(!doc.querySelector("#bookingDetailsDialog").open && doc.querySelector('[data-request-filter="history"]').classList.contains("active") && doc.querySelector("#coachRequestStatus").textContent === "已达成", "A terminal modification linked from a booking must open its history detail in the shared request workspace.");
  const pendingFixture = (count) => Array.from({ length: count }, (_, index) => ({
    id: `request-count-${index}`, type: "new-booking", coachId: "maya", student: { name: `Student ${index}` },
    status: "negotiating", waitingFor: "coach", proposerRole: "student", acceptedBy: ["student"],
    proposal: proposal(1, "12:00", "12:30"), expiresAt, createdAt, events: [],
  }));
  win.bookingRequests = pendingFixture(12);
  win.renderCoachBookingRequests();
  assert(["coachPendingBadge", "coachRequestNavBadge", "coachRequestFilterBadge"].every((id) => doc.querySelector(`#${id}`).textContent === "12"), "Two-digit pending counts must remain readable in every applicable badge.");
  win.bookingRequests = pendingFixture(105);
  win.renderCoachBookingRequests();
  assert(["coachPendingBadge", "coachRequestNavBadge"].every((id) => doc.querySelector(`#${id}`).textContent === "99+") && doc.querySelector("#coachRequestFilterBadge").textContent === "105", "Global reminders must cap at 99+ while the local status filter keeps its actual count.");
  const conflictEvent = (offset) => ({ type: "proposal-time-conflict", at: new Date(Date.now() + offset * 60_000).toISOString() });
  const groupedRequest = {
    ...pendingFixture(1)[0], id: "request-grouped-events", type: "booking-change", bookingId: booked.id,
    student: { name: "Log Student" }, waitingFor: "student", acceptedBy: ["coach"],
    events: [conflictEvent(0), conflictEvent(1), { type: "message", actorRole: "student", actorName: "Log Student", message: "<img src=x>请调整时间", at: createdAt }, conflictEvent(2), conflictEvent(3), { type: "proposal-created", proposalVersion: 2, at: createdAt }, conflictEvent(4), conflictEvent(5)],
  };
  win.bookingRequests = [groupedRequest];
  const originalEventLog = JSON.stringify(groupedRequest.events);
  doc.querySelector('[data-request-filter="all"]').click();
  const eventGroups = [...doc.querySelectorAll("#coachRequestConversation .coach-request-event-group")];
  assert(eventGroups.length === 3 && eventGroups.every((group) => !group.open && group.querySelectorAll(".coach-request-system-event").length === 2), "Only consecutive conflict reminders may fold into closed groups; messages and new proposals must separate them.");
  eventGroups[0].open = true;
  assert(eventGroups[0].querySelector("time").dateTime === groupedRequest.events[0].at && JSON.stringify(groupedRequest.events) === originalEventLog, "Expanding a conflict group must retain every original timestamp without editing or deleting the stored event log.");
  assert(!doc.querySelector("#coachRequestConversation img") && doc.querySelector("#coachRequestConversation").textContent.includes("<img src=x>"), "Conversation grouping must continue rendering external message text safely.");
  assert(doc.querySelector("#coachRequestDialogTitle").textContent === "Log Student" && doc.querySelector("#coachRequestType").textContent === "修改预约", "The detail must separate the student's name from the secondary request type.");
  assert(doc.querySelector("#coachRequestScopeCount").textContent === "1" && doc.querySelector("#coachRequestAllCount").textContent === "1" && doc.querySelector("#coachRequestFilterBadge").textContent === "0" && doc.querySelector("#coachRequestStudentCount").textContent === "1" && !doc.querySelector("#coachRequestFilterBadge").classList.contains("has-action"), "A waiting-on-student request must produce clear 1/0/1 status counts without an urgent zero badge.");
  assertNoRuntimeErrors("Coach pending request flow", errors);
  dom.window.close();
}

async function testCoachScheduleCalendarGrid() {
  const { dom, errors } = await loadPage("coach/index.html");
  const win = dom.window;
  const doc = win.document;
  const weekStart = win.startOfWeekIso(win.nextWeekdayIso(1));
  const calendarCss = fs.readFileSync(path.resolve("css/calendar.css"), "utf8");
  assert(/\.coach-week-calendar\s*\{[^}]*overscroll-behavior-y:\s*auto;[^}]*touch-action:\s*pan-x pan-y;/s.test(calendarCss), "Coach calendars must restore native wheel and touchpad scroll chaining at their boundaries.");
  const booking = (id, day, start, end, location, studentName, extra = {}) => ({
    id,
    coachId: "maya",
    date: win.addDaysIso(weekStart, day),
    start,
    end,
    location,
    availabilityLocation: location,
    booked: true,
    lessonName: "私教课",
    lessonDuration: win.minutesFromTime(end) - win.minutesFromTime(start),
    lessonPrice: 60,
    status: "Confirmed",
    student: { name: studentName, email: `${id}@example.com`, note: "" },
    ...extra,
  });
  const lesson15 = booking("lesson-15", 6, "08:00", "08:15", "Polar Ice Rink", "Fifteen Minute Student");
  const lesson30 = booking("lesson-30", 0, "08:00", "08:30", "Polar Ice Rink", "Thirty Student");
  const lesson45 = booking("lesson-45", 1, "09:15", "10:00", "Arcadia Ice Arena", "Forty Five Student");
  const lesson60 = booking("lesson-60", 2, "10:30", "11:30", "Oceanside Ice Arena", "Sixty Student");
  const changedLocation30 = booking("lesson-location-change", 4, "08:00", "08:30", "Polar Ice Rink", "Alexandria Catherine Montgomery", { availabilityLocation: "Arcadia Ice Arena" });
  const gapOpenSlot = { ...booking("gap-open", 0, "08:30", "09:00", "Polar Ice Rink", ""), booked: false, student: null };
  const gapAfterBooking = booking("gap-after", 0, "09:00", "09:30", "Polar Ice Rink", "Gap Student");
  const openSlot = { ...booking("open-slot", 3, "12:00", "12:30", "Polar Ice Rink", ""), booked: false, student: null };
  const continuousOpenSlot = { ...openSlot, id: "open-slot-continuous", start: "12:30", end: "13:00" };
  const changedRinkSlot = { ...openSlot, id: "open-slot-changed", start: "13:00", end: "13:30", location: "Arcadia Ice Arena", availabilityLocation: "Arcadia Ice Arena" };
  const interruptedOpenSlot = { ...openSlot, id: "open-slot-interrupted", start: "14:00", end: "14:30" };
  const longOpenSlot = { ...openSlot, id: "long-open-slot", date: win.addDaysIso(weekStart, 5), start: "06:00", end: "12:00" };
  win.slots = [lesson15, lesson30, gapOpenSlot, gapAfterBooking, lesson45, lesson60, changedLocation30, openSlot, continuousOpenSlot, changedRinkSlot, interruptedOpenSlot, longOpenSlot];
  win.blockedExceptions = [{ id: "grid-block", coachId: "maya", date: win.addDaysIso(weekStart, 4), start: "13:00", end: "13:30", reason: "Unavailable" }];
  doc.querySelector("#exceptionCalendarWeekStart").value = weekStart;
  win.renderExceptionDragCalendar();
  doc.querySelector("#calendarWeekStart").value = weekStart;
  win.renderDragCalendar();

  const block15 = doc.querySelector('.coach-calendar-booking[data-slot-id="lesson-15"]');
  const block30 = doc.querySelector('.coach-calendar-booking[data-slot-id="lesson-30"]');
  const block45 = doc.querySelector('.coach-calendar-booking[data-slot-id="lesson-45"]');
  const block60 = doc.querySelector('.coach-calendar-booking[data-slot-id="lesson-60"]');
  const changedLocationBlock = doc.querySelector('.coach-calendar-booking[data-slot-id="lesson-location-change"]');
  assert(block15 && block30 && block45 && block60 && changedLocationBlock, "Coach calendar must render one visible overlay for every appointment.");
  assert(block15.style.gridRow.endsWith("span 15") && block30.style.gridRow.endsWith("span 30") && block45.style.gridRow.endsWith("span 45") && block60.style.gridRow.endsWith("span 60"), "Appointment block heights must follow their exact minute durations.");
  assert(block15.classList.contains("is-short") && block15.querySelector(".coach-calendar-booking-meta") && block15.title.includes("Fifteen Minute Student") && block15.title.includes("08:00–08:15") && block15.title.includes("Polar Ice Rink"), "A 15-minute appointment must preserve its exact height while keeping complete hover and accessible information.");
  assert(!block30.querySelector(".coach-calendar-location-change") && block30.querySelector(".coach-calendar-booking-rink")?.textContent === "Polar Ice", "A normal 30-minute appointment must show the maintained unambiguous rink short name without a location-change label.");
  assert(changedLocationBlock.querySelector(".coach-calendar-location-change")?.textContent === "另约场地" && changedLocationBlock.querySelector("strong")?.textContent === "Alexandria Catherine Montgomery" && changedLocationBlock.querySelector(".coach-calendar-booking-time")?.textContent === "08:00–08:30" && changedLocationBlock.querySelector(".coach-calendar-booking-rink")?.textContent === "Polar Ice", "An alternate-venue card must keep the full source text in the name node while reserving fixed places for its label, time, and actual rink.");
  assert(changedLocationBlock.title.includes("Alexandria Catherine Montgomery") && changedLocationBlock.title.includes("实际授课地点：Polar Ice Rink") && changedLocationBlock.title.includes("该时段开放冰场：Arcadia Ice Arena"), "Alternate-venue hover text must use the booking's full name, actual time, actual location, and the rink opened for that time slot.");
  const changedLocationCell = doc.querySelector('#exceptionDragCalendar [data-day-index="4"][data-minutes="480"]');
  assert(changedLocationCell.style.getPropertyValue("--rink-color") === "#bfdbfe" && changedLocationBlock.style.getPropertyValue("--booking-accent") === "#22c55e", "A changed-location booking must retain the original Arcadia availability background while the booking card uses the actual Polar color.");
  assert(changedLocationCell.title === changedLocationBlock.title, "Hovering the booking or its underlying occupied cell must expose the same real booking information instead of a stale availability time.");
  const availability45 = [...doc.querySelectorAll("#dragCalendar .coach-calendar-booking")].find((block) => block.title.includes("09:15–10:00"));
  assert(doc.querySelector("#dragCalendar").classList.contains("coach-week-calendar") && doc.querySelector("#exceptionDragCalendar").classList.contains("coach-week-calendar"), "Both coach calendars must share the common week-grid style contract.");
  assert(availability45?.classList.contains("is-availability-booking") && availability45.style.gridRow.endsWith("span 45"), "Availability calendar bookings must use the same exact minute scale.");
  assert(availability45.style.getPropertyValue("--booking-accent") === block45.style.getPropertyValue("--booking-accent"), "The same rink must use the same booking color in both calendars.");
  assert(doc.querySelector("#dragCalendar .calendar-time").style.gridRow === doc.querySelector("#exceptionDragCalendar .calendar-time").style.gridRow, "Both calendars must align time-axis rows identically.");
  const headerLabel = (selector) => [...doc.querySelector(selector).querySelectorAll(':scope > strong, :scope > span')].map((node) => node.textContent).join(' ');
  assert(headerLabel('#dragCalendar .calendar-day') === headerLabel('#exceptionDragCalendar .calendar-day'), "Both calendars must share weekday and date labels while availability adds its day-operation control.");
  assert(block45.textContent.includes("Forty Five Student") && block45.textContent.includes("09:15–10:00") && block45.textContent.includes("Arcadia") && block45.title.includes("Arcadia Ice Arena"), "Appointment blocks must show the maintained rink abbreviation while retaining the full rink name in details.");
  assert(block60.textContent.includes("Oceanside") && block60.title.includes("Oceanside Ice Arena"), "Long rink names must use an explicit abbreviation without losing the full accessible label.");
  assert(block30.style.getPropertyValue("--booking-accent") !== block45.style.getPropertyValue("--booking-accent") && block45.style.getPropertyValue("--booking-accent") !== block60.style.getPropertyValue("--booking-accent"), "Different rinks must retain distinct booking colors.");
  assert(doc.querySelector('#exceptionDragCalendar [data-day-index="3"][data-minutes="720"]').classList.contains("has-slot"), "Available time must remain visible beneath the appointment layer.");
  const watermarkAt = (calendarId, day, minutes) => doc.querySelector(`#${calendarId} .calendar-location-watermark[data-day-index="${day}"][data-start-minutes="${minutes}"]`);
  for (const calendarId of ["exceptionDragCalendar", "dragCalendar"]) {
    const firstWatermark = watermarkAt(calendarId, 3, 720);
    const firstStamp = firstWatermark?.querySelector(".calendar-location-watermark-text");
    const watermarkStyle = win.getComputedStyle(firstWatermark);
    const stampStyle = win.getComputedStyle(firstStamp);
    assert(firstWatermark?.dataset.endMinutes === "780" && firstStamp?.textContent === "POLAR ICE", `${calendarId} must render one watermark layer across the continuous rink segment.`);
    assert(watermarkAt(calendarId, 3, 780)?.textContent === "ARCADIA", `${calendarId} must start a new watermark layer when the rink changes.`);
    assert(watermarkAt(calendarId, 3, 840)?.textContent === "POLAR ICE", `${calendarId} must restart the same rink watermark after a time interruption.`);
    const shortGap = watermarkAt(calendarId, 0, 510);
    assert(shortGap?.dataset.endMinutes === "540" && shortGap.textContent === "POLAR ICE", `${calendarId} must give a minimum 30-minute gap between bookings its own clipped watermark.`);
    assert(watermarkStyle.pointerEvents === "none" && stampStyle.fontSize === "18px" && stampStyle.fontWeight === "800" && stampStyle.transform.includes("-31deg"), `${calendarId} watermarks must share the bold diagonal non-interactive treatment.`);
    assert(!doc.querySelector(`#${calendarId} .calendar-location-label`), `${calendarId} must remove the superseded location-label implementation.`);
    const longWatermark = watermarkAt(calendarId, 5, 360);
    assert(longWatermark?.dataset.endMinutes === "720" && longWatermark.querySelectorAll(".calendar-location-watermark-text").length === 2, `${calendarId} long availability must use sparse staggered repeats rather than one label per cell.`);
  }
  assert(Number(win.getComputedStyle(block30).zIndex) > Number(win.getComputedStyle(watermarkAt("exceptionDragCalendar", 0, 510)).zIndex), "Appointment content must remain above the shared location watermark layer.");
  assert(block45.querySelector(".coach-calendar-booking-meta")?.textContent === "09:15–10:00Arcadia" && block30.querySelector(".coach-calendar-booking-meta")?.textContent === "08:00–08:30Polar Ice", "Appointments of 30 minutes and longer must keep their real time and maintained rink name on the secondary line.");
  assert(doc.querySelector('#exceptionDragCalendar [data-day-index="4"][data-minutes="780"]').classList.contains("has-blocked"), "Unavailable time must retain its blocked state.");
  assert([...doc.querySelectorAll("#exceptionDragCalendar .calendar-day")].every((header, index) => header.textContent.includes(`周${"一二三四五六日"[index]}`)), "Week headers must show clear localized weekday labels.");
  block45.click();
  assert(doc.querySelector("#bookingDetailsDialog").open && doc.querySelector("#bookingDetailsBody").textContent.includes("Forty Five Student"), "Clicking a calendar appointment must retain the existing details action.");
  doc.querySelector("#closeBookingDetails").click();
  changedLocationBlock.click();
  assert(doc.querySelector("#bookingDetailsDialog").open && doc.querySelector("#bookingDetailsBody").textContent.includes("该时段开放冰场：Arcadia Ice Arena → 实际授课地点：Polar Ice Rink"), "Alternate-venue booking details must explicitly compare the rink opened for that time slot with the actual teaching location.");
  doc.querySelector("#closeBookingDetails").click();
  doc.querySelector("#toggleExceptionCalendarHours").click();
  assert(doc.querySelector('.coach-calendar-booking[data-slot-id="lesson-45"]').style.gridRow.endsWith("span 45"), "Full-day mode must preserve exact appointment duration.");

  const dragDate = win.addDaysIso(weekStart, 6);
  for (const [id, value] of [['coachPlannerScope', 'dates'], ['coachPlannerFrom', weekStart], ['coachPlannerTo', dragDate]]) { const field = doc.getElementById(id); field.value = value; field.dispatchEvent(new win.Event('change', { bubbles: true })); }
  const context = (node) => node.dispatchEvent(new win.MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  const command = (label) => { const button = [...doc.querySelectorAll('#coachOpenContextMenu button')].find((item) => calendarMenuLabel(item) === label); assert(button && !button.disabled, `Missing calendar command: ${label}`); button.click(); };
  const dragCell = () => doc.querySelector('#dragCalendar .calendar-cell[data-day-index="6"][data-minutes="840"]');
  const beforeSelect = JSON.stringify(win.slots); dragCell().click();
  assert(JSON.stringify(win.slots) === beforeSelect, 'Cell selection must not paint or save availability.');
  doc.querySelector('#calendarRinkOptions [data-rink="Polar Ice Rink"]').click(); dragCell().click();
  doc.querySelector('#calendarRinkOptions [data-rink="Polar Ice Rink"]').click();
  assert(win.slots.some((slot) => slot.date === dragDate && slot.start === '14:00' && !slot.booked), 'Explicit selection commands must create draft availability.');
  doc.querySelector('#saveAvailability').click();
  assert(doc.querySelector('#availabilitySaveMessage').textContent.includes('已保存'), 'Selection commands must retain the established save behavior.');
  context(dragCell()); command('删除选中开放时段');
  assert(!win.slots.some((slot) => slot.date === dragDate && slot.start === '14:00' && !slot.booked), 'Delete must only remove the selected range.');
  doc.querySelector('#saveAvailability').click();
  assertNoRuntimeErrors("Coach calendar grid", errors);
  dom.window.close();
}

async function testAvailabilityDragRetraction() {
  const { dom, errors } = await loadPage('coach/index.html');
  const win = dom.window, doc = win.document;
  doc.querySelector('[data-coach-panel="availabilityPanel"]').click();
  const week = win.startOfWeekIso(win.addDaysIso(win.todayIso(), 14)), date = win.addDaysIso(week, 2);
  win.slots = [{ id: 'selection-base', coachId: 'maya', date, start: '06:00', end: '09:00', location: 'Any served rink', booked: false }];
  doc.getElementById('calendarWeekStart').value = week; win.renderDragCalendar();
  const calendar = doc.getElementById('dragCalendar'), cell = (minute) => calendar.querySelector(`.calendar-cell[data-day-index="2"][data-minutes="${minute}"]`);
  let hit = cell(360); doc.elementsFromPoint = () => [hit];
  const pointer = (node, type, y) => { const event = new win.MouseEvent(type, { bubbles: true, cancelable: true, clientX: 100, clientY: y, button: 0 }); Object.defineProperty(event, 'pointerId', { value: 1 }); node.dispatchEvent(event); };
  const before = JSON.stringify(win.captureAvailabilityUndoState()), originalGrid = [...calendar.querySelectorAll('.calendar-cell')].map((node) => node.outerHTML).join('');
  pointer(hit, 'pointerdown', 10); hit = cell(510); pointer(calendar, 'pointermove', 90); hit = cell(390); pointer(calendar, 'pointermove', 30);
  assert(calendar.querySelector('.calendar-open-selection').getAttribute('aria-label').endsWith('06:00–07:00'), 'Retracting selection must retain only the final range.');
  doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert(!calendar.querySelector('.calendar-open-selection') && JSON.stringify(win.captureAvailabilityUndoState()) === before, 'Escape must cancel selection without editing the draft or undo history.');
  hit = cell(510); pointer(hit, 'pointerdown', 90); hit = cell(360); pointer(calendar, 'pointermove', 10); hit = cell(450); pointer(calendar, 'pointermove', 50);
  assert(calendar.querySelector('.calendar-open-selection').getAttribute('aria-label').endsWith('07:30–09:00'), 'Reverse selection must retract without changing its data.');
  calendar.dispatchEvent(new win.Event('pointercancel', { bubbles: true }));
  assert([...calendar.querySelectorAll('.calendar-cell')].map((node) => node.outerHTML).join('') === originalGrid && JSON.stringify(win.captureAvailabilityUndoState()) === before, 'Pointer cancellation must leave original colors, exact times and draft markers intact.');
  assertNoRuntimeErrors('Availability range selection retraction', errors); dom.window.close();
}

async function testAutomaticSchedulingBookingTransactions() {
  const { dom, errors } = await loadPage("coach/index.html");
  const win = dom.window, doc = win.document;
  const date = win.addDaysIso(win.todayIso(), 14);
  const make = (id, start, end, location, booked = false) => ({ id, coachId: "maya", date, start, end, location, availabilityLocation: location, booked, status: booked ? "Booked" : undefined, student: booked ? { name: id, email: `${id}@example.com` } : null, lessonName: "私教课", lessonDuration: 30, lessonPrice: 60 });
  const original = make("planner-fixed-A", "09:00", "09:30", "Polar Ice Rink", true);
  win.slots = [original, ...[["09:30", "10:00"], ["10:00", "10:30"], ["10:30", "11:00"], ["11:00", "11:30"], ["11:30", "12:00"]].map(([start, end], index) => make(`planner-open-${index}`, start, end, "Polar Ice Rink"))];
  const config = win.createSchedulingConfig(win.readProfileState("maya").saved.servedRinks);
  config.enabled = true;
  config.workDays = Array.from({ length: 7 }, () => ({ enabled: true, start: "06:00", end: "17:30" }));
  for (const location of config.locations) {
    location.included = location.name !== "Oceanside Ice Arena";
    location.windows = location.included ? [{ days: [0, 1, 2, 3, 4, 5, 6], start: "06:00", end: "17:30" }] : [];
  }
  config.travelRules = [
    { id: "A-B", from: "Polar Ice Rink", to: "Arcadia Ice Arena", days: [0, 1, 2, 3, 4, 5, 6], start: "00:00", end: "24:00", minutes: 30 },
    { id: "B-A", from: "Arcadia Ice Arena", to: "Polar Ice Rink", days: [0, 1, 2, 3, 4, 5, 6], start: "00:00", end: "24:00", minutes: 30 },
  ];
  win.setSchedulingConfig("maya", config);
  const request = (id, start, end) => ({ id, coachId: "maya", type: "new-booking", student: { name: id, email: `${id}@example.com` }, status: "negotiating", waitingFor: "coach", proposerRole: "student", acceptedBy: ["student"], createdAt: new Date().toISOString(), expiresAt: new Date(`${date}T09:00:00`).toISOString(), proposal: { version: 1, date, start, end, location: "Arcadia Ice Arena", lessonName: "私教课", duration: 30, price: 60 }, events: [] });
  win.bookingRequests = [request("planner-accepted", "10:00", "10:30"), request("planner-failure", "12:00", "12:30")];
  assert(win.publishAvailabilityDraft().ok, "The planner transaction fixture must start from a published configuration and schedule.");
  doc.querySelector('[data-coach-panel="availabilityPanel"]').click();
  win.renderSchedulingSettings();
  win.pushAvailabilityUndoState();
  const gap = doc.querySelector('[data-config="sameRinkGap"]');
  gap.value = "5"; gap.dispatchEvent(new win.Event("input", { bubbles: true }));
  win.blockedExceptions = [...win.blockedExceptions, { id: "private-rest-draft", coachId: "maya", date, start: "11:00", end: "11:30" }];
  assert(win.getSchedulingConfig("maya").sameRinkGap === 5 && win.getTestPublishedSchedule().planning.configs.maya.sameRinkGap === 0, "Editing a scheduling rule must not publish it immediately.");
  const accepted = win.acceptCoachBookingRequest("planner-accepted");
  assert(accepted.accepted, `A feasible request must be accepted: ${JSON.stringify(accepted)}`);
  const published = win.getTestPublishedSchedule();
  assert(!JSON.parse(win.localStorage.getItem("ice-skating-coach-booking-slots-v12")).blockedExceptions.some((block) => block.id === "private-rest-draft") && win.blockedExceptions.some((block) => block.id === "private-rest-draft"), "Accepting a request must retain a private rest draft without publishing it.");
  assert(published.slots.some((slot) => slot.specialRequestId === "planner-accepted" && slot.booked), "Accepted requests must publish their booking.");
  assert(published.planning.configs.maya.sameRinkGap === 0 && win.getSchedulingConfig("maya").sameRinkGap === 5 && !doc.querySelector("#saveProfileChanges").disabled, "An immediate request must preserve the unrelated editing draft without publishing its rule changes.");
  assert(published.slots.some((slot) => !slot.booked && slot.location === "Polar Ice Rink" && slot.start === "09:30") && !published.planning.blocks.some((block) => block.date === date), "Accepting a feasible request must preserve other published supply and avoid publishing an unreviewed optimization.");
  assert(published.planning.suggestions.some((item) => item.date === date), "The affected date must receive an optimization suggestion.");
  win.undoAvailabilityChange();
  assert(win.slots.some((slot) => slot.specialRequestId === "planner-accepted" && slot.booked), "Undoing the old draft must never remove a booking accepted after that draft snapshot.");
  const savedBeforeFailure = win.localStorage.getItem("ice-skating-coach-booking-slots-v12");
  const setItem = win.localStorage.setItem;
  win.localStorage.setItem = () => { throw new win.DOMException("test failure", "QuotaExceededError"); };
  const failed = win.acceptCoachBookingRequest("planner-failure");
  win.localStorage.setItem = setItem;
  assert(!failed.accepted && failed.reason === "storage" && win.bookingRequests.find((item) => item.id === "planner-failure").status === "negotiating" && !win.slots.some((slot) => slot.specialRequestId === "planner-failure"), "A failed atomic save must restore both the request and booking state.");
  assert(win.localStorage.getItem("ice-skating-coach-booking-slots-v12") === savedBeforeFailure, "Failure must leave the published schedule unchanged.");
  assert(JSON.stringify(win.slots.find((slot) => slot.id === original.id)) === JSON.stringify(original), "Scheduling transactions must preserve unrelated fixed bookings byte-for-byte.");
  assertNoRuntimeErrors("Automatic scheduling transactions", errors);
  dom.window.close();
}

async function testCompactCommutePlanner() {
  const { dom, errors } = await loadPage('coach/index.html', { now: '2035-01-01T06:00:00' });
  const win = dom.window, doc = win.document;
  const date = win.addDaysIso(win.todayIso(), 1), [from, to] = win.readProfileState('maya').saved.servedRinks;
  const make = (id, start, end, location, booked = false) => ({ id, coachId: 'maya', date, start, end, location, availabilityLocation: location, booked, status: booked ? 'Booked' : 'Open', lessonName: '私教课', lessonDuration: 30, lessonPrice: 60 });
  const booking = make('commute-reference', '09:00', '09:30', from, true);
  win.slots = [make('travel-open-a', '08:00', '09:00', from), booking, make('travel-open-b', '10:00', '12:00', to)];
  doc.querySelector('[data-coach-panel="availabilityPanel"]').click();
  const field = (id, value) => { const node = doc.getElementById(id); node.value = value; node.dispatchEvent(new win.Event('change', { bubbles: true })); };
  field('coachPlannerScope', 'dates'); field('coachPlannerFrom', date); field('coachPlannerTo', date); field('calendarWeekStart', date);
  doc.querySelector('[data-optimize-scope="tomorrow"]').click();
  win.renderSchedulingSettings(); win.renderDragCalendar();
  const root = doc.getElementById('coachSchedulerConfig'), details = () => root.querySelector('[data-travel-details]');
  assert(root.querySelectorAll('[data-travel-direction]').length === 2 && !root.querySelector('[data-preference], [data-config="mandatoryOrder"]') && !root.textContent.includes('地点偏好'), 'Only the two calendar venues should produce routes, with no preference controls.');
  assert(!details().open && root.querySelector('[data-config="sameRinkGap"]').value === '0', 'Default commute UI must be compact with a zero-minute break.');
  assert(!root.textContent.includes('Google') && !root.querySelector('[data-field="address"], [data-field="mapDate"], [data-planner-action="estimate"], [data-travel-rule], [data-config="travelBuffer"]'), 'Coach generation must not expose map or per-weekday route setup.');
  doc.querySelector('[data-optimize-scope="today"]').click();
  assert(!root.querySelector('[data-travel-direction]') && root.textContent.includes('没有需要跨冰场'), 'Moving the scope to an empty date must clear the route list immediately.');
  doc.querySelector('[data-optimize-scope="tomorrow"]').click();
  assert(root.querySelectorAll('[data-travel-direction]').length === 2, 'Returning to the populated scope must restore both directions.');
  const originalSupply = [...win.slots], third = win.readProfileState('maya').saved.servedRinks[2];
  win.slots = [...originalSupply, make('third-booking', '14:00', '14:30', third, true), { ...make('outside-range', '15:00', '16:00', 'Outside rink'), date: win.addDaysIso(date, 1) }];
  win.renderSchedulingSettings();
  assert(root.querySelectorAll('[data-travel-direction]').length === 6 && ![...root.querySelectorAll('[data-travel-direction]')].some((row) => row.dataset.from === 'Outside rink' || row.dataset.to === 'Outside rink'), 'Bookings supply route endpoints; outside-range venues do not.');
  win.slots = [...originalSupply, make('any-route-block', '14:00', '15:00', 'Any served rink')]; win.renderSchedulingSettings();
  assert(root.querySelectorAll('[data-travel-direction]').length === 6 && ![...root.querySelectorAll('[data-travel-direction]')].some((row) => row.dataset.from === 'Any served rink' || row.dataset.to === 'Any served rink'), 'Unrestricted blocks expand to profile candidates, never a fictitious route endpoint.');
  win.slots = originalSupply; win.renderSchedulingSettings();
  const original = JSON.stringify(win.slots), published = JSON.stringify(win.getTestPublishedSchedule());
  doc.getElementById('generateCoachSchedule').click(); await new Promise((resolve) => setTimeout(resolve, 50));
  const previewTrip = () => doc.querySelector('.planning-calendar-block--commute[data-preview-block]');
  assert(previewTrip() && previewTrip().textContent.includes('30 分钟') && previewTrip().textContent.includes('草稿') && previewTrip().title.includes('09:30–10:00'), 'A generated preview must display its precise preset commute directly in the calendar.');
  assert(JSON.stringify(win.slots) === original && JSON.stringify(win.getTestPublishedSchedule()) === published, 'Previewing commute blocks must not apply or publish the plan.');
  previewTrip().click();
  assert(details().open && !doc.getElementById('coachPlanningLockDialog'), `Clicking an unlocked commute must open the matching compact direction settings. Runtime: ${JSON.stringify(errors)}`);
  const row = () => [...root.querySelectorAll('[data-travel-direction]')].find((node) => node.dataset.from === from && node.dataset.to === to);
  const reverse = () => [...root.querySelectorAll('[data-travel-direction]')].find((node) => node.dataset.from === to && node.dataset.to === from);
  row().querySelector('input').value = '45'; row().querySelector('input').dispatchEvent(new win.Event('input', { bubbles: true }));
  assert(!previewTrip() && doc.querySelector('[data-apply-schedule]').disabled && row().textContent.includes('个人调整') && reverse().querySelector('input').value === '30', 'A directional override must leave the reverse preset intact and invalidate the old calendar preview.');
  row().querySelector('[data-planner-action="reset-travel"]').click();
  assert(details().open && row().querySelector('input').value === '30' && row().textContent.includes('系统预设'), 'Reset must restore the system rule while keeping the compact table open.');
  doc.getElementById('generateCoachSchedule').click(); await new Promise((resolve) => setTimeout(resolve, 50));
  assert(previewTrip(), 'Restored defaults must generate without manual route entry or a map service.');
  doc.querySelector('[data-apply-schedule]').click();
  const applied = doc.querySelector('.planning-calendar-block--commute[data-planning-block]');
  assert(applied && !previewTrip() && applied.textContent.includes('30 分钟') && !applied.textContent.includes('草稿'), 'Applying a proposal must retain the same computed commute in the shared calendar.');
  assert(JSON.stringify(win.slots.find((slot) => slot.id === booking.id)) === JSON.stringify(booking) && JSON.stringify(win.getTestPublishedSchedule()) === published, 'Applying commute changes preserves appointments and remains unpublished.');
  doc.getElementById('saveProfileChanges').click();
  assert(win.getTestPublishedSchedule().planning.blocks.some((block) => block.kind === 'commute' && block.from === from && block.to === to && block.start === '09:30' && block.end === '10:00'), `Save changes must persist the same preset-based commute. ${JSON.stringify({ blocks: win.getTestPublishedSchedule().planning.blocks, message: doc.getElementById('profileMessage')?.textContent, errors })}`);
  assertNoRuntimeErrors('Compact commute planner', errors); dom.window.close();
}

async function testLunchSettingModes() {
  const { dom, errors } = await loadPage('coach/index.html');
  const win = dom.window, doc = win.document;
  doc.querySelector('[data-coach-panel="availabilityPanel"]').click();
  win.renderSchedulingSettings();
  const root = doc.getElementById('coachSchedulerConfig');
  const modes = () => [...root.querySelectorAll('[data-lunch="mode"]')];
  const fields = () => root.querySelector('[data-lunch-fields]');
  const note = () => root.querySelector('[data-lunch-note]');
  const change = (value) => { modes().find((input) => input.value === value).click(); };
  const set = (key, value) => { const input = root.querySelector(`[data-lunch="${key}"]`); input.value = value; input.dispatchEvent(new win.Event('input', { bubbles: true })); };
  const published = JSON.stringify(win.getTestPublishedSchedule());
  assert(modes().length === 3 && modes()[0].checked && !root.querySelector('select[data-lunch="mode"]') && fields().hidden && !fields().querySelector('input'), 'Self-managed lunch must show no irrelevant time or duration fields.');
  assert(note().hidden, 'Self-managed lunch hides the automatic lunch explanation.');
  change('flexible');
  assert(!note().hidden && note().textContent === '系统将在指定范围内，根据课程与通勤安排一段连续午休。' && note().nextElementSibling === fields(), 'Automatic lunch shows its muted explanation above the time fields.');
  assert(!fields().hidden && fields().querySelector('legend').textContent === '可安排范围' && fields().textContent.includes('休息时长') && fields().querySelectorAll('input[type="time"]').length === 2 && fields().querySelectorAll('input[type="number"]').length === 1, 'Flexible lunch must expose a range and a separate continuous break duration.');
  set('start', '12:00'); set('end', '14:00'); set('duration', '30');
  assert(win.getSchedulingConfig().lunch.duration === 30 && win.getSchedulingConfig().lunch.end === '14:00', 'Flexible range and break length must stay separate in shared settings.');
  change('fixed'); assert(note().hidden, 'Fixed lunch hides the automatic lunch explanation.'); set('start', '12:15'); set('end', '13:45');
  assert(fields().querySelectorAll('input').length === 2 && !fields().querySelector('[data-lunch="duration"]') && !fields().querySelector('fieldset') && fields().querySelectorAll('label')[0].textContent === '开始时间' && fields().querySelectorAll('label')[1].textContent === '结束时间', 'Fixed lunch must show only unambiguous start/end fields.');
  assert(win.getSchedulingConfig().lunch.duration === 90, 'Fixed lunch duration must update automatically from both endpoint inputs.');
  change('none');
  assert(fields().hidden && !fields().querySelector('input') && win.getSchedulingConfig().lunch.mode === 'none' && !root.textContent.includes('开始 / 窗口起点'), 'Returning to self-managed lunch must remove irrelevant controls and mixed labels.');
  const gap = root.querySelector('[data-config="sameRinkGap"]'); gap.value = '5'; gap.dispatchEvent(new win.Event('input', { bubbles: true }));
  assert(win.getSchedulingConfig().lunch.mode === 'none' && win.getSchedulingConfig().sameRinkGap === 5, 'Editing another setting must not reactivate hidden lunch values.');
  win.renderSchedulingSettings(); assert(root.querySelector('[data-lunch-fields]').hidden, 'Re-rendering shared settings must retain the selected lunch mode.');
  assert(JSON.stringify(win.getTestPublishedSchedule()) === published, 'Mode changes must retain the existing draft/save boundary.');
  assertNoRuntimeErrors('Conditional lunch fields', errors); dom.window.close();
}

async function testCalendarSettingTools() {
  const { dom, errors } = await loadPage('coach/index.html');
  const win = dom.window, doc = win.document;
  doc.querySelector('[data-coach-panel="availabilityPanel"]').click();
  const week = win.startOfWeekIso(win.addDaysIso(win.todayIso(), 7)), date = (day) => win.addDaysIso(week, day);
  const [location, other] = win.readProfileState('maya').saved.servedRinks;
  const slot = (id, day, start, end, place = location, booked = false) => ({ id, coachId: 'maya', date: date(day), start, end, location: place, availabilityLocation: place, booked, status: booked ? 'Booked' : 'Open', lessonName: '私教课', lessonDuration: 30, lessonPrice: 60 });
  const booking = { ...slot('tool-reference', 0, '10:00', '10:30', other, true), availabilityLocation: location };
  win.slots = [slot('tool-before', 0, '09:47', '10:00'), booking, slot('tool-after', 0, '10:30', '11:12'), slot('tool-gap-after', 0, '12:00', '13:00')];
  assert(win.publishAvailabilityDraft().ok, 'The isolated contour fixture must start from matching saved and draft layers.');
  const published = JSON.stringify(win.getTestPublishedSchedule());
  const field = (id, value) => { const node = doc.getElementById(id); node.value = value; node.dispatchEvent(new win.Event('change', { bubbles: true })); };
  field('coachPlannerScope', 'dates'); field('coachPlannerFrom', week); field('coachPlannerTo', date(13)); field('calendarWeekStart', week); win.renderDragCalendar(); win.renderSchedulingSettings();
  const calendar = doc.getElementById('dragCalendar'), tool = () => doc.getElementById('calendarLocationType');
  const button = (value) => doc.querySelector(`.coach-availability-paint-tools [data-rink="${value}"][aria-pressed]`);
  const cell = (day, minute) => calendar.querySelector(`.calendar-cell[data-day-index="${day}"][data-minutes="${minute}"]`);
  const blocks = (day) => [...calendar.querySelectorAll('.calendar-open-block')].filter((node) => node.getAttribute('aria-label').startsWith(date(day)));
  const at = (day, start) => blocks(day).find((node) => node.getAttribute('aria-label').startsWith(`${date(day)} ${start}`))?.getAttribute('aria-label') || '';
  let hit;
  doc.elementsFromPoint = () => hit ? [hit] : [];
  const pointer = (node, type, y) => { const event = new win.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: 100, clientY: y }); Object.defineProperty(event, 'pointerId', { value: 55 }); node.dispatchEvent(event); };
  const start = (day, minute) => { hit = cell(day, minute); pointer(hit, 'pointerdown', 100); };
  const extend = (day, minute) => { hit = cell(day, minute); pointer(calendar, 'pointermove', 160); };
  const finish = () => { pointer(calendar, 'pointerup', 160); calendar.dispatchEvent(new win.MouseEvent('click', { bubbles: true })); };
  const esc = (target = calendar) => target.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  assert(tool().value === '' && !doc.querySelector('[data-rink][aria-pressed="true"]') && doc.getElementById('calendarPaintHint').textContent === '' && doc.querySelector('[data-open-action="select"]').getAttribute('aria-pressed') === 'true', 'The calendar must initialize without a painting option.');
  const pristine = JSON.stringify(win.captureAvailabilityUndoState());
  cell(0, 600).click(); start(0, 600); extend(0, 630); finish();
  assert(JSON.stringify(win.captureAvailabilityUndoState()) === pristine && calendar.querySelector('[data-open-move]'), 'Default clicks and range drags must only select, including beneath a reference booking.');
  button(other).click();
  assert(tool().value === other && button(other).getAttribute('aria-pressed') === 'true' && !calendar.querySelector('.calendar-open-selection') && doc.getElementById('calendarPaintHint').textContent.startsWith('点击或拖选目标范围，设为 '), 'A selected rink must activate direct setting and clear an old selection.');
  start(0, 600); pointer(calendar, 'pointerup', 100); calendar.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  assert(doc.getElementById('coachOpenOperationMessage').hidden && !doc.getElementById('formMessage').textContent && !doc.getElementById('saveProfileChanges').disabled, 'Ordinary calendar changes must rely on the calendar and existing unsaved status, without success messages.');
  assert(at(0, '09:47').includes('10:00') && at(0, '10:00').includes('10:30') && at(0, '10:30').includes('11:12') && at(0, '10:00').includes(other.split(' ')[0]), 'A setting click must replace just one cell, preserve minute-exact neighbors and update the booked underlay.');
  assert(JSON.stringify(win.slots.find((item) => item.id === booking.id)) === JSON.stringify(booking), 'Setting under a lesson must never mutate that appointment.');
  overviewDate(doc, date(0)); assert([...doc.querySelectorAll('#dropdownOpenSlots [data-rink]')].some((node) => node.dataset.rink === other), 'Direct setting must synchronize the existing list.');
  win.undoAvailabilityChange(); assert(at(0, '09:47').includes('11:12'), 'One click must undo in one step.');
  assert(doc.getElementById('coachOpenOperationMessage').textContent === '已撤销' && !doc.getElementById('formMessage').textContent, 'Undo feedback must stay short and clear the old form message.');
  start(0, 630); extend(0, 720);
  assert(JSON.stringify(win.captureAvailabilityUndoState()) === pristine && !calendar.querySelector('[data-open-move]'), 'Setting drag previews must remain data-free until release and not expose a move handle.');
  finish();
  assert(calendar.querySelectorAll('.calendar-edit-contours path').length === 1 && [...calendar.querySelectorAll('.calendar-cell.is-editing')].every((node) => win.getComputedStyle(node).boxShadow === 'none'), 'Confirmed settings must use one connected contour instead of thick per-cell draft boxes.');
  assert(at(0, '09:47').includes('10:30') && at(0, '10:30').includes('12:30') && at(0, '10:30').includes(other.split(' ')[0]) && at(0, '12:30').includes('13:00'), 'Setting a dragged envelope must fill closed gaps and only replace the chosen range.');
  win.undoAvailabilityChange();
  button('Unavailable').click(); assert(tool().value === 'Unavailable' && button(other).getAttribute('aria-pressed') === 'false' && doc.getElementById('calendarPaintHint').textContent === '点击或拖选目标范围，设为不可预约；已有预约不变。', 'Rink and unavailable tools must be mutually exclusive.');
  cell(0, 600).click(); assert(!at(0, '10:00') && at(0, '09:47').includes('10:00') && at(0, '10:30').includes('11:12'), 'Unavailable click must close just one cell under the booking.'); win.undoAvailabilityChange();
  start(0, 600); extend(0, 720); finish(); assert(at(0, '09:47').includes('10:00') && at(0, '12:30').includes('13:00') && !at(0, '10:30'), 'Unavailable drag must close the complete envelope and preserve exterior fragments.'); win.undoAvailabilityChange();
  button('Unavailable').click(); assert(tool().value === '' && !doc.querySelector('[data-rink][aria-pressed="true"]'), 'Clicking the current tool again must return to selection.');
  button(location).click(); start(0, 600); extend(0, 660); esc(); calendar.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  assert(tool().value === '' && !calendar.hasAttribute('data-open-gesture') && JSON.stringify(win.captureAvailabilityUndoState()) === pristine, 'Escape must cancel an active setting drag and tool without changing data.');
  button(location).click(); esc(button(location)); assert(tool().value === '', 'Escape from a focused tool must also return to selection.');
  button(location).click(); field('coachPlannerScope', 'weekly');
  cell(1, 600).click(); assert(win.slots.some((item) => item.date === date(8) && item.start === '10:00' && item.end === '10:30' && item.location === location), `Direct setting must follow the same bounded weekly editing scope: ${doc.getElementById('coachOpenOperationMessage').textContent}; ${doc.getElementById('calendarWeekStart').value}; ${doc.getElementById('coachPlannerFrom').value}-${doc.getElementById('coachPlannerTo').value}`); win.undoAvailabilityChange();
  // Isolated fixture: neighboring dates retain different venues inside one concave outline.
  field('coachPlannerScope', 'dates'); button('Zoom').click(); start(1, 600); extend(1, 630); finish();
  button(other).click(); start(2, 630); extend(2, 660); finish();
  const concave = calendar.querySelectorAll('.calendar-edit-contours path');
  assert(concave.length === 1 && (concave[0].getAttribute('d').match(/L/g) || []).length === 7, 'Adjacent dates with offset ranges must form one stepped outline, excluding both unselected corners.');
  assert(at(1, '10:00').includes('Zoom') && at(2, '10:30').includes(other.split(' ')[0]), 'Visual union must preserve both underlying venues and ranges.');
  win.undoAvailabilityChange(); win.undoAvailabilityChange();
  assert(JSON.stringify(win.getTestPublishedSchedule()) === published && JSON.stringify(win.slots.find((item) => item.id === booking.id)) === JSON.stringify(booking), 'Setting tools must remain unpublished and keep appointments unchanged.');
  assertNoRuntimeErrors('Calendar setting tools', errors); dom.window.close();
}

async function testCalendarClipboardShortcuts() {
  for (const mac of [false, true]) {
    const { dom, errors } = await loadPage('coach/index.html');
    const win = dom.window, doc = win.document;
    Object.defineProperty(win.navigator, 'platform', { configurable: true, value: mac ? 'MacIntel' : 'Win32' });
    const week = win.startOfWeekIso(win.addDaysIso(win.todayIso(), 7)), date = (day) => win.addDaysIso(week, day);
    const [location, other] = win.readProfileState('maya').saved.servedRinks;
    const slot = (id, day, start, end, place = location, booked = false) => ({ id, coachId: 'maya', date: date(day), start, end, location: place, availabilityLocation: place, booked, status: booked ? 'Booked' : 'Open', lessonName: '私教课', lessonDuration: 30, lessonPrice: 60 });
    const booking = { ...slot('shortcut-booking', 1, '10:00', '10:30', other, true), availabilityLocation: 'Zoom' };
    win.slots = [slot('shortcut-source', 0, '09:47', '11:12'), slot('shortcut-second', 0, '11:30', '12:05', 'Zoom'), slot('shortcut-target', 1, '08:00', '14:00', 'Zoom'), booking, slot('shortcut-day-target', 2, '06:00', '18:00', 'Any served rink')];
    const published = JSON.stringify(win.getTestPublishedSchedule());
    doc.querySelector('[data-coach-panel="availabilityPanel"]').click();
    const field = (id, value) => { const node = doc.getElementById(id); node.value = value; node.dispatchEvent(new win.Event('change', { bubbles: true })); };
    field('coachPlannerScope', 'dates'); field('coachPlannerFrom', week); field('coachPlannerTo', date(6)); field('calendarWeekStart', week);
    win.renderDragCalendar(); win.renderSchedulingSettings();
    const calendar = doc.getElementById('dragCalendar');
    const cell = (day, minute) => calendar.querySelector(`.calendar-cell[data-day-index="${day}"][data-minutes="${minute}"]`);
    const header = (day) => calendar.querySelector(`.calendar-day[data-date="${date(day)}"]`);
    const block = (day, start) => [...calendar.querySelectorAll('.calendar-open-block')].find((node) => node.getAttribute('aria-label').startsWith(`${date(day)} ${start}`));
    const key = (letter, target = calendar, extra = {}) => { const event = new win.KeyboardEvent('keydown', { key: letter, ctrlKey: !mac, metaKey: mac, bubbles: true, cancelable: true, ...extra }); target.dispatchEvent(event); return event; };
    const context = (node) => node.dispatchEvent(new win.MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    const command = (label) => { const button = [...doc.querySelectorAll('#coachOpenContextMenu button')].find((node) => calendarMenuLabel(node) === label); assert(button && !button.disabled, `Missing shortcut menu command: ${label}`); button.click(); };
    cell(0, 600).click(); assert(key('c').defaultPrevented, 'Calendar copy must handle its platform modifier.');
    const beforeEditing = JSON.stringify(win.captureAvailabilityUndoState());
    for (const tag of ['input', 'textarea', 'select', 'div']) {
      const editor = doc.createElement(tag); if (tag === 'div') editor.setAttribute('contenteditable', 'true'); calendar.append(editor);
      const nested = tag === 'div' ? editor.appendChild(doc.createElement('span')) : editor;
      assert(!key('c', nested).defaultPrevented && !key('v', nested).defaultPrevented, 'Text/time editors must keep native copying and pasting, even inside the calendar.'); editor.remove();
    }
    assert(!key('v', doc.body).defaultPrevented && !key('c', calendar, { shiftKey: true }).defaultPrevented, 'Outside/calendar-external shortcuts must retain normal browser behavior.');
    assert(JSON.stringify(win.captureAvailabilityUndoState()) === beforeEditing, 'Text shortcuts must not change calendar drafts or undo history.');
    // Clicking within a large block records the precise destination cell, not the block start.
    cell(1, 570).click(); assert(key('v').defaultPrevented, 'Calendar paste must use the same platform modifier.');
    assert(block(1, '08:00')?.getAttribute('aria-label').includes('09:30') && block(1, '09:30')?.getAttribute('aria-label').includes('10:55') && block(1, '10:55')?.getAttribute('aria-label').includes('14:00'), 'Shortcut paste must target 09:30, preserve 85 minutes and retain target prefix/suffix.');
    assert(JSON.stringify(win.slots.find((item) => item.id === booking.id)) === JSON.stringify(booking), 'Pasting across a reference appointment must never alter its record.');
    win.undoAvailabilityChange();
    // Mouse copy interoperates with keyboard paste, with platform-specific hints.
    context(cell(0, 600));
    const copyItem = [...doc.querySelectorAll('#coachOpenContextMenu button')].find((node) => calendarMenuLabel(node) === '复制');
    assert(copyItem.querySelector('kbd').textContent === (mac ? '⌘C' : 'Ctrl+C') && copyItem.getAttribute('aria-keyshortcuts') === (mac ? 'Meta+C' : 'Control+C'), 'Right-click copy must display the platform shortcut and expose it accessibly.');
    command('复制'); cell(3, 600).click(); key('v');
    assert(block(3, '10:00')?.getAttribute('aria-label').includes('11:25'), 'Menu copy and shortcut paste must share the exact same clipboard.'); win.undoAvailabilityChange();
    // Keyboard copy interoperates with direct replacing paste from the mouse menu.
    cell(0, 600).click(); key('c'); context(cell(1, 570));
    const pasteItem = [...doc.querySelectorAll('#coachOpenContextMenu button')].find((node) => calendarMenuLabel(node) === `粘贴到${date(1)} 周二 09:30`);
    assert(pasteItem.querySelector('kbd').textContent === (mac ? '⌘V' : 'Ctrl+V'), 'Paste menu must show the matching platform shortcut.');
    command(`粘贴到${date(1)} 周二 09:30`); assert(block(1, '09:30')?.getAttribute('aria-label').includes('10:55'), 'Right-click and shortcut paste must share replacement semantics.'); win.undoAvailabilityChange();
    header(0).click();
    assert(calendar.querySelectorAll('.calendar-selection-contours path').length === 2, 'Whole-day selection must outline disconnected open ranges separately without enclosing the closed gap.');
    key('c'); header(2).click(); key('v');
    assert(block(2, '09:47')?.getAttribute('aria-label').includes('11:12') && block(2, '11:30')?.getAttribute('aria-label').includes('12:05') && !block(2, '06:00'), 'Whole-day keyboard paste must preserve all precise times, venues and gaps while replacing the target day.');
    win.undoAvailabilityChange(); assert(block(2, '06:00')?.getAttribute('aria-label').includes('18:00'), 'Whole-day replacement must undo as one action.');
    assert(JSON.stringify(win.getTestPublishedSchedule()) === published, 'Clipboard operations must remain unpublished drafts.');
    assertNoRuntimeErrors(mac ? 'Mac calendar clipboard' : 'Windows calendar clipboard', errors); dom.window.close();
  }
}

async function testOpenCalendarButtons() {
  const { dom, errors } = await loadPage('coach/index.html');
  const win = dom.window, doc = win.document;
  const week = win.startOfWeekIso(win.addDaysIso(win.todayIso(), 7)), date = (offset) => win.addDaysIso(week, offset);
  const location = win.readProfileState('maya').saved.servedRinks[0];
  const booking = { id: 'button-booking', coachId: 'maya', date: date(0), start: '10:00', end: '10:30', location: 'Zoom', availabilityLocation: location, booked: true, status: 'Booked', student: { name: 'Reference' } };
  win.slots = [
    { id: 'button-source', coachId: 'maya', date: date(0), start: '09:47', end: '10:00', location, booked: false },
    booking,
    { id: 'button-after', coachId: 'maya', date: date(0), start: '10:30', end: '11:12', location, booked: false },
    { id: 'button-target', coachId: 'maya', date: date(2), start: '08:00', end: '14:00', location: 'Any served rink', booked: false }
  ];
  const published = JSON.stringify(win.getTestPublishedSchedule()), bookingBefore = JSON.stringify(booking);
  doc.querySelector('[data-coach-panel="availabilityPanel"]').click();
  doc.querySelector('[data-method="calendarPanel"]').click();
  const field = (id, value) => { doc.getElementById(id).value = value; doc.getElementById(id).dispatchEvent(new win.Event('change', { bubbles: true })); };
  field('coachPlannerScope', 'dates'); field('coachPlannerFrom', week); field('coachPlannerTo', date(13)); field('calendarWeekStart', week);
  const action = (name) => doc.querySelector(`[data-open-action="${name}"]`);
  const cell = (day, minute) => doc.querySelector(`#dragCalendar .calendar-cell[data-day-index="${day}"][data-minutes="${minute}"]`);
  const block = (day, start) => [...doc.querySelectorAll('#dragCalendar .calendar-open-block')].find((node) => node.getAttribute('aria-label').startsWith(`${date(day)} ${start}`));
  assert(!doc.querySelector('.coach-availability-help') && !action('add').disabled && action('edit').disabled && action('paste').disabled, 'Calendar must expose ordinary actions without a help disclosure.');
  action('add').click(); assert(doc.activeElement === doc.querySelector('#dropdownOpenSlots [data-planner-action="add-work-range"]') && !doc.getElementById('dropdownPanel').classList.contains('is-hidden') && !doc.getElementById('coachWorkTimeDialog').open, 'Add must switch to the overview and focus a daily plus without choosing a date or opening fields.');
  cell(0, 600).click();
  assert(!action('edit').disabled && !action('copy').disabled && !action('delete').disabled && doc.getElementById('coachOpenSelectionStatus').textContent.includes('09:47–11:12'), 'Single click must expose precise selected-block actions, including booking underlay.');
  action('edit').click(); field('coachWorkTimeEnd', '11:17'); doc.getElementById('cancelCoachWorkTime').click();
  assert(block(0, '09:47').getAttribute('aria-label').includes('11:12') && JSON.stringify(win.getTestPublishedSchedule()) === published, 'Cancel must discard the editor fields.');
  action('edit').click(); field('coachWorkTimeEnd', '11:17'); submit(doc.getElementById('coachWorkTimeForm'));
  assert(block(0, '09:47').getAttribute('aria-label').includes('11:17'), 'Ordinary edit uses the existing draft editor.');
  win.undoAvailabilityChange(); cell(0, 600).click(); action('copy').click();
  field('calendarWeekStart', date(7));
  assert(action('paste').disabled && action('edit').disabled, 'Changing week must clear the old source/target while retaining the clipboard.');
  cell(0, 600).click();
  let warning = ''; win.confirm = (message) => { warning = message; return false; };
  const beforePaste = JSON.stringify(win.captureAvailabilityUndoState()); action('paste').click();
  assert(warning.includes(date(7)) && warning.includes('10:00–11:25') && warning.includes('覆盖目标范围') && warning.includes('已有预约保持不变') && JSON.stringify(win.captureAvailabilityUndoState()) === beforePaste, 'Declining paste must retain the draft and disclose current-week destination, exact envelope and booking protection.');
  win.confirm = () => true; action('paste').click();
  assert([...doc.querySelectorAll('.calendar-open-block')].some((node) => node.getAttribute('aria-label').startsWith(`${date(7)} 10:00–11:25`)), 'Cross-week copy must paste at the clicked current-week destination.');
  win.undoAvailabilityChange(); field('calendarWeekStart', week);
  cell(0, 600).click(); action('copy').click(); cell(2, 600).click(); action('paste').click();
  assert(block(2, '08:00')?.getAttribute('aria-label').includes('10:00') && block(2, '11:25')?.getAttribute('aria-label').includes('14:00') && block(2, '10:00'), 'Paste must replace only the target envelope and keep its surrounding ranges.');
  win.undoAvailabilityChange();
  doc.querySelector(`#dragCalendar .calendar-day[data-date="${date(0)}"]`).click(); action('copy').click();
  assert(action('edit').disabled, 'A full day is not a single-range edit.');
  doc.querySelector(`#dragCalendar .calendar-day[data-date="${date(3)}"]`).click(); action('paste').click();
  assert(block(3, '09:47')?.getAttribute('aria-label').includes('11:12'), 'Ordinary day copy must preserve precise times.');
  win.undoAvailabilityChange();
  cell(0, 600).click(); win.confirm = () => false; action('delete').click(); assert(block(0, '09:47'), 'Declining deletion keeps availability.');
  win.confirm = () => true; action('delete').click();
  assert(!block(0, '09:47') && JSON.stringify(win.slots.find((item) => item.id === booking.id)) === bookingBefore && JSON.stringify(win.getTestPublishedSchedule()) === published, 'Delete must remove only draft availability while leaving the established appointment and published facts intact.');
  win.undoAvailabilityChange();
  doc.getElementById('calendarUnavailableTool').click(); assert(action('select').getAttribute('aria-pressed') === 'false' && action('paste').disabled, 'Painting mode must not present selection actions as active.');
  action('select').click(); cell(0, 600).click(); action('edit').click(); field('coachWorkTimeEnd', '11:19'); submit(doc.getElementById('coachWorkTimeForm'));
  doc.getElementById('saveProfileChanges').click();
  assert(win.getTestPublishedSchedule().planning.dateOverrides.some((range) => range.date === date(0) && range.end === '11:19') && JSON.stringify(win.slots.find((item) => item.id === booking.id)) === bookingBefore, 'Saving ordinary edits must persist the dated override and preserve the appointment.');
  assertNoRuntimeErrors('Ordinary calendar buttons', errors); dom.window.close();
}

async function testOpenCalendarOperations() {
  const { dom, errors } = await loadPage('coach/index.html');
  const win = dom.window, doc = win.document;
  const week = win.startOfWeekIso(win.addDaysIso(win.todayIso(), 7)), date = (offset) => win.addDaysIso(week, offset);
  const location = win.readProfileState('maya').saved.servedRinks[0], other = win.readProfileState('maya').saved.servedRinks[1];
  const slot = (id, day, start, end, place = location, booked = false) => ({ id, coachId: 'maya', date: date(day), start, end, location: place, availabilityLocation: place, booked, status: booked ? 'Booked' : 'Open', lessonName: '私教课', lessonDuration: 30, lessonPrice: 60 });
  const booking = { ...slot('reference', 0, '10:00', '10:30', other, true), availabilityLocation: location, student: { name: 'Reference student', email: 'reference@example.com' } };
  win.slots = [slot('before', 0, '09:00', '10:00'), booking, slot('after', 0, '10:30', '11:00'), slot('second-place', 0, '11:00', '12:00', 'Zoom'), slot('target', 2, '08:00', '14:00', 'Any served rink'), slot('precise', 4, '09:47', '11:12'), slot('base', 5, '10:00', '12:00', 'Any served rink')];
  const published = JSON.stringify(win.getTestPublishedSchedule()), bookingBefore = JSON.stringify(booking);
  doc.querySelector('[data-coach-panel="availabilityPanel"]').click();
  const field = (id, value) => { doc.getElementById(id).value = value; doc.getElementById(id).dispatchEvent(new win.Event('change', { bubbles: true })); };
  field('coachPlannerScope', 'dates'); field('coachPlannerFrom', week); field('coachPlannerTo', date(6)); field('calendarWeekStart', week);
  win.renderDragCalendar(); win.renderSchedulingSettings();
  const calendar = doc.getElementById('dragCalendar');
  const cell = (day, minute) => calendar.querySelector(`.calendar-cell[data-day-index="${day}"][data-minutes="${minute}"]`);
  const block = (day, start) => [...calendar.querySelectorAll('.calendar-open-block')].find((node) => node.getAttribute('aria-label').startsWith(`${date(day)} ${start}`));
  const context = (node) => node.dispatchEvent(new win.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 300, clientY: 250 }));
  const command = (text) => { const button = [...doc.querySelectorAll('#coachOpenContextMenu button')].find((node) => calendarMenuLabel(node) === text); assert(button && !button.disabled, `Missing menu action: ${text}`); button.click(); };
  let hit = null;
  doc.elementsFromPoint = () => hit ? [hit] : [];
  const pointer = (node, type, x, y) => { const event = new win.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 }); Object.defineProperty(event, 'pointerId', { value: 17 }); node.dispatchEvent(event); };
  const choose = (day, from, until) => { hit = cell(day, from); pointer(hit, 'pointerdown', 100, 100); hit = cell(day, until); pointer(calendar, 'pointermove', 100, until === from ? 110 : 180); pointer(calendar, 'pointerup', 100, until === from ? 110 : 180); calendar.dispatchEvent(new win.MouseEvent('click', { bubbles: true })); };
  const move = (day, minute) => { const handle = calendar.querySelector('[data-open-move]'); assert(handle, 'Selection must expose an explicit move handle.'); pointer(handle, 'pointerdown', 100, 100); hit = cell(day, minute); pointer(calendar, 'pointermove', 200, 160); };
  assert(block(0, '09:00')?.style.gridRow.endsWith('span 120'), 'Reference bookings must not split the underlying continuous open block.');
  assert(block(4, '09:47')?.style.gridRow.endsWith('span 85'), 'Minute-exact blocks must retain their real proportions.');
  assert(!block(0, '09:00').querySelector('.calendar-open-name, .calendar-open-time') && win.getComputedStyle(block(0, '09:00')).backgroundColor === 'rgba(0, 0, 0, 0)', 'Idle UI must retain transparent hit targets and original calendar styling.');
  const pristine = JSON.stringify(win.captureAvailabilityUndoState());
  hit = cell(0, 570); pointer(hit, 'pointerdown', 100, 100); pointer(calendar, 'pointerup', 101, 101); calendar.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  assert(calendar.querySelector('.calendar-open-selection').getAttribute('aria-label').endsWith('09:00–11:00') && !doc.getElementById('coachWorkTimeDialog').open, 'A click with only slight pointer jitter must select the complete same-location block, including the supply under bookings, stopping at the venue change.');
  cell(0, 600).click();
  assert(calendar.querySelector('.calendar-open-selection').getAttribute('aria-label').endsWith('09:00–11:00'), 'An accessible cell click on a reference appointment must also select the whole underlying rink block.');
  cell(4, 600).click();
  assert(calendar.querySelector('.calendar-open-selection').getAttribute('aria-label').endsWith('09:47–11:12'), 'Click selection must preserve exact minute endpoints rather than grid boundaries.');
  choose(0, 570, 570);
  assert(calendar.querySelector('.calendar-open-selection').getAttribute('aria-label').endsWith('09:30–10:00') && !doc.getElementById('coachWorkTimeDialog').open, 'Dragging within a single cell must still allow selecting just that cell.');
  assert(JSON.stringify(win.captureAvailabilityUndoState()) === pristine, 'Selection alone must not change availability or undo history.');
  assert(win.getComputedStyle(cell(0, 570)).boxShadow === 'none' && win.getComputedStyle(calendar.querySelector('.calendar-open-selection')).outline === 'none', 'Individual cells and the handle wrapper must not add repeated selection outlines.');
  assert(calendar.querySelectorAll('.calendar-open-selection').length === 1 && calendar.querySelectorAll('.calendar-selection-contours path').length === 1 && !calendar.querySelector('[data-open-selection-more], [data-open-day-more]'), 'A selection must have one perimeter and no in-grid menu buttons.');
  const grip = calendar.querySelector('[data-open-move]');
  assert(grip && !grip.textContent.trim() && grip.querySelector('svg') && grip.getAttribute('aria-label').includes('移动选区'), 'Moving must remain available through an accessible icon grip without a text button.');
  calendar.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true, cancelable: true }));
  assert(!doc.getElementById('coachOpenContextMenu').hidden && [...doc.querySelectorAll('#coachOpenContextMenu button')].some((button) => calendarMenuLabel(button) === '复制'), 'The right-click menu must remain keyboard-accessible after removing the in-grid menu button.');
  doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  const geometry = doc.elementsFromPoint;
  doc.elementsFromPoint = (x, y) => { assert(Number.isFinite(x) && Number.isFinite(y), 'Keyboard operations must never hit-test undefined pointer coordinates.'); return geometry(x, y); };
  calendar.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'c', ctrlKey: true, bubbles: true, cancelable: true }));
  assert(doc.getElementById('coachOpenOperationMessage').textContent === '已复制开放安排，已有预约不会被复制。', 'A focused selection must support the existing copy shortcut.');
  assert(win.getComputedStyle(doc.getElementById('coachOpenOperationMessage')).position === 'static' && doc.getElementById('coachOpenOperationMessage').parentElement.contains(doc.getElementById('calendarPaintHint')), 'Copy feedback must be inline above the calendar, never an overlay.');
  await new Promise((resolve) => setTimeout(resolve, 2100));
  assert(doc.getElementById('coachOpenOperationMessage').hidden && !doc.getElementById('coachOpenOperationMessage').textContent, 'Copy feedback must disappear after a short interval.');
  context(cell(0, 570)); command('复制'); context(cell(1, 570)); command(`粘贴到${date(1)} 周二 09:30`);
  assert(block(1, '09:30')?.style.gridRow.endsWith('span 30') && block(0, '09:00'), 'Partial copy to empty space must retain the source and just the selected duration.');
  win.undoAvailabilityChange();
  choose(0, 570, 660);
  assert(calendar.querySelector('.calendar-open-selection').getAttribute('aria-label').endsWith('09:30–11:30'), 'Dragging across the reference booking must extend selection through all underlying locations.');
  context(cell(0, 600)); command('复制'); context(cell(1, 540)); command(`粘贴到${date(1)} 周二 09:00`);
  assert(block(1, '09:00')?.getAttribute('aria-label').includes('10:30') && block(1, '10:30')?.getAttribute('aria-label').includes('Zoom'), 'Mixed-venue paste must use original availability (not the booked location) and preserve relative offsets.');
  assert(!win.slots.some((item) => item.date === date(1) && item.location === other), 'The reference lesson location must never become copied availability.');
  context(cell(2, 570));
  assert([...doc.querySelectorAll('#coachOpenContextMenu button')].some((button) => calendarMenuLabel(button) === `粘贴到${date(2)} 周三 09:30` && !button.disabled), 'Occupied targets must still expose paste.');
  command(`粘贴到${date(2)} 周三 09:30`);
  assert(block(2, '08:00')?.getAttribute('aria-label').includes('09:30') && block(2, '11:30')?.getAttribute('aria-label').includes('14:00') && block(2, '09:30')?.getAttribute('aria-label').includes('11:00') && block(2, '11:00')?.getAttribute('aria-label').includes('Zoom'), 'Ordinary paste must replace only its target envelope, preserving the target prefix/suffix and copied internal locations.');
  win.undoAvailabilityChange(); assert(block(2, '08:00')?.getAttribute('aria-label').includes('14:00'), 'Replacement must undo atomically.');
  // Move only via the handle; exact minute offsets survive a grid-based shift.
  choose(4, 570, 660); hit = cell(4, 570); move(3, 600);
  assert(calendar.querySelector('.calendar-open-drop').getAttribute('aria-label').includes('10:17–11:42'), 'Move must apply a relative 30-minute offset without rounding the precise source.');
  assert(doc.getElementById('coachOpenOperationMessage').hidden && ![...calendar.querySelectorAll('[title]')].some((node) => node.title) && !calendar.querySelector('.calendar-open-drop').textContent.trim(), 'Moving must suppress toast/native time tooltips and floating text without losing precise target coordinates.');
  assert(doc.getElementById('calendarPaintHint').textContent.includes('10:17–11:42'), 'The existing calendar hint must retain accurate target times outside the grid.');
  pointer(calendar, 'pointerup', 200, 160); calendar.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  assert(!block(4, '09:47') && block(3, '10:17'), 'Only the handle drop may move selected supply.');
  win.undoAvailabilityChange();
  choose(4, 570, 660); const beforeEscape = JSON.stringify(win.captureAvailabilityUndoState()); hit = cell(4, 570); move(3, 600); doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); calendar.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  assert(!calendar.querySelector('.calendar-open-drop') && JSON.stringify(win.captureAvailabilityUndoState()) === beforeEscape, 'Escape must cancel a move without touching the draft.');
  assert(!calendar.hasAttribute('data-open-gesture') && [...calendar.querySelectorAll('[title]')].some((node) => node.title), 'Cancel must restore ordinary hover information and remove transient gesture state.');
  // Closing the supply below an established appointment changes only its underlay.
  choose(0, 600, 600); context(cell(0, 600)); command('删除选中开放时段');
  assert(!block(0, '09:00').getAttribute('aria-label').includes('11:00') && doc.querySelector('.coach-calendar-booking.is-availability-booking'), 'Closing a booked period must split availability while retaining the reference card.');
  assert(JSON.stringify(win.slots.find((item) => item.id === 'reference')) === bookingBefore, 'Established appointment records must remain byte-for-byte unchanged.');
  overviewDate(doc, date(0));
  assert(doc.getElementById('dropdownOpenSlots').textContent.includes('09:00–10:00') && doc.getElementById('dropdownOpenSlots').textContent.includes('10:30–11:00'), 'The list must reflect the same edited underlay.');
  win.undoAvailabilityChange();
  // A moved draft overlay reveals its earlier location only inside the source selection.
  choose(5, 600, 690); cell(5, 600).dispatchEvent(new win.MouseEvent('dblclick', { bubbles: true }));
  assert(doc.getElementById('coachWorkTimeDialog').open, 'Double clicking a selected calendar cell must open the shared partial-range editor.');
  field('coachWorkTimeLocation', location); submit(doc.getElementById('coachWorkTimeForm'));
  assert(block(5, '10:00')?.getAttribute('aria-label').includes('Polar'), 'Editing a selected range must update its actual shared location.');
  choose(5, 600, 690); hit = cell(5, 600); move(6, 600); pointer(calendar, 'pointerup', 200, 160); calendar.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  assert(block(5, '10:00')?.getAttribute('aria-label').includes('不限冰场') && block(6, '10:00'), `Moving a changed overlay must restore the real earlier source location, rather than always closing it: ${block(5, '10:00')?.getAttribute('aria-label')}; destination ${block(6, '10:00')?.getAttribute('aria-label')}; message ${doc.getElementById('coachOpenOperationMessage').textContent}; edit ${doc.getElementById('coachWorkTimeMessage').textContent}`);
  win.undoAvailabilityChange(); win.undoAvailabilityChange();
  const header = (day) => calendar.querySelector(`.calendar-day[data-date="${date(day)}"]`);
  context(header(0)); command('复制当天安排'); context(header(6)); command(`粘贴当天安排到${date(6)} 周日`);
  assert(block(6, '09:00')?.getAttribute('aria-label').includes('11:00') && block(6, '11:00')?.getAttribute('aria-label').includes('Zoom') && !win.slots.some((item) => item.date === date(6) && item.booked), 'Day copy must include the underlying supply without copying bookings.');
  assert(JSON.stringify(win.getTestPublishedSchedule()) === published && JSON.stringify(win.slots.find((item) => item.id === 'reference')) === bookingBefore, 'All changes must remain draft-only and preserve the appointment.');
  // Save uses the same persistence and keeps the closing override beneath the booking.
  choose(0, 600, 600); context(cell(0, 600)); command('删除选中开放时段'); doc.getElementById('saveProfileChanges').click();
  const saved = win.getTestPublishedSchedule();
  assert(JSON.stringify(saved.slots.find((item) => item.id === 'reference')) === bookingBefore && saved.planning.dateOverrides.some((item) => item.date === date(0) && item.start === '10:00' && item.end === '10:30' && item.kind === 'rest'), 'Save must persist the underlying closure and preserve the original booking.');
  assertNoRuntimeErrors('Partial open calendar operations', errors); dom.window.close();
}

async function testPreciseAvailabilitySave() {
  const { dom, errors } = await loadPage('coach/index.html');
  const win = dom.window, doc = win.document;
  const date = win.addDaysIso(win.todayIso(), 3), location = win.readProfileState('maya').saved.servedRinks[0];
  const config = win.createSchedulingConfig(win.readProfileState('maya').saved.servedRinks);
  config.enabled = true; config.workHoursSource = 'availability';
  config.locations.forEach((place) => { place.included = place.name === location; });
  win.setSchedulingConfig('maya', config);
  win.slots = [{ id: 'precise-save', coachId: 'maya', date, start: '09:47', end: '11:12', location, booked: false }];
  doc.querySelector('[data-coach-panel="availabilityPanel"]').click();
  const field = (id, value) => { doc.getElementById(id).value = value; doc.getElementById(id).dispatchEvent(new win.Event('change', { bubbles: true })); };
  field('coachPlannerScope', 'dates'); field('coachPlannerFrom', date); field('coachPlannerTo', date); win.renderSchedulingSettings();
  doc.querySelector('#dropdownOpenSlots .availability-range-card').click(); field('coachWorkTimeEnd', '11:13'); submit(doc.getElementById('coachWorkTimeForm'));
  doc.getElementById('saveProfileChanges').click();
  assert(win.getTestPublishedSchedule().slots.some((slot) => slot.start === '09:47' && slot.end === '11:13'), 'Save changes must publish precise endpoints without rounding or losing trailing minutes.');
  assertNoRuntimeErrors('Precise availability save', errors); dom.window.close();
}

async function testLunchAlternativesPreview() {
  const { dom, errors } = await loadPage('coach/index.html', { now: '2035-01-01T06:00:00' });
  const win = dom.window, doc = win.document, date = win.addDaysIso(win.todayIso(), 1);
  const [a, b] = win.readProfileState('maya').saved.servedRinks;
  const make = (id, start, end, location, booked = false) => ({ id, coachId: 'maya', date, start, end, location, availabilityLocation: location, booked, status: booked ? 'Booked' : 'Open', lessonName: '私教课', lessonDuration: 30, lessonPrice: 60 });
  win.slots = [make('morning', '09:00', '11:30', a), make('fixed-a', '11:30', '12:00', a, true), make('fixed-b', '12:50', '14:00', b, true), make('afternoon', '14:00', '17:00', b)];
  doc.querySelector('[data-coach-panel="availabilityPanel"]').click();
  doc.querySelector('[data-optimize-scope="tomorrow"]').click();
  doc.querySelector('[data-lunch="mode"][value="flexible"]').click();
  const published = JSON.stringify(win.getTestPublishedSchedule()), bookings = JSON.stringify(win.slots.filter((slot) => slot.booked));
  const generate = async () => { doc.getElementById('generateCoachSchedule').click(); await new Promise((resolve) => setTimeout(resolve, 50)); };
  await generate();
  const preview = doc.getElementById('coachSchedulePreview');
  assert(preview.textContent.includes(date) && preview.textContent.includes('无法容纳连续 30 分钟') && preview.querySelector('[data-apply-schedule]').disabled, 'An infeasible lunch is concentrated in the preview and blocks unchosen application.');
  const shorter = preview.querySelector('[data-lunch-choice="shorter"]');
  assert(shorter && shorter.textContent.includes('20 分钟') && preview.querySelector('[data-lunch-choice="self"]'), 'Only computed feasible lunch alternatives are selectable.');
  shorter.click();
  assert(!preview.querySelector('[data-apply-schedule]').disabled && preview.textContent.includes('已选择'), 'A coach choice unlocks the reviewed date.');
  assert(win.getSchedulingConfig().lunch.duration === 30 && JSON.stringify(win.getTestPublishedSchedule()) === published, 'Selecting a per-date alternative does not change the default lunch policy or publish.');
  preview.querySelector('[data-apply-schedule]').click();
  const draft = win.captureAvailabilityUndoState().scheduling;
  assert(draft.dateOverrides.some((item) => item.date === date && item.kind === 'lunch-policy' && item.lunch.duration === 20), 'The selected alternative is owned by that date.');
  assert(draft.blocks.some((item) => item.date === date && item.kind === 'commute' && item.start >= '12:00' && item.end <= '12:50' && win.minutesFromTime(item.end) - win.minutesFromTime(item.start) === 30), 'The selected alternative preserves all thirty travel minutes.');
  const lunch = draft.blocks.find((item) => item.date === date && item.source === 'lunch');
  assert(lunch.start >= '12:00' && lunch.end <= '12:50' && win.minutesFromTime(lunch.end) - win.minutesFromTime(lunch.start) === 20 && !draft.blocks.some((block) => block.kind === 'commute' && block.start < lunch.end && block.end > lunch.start), 'Lunch uses twenty separate minutes after accounting for commute.');
  assert(JSON.stringify(win.slots.filter((slot) => slot.booked)) === bookings && JSON.stringify(win.getTestPublishedSchedule()) === published, 'Applying preserves bookings and still does not publish.');
  doc.getElementById('saveProfileChanges').click();
  assert(win.getTestPublishedSchedule().planning.dateOverrides.some((item) => item.kind === 'lunch-policy' && item.lunch.duration === 20), 'Save publishes the explicitly selected date policy.');
  assertNoRuntimeErrors('Lunch alternatives preview and publication', errors); dom.window.close();
}

async function testUnifiedPlannerRangeAndPicker() {
  const { dom, errors } = await loadPage('coach/index.html', { now: '2035-01-01T06:00:00' });
  const win = dom.window, doc = win.document, today = win.todayIso(), next = win.addDaysIso(today, 7);
  const location = win.readProfileState('maya').saved.servedRinks[0];
  const make = (id, date, start = '09:00', end = '12:00', booked = false) => ({ id, coachId: 'maya', date, start, end, location, availabilityLocation: location, booked, status: booked ? 'Booked' : 'Open', lessonName: '私教课', lessonDuration: 30, lessonPrice: 60 });
  win.slots = [make('today-base', today), make('next-week-base', next), make('past-open', today, '05:00', '05:30'), make('fixed-reference', today, '13:00', '13:30', true)];
  const original = JSON.parse(JSON.stringify(win.slots)), published = JSON.stringify(win.getTestPublishedSchedule());
  doc.querySelector('[data-coach-panel="availabilityPanel"]').click();
  const field = (id, value) => { const node = doc.getElementById(id); node.value = value; node.dispatchEvent(new win.Event('change', { bubbles: true })); };
  const scheduler = doc.getElementById('coachSchedulerPanel'), base = doc.getElementById('coachBaseAvailabilitySettings');
  const ids = [...doc.querySelectorAll('[id]')].map(node => node.id);
  assert(new Set(ids).size === ids.length, 'Coach page must expose one control per ID so visible date fields bind to the shared draft.');
  assert(base.contains(doc.getElementById('coachPlannerScope')) && base.contains(doc.getElementById('coachPlannerFrom')) && base.contains(doc.getElementById('coachPlannerTo')) && base.hidden, 'Foundation mode and dates belong to the collapsed editing-range panel.');
  assert(!scheduler.querySelector('#coachPlannerScope, #coachPlannerFrom, #coachPlannerTo, #coachAddOpenForm') && scheduler.querySelectorAll('[data-optimize-scope]').length === 3, 'Optimization exposes only Today/Tomorrow/This week as its date controls.');
  assert(doc.getElementById('coachOptimizationDates').textContent === today, 'Today shows its concrete date.');
  // The existing range remains the scope for editing the foundation, independently of optimization.
  field('coachPlannerFrom', next); field('coachPlannerTo', win.addDaysIso(next, 6));
  doc.getElementById('coachPlannerToTrigger').click();
  const picker = doc.getElementById('coachPlannerToPopover');
  assert(!picker.hidden && picker.querySelectorAll('[data-date]').length === 42, 'Foundation editing retains the existing themed date picker.');
  doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert(picker.hidden, 'Escape closes the foundation date picker.');
  const before = JSON.stringify(win.captureAvailabilityUndoState());
  doc.getElementById('generateCoachSchedule').click();
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert(doc.querySelectorAll('#coachSchedulePreview .planner-timetable-day').length === 1 && doc.querySelector('#coachSchedulePreview .planner-timetable-day strong').textContent === today, 'Today optimization ignores the independent weekly editing range.');
  assert(JSON.stringify(win.captureAvailabilityUndoState()) === before, 'Preview never mutates the shared draft or published data.');
  const startField = doc.querySelector('#coachSchedulePreview [data-preview-kind="open"] [data-preview-field="start"]');
  startField.value = '09:15'; startField.dispatchEvent(new win.Event('change', { bubbles: true }));
  assert(!doc.querySelector('[data-apply-schedule]').disabled, 'A valid manual trim is reviewable before applying.');
  doc.querySelector('[data-apply-schedule]').click();
  assert(JSON.stringify(win.getTestPublishedSchedule()) === published, 'Applying remains a draft until Save.');
  const after = win.captureAvailabilityUndoState();
  assert(JSON.stringify(after.scheduling.templates) === JSON.stringify(JSON.parse(before).scheduling.templates), 'Date optimization never rewrites weekly templates.');
  for (const slot of original.filter((slot) => slot.id !== 'today-base')) assert(JSON.stringify(win.slots.find((item) => item.id === slot.id)) === JSON.stringify(slot), 'Future weekly supply, started supply and fixed bookings remain exact.');
  assert(win.slots.filter((slot) => !slot.booked && slot.date === today && slot.start >= '06:00').every((slot) => slot.start >= '09:15'), 'The manually reviewed trim is applied.');
  doc.querySelector('[data-optimize-scope="week"]').click();
  doc.getElementById('generateCoachSchedule').click(); await new Promise((resolve) => setTimeout(resolve, 60));
  assert(doc.querySelectorAll('#coachSchedulePreview .planner-timetable-day').length === 7, 'This week produces only the concrete remaining dates of the current week.');
  assert(doc.getElementById('coachOptimizationDates').textContent === `${today} — ${win.addDaysIso(today, 6)}`, 'This week shows its concrete remaining range.');
  doc.querySelector('[data-optimize-scope="tomorrow"]').click();
  assert(doc.getElementById('coachSchedulePreview').hidden && !doc.querySelector('[data-apply-schedule]') && !doc.querySelector('[data-preview-block]'), 'Changing scope removes the old preview and calendar overlays immediately.');
  assert(doc.getElementById('coachOptimizationDates').textContent === win.addDaysIso(today, 1), 'Tomorrow shows its concrete date.');
  doc.getElementById('generateCoachSchedule').click(); await new Promise((resolve) => setTimeout(resolve, 30));
  assert(doc.querySelectorAll('#coachSchedulePreview .planner-timetable-day').length === 1 && doc.querySelector('#coachSchedulePreview .planner-timetable-day strong').textContent === win.addDaysIso(today, 1), 'Regeneration uses only Tomorrow.');
  doc.querySelector('[data-optimize-scope="week"]').click();
  doc.getElementById('generateCoachSchedule').click();
  assert(doc.getElementById('generateCoachSchedule').getAttribute('aria-busy') === 'true', 'Multi-day generation yields while busy.');
  doc.querySelector('[data-optimize-scope="today"]').click();
  doc.querySelector('[data-optimize-scope="week"]').click();
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert(doc.getElementById('coachSchedulePreview').hidden && !doc.querySelector('[data-apply-schedule]') && doc.getElementById('coachSchedulerMessage').textContent.includes('重新生成'), 'Changing scope away and back during generation cannot restore the abandoned preview.');
  assertNoRuntimeErrors('Independent optimization and foundation ranges', errors); dom.window.close();
}

async function testPlannerDateRange() {
  const { dom, errors } = await loadPage("coach/index.html");
  const win = dom.window, doc = win.document;
  const from = doc.getElementById('coachPlannerFrom'), to = doc.getElementById('coachPlannerTo');
  const button = doc.getElementById('generateCoachSchedule');
  const error = doc.getElementById('coachPlannerToError');
  const date = win.addDaysIso(win.todayIso(), 2);
  const location = win.readProfileState('maya').saved.servedRinks[0];
  const config = win.createSchedulingConfig(win.readProfileState('maya').saved.servedRinks);
  config.locations.forEach((place) => { place.included = place.name === location; });
  win.setSchedulingConfig('maya', config);
  win.slots = [{ id: 'range-open', coachId: 'maya', date, start: '09:00', end: '10:00', location, booked: false }];
  doc.querySelector('[data-coach-panel="availabilityPanel"]').click();
  doc.getElementById('coachPlannerScope').value = 'dates';
  doc.getElementById('coachPlannerScope').dispatchEvent(new win.Event('change', { bubbles: true }));
  const change = (input, value, type = 'change') => { input.value = value; input.dispatchEvent(new win.Event(type, { bubbles: true })); };
  change(from, date); change(to, date);
  win.renderSchedulingSettings();
  assert(to.min === date && !button.disabled && error.hidden, 'Same-day ranges must be valid, including the picker minimum.');
  button.click();
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert(doc.querySelectorAll('#coachSchedulePreview .planner-timetable-day').length === 1, 'A same-day range must generate exactly one day in its preview.');
  const crossWeek = win.addDaysIso(win.startOfWeekIso(win.addDaysIso(win.todayIso(), 7)), 6);
  const nextMonth = new Date(`${win.todayIso()}T12:00:00Z`);
  nextMonth.setUTCDate(1); nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  const monthFirst = nextMonth.toISOString().slice(0, 10);
  for (const [start, end] of [[crossWeek, win.addDaysIso(crossWeek, 1)], [win.addDaysIso(monthFirst, -1), monthFirst]]) {
    change(from, start); change(to, end, 'input'); change(to, end);
    assert(!button.disabled && error.hidden && to.min === start, 'Valid cross-week and cross-month input must remain enabled.');
  }
  const later = win.addDaysIso(to.value, 2);
  change(from, later);
  assert(to.value === later && to.min === later && !doc.getElementById('coachPlannerRangeHint').hidden && !button.disabled, 'Advancing the start past the old end must move the end to the same day and show a lightweight hint.');
  const snapshot = JSON.stringify(win.captureAvailabilityUndoState());
  change(to, win.addDaysIso(from.value, -1), 'input');
  assert(!button.disabled && error.textContent === '结束日期不能早于开始日期' && !error.hidden && !to.checkValidity(), 'Invalid foundation dates must show their error without disabling independent Today optimization.');
  change(to, '', 'input');
  assert(!button.disabled && !error.hidden, 'Incomplete foundation dates do not change optimization scope.');
  change(to, from.value);
  assert(error.hidden && JSON.stringify(win.captureAvailabilityUndoState()) === snapshot, 'Fixing the editing range never changes scheduling business data.');
  assertNoRuntimeErrors('Planner date range', errors);
  dom.window.close();
}

async function testWeeklyWorkTimeOperations() {
  const { dom, errors } = await loadPage("coach/index.html");
  const win = dom.window, doc = win.document;
  assert(doc.getElementById('coachPlannerScope').value === 'weekly', 'Work hours must open as a general weekly schedule by default.');
  assert(!doc.getElementById('coachAddOpenForm') && doc.querySelector('#dropdownOpenSlots [data-planner-action="add-work-range"]'), 'Daily add controls must replace the permanent form.');
  doc.getElementById('coachPlannerScope').value = 'dates';
  doc.getElementById('coachPlannerScope').dispatchEvent(new win.Event('change', { bubbles: true }));
  const monday = nextWeekdayByIndex(win, 1);
  const [location, other] = win.readProfileState('maya').saved.servedRinks;
  const make = (date, start, end, location, booked = false) => ({ id: `week-${date}-${start}`, coachId: 'maya', date, start, end, location, booked, status: booked ? 'Booked' : 'Open', lessonName: '私教课', lessonDuration: 30, lessonPrice: 60 });
  win.slots = [0, 7, 14, 21].map((offset) => make(win.addDaysIso(monday, offset), '09:00', '10:00', location));
  win.slots = [...win.slots, make(monday, '10:00', '10:30', location, true)];
  const booking = JSON.stringify(win.slots.find((slot) => slot.booked));
  doc.querySelector('[data-coach-panel="availabilityPanel"]').click();
  const field = (id, value) => { doc.getElementById(id).value = value; doc.getElementById(id).dispatchEvent(new win.Event('change', { bubbles: true })); };
  field('coachPlannerFrom', monday); field('coachPlannerTo', win.addDaysIso(monday, 27));
  field('calendarWeekStart', win.startOfWeekIso(win.addDaysIso(monday, 7)));
  // Create an actual single-date exception through the existing overview.
  doc.querySelector(`#dropdownOpenSlots [data-work-day="${win.addDaysIso(monday, 7)}"] [data-planner-action="edit-work-range"]`).click();
  field('coachWorkTimeLocation', other); submit(doc.getElementById('coachWorkTimeForm'));
  field('coachPlannerScope', 'weekly');
  field('calendarWeekStart', win.startOfWeekIso(monday));
  const table = () => doc.querySelector('#dropdownOpenSlots');
  assert(table().querySelectorAll('[data-work-day]').length === 7, 'The overview must retain seven days.');
  assert(table().querySelector(`[data-work-day="${monday}"] .availability-range-card`).dataset.rink === location && table().querySelector(`[data-work-day="${monday}"]`).textContent.includes('09:00–10:30'), 'The dated overview must show the original weekly venue and booking underlay; a different date exception must not replace it.');
  const saturday = () => table().querySelector(`[data-work-day="${win.addDaysIso(monday, 5)}"]`);
  assert(saturday().textContent.includes('暂无安排'), 'Closed weekends must remain visible.');
  saturday().querySelector('[data-planner-action="add-work-range"]').click();
  field('coachWorkTimeStart', '12:00'); field('coachWorkTimeEnd', '13:00'); field('coachWorkTimeLocation', location);
  doc.getElementById('cancelCoachWorkTime').click();
  assert(saturday().textContent.includes('暂无安排'), 'Cancelling an addition must preserve closure.');
  saturday().querySelector('[data-planner-action="add-work-range"]').click();
  field('coachWorkTimeStart', '12:00'); field('coachWorkTimeEnd', '13:00'); field('coachWorkTimeLocation', location);
  submit(doc.getElementById('coachWorkTimeForm'));
  assert(saturday().textContent.includes('12:00–13:00'), 'A closed weekend must accept a new recurring range.');
  const firstSaturday = win.addDaysIso(monday, 5);
  assert([0, 7, 14, 21].every((offset) => win.slots.some((slot) => slot.date === win.addDaysIso(firstSaturday, offset) && slot.start === '12:00')), 'Adding must update every occurrence through the explicit repeat end.');
  const originalColor = saturday().querySelector('.availability-range-card').style.getPropertyValue('--rink-color');
  doc.querySelector('#dragCalendar .calendar-cell[data-day-index="5"][data-minutes="720"]').click();
  doc.querySelector('[data-open-action="edit"]').click();
  field('coachWorkTimeLocation', other);
  submit(doc.getElementById('coachWorkTimeForm'));
  doc.getElementById('calendarWeekStart').value = win.startOfWeekIso(monday);
  win.renderDragCalendar();
  const updatedTag = saturday().querySelector('.availability-range-card');
  const calendarCell = doc.querySelector('#dragCalendar .calendar-cell[data-day-index="5"][data-minutes="720"]');
  assert(updatedTag.dataset.rink === other && updatedTag.style.getPropertyValue('--rink-color') !== originalColor && updatedTag.style.getPropertyValue('--rink-color') === calendarCell.style.getPropertyValue('--rink-color'), 'Changing a venue must update its label and calendar color together.');
  table().querySelector(`[data-work-day="${monday}"] [data-planner-action="edit-work-range"]`).click();
  assert(doc.getElementById('coachWorkTimeEnd').value === '10:00', 'Weekly card editing must target the base rule rather than the merged booking underlay.');
  field('coachWorkTimeEnd', '11:00');
  submit(doc.getElementById('coachWorkTimeForm'));
  assert(!doc.getElementById('coachWorkTimeDialog').open, `Weekly editing must succeed while preserving booked portions: ${doc.getElementById('coachWorkTimeMessage').textContent}`);
  assert(win.slots.some((slot) => slot.date === win.addDaysIso(monday, 7) && slot.start === '09:00' && slot.location === other), 'Weekly edits must preserve single-date exceptions even on the first edited occurrence.');
  assert(JSON.stringify(win.slots.find((slot) => slot.booked)) === booking, 'Established bookings must remain byte-for-byte unchanged.');
  doc.querySelector('#dragCalendar .calendar-cell[data-day-index="5"][data-minutes="720"]').click();
  doc.querySelector('[data-open-action="delete"]').click();
  assert(saturday().textContent.includes('暂无安排') && !win.slots.some((slot) => slot.date === firstSaturday), 'Deletion must update both weekly rules and calendar occurrences.');
  field('coachPlannerScope', 'dates');
  assert(doc.getElementById('coachEditingRangeSummary').textContent.includes('指定日期'), 'Date mode must be reflected in the shared range summary.');
  assertNoRuntimeErrors('Weekly work time operations', errors);
  dom.window.close();
}

async function testWorkTimeTimetable() {
  const { dom, errors } = await loadPage("coach/index.html", { now: "2035-01-01T06:00:00" });
  const win = dom.window, doc = win.document;
  doc.getElementById('coachPlannerScope').value = 'dates';
  doc.getElementById('coachPlannerScope').dispatchEvent(new win.Event('change', { bubbles: true }));
  const date = win.addDaysIso(win.todayIso(), 2);
  const location = win.readProfileState("maya").saved.servedRinks[0];
  const make = (id, start, end, booked = false) => ({ id, coachId: "maya", date, start, end, location, booked, status: booked ? "Booked" : "Open", lessonName: "私教课", lessonDuration: 30, lessonPrice: 60 });
  win.slots = [make("table-a", "09:00", "09:30"), make("table-b", "09:30", "10:00"), make("table-booked", "11:00", "11:30", true)];
  const config = win.createSchedulingConfig(win.readProfileState("maya").saved.servedRinks);
  config.locations.forEach((place) => { place.included = false; place.windows = [{ days: [], start: 'bad', end: '' }]; });
  win.setSchedulingConfig("maya", config);
  doc.querySelector('[data-coach-panel="availabilityPanel"]').click();
  for (const id of ["coachPlannerFrom", "coachPlannerTo"]) {
    doc.getElementById(id).value = date;
    doc.getElementById(id).dispatchEvent(new win.Event("change", { bubbles: true }));
  }
  win.renderSchedulingSettings();
  assert(!doc.getElementById('coachSchedulerConfig').textContent.includes('参与地点与可授课窗口') && !doc.getElementById('coachSchedulerConfig').querySelector('[data-location], [data-planner-action="use-work-hours"], [data-planner-action="add-window"]'), 'Planner must not ask for duplicate venue confirmations or windows.');
  const table = () => doc.querySelector('#dropdownOpenSlots');
  assert(table().textContent.includes("09:00–10:00") && table().textContent.includes("11:00–11:30"), "Adjacent availability must merge and booking underlay must remain independently editable.");
  assert(!doc.querySelector('[data-workday]') && !table().querySelector('input'), "Work hours must be read-only until a range is opened.");
  assert(table().querySelector('.availability-range-card small').textContent === '共 1 小时', 'Duration must be calculated beside the merged time range without adding a column.');
  const before = JSON.stringify(win.slots), saved = JSON.stringify(win.getTestPublishedSchedule());
  table().querySelector('.availability-range-card').click();
  doc.getElementById('coachWorkTimeEnd').value = '10:30';
  doc.getElementById('cancelCoachWorkTime').click();
  assert(JSON.stringify(win.slots) === before, "Cancel must leave the shared draft unchanged.");
  table().querySelector('.availability-range-card').click();
  doc.getElementById('coachWorkTimeEnd').value = '11:30';
  submit(doc.getElementById('coachWorkTimeForm'));
  assert(doc.getElementById('coachWorkTimeMessage').textContent.includes('开放安排冲突') && JSON.stringify(win.slots) === before, "Extending into another underlying availability range must reject the edit atomically.");
  doc.getElementById('coachWorkTimeEnd').value = '10:30';
  submit(doc.getElementById('coachWorkTimeForm'));
  assert(table().textContent.includes('09:00–10:30') && !doc.getElementById('coachWorkTimeDialog').open, "Confirm must update the shared draft and timetable.");
  assert(table().querySelector('.availability-range-card small').textContent === '共 1 小时 30 分钟', 'The secondary duration must update immediately after confirming a time edit.');
  assert(JSON.stringify(win.getTestPublishedSchedule()) === saved, "Editing must not publish availability.");
  doc.querySelector('[data-optimize-scope="week"]').click();
  const edited = JSON.stringify(win.slots);
  doc.getElementById('generateCoachSchedule').click();
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert(JSON.stringify(win.slots) === edited && !doc.getElementById('coachSchedulePreview').hidden, "Generation must only show a separate preview.");
  assert(doc.querySelector('[data-apply-schedule]') && !doc.querySelector('[data-apply-schedule]').disabled, "A fresh preview must be applicable.");
  addOverviewRange(doc, date, '14:00', '15:00', location);
  assert(table().textContent.includes('14:00–15:00') && doc.querySelector('[data-apply-schedule]').disabled, "Existing form edits must update the timetable and invalidate the old preview.");
  const revised = JSON.stringify(win.slots);
  doc.getElementById('generateCoachSchedule').click();
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert(JSON.stringify(win.slots) === revised && doc.getElementById('coachSchedulePreview').textContent.includes('14:00'), "Regeneration must use the latest shared draft without replacing it.");
  doc.querySelector('[data-apply-schedule]').click();
  assert(doc.getElementById('coachSchedulePreview').hidden && JSON.stringify(win.getTestPublishedSchedule()) === saved, "Apply must update the editing draft without publishing.");
  assert(win.slots.some((slot) => slot.id === 'table-booked' && slot.start === '11:00'), "The booking must remain untouched.");
  assertNoRuntimeErrors("Work timetable", errors);
  dom.window.close();
}

async function testStudentPublishedAvailability() {
  const { dom, errors } = await loadPage("student/index.html?access=full");
  const win = dom.window, doc = win.document;
  const date = win.nextWeekdayIso();
  win.slots = [{ id: "published-student-slot", coachId: "maya", date, start: "10:00", end: "11:00", location: "Polar Ice Rink", availabilityLocation: "Polar Ice Rink", booked: false }];
  win.setTestAvailabilityDraft([]);
  win.render();
  const available = [...doc.querySelectorAll('button[data-action="choose-time"]')].find((button) => button.dataset.ids?.includes("published-student-slot"));
  assert(available, "Unpublished deletion in the coach editor must not hide published student availability.");
  win.openBookingDialog("published-student-slot");
  doc.querySelector("#studentEmail").value = "student@example.com";
  submit(doc.querySelector("#bookingForm"));
  assert(!doc.querySelector("#bookingDialog").open && win.getTestPublishedSchedule().slots.some((slot) => slot.booked), "Student booking must use published supply even when the editing draft differs.");
  assertNoRuntimeErrors("Student published availability", errors);
  dom.window.close();
}

async function testEditingRangePopover() {
  const { dom, errors } = await loadPage('coach/index.html', { now: '2035-01-01T06:00:00' });
  const win = dom.window, doc = win.document;
  doc.querySelector('[data-coach-panel="availabilityPanel"]').click();
  const trigger = doc.getElementById('coachEditingRangeTrigger'), panel = doc.getElementById('coachBaseAvailabilitySettings');
  const summary = doc.getElementById('coachEditingRangeSummary');
  const from = doc.getElementById('coachPlannerFrom'), to = doc.getElementById('coachPlannerTo');
  const before = JSON.stringify(win.captureAvailabilityUndoState()), storage = JSON.stringify(dumpLocalStorage(win));
  const change = (input, value) => { input.value = value; input.dispatchEvent(new win.Event('change', { bubbles: true })); };
  const escape = () => doc.activeElement.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  assert(panel.hidden && trigger.getAttribute('aria-expanded') === 'false' && summary.textContent.includes(from.value), 'Range starts collapsed with the actual scope summary.');
  trigger.click(); await Promise.resolve();
  assert(!panel.hidden && doc.activeElement === doc.getElementById('coachPlannerScope'), 'Opening must expose the original controls and focus the mode.');
  const start = win.addDaysIso(win.todayIso(), 7), end = win.addDaysIso(start, 13);
  change(from, start); change(to, end);
  assert(summary.textContent.includes(start) && summary.textContent.includes(end) && summary.textContent.includes('每周安排'), 'Valid changes immediately update the actual range summary.');
  from.click();
  const popup = doc.getElementById('coachPlannerFromPopover');
  assert(!popup.hidden && !panel.hidden, 'Nested date picker must stay inside the range layer.');
  const month = popup.querySelector('[data-date-month]'); month.focus(); month.dispatchEvent(new win.Event('change', { bubbles: true }));
  assert(!popup.hidden && !panel.hidden, 'Month selection must not close the outer layer.');
  escape();
  assert(popup.hidden && !panel.hidden && doc.activeElement === doc.getElementById('coachPlannerFromTrigger'), 'First Escape closes only the nested calendar and returns its focus.');
  escape();
  assert(panel.hidden && doc.activeElement === trigger, 'Second Escape closes the range and returns trigger focus.');
  trigger.click(); await Promise.resolve(); from.click();
  doc.getElementById('closeCoachEditingRange').click();
  assert(panel.hidden && popup.hidden && doc.activeElement === trigger, 'Explicit close cleans the inner picker without reverting range.');
  trigger.click(); await Promise.resolve(); from.click();
  const outside = doc.getElementById('todayCalendarWeek'); outside.focus();
  assert(panel.hidden && popup.hidden && doc.activeElement === outside, 'Tab or focus outside closes both layers without stealing external focus.');
  trigger.click(); await Promise.resolve(); from.click(); doc.body.click();
  assert(panel.hidden && popup.hidden && doc.activeElement === trigger, 'Outside background click closes both layers and restores trigger focus.');
  trigger.click(); await Promise.resolve(); change(to, ''); doc.getElementById('closeCoachEditingRange').click();
  assert(!doc.getElementById('coachEditingRangeError').hidden && trigger.getAttribute('aria-invalid') === 'true' && summary.textContent.includes(end), 'Invalid fields retain the actual scope summary with a visible correction entry.');
  doc.querySelector('#dropdownOpenSlots [data-planner-action="add-work-range"]').click(); await Promise.resolve();
  assert(!panel.hidden && doc.activeElement === to && !doc.getElementById('coachWorkTimeDialog').open, 'Adding with invalid range opens and focuses correction instead of using stale scope.');
  assert(!doc.getElementById('generateCoachSchedule').disabled, 'Independent Today optimization must stay available.');
  change(to, end); change(doc.getElementById('coachPlannerScope'), 'dates');
  assert(doc.getElementById('coachEditingRangeError').hidden && summary.textContent.includes('指定日期'), 'Correction clears the error and mode changes immediately update the summary.');
  doc.getElementById('closeCoachEditingRange').click();
  doc.querySelector('[data-method="dropdownPanel"]').click(); trigger.click(); await Promise.resolve();
  assert(!panel.hidden && summary.textContent.includes(start) && summary.textContent.includes(end), 'Both views share the same range controls and summary.');
  doc.getElementById('closeCoachEditingRange').click();
  assert(JSON.stringify(win.captureAvailabilityUndoState()) === before && JSON.stringify(dumpLocalStorage(win)) === storage, 'Range UI and picker actions must not mutate schedule, bookings, drafts or storage.');
  assertNoRuntimeErrors('Editing range', errors); dom.window.close();
}

async function testOnDemandOpenEditor() {
  const { dom, errors } = await loadPage('coach/index.html', { now: '2035-01-01T06:00:00' });
  const win = dom.window, doc = win.document;
  const field = (id, value) => { const node = doc.getElementById(id); node.value = value; node.dispatchEvent(new win.Event('change', { bubbles: true })); };
  doc.querySelector('[data-coach-panel="availabilityPanel"]').click();
  assert(!doc.querySelector('[id^="coachAdd"]') && !doc.getElementById('coachWorkTimeDialog').open, 'No permanent add fields remain.');
  const monday = win.startOfWeekIso(win.addDaysIso(win.todayIso(), 7)), sunday = win.addDaysIso(monday, 6);
  field('calendarWeekStart', monday); field('coachPlannerFrom', monday); field('coachPlannerTo', win.addDaysIso(sunday, 7));
  const booking = { id: 'front-booking', coachId: 'maya', date: sunday, start: '14:30', end: '15:00', location: 'Zoom', booked: true, status: 'Booked' };
  win.slots = [booking]; win.render();
  const published = JSON.stringify(win.getTestPublishedSchedule());
  doc.querySelector('[data-method="dropdownPanel"]').click();
  const add = (date) => doc.querySelector(`#dropdownOpenSlots [data-work-day="${date}"] [data-planner-action="add-work-range"]`).click();
  add(sunday);
  const form = doc.getElementById('coachWorkTimeForm');
  assert(doc.getElementById('coachWorkTimeDialog').open, 'Daily plus opens the existing editor.');
  field('coachWorkTimeStart', '14:07'); field('coachWorkTimeEnd', '15:13'); field('coachWorkTimeLocation', 'Zoom'); field('coachWorkTimeMemo', '新入口备注');
  submit(form);
  assert(!doc.getElementById('coachWorkTimeDialog').open, 'Confirm adds to the draft and closes the editor.');
  assert([sunday, win.addDaysIso(sunday, 7)].every(date => win.slots.some(slot => !slot.booked && slot.date === date && slot.start === '14:07')), 'The existing weekly rule must add each occurrence with exact minutes.');
  assert(JSON.stringify(win.slots.find(slot => slot.id === booking.id)) === JSON.stringify(booking), 'Adding across a booking must preserve it byte for byte.');
  assert(JSON.stringify(win.getTestPublishedSchedule()) === published, 'An addition must stay in the draft until saved.');
  doc.querySelector('[data-method="dropdownPanel"]').click();
  assert(doc.querySelector('#dropdownOpenSlots').textContent.includes('14:07') && doc.querySelector('.calendar-open-block[aria-label*="14:07"]'), 'An addition must synchronize both views.');
  doc.querySelector(`#dropdownOpenSlots [data-work-day="${sunday}"] .availability-range-card`).click();
  assert(doc.getElementById('coachWorkTimeMemo').value === '新入口备注', 'Reopening retains the precise draft note.');
  doc.getElementById('cancelCoachWorkTime').click();
  field('coachPlannerScope', 'dates'); add(monday);
  field('coachWorkTimeStart', '16:11'); field('coachWorkTimeEnd', '17:19'); submit(form);
  assert(win.slots.filter(slot => slot.start === '16:11').length === 1 && win.slots.some(slot => slot.date === monday && slot.end === '17:19'), 'Date mode must add only the selected day.');
  const before = JSON.stringify(win.slots);
  add(monday); field('coachWorkTimeStart', '18:00'); field('coachWorkTimeEnd', '15:00'); submit(form);
  assert(JSON.stringify(win.slots) === before && doc.getElementById('coachWorkTimeDialog').open && doc.getElementById('coachWorkTimeMessage').textContent, 'Invalid times must be rejected atomically.');
  field('coachWorkTimeEnd', '19:00'); field('coachPlannerFrom', 'invalid'); submit(form);
  assert(JSON.stringify(win.slots) === before && doc.getElementById('coachWorkTimeMessage').textContent.includes('编辑范围'), 'Confirm must also reject invalid range without committing through stale scope.');
  doc.getElementById('cancelCoachWorkTime').click();
  field('coachPlannerFrom', 'invalid'); add(monday);
  assert(JSON.stringify(win.slots) === before && !doc.getElementById('coachWorkTimeDialog').open && !doc.getElementById('coachBaseAvailabilitySettings').hidden && !doc.getElementById('coachEditingRangeError').hidden, 'Invalid scope must reveal the correction entry and block addition through stale scope.');
  doc.querySelector(`#dropdownOpenSlots [data-work-day="${sunday}"] .availability-range-card`).click();
  assert(!doc.getElementById('coachWorkTimeDialog').open && JSON.stringify(win.slots) === before, 'Invalid scope must also block editing.');
  field('coachPlannerFrom', monday); doc.getElementById('closeCoachEditingRange').click();
  doc.getElementById('saveProfileChanges').click();
  const saved = dumpLocalStorage(win);
  const reloaded = await loadPage('coach/index.html', { now: '2035-01-01T06:00:00', localStorage: saved });
  assert(reloaded.dom.window.slots.some(slot => slot.date === monday && slot.start === '16:11' && slot.end === '17:19'), 'Saving and reloading must retain precise additions.');
  assert(Object.entries(booking).every(([key, value]) => reloaded.dom.window.slots.find(slot => slot.id === booking.id)?.[key] === value), 'Reloading must preserve the booking.');
  assertNoRuntimeErrors('On-demand editor', errors); assertNoRuntimeErrors('On-demand reload', reloaded.errors);
  dom.window.close(); reloaded.dom.window.close();
}

async function testAvailabilityWeekOverview() {
  const { dom, errors } = await loadPage('coach/index.html', { now: '2035-01-01T06:00:00' });
  const win = dom.window, doc = win.document;
  const field = (id, value) => { const node = doc.getElementById(id); node.value = value; node.dispatchEvent(new win.Event('change', { bubbles: true })); };
  doc.querySelector('[data-coach-panel="availabilityPanel"]').click();
  const monday = win.startOfWeekIso(win.addDaysIso(win.todayIso(), 7));
  const sunday = win.addDaysIso(monday, 6);
  field('calendarWeekStart', monday);
  field('coachPlannerFrom', monday); field('coachPlannerTo', sunday); field('coachPlannerScope', 'dates');
  const booking = { id: 'overview-booking', coachId: 'maya', date: sunday, start: '09:00', end: '09:30', location: 'Zoom', booked: true, status: 'Booked' };
  win.slots = [booking]; win.render();
  const published = JSON.stringify(win.getTestPublishedSchedule());
  doc.querySelector('[data-method="dropdownPanel"]').click();
  const days = () => [...doc.querySelectorAll('#dropdownOpenSlots [data-work-day]')];
  const day = () => days()[6];
  const card = () => [...day().querySelectorAll('.availability-range-card')].find((node) => node.textContent.includes('14:07'));
  assert(days().length === 7 && days().every((node) => node.querySelector('[data-planner-action="add-work-range"]')), 'All seven days, including closed weekends, must offer an add action.');
  assert(!doc.getElementById('coachAddOpenForm') && !doc.getElementById('availabilityForm') && !doc.querySelector('#dropdownOpenSlots table') && days().every(day => day.querySelector('[data-planner-action="add-work-range"]').textContent === '＋'), 'Daily plus controls must accompany the cards without a permanent form.');
  day().querySelector('[data-planner-action="add-work-range"]').click();
  field('coachWorkTimeStart', '14:07'); field('coachWorkTimeEnd', '15:13'); field('coachWorkTimeLocation', 'Zoom'); field('coachWorkTimeMemo', '精确分钟备注');
  submit(doc.getElementById('coachWorkTimeForm'));
  assert(card() && card().querySelector('small').textContent.includes('1 小时 6 分钟'), 'Adding from Sunday must update the compact card and secondary duration.');
  card().click();
  assert(doc.getElementById('coachWorkTimeMemo').value === '精确分钟备注', 'Reopening must preserve the note in a dated override.');
  field('coachWorkTimeEnd', '15:21'); submit(doc.getElementById('coachWorkTimeForm'));
  const scope = ['coachPlannerFrom', 'coachPlannerTo', 'coachPlannerScope'].map((id) => doc.getElementById(id).value);
  doc.querySelector('[data-method="calendarPanel"]').click();
  const block = [...doc.querySelectorAll('.calendar-open-block')].find((node) => node.getAttribute('aria-label').includes('14:07–15:21'));
  assert(block, 'The calendar must immediately show unsaved form edits.');
  block.dispatchEvent(new win.MouseEvent('dblclick', { bubbles: true }));
  field('coachWorkTimeEnd', '15:27'); submit(doc.getElementById('coachWorkTimeForm'));
  doc.querySelector('[data-method="dropdownPanel"]').click();
  assert(card().textContent.includes('15:27'), 'Editing from the calendar must immediately update the form card.');
  assert(JSON.stringify(scope) === JSON.stringify(['coachPlannerFrom', 'coachPlannerTo', 'coachPlannerScope'].map((id) => doc.getElementById(id).value)), 'View changes must retain editing mode and date bounds.');
  card().click(); doc.getElementById('deleteCoachWorkTime').click();
  assert(!card() && ![...doc.querySelectorAll('.calendar-open-block')].some((node) => node.getAttribute('aria-label').includes('14:07')), 'Deleting must synchronize both draft views.');
  assert(JSON.stringify(win.slots.find((slot) => slot.id === booking.id)) === JSON.stringify(booking) && JSON.stringify(win.getTestPublishedSchedule()) === published, 'Draft editing must preserve bookings and published data.');
  assertNoRuntimeErrors('Availability week overview', errors); dom.window.close();
}

async function main() {
  await testOpenCalendarButtons();
  await testEditingRangePopover();
  await testOnDemandOpenEditor();
  await testAvailabilityWeekOverview();
  await testLunchSettingModes();
  await testCalendarSettingTools();
  await testCalendarClipboardShortcuts();
  await testCompactCommutePlanner();
  await testOpenCalendarOperations();
  await testPreciseAvailabilitySave();
  await testLunchAlternativesPreview();
  await testUnifiedPlannerRangeAndPicker();
  await testPlannerDateRange();
  await testWeeklyWorkTimeOperations();
  await testWorkTimeTimetable();
  await testLandingPage();
  await testLoginPages();
  await testAdminPage();
  await testCoachPage();
  await testBlockedTimeDialogFlow();
  await testDesktopPageContracts();
  await testAvailabilityConflictActions();
  await testCoachProfileDraftAndSave();
  await testLegacyBasePriceMigration();
  await testLessonDeletionDraftAndSave();
  await testProfileSaveFailureKeepsDraft();
  await testSafeDynamicRendering();
  await testCoachScheduleFilters();
  await testCoachStudentPickerViewportPlacement();
  await testCoachPendingRequestFlow();
  await testCoachScheduleWeekNavigation();
  await testCoachScheduleCalendarGrid();
  await testAvailabilityDragRetraction();
  await testAutomaticSchedulingBookingTransactions();
  await testStudentPage();
  await testPublicCoachProfile();
  await testFullStudentPage();
  await testStudentPublishedAvailability();
  await testRecurringAvailabilityAcceptance();
  await testTicketAcceptanceCoverage();
  for (const dom of testPages) dom.window.close();
  testPages.clear();
  console.log("Smoke test passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
