const fs = require("fs");
const path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");
const esbuild = require("esbuild");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function loadPage(fileName, options = {}) {
  const [filePathPart, query = ""] = fileName.split("?");
  const filePath = path.resolve(filePathPart);
  let html = fs.readFileSync(filePath, "utf8");
  html = html.replace(/<script\s+type="module"\s+src="([^"]+)"\s*><\/script>/g, (_, source) => {
    const entryPoint = path.resolve(path.dirname(filePath), source.split("?")[0]);
    const isAppEntry = /(?:admin|coach|student)-entry\.js$/.test(entryPoint);
    const testBridge = isAppEntry ? `
      import ${JSON.stringify(entryPoint)};
      import { state, replaceBlockedExceptions, replaceBookingRequests, replaceSlots, getProfile, getSavedProfile, setCoachProfileDraft } from ${JSON.stringify(path.resolve("js/core/state.js"))};
      import { openBookingDetails } from ${JSON.stringify(path.resolve("js/ui/booking-details.js"))};
      import { openBookingDialog, openModifyBookingDialog, syncBookingForSelf } from ${JSON.stringify(path.resolve("js/student/booking-actions.js"))};
      import { renderCoachPage } from ${JSON.stringify(path.resolve("js/coach/render.js"))};
      import { renderDragCalendar } from ${JSON.stringify(path.resolve("js/coach/availability/render.js"))};
      import { renderExceptionDragCalendar } from ${JSON.stringify(path.resolve("js/coach/bookings/calendar-render.js"))};
      import { renderStudentOwnBookings, renderStudentPage } from ${JSON.stringify(path.resolve("js/student/render.js"))};
      import { finishCalendarDrag, startCalendarDrag, moveCalendarDrag, cancelCalendarDrag } from ${JSON.stringify(path.resolve("js/coach/availability/actions.js"))};
      import { captureAvailabilityUndoState } from ${JSON.stringify(path.resolve("js/coach/availability/undo.js"))};
      import { shiftScheduleWeek } from ${JSON.stringify(path.resolve("js/coach/bookings/actions.js"))};
      import { prepareCoachBookingCancellation } from ${JSON.stringify(path.resolve("js/coach/bookings/details-actions.js"))};
      import { getCoachBookingStudentKey } from ${JSON.stringify(path.resolve("js/coach/bookings/render.js"))};
      import { renderCoachBookingRequests } from ${JSON.stringify(path.resolve("js/coach/bookings/request-render.js"))};
      import { synchronizeBookingRequestConflicts, synchronizeExpiredBookingRequests } from ${JSON.stringify(path.resolve("js/core/booking-requests.js"))};
      import { ensureLocationChangeDemoBookings } from ${JSON.stringify(path.resolve("js/core/demo-data.js"))};
      import { addDaysIso, minutesFromTime, nextWeekdayIso, startOfWeekIso, todayIso, weekdayIndex } from ${JSON.stringify(path.resolve("js/core/utils-data.js"))};
      Object.defineProperty(globalThis, "slots", { configurable: true, get: () => state.slots, set: replaceSlots });
      Object.defineProperty(globalThis, "blockedExceptions", { configurable: true, get: () => state.blockedExceptions, set: replaceBlockedExceptions });
      Object.defineProperty(globalThis, "bookingRequests", { configurable: true, get: () => state.bookingRequests, set: replaceBookingRequests });
      Object.defineProperty(globalThis, "hasUnsavedProfileChanges", { configurable: true, get: () => state.hasUnsavedProfileChanges });
      const render = () => document.body.dataset.page === "coach" ? renderCoachPage() : renderStudentPage();
      Object.assign(globalThis, {
        addDaysIso, getProfile, getSavedProfile, nextWeekdayIso, openBookingDetails, openBookingDialog,
        openModifyBookingDialog, render, renderCoachBookingRequests, renderDragCalendar, renderExceptionDragCalendar,
        getCoachBookingStudentKey, minutesFromTime, renderStudentOwnBookings, replaceSlots,
        finishCalendarDrag, startCalendarDrag, moveCalendarDrag, cancelCalendarDrag, captureAvailabilityUndoState, prepareCoachBookingCancellation, setCoachProfileDraft, shiftScheduleWeek, startOfWeekIso,
        syncBookingForSelf, synchronizeBookingRequestConflicts, synchronizeExpiredBookingRequests, ensureLocationChangeDemoBookings, todayIso, weekdayIndex,
      });
    ` : `import ${JSON.stringify(entryPoint)};`;
    const bundled = esbuild.buildSync({
      stdin: {
        contents: testBridge,
        resolveDir: path.dirname(entryPoint),
        sourcefile: "smoke-test-entry.js",
      },
      bundle: true,
      format: "iife",
      platform: "browser",
      write: false,
    }).outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
    return `<script>${bundled}</script>`;
  });
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
      window.confirm = () => true;
    },
  });

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
  assert(studentLogin.dom.window.document.querySelector('a[href="../index.html"]'), "Student login page is missing the public preview link.");
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

  assertNoRuntimeErrors("coach/index.html", errors);
  assert(document.querySelector(".view.active")?.id === "coachView", "Coach page did not open on the coach view.");
  assert(document.querySelector('.coach-global-home[href="../index.html"]')?.textContent === "切换入口" && document.querySelectorAll(".coach-global-home svg rect").length === 4 && !document.querySelector(".coach-header-identity a"), "Portal switching must keep its destination and use an independent four-grid tool entry.");
  assert(document.querySelector("#coachHeading")?.textContent === "教练工作台", "Coach workspace title did not use the page-wide meaning.");
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
  for (const link of login.dom.window.document.querySelectorAll(".auth-button")) {
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

async function testAvailabilityConflictActions() {
  const emptyStorage = {
    "ice-skating-coach-booking-slots-v12": "[]",
    "ice-skating-coach-blocked-exceptions-v1": "[]",
  };
  const { dom, errors } = await loadPage("coach/index.html", { localStorage: emptyStorage });
  const win = dom.window;
  const doc = win.document;
  const date = nextWeekdayByIndex(win, 6);
  const form = doc.querySelector("#availabilityForm");

  assertNoRuntimeErrors("coach availability conflict setup", errors);
  doc.querySelector('[data-coach-panel="availabilityPanel"]').click();
  doc.querySelector("#slotDate").value = date;
  doc.querySelector("#startTime").value = "12:00";
  doc.querySelector("#startTime").dispatchEvent(new win.Event("change", { bubbles: true }));
  doc.querySelector("#endTime").value = "13:00";
  doc.querySelector("#locationType").value = "Polar Ice Rink";
  submit(form);

  const beforeConflict = JSON.stringify(win.slots);
  doc.querySelector("#startTime").value = "12:30";
  doc.querySelector("#startTime").dispatchEvent(new win.Event("change", { bubbles: true }));
  doc.querySelector("#endTime").value = "13:30";
  doc.querySelector("#locationType").value = "Arcadia Ice Arena";
  submit(form);
  assert(doc.querySelector("#conflictDialog").open, "Overlapping rink availability did not open the conflict dialog.");
  assert(doc.querySelector("#confirmConflictOverride").classList.contains("primary-button") && doc.querySelector("#confirmConflictOverride").textContent === "覆盖并添加" && doc.querySelector("#cancelConflictOverride").textContent === "取消", "Availability conflicts must use the shared primary/secondary confirmation actions with clear Chinese labels.");
  doc.querySelector("#cancelConflictOverride").click();
  assert(!doc.querySelector("#conflictDialog").open, "Cancel did not close the availability conflict dialog.");
  assert(JSON.stringify(win.slots) === beforeConflict, "Cancel changed availability despite rejecting the override.");

  submit(form);
  doc.querySelector("#conflictDialog").dispatchEvent(new win.Event("cancel"));
  assert(!doc.querySelector("#conflictDialog").open && JSON.stringify(win.slots) === beforeConflict, "Native dialog cancellation must preserve the availability draft.");
  submit(form);
  assert(doc.querySelector("#conflictDialog").open, "Conflict dialog did not reopen for the same unresolved overlap.");
  doc.querySelector("#confirmConflictOverride").click();
  assert(!doc.querySelector("#conflictDialog").open, "Override did not close the availability conflict dialog.");
  assert(
    win.slots.some((slot) => slot.coachId === "maya" && slot.date === date && slot.start === "12:30" && slot.location === "Arcadia Ice Arena"),
    "Override did not apply the requested rink availability.",
  );
  assertNoRuntimeErrors("coach availability conflict actions", errors);
  dom.window.close();
}

async function testCoachProfileDraftAndSave() {
  const { dom, errors } = await loadPage("coach/index.html");
  const win = dom.window;
  const doc = win.document;
  const originalProfile = JSON.parse(JSON.stringify(win.getProfile("maya")));
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
  assert(doc.querySelectorAll(".coach-action-bar").length === 1 && doc.querySelector("#profileSaveStatus").textContent.trim() === "已保存", "The coach page must expose one initialized sticky action bar.");
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
  assert(win.getProfile("maya").photoUrl === originalPhotoUrl, "Cancel changed the profile photo draft.");
  assert(doc.activeElement === doc.querySelector("#openCoachPhotoDialog"), "Closing the photo dialog did not restore focus to its opener.");

  doc.querySelector("#openCoachPhotoDialog").click();
  await selectPhoto("escaped.png");
  photoDialog.dispatchEvent(new win.Event("cancel", { cancelable: true }));
  photoDialog.close();
  assert(win.getProfile("maya").photoUrl === originalPhotoUrl, "Esc cancellation changed the profile photo draft.");
  doc.querySelector("#openCoachPhotoDialog").click();
  assert(doc.querySelector("#confirmCoachPhoto").disabled, "Reopening the photo dialog retained an unconfirmed candidate.");
  assert(doc.querySelector("#chooseCoachPhoto").textContent === "选择照片", "Reopening the photo dialog retained the reselect label.");
  doc.querySelector("#closeCoachPhotoDialog").click();

  doc.querySelector("#openCoachPhotoDialog").click();
  await selectPhoto("confirmed.png");
  doc.querySelector("#confirmCoachPhoto").click();
  assert(win.getProfile("maya").photoUrl.startsWith("data:image/jpeg"), "Confirming an uploaded photo did not update the profile draft.");
  assert(win.getSavedProfile("maya").photoUrl === originalPhotoUrl, "Confirming an uploaded photo persisted it before the unified page save.");
  doc.querySelector('[data-coach-panel="bookingsPanel"]').click();
  doc.querySelector('[data-coach-panel="profilePanel"]').click();
  assert(win.getProfile("maya").photoUrl === originalPhotoUrl, "Discarding an uploaded photo draft changed the saved profile.");
  assert(doc.querySelector("#coachRate").value === "60", "Maya's default base price must be $60 per 30 minutes.");
  assert(doc.querySelector("#coachRate").min === "1" && doc.querySelector("#coachRate").step === "1", "Base price input must accept positive integers in increments of one.");
  assert(doc.querySelector("#coachRate").closest(".money-input").textContent.includes("/30分钟"), "Base price unit must be 30 minutes.");
  win.confirm = () => true;
  doc.querySelector("#coachBio").value = "这段介绍应被放弃。";
  doc.querySelector("#coachBio").dispatchEvent(new win.Event("input", { bubbles: true }));
  doc.querySelector('#coachTeachingDisciplines input[value="pairs"]').click();
  assert(doc.querySelector("#profileSaveStatus").textContent.trim() === "未保存更改", "Editing must show its pending state.");
  const draftBeforePreview = JSON.stringify(win.getProfile("maya"));
  const savedBeforePreview = JSON.stringify(win.getSavedProfile("maya"));
  let previewWarning = "";
  win.confirm = (message) => { previewWarning = message; return false; };
  const cancelledPreview = new win.MouseEvent("click", { bubbles: true, cancelable: true });
  doc.querySelector("#previewCoachProfile").dispatchEvent(cancelledPreview);
  assert(cancelledPreview.defaultPrevented && previewWarning.includes("预览将显示已保存版本，不包含当前未保存修改"), "Cancelling preview with unsaved edits must keep editing after an explicit saved-version warning.");
  win.confirm = () => true;
  const approvedPreview = new win.MouseEvent("click", { bubbles: true, cancelable: true });
  doc.querySelector("#previewCoachProfile").dispatchEvent(approvedPreview);
  assert(!approvedPreview.defaultPrevented && JSON.stringify(win.getProfile("maya")) === draftBeforePreview && JSON.stringify(win.getSavedProfile("maya")) === savedBeforePreview && win.hasUnsavedProfileChanges, "Continuing preview must preserve both saved data and the unsaved editing draft without silently saving.");
  const beforeUnload = new win.Event("beforeunload", { cancelable: true });
  win.dispatchEvent(beforeUnload);
  assert(beforeUnload.defaultPrevented, "Leaving with an unsaved profile did not trigger the beforeunload guard.");
  const discardedSpecialty = doc.querySelector('#coachSpecialtyOptions input[value="spins"]');
  discardedSpecialty.closest("label").click();
  assert(discardedSpecialty.checked, "Clicking the preset specialty text did not toggle its square checkbox.");
  assert(win.getProfile("maya").bio && win.getProfile("maya").specialties.includes("spins") && win.getProfile("maya").teachingDisciplines.includes("pairs"), "Personal identity edits did not enter the profile draft.");
  assert(!win.getSavedProfile("maya").bio && !win.getSavedProfile("maya").specialties.length && !win.getSavedProfile("maya").teachingDisciplines.length, "Personal detail edits mutated saved data before submit.");
  doc.querySelector('[data-coach-panel="bookingsPanel"]').click();
  doc.querySelector('[data-coach-panel="profilePanel"]').click();
  assert(doc.querySelector("#coachBio").value === "" && !doc.querySelector('#coachSpecialtyOptions input[value="spins"]').checked && !doc.querySelector('#coachTeachingDisciplines input[value="pairs"]').checked, "Discarding profile edits did not restore biography, disciplines, and specialties.");
  rinkInput.checked = false;
  rinkInput.dispatchEvent(new win.Event("change", { bubbles: true }));
  assert(win.hasUnsavedProfileChanges, "Editing teaching rinks did not mark the profile draft as unsaved.");
  assert(JSON.stringify(win.getSavedProfile("maya")) === JSON.stringify(originalProfile), "Editing a profile draft mutated saved profile data before submit.");
  doc.querySelector('[data-coach-panel="bookingsPanel"]').click();
  assert(!win.hasUnsavedProfileChanges, "Leaving the profile after confirming discard kept the dirty state.");
  assert(JSON.stringify(win.getProfile("maya")) === JSON.stringify(originalProfile), "Discarding profile edits changed saved profile data.");

  doc.querySelector('[data-coach-panel="profilePanel"]').click();
  const rinkInputs = [...doc.querySelectorAll('input[name="servedRinks"]')];
  rinkInputs.forEach((input) => { input.checked = false; });
  submit(doc.querySelector("#coachProfileForm"));
  assert(doc.querySelector("#profileMessage").textContent.includes("至少选择一个"), "The unified save lost the teaching-rink validation.");
  assert(JSON.stringify(win.getSavedProfile("maya")) === JSON.stringify(originalProfile), "Invalid profile data was saved.");
  rinkInputs.forEach((input) => { input.checked = originalProfile.servedRinks.includes(input.value); });
  doc.querySelector("#coachRate").value = "47.5";
  submit(doc.querySelector("#coachProfileForm"));
  assert(doc.querySelector("#profileMessage").textContent.includes("整数"), "Base price validation accepted a decimal value.");
  assert(JSON.stringify(win.getSavedProfile("maya")) === JSON.stringify(originalProfile), "Invalid base price changed saved profile data.");

  doc.querySelector("#coachRate").value = "55";
  doc.querySelector("#coachRate").dispatchEvent(new win.Event("input", { bubbles: true }));
  const lessonCountBeforeCancel = win.getProfile("maya").lessonOptions.length;
  doc.querySelector("#openLessonOptionEditor").click();
  assert(!doc.querySelector("#lessonOptionEditor").hidden && doc.querySelector("#openLessonOptionEditor").hidden, "Add lesson did not expand an inline table row.");
  doc.querySelector("#lessonName").value = "不应添加的课程";
  doc.querySelector("#cancelLessonOption").click();
  assert(doc.querySelector("#lessonOptionEditor").hidden && !doc.querySelector("#openLessonOptionEditor").hidden && doc.querySelector("#lessonName").value === "", "Cancel did not clear and collapse the uncommitted lesson row.");
  assert(win.getProfile("maya").lessonOptions.length === lessonCountBeforeCancel, "Cancel changed the lesson draft collection.");
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
  assert(win.getProfile("maya").lessonOptions.some((lesson) => lesson.name === "45 分钟测试课" && lesson.price === 82.75), "A manually edited lesson price was not retained.");
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
  assert(win.getProfile("maya").customSpecialties.join("|") === "成人零基础" && doc.querySelector("#coachCustomSpecialties").textContent.includes("成人零基础"), "Enter did not trim and add a custom specialty to the profile draft.");
  assert(win.getProfile("maya").selectedCustomSpecialties.join("|") === "成人零基础", "New custom specialty was not selected by default.");
  assert(doc.querySelector("#customSpecialtyEditor").hidden && !doc.querySelector("#toggleCustomSpecialty").hidden, "Adding a custom specialty did not collapse the inline editor.");
  assert(doc.querySelector('#coachCustomSpecialties input[data-action="toggle-custom-specialty"]:checked')?.dataset.specialty === "成人零基础", "Custom specialty did not render as the same selected square checkbox control.");
  doc.querySelector("#toggleCustomSpecialty").click();
  doc.querySelector("#customSpecialtyInput").value = "成人零基础";
  doc.querySelector("#addCustomSpecialty").click();
  assert(win.getProfile("maya").customSpecialties.length === 1 && doc.querySelector("#customSpecialtyMessage").textContent.includes("已存在"), "Duplicate custom specialty was accepted.");
  doc.querySelector("#customSpecialtyInput").value = "冰舞";
  doc.querySelector("#addCustomSpecialty").click();
  const iceDanceInput = doc.querySelector('input[data-action="toggle-custom-specialty"][data-specialty="冰舞"]');
  iceDanceInput.click();
  assert(win.getProfile("maya").customSpecialties.includes("冰舞") && !win.getProfile("maya").selectedCustomSpecialties.includes("冰舞") && !iceDanceInput.checked, "Unchecking a custom specialty removed its option instead of only changing selection.");
  iceDanceInput.click();
  doc.querySelector('button[data-action="delete-custom-specialty"][data-specialty="冰舞"]').click();
  assert(!win.getProfile("maya").customSpecialties.includes("冰舞") && !win.getProfile("maya").selectedCustomSpecialties.includes("冰舞"), "Custom specialty trash action did not delete the option and selection state.");
  doc.querySelector("#toggleCustomSpecialty").click();
  doc.querySelector("#customSpecialtyInput").value = "待选专长";
  doc.querySelector("#addCustomSpecialty").click();
  doc.querySelector('input[data-action="toggle-custom-specialty"][data-specialty="待选专长"]').click();
  assert(win.getProfile("maya").customSpecialties.includes("待选专长") && !win.getProfile("maya").selectedCustomSpecialties.includes("待选专长"), "Unselected custom specialty was not retained in the draft.");
  doc.querySelector("#toggleCustomSpecialty").click();
  doc.querySelector("#customSpecialtyInput").value = "不应添加";
  doc.querySelector("#customSpecialtyInput").dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  assert(doc.querySelector("#customSpecialtyEditor").hidden && !win.getProfile("maya").customSpecialties.includes("不应添加"), "Escape did not cancel and collapse the custom specialty editor.");
  doc.querySelector("#toggleCustomSpecialty").click();
  doc.querySelector("#customSpecialtyInput").value = "同样不应添加";
  doc.querySelector("#cancelCustomSpecialty").click();
  assert(doc.querySelector("#customSpecialtyEditor").hidden && doc.querySelector("#customSpecialtyInput").value === "", "Cancel did not clear and collapse the custom specialty editor.");
  doc.querySelector("#travelsToOtherRinks").value = "negotiable";
  doc.querySelector("#travelsToOtherRinks").dispatchEvent(new win.Event("change", { bubbles: true }));
  assert(!doc.querySelector("#travelConditionsLabel").classList.contains("is-hidden"), "Negotiable travel selection did not reveal the optional conditions field.");
  doc.querySelector("#travelConditions").value = "限市区范围，交通费用另议。";
  doc.querySelector("#travelConditions").dispatchEvent(new win.Event("input", { bubbles: true }));
  assert(win.getProfile("maya").travelsToOtherRinks && win.getProfile("maya").travelConditions.includes("交通费用"), "Travel preference or conditions did not enter the profile draft.");
  doc.querySelector("#openCoachPhotoDialog").click();
  await selectPhoto("saved.png");
  doc.querySelector("#confirmCoachPhoto").click();
  assert(win.getProfile("maya").photoUrl === newPhotoUrl, "Confirming the photo did not update the profile draft.");
  assert(win.getSavedProfile("maya").photoUrl === originalPhotoUrl, "Confirming the photo persisted it before the unified page save.");
  assert(doc.querySelector("#saveProfileChanges").classList.contains("has-unsaved"), "The header save button did not show the unsaved state.");
  doc.querySelector("#saveProfileChanges").click();
  assert(win.getProfile("maya").rate === newRate, "Saving the profile did not update the coach rate.");
  assert(win.getProfile("maya").basePriceUnitMinutes === 30, "Saving the profile lost the 30-minute pricing marker.");
  assert(win.getProfile("maya").photoUrl === newPhotoUrl, "The unified profile save did not update the coach photo.");
  assert(win.getProfile("maya").bio === savedBio && JSON.stringify(win.getProfile("maya").specialties) === JSON.stringify(["edges", "footwork"]), "The unified profile save did not retain biography and preset specialties.");
  assert(JSON.stringify(win.getProfile("maya").teachingDisciplines) === JSON.stringify(["singles", "ice-dance"]), "The unified profile save did not retain teaching disciplines.");
  assert(JSON.stringify(win.getProfile("maya").customSpecialties) === JSON.stringify(["成人零基础", "待选专长"]), "The unified profile save did not retain selected and unselected custom specialty options.");
  assert(JSON.stringify(win.getProfile("maya").selectedCustomSpecialties) === JSON.stringify(["成人零基础"]), "The unified profile save did not retain custom specialty selection state.");
  assert(win.getProfile("maya").travelsToOtherRinks && win.getProfile("maya").travelConditions === "限市区范围，交通费用另议。", "The unified profile save did not retain negotiable travel conditions.");
  assert(!win.hasUnsavedProfileChanges, "Saving the profile did not clear the dirty state.");
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
  assert(reloaded.dom.window.getProfile("maya").rate === newRate, "Saved coach rate was lost after reload.");
  assert(reloaded.dom.window.getProfile("maya").lessonOptions.some((lesson) => lesson.name === "45 分钟测试课" && lesson.price === 82.75), "Saved lesson price was lost or recalculated after reload.");
  assert(reloaded.dom.window.getProfile("maya").photoUrl === newPhotoUrl, "Saved coach photo was lost after reload.");
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
  assert(firstLoad.dom.window.getProfile("maya").rate === 60, "Maya's hourly rate did not migrate to a 30-minute base price.");
  assert(firstLoad.dom.window.getProfile("alex").rate === 47, "Alex's hourly rate did not discard the fractional conversion.");
  assert(firstLoad.dom.window.getProfile("sam").rate === 55, "Sam's hourly rate did not migrate to a 30-minute base price.");
  assert(firstLoad.dom.window.getProfile("sam").lessonOptions.find((lesson) => lesson.id === "sam-custom").price === 83, "Migration recalculated an existing lesson price.");
  assert(firstLoad.dom.window.getProfile("maya").travelFee === 25 && firstLoad.dom.window.getProfile("maya").travelConditions.includes("额外出行费 $25/次"), "Legacy travel fee meaning was not preserved in the negotiable conditions migration.");
  assert(firstLoad.dom.window.getProfile("maya").selectedCustomSpecialties.join("|") === "旧自定义专长", "Legacy custom specialties were not selected during migration.");
  assert(!firstLoad.dom.window.getProfile("maya").teachingDisciplines.length && firstLoad.dom.window.getProfile("maya").skatingStartYear === null, "Legacy profiles fabricated missing skating identity details during migration.");
  assert(firstLoad.dom.window.getProfile("maya").coachingStartYear === 2015, "A legacy year without a visibility flag was not preserved.");
  assert(firstLoad.dom.window.getProfile("alex").skatingStartYear === 2012, "A formerly private retained year was discarded during migration.");
  assert(firstLoad.dom.window.getProfile("sam").coachingStartYear === 2014, "A formerly public year was lost during migration.");
  assert(firstLoad.dom.window.document.querySelector("#travelsToOtherRinks").value === "negotiable", "Legacy other-rink acceptance did not map to negotiable.");
  const migratedStorage = dumpLocalStorage(firstLoad.dom.window);
  const storedProfiles = JSON.parse(migratedStorage["ice-skating-coach-profiles-v2"]);
  assert(storedProfiles.alex.skatingStartYear === 2012 && storedProfiles.sam.coachingStartYear === 2014, "Legacy year data was not retained in migrated storage.");
  assert(["maya", "alex", "sam"].every((coachId) => storedProfiles[coachId].basePriceUnitMinutes === 30), "Migration marker was not persisted.");
  assert(storedProfiles.maya.demoPhotoVersion === 1 && storedProfiles.maya.photoUrl.endsWith("/assets/coaches/maya-chen.jpg"), "Stored demo data did not receive the default portrait migration.");
  firstLoad.dom.window.close();

  const secondLoad = await loadPage("coach/index.html", { localStorage: migratedStorage });
  assertNoRuntimeErrors("migrated base price reload", secondLoad.errors);
  assert(secondLoad.dom.window.getProfile("alex").rate === 47, "The migrated base price was converted a second time after reload.");
  assert(secondLoad.dom.window.getProfile("sam").lessonOptions.find((lesson) => lesson.id === "sam-custom").price === 83, "Reload changed an existing lesson price.");
  secondLoad.dom.window.close();
}

async function testLessonDeletionDraftAndSave() {
  const { dom, errors } = await loadPage("coach/index.html");
  const win = dom.window;
  const doc = win.document;
  const lessonName = "45 分钟私教";
  const initialButtons = [...doc.querySelectorAll('button[data-action="remove-lesson"]')];

  assert(initialButtons.length === win.getProfile("maya").lessonOptions.length, "Each lesson row must expose one delete action.");
  assert(initialButtons.every((button) => button.querySelector("svg") && !button.textContent.trim() && button.dataset.tooltip === "删除课程"), "Lesson delete actions must render a trash icon with a visible hover/focus tooltip.");
  assert(initialButtons.every((button) => button.getAttribute("aria-label") === `删除 ${button.closest(".lesson-option-row").querySelector(".lesson-name-input").value}`), "Lesson delete actions must include the course name in their accessible labels.");
  const findDeleteButton = () => [...doc.querySelectorAll(".lesson-option-row")]
    .find((row) => row.querySelector(".lesson-name-input").value === lessonName)
    ?.querySelector('button[data-action="remove-lesson"]');
  const savedLesson = JSON.parse(JSON.stringify(win.getSavedProfile("maya").lessonOptions.find((lesson) => lesson.name.includes("45"))));
  const savedIndex = win.getSavedProfile("maya").lessonOptions.findIndex((lesson) => lesson.id === savedLesson.id);

  findDeleteButton().click();
  assert(!win.getProfile("maya").lessonOptions.some((lesson) => lesson.id === savedLesson.id), "Deleting a lesson did not remove it immediately from the profile draft.");
  assert(win.getSavedProfile("maya").lessonOptions.some((lesson) => lesson.id === savedLesson.id), "Deleting a lesson persisted before the unified save.");
  assert(doc.querySelector("#profileMessage").textContent.trim() === "已移除课程，保存后生效" && !doc.querySelector("#undoProfileChange").hidden, "Draft deletion did not expose the required pending-save feedback and undo action.");
  assert(doc.querySelector("#profileSaveStatus").textContent.trim() === "未保存更改", "Draft deletion did not update the floating unsaved state.");

  doc.querySelector("#undoProfileChange").click();
  assert(JSON.stringify(win.getProfile("maya").lessonOptions[savedIndex]) === JSON.stringify(savedLesson), "Undo did not restore the removed lesson content and original position.");
  assert(doc.querySelector("#profileMessage").textContent.trim() === "已恢复课程" && doc.querySelector("#undoProfileChange").hidden, "Undo feedback did not replace the removal action.");

  findDeleteButton().click();
  win.confirm = () => true;
  doc.querySelector('[data-coach-panel="bookingsPanel"]').click();
  doc.querySelector('[data-coach-panel="profilePanel"]').click();
  assert(win.getProfile("maya").lessonOptions.some((lesson) => lesson.id === savedLesson.id) && findDeleteButton(), "Discarding lesson deletion did not restore the saved course.");

  findDeleteButton().click();
  doc.querySelector("#saveProfileChanges").click();
  assert(!win.getSavedProfile("maya").lessonOptions.some((lesson) => lesson.id === savedLesson.id), "Unified save did not persist lesson deletion.");
  assert(!JSON.parse(win.localStorage.getItem("ice-skating-coach-profiles-v2")).maya.lessonOptions.some((lesson) => lesson.id === savedLesson.id), "Persisted profile storage retained the deleted lesson.");
  const savedStorage = dumpLocalStorage(win);
  assertNoRuntimeErrors("lesson deletion draft and save", errors);
  dom.window.close();

  const reloaded = await loadPage("coach/index.html", { localStorage: savedStorage });
  assert(!reloaded.dom.window.getProfile("maya").lessonOptions.some((lesson) => lesson.id === savedLesson.id), "Refreshing restored a course that was formally deleted and saved.");
  assertNoRuntimeErrors("saved lesson deletion reload", reloaded.errors);
  reloaded.dom.window.close();
}

async function testProfileSaveFailureKeepsDraft() {
  const { dom, errors } = await loadPage("coach/index.html");
  const win = dom.window;
  const doc = win.document;
  const originalBio = win.getSavedProfile("maya").bio;
  const nativeSetItem = win.localStorage.setItem;

  doc.querySelector("#coachBio").value = "保存失败时必须保留的草稿";
  doc.querySelector("#coachBio").dispatchEvent(new win.Event("input", { bubbles: true }));
  win.localStorage.setItem = () => { throw new win.DOMException("Storage unavailable", "QuotaExceededError"); };
  doc.querySelector("#saveProfileChanges").click();

  assert(win.getSavedProfile("maya").bio === originalBio, "A failed save changed the saved profile.");
  assert(win.getProfile("maya").bio === "保存失败时必须保留的草稿" && win.hasUnsavedProfileChanges, "A failed save discarded the profile draft or dirty state.");
  assert(doc.querySelector("#profileSaveStatus").textContent.trim() === "保存失败" && doc.querySelector("#profileMessage").textContent.includes("存储"), "A failed save did not explain the storage failure.");
  assert(!doc.querySelector("#coachSaveError").hidden && doc.querySelector("#coachSaveError").textContent.includes("存储"), "The floating save area must explain a failed save beside the retry action.");
  assert(!doc.querySelector("#saveProfileChanges").disabled && !doc.querySelector("#saveProfileChanges").hasAttribute("aria-busy"), "The save action remained locked after failure.");

  win.localStorage.setItem = nativeSetItem;
  doc.querySelector("#saveProfileChanges").click();
  assert(win.getSavedProfile("maya").bio === "保存失败时必须保留的草稿" && doc.querySelector("#saveProfileChanges").disabled && doc.querySelector("#coachSaveError").hidden && doc.querySelector("#profileSaveStatus").textContent === "已保存", "Retrying from the floating action area must save the retained profile draft and clear its error.");
  assertNoRuntimeErrors("profile save failure", errors);
  dom.window.close();
}

async function testSafeDynamicRendering() {
  const { dom, errors } = await loadPage("coach/index.html");
  const win = dom.window;
  const doc = win.document;
  const unsafe = '<img src=x onerror="alert(1)">Unsafe';
  const profile = JSON.parse(JSON.stringify(win.getSavedProfile("maya")));
  profile.lessonOptions = [{ id: 'lesson" unsafe', name: unsafe, duration: 30, price: 60 }];
  win.setCoachProfileDraft(profile);
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

  assertNoRuntimeErrors("coach/index.html recurring availability setup", coachPage.errors);
  const saturday = nextWeekdayByIndex(coachPage.dom.window, 6);
  const nextSaturday = coachPage.dom.window.addDaysIso(saturday, 7);

  document.querySelector('[data-coach-panel="availabilityPanel"]').click();
  document.querySelector("#slotDate").value = saturday;
  document.querySelector("#slotDate").dispatchEvent(new Event("change", { bubbles: true }));
  document.querySelector("#startTime").value = "17:00";
  document.querySelector("#startTime").dispatchEvent(new Event("change", { bubbles: true }));
  document.querySelector("#endTime").value = "18:00";
  document.querySelector("#locationType").value = "Polar Ice Rink";
  submit(document.querySelector("#availabilityForm"));

  let createdSlots = coachPage.dom.window.slots.filter((slot) => slot.coachId === "maya" && slot.date === saturday && slot.start >= "17:00" && slot.end <= "18:00");
  let repeatedSlots = coachPage.dom.window.slots.filter((slot) => slot.coachId === "maya" && slot.date === nextSaturday && slot.start >= "17:00" && slot.end <= "18:00");
  assert(createdSlots.length === 2, "Recurring availability create did not add the selected date slots.");
  assert(repeatedSlots.length === 2, "Recurring availability create did not repeat on the following week.");
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
  assertNoRuntimeErrors("coach/index.html recurring availability reload", reloadedCoachPage.errors);
  createdSlots = reloadedCoachPage.dom.window.slots.filter((slot) => slot.coachId === "maya" && slot.date === saturday && slot.start >= "17:00" && slot.end <= "18:00");
  repeatedSlots = reloadedCoachPage.dom.window.slots.filter((slot) => slot.coachId === "maya" && slot.date === nextSaturday && slot.start >= "17:00" && slot.end <= "18:00");
  assert(createdSlots.length === 2 && repeatedSlots.length === 2, "Saved recurring availability did not persist after reload.");

  const editDocument = reloadedCoachPage.dom.window.document;
  editDocument.querySelector("#slotDate").value = saturday;
  editDocument.querySelector("#slotDate").dispatchEvent(new reloadedCoachPage.dom.window.Event("change", { bubbles: true }));
  editDocument.querySelector("#startTime").value = "17:00";
  editDocument.querySelector("#startTime").dispatchEvent(new reloadedCoachPage.dom.window.Event("change", { bubbles: true }));
  editDocument.querySelector("#endTime").value = "18:00";
  editDocument.querySelector("#locationType").value = "Zoom";
  submit(editDocument.querySelector("#availabilityForm"));
  editDocument.querySelector("#saveAvailability").click();

  const editedSlots = reloadedCoachPage.dom.window.slots.filter((slot) => slot.coachId === "maya" && [saturday, nextSaturday].includes(slot.date) && slot.start >= "17:00" && slot.end <= "18:00");
  assert(editedSlots.length === 4 && editedSlots.every((slot) => slot.location === "Zoom"), "Recurring availability edit did not update existing weekly slots.");

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
  assertNoRuntimeErrors("coach/index.html recurring availability delete", deletePage.errors);
  const deleteDocument = deletePage.dom.window.document;
  deleteDocument.querySelector("#slotDate").value = saturday;
  deleteDocument.querySelector("#slotDate").dispatchEvent(new deletePage.dom.window.Event("change", { bubbles: true }));
  const deleteButton = [...deleteDocument.querySelectorAll('#dropdownOpenSlots [data-action="delete-many"]')].find((button) => button.dataset.start === "17:00" && button.dataset.end === "18:00");
  assert(deleteButton, "Recurring availability delete action was not available.");
  deleteButton.click();
  deleteDocument.querySelector("#saveAvailability").click();

  const afterDelete = deletePage.dom.window.slots.filter((slot) => slot.coachId === "maya" && slot.date >= saturday && deletePage.dom.window.weekdayIndex(slot.date) === 6 && slot.start >= "17:00" && slot.end <= "18:00");
  assert(afterDelete.every((slot) => slot.booked), "Recurring availability delete left unbooked weekly availability behind.");
}

async function testTicketAcceptanceCoverage() {
  const findings = [];
  const addFinding = (ticket, message) => findings.push(`${ticket}: ${message}`);
  const hasText = (document, text) => document.body.textContent.includes(text);
  const studentPage = await loadPage("student/index.html?access=full");
  const coachPage = await loadPage("coach/index.html");
  const adminPage = await loadPage("admin/index.html");
  const { document: studentDocument } = studentPage.dom.window;
  const { document: coachDocument } = coachPage.dom.window;
  const { document: adminDocument } = adminPage.dom.window;

  if (!studentDocument.querySelector("form[action], form#studentSignupForm, input[type='password']")) {
    addFinding("学生注册、登录并保持会话", "No real student signup/login form or persisted session control is implemented; login is only an access=full link.");
  }

  const coachLogin = await loadPage("coach/login/index.html");
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
    return slot.coachId === "maya" && !slot.booked && new Date(`${slot.date}T${slot.end}`) > new Date();
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
  const studentNavReload = await loadPage("student/index.html?access=full", { localStorage: persistedStudentState });
  if (!studentNavReload.dom.window.document.querySelector('[data-student-content="studentBookingsPanel"]')?.classList.contains("active")) {
    addFinding("学生端导航状态持久化", "Student tab navigation does not persist the last selected booking panel.");
  }
  persistedStudentState["ice-skating-student-active-panel-v1"] = "missingPanel";
  const invalidNavReload = await loadPage("student/index.html?access=full", { localStorage: persistedStudentState });
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
  const bookingStatusNow = new Date();
  const bookingEnded = new Date(`${bookedSlot.date}T${bookedSlot.end}`) < bookingStatusNow;
  if (bookingEnded && !coachBookingsText.includes("已结束")) {
    addFinding("教练端查看预约", "Coach bookings list does not display the ended status.");
  }
  if (!bookingEnded && (!coachBookingsText.includes("预约成功") || coachBookingsText.includes("已确认"))) {
    addFinding("教练端查看预约", "Upcoming normal bookings do not show the explicit successful-booking status.");
  }

  const profile = coachPage.dom.window.getProfile("maya");
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
  if (!coachDocument.querySelector("#locationType") || !coachDocument.querySelector("#startTime") || !coachDocument.querySelector("#endTime")) {
    addFinding("可用时间手动输入", "Manual availability form is missing rink/start/end fields.");
  }
  coachDocument.querySelector("#startTime").value = "10:00";
  coachDocument.querySelector("#startTime").dispatchEvent(new coachPage.dom.window.Event("change", { bubbles: true }));
  coachDocument.querySelector("#endTime").value = "09:30";
  submit(coachDocument.querySelector("#availabilityForm"));
  if (!coachDocument.querySelector("#formMessage")?.textContent.includes("结束时间需要晚于开始时间")) {
    addFinding("可用时间手动输入", "Invalid manual time range does not show clear validation feedback.");
  }

  const beforeOverlap = coachPage.dom.window.slots.length;
  const date = coachPage.dom.window.nextWeekdayIso();
  coachDocument.querySelector("#slotDate").value = date;
  coachDocument.querySelector("#startTime").value = "12:00";
  coachDocument.querySelector("#startTime").dispatchEvent(new coachPage.dom.window.Event("change", { bubbles: true }));
  coachDocument.querySelector("#endTime").value = "13:00";
  coachDocument.querySelector("#locationType").value = "Polar Ice Rink";
  submit(coachDocument.querySelector("#availabilityForm"));
  coachDocument.querySelector("#locationType").value = "Arcadia Ice Arena";
  submit(coachDocument.querySelector("#availabilityForm"));
  if (!coachDocument.querySelector("dialog#conflictDialog, [data-conflict-dialog]")) {
    addFinding("可用时间冲突处理", "Cross-rink overlapping availability is overwritten without a conflict dialog offering Override and Cancel.");
  }
  if (coachPage.dom.window.slots.length < beforeOverlap) {
    addFinding("可用时间冲突处理", "Overlap handling is not an explicit atomic trim flow.");
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
  const { dom, errors } = await loadPage("coach/index.html");
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
  win.synchronizeExpiredBookingRequests();
  win.synchronizeBookingRequestConflicts();
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
  const requestControlCss = fs.readFileSync(path.resolve("css/design-system.css"), "utf8");
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
  changeRequest.waitingFor = "coach";
  changeRequest.acceptedBy = ["student"];
  win.render();
  doc.querySelector('[data-booking-section="bookingListSection"]').click();
  doc.querySelector('[data-coach-booking-period="upcoming"]').click();
  assert(doc.querySelector('#coachSlots [data-slot-id="request-conflict-booking"] .coach-booking-request-action')?.textContent === "等你回应", "A modification waiting for the coach must add the action hint without replacing the booking status.");
  doc.querySelector("#coachRequestSectionTrigger").click();
  doc.querySelector('#coachRequestRecords [data-request-id="request-change"]').click();
  doc.querySelector("#acceptCoachRequest").click();
  assert(win.bookingRequests.find((request) => request.id === "request-change").status === "agreed" && booked.location === "Arcadia Ice Arena" && booked.availabilityLocation === "Polar Ice Rink", "An agreed same-time location change must update the actual rink only after acceptance while preserving the original availability rink for calendar comparison.");

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
  const designSystemCss = fs.readFileSync(path.resolve("css/design-system.css"), "utf8");
  assert(/\.coach-week-calendar\s*\{[^}]*overscroll-behavior-y:\s*auto;[^}]*touch-action:\s*pan-x pan-y;/s.test(designSystemCss), "Coach calendars must restore native wheel and touchpad scroll chaining at their boundaries.");
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
  assert(doc.querySelector("#dragCalendar .calendar-day").innerHTML === doc.querySelector("#exceptionDragCalendar .calendar-day").innerHTML, "Both calendars must share weekday and date header rendering.");
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
  const dragCell = doc.querySelector(`#dragCalendar [data-day-index="6"][data-minutes="840"]`);
  dragCell.setPointerCapture = () => {};
  doc.querySelector("#calendarLocationType").value = "Polar Ice Rink";
  win.startCalendarDrag({ target: dragCell, pointerId: 1 });
  win.finishCalendarDrag();
  assert(win.slots.some((slot) => slot.date === dragDate && slot.start === "14:00" && !slot.booked), "Availability drag must retain its existing create behavior.");
  assert(doc.querySelector("#availabilitySaveMessage").textContent.includes("未保存"), "Calendar drag changes must remain clearly unsaved.");
  doc.querySelector("#saveAvailability").click();
  assert(doc.querySelector("#availabilitySaveMessage").textContent.includes("已保存"), "Dragged availability must retain the existing save behavior.");
  const savedDragCell = doc.querySelector(`#dragCalendar [data-day-index="6"][data-minutes="840"]`);
  savedDragCell.setPointerCapture = () => {};
  doc.querySelector("#calendarLocationType").value = "Unavailable";
  win.startCalendarDrag({ target: savedDragCell, pointerId: 2 });
  win.finishCalendarDrag();
  assert(!win.slots.some((slot) => slot.date === dragDate && slot.start === "14:00" && !slot.booked), "Availability drag must retain its existing delete behavior.");
  assert(doc.querySelector("#availabilitySaveMessage").textContent.includes("未保存"), "Dragged deletion must remain pending until saved.");
  doc.querySelector("#saveAvailability").click();
  assert(doc.querySelector("#availabilitySaveMessage").textContent.includes("已保存"), "Dragged deletion must retain the existing save behavior.");
  assertNoRuntimeErrors("Coach calendar grid", errors);
  dom.window.close();
}

async function testAvailabilityDragRetraction() {
  const { dom, errors } = await loadPage("coach/index.html");
  const win = dom.window, doc = win.document;
  doc.querySelector('[data-coach-panel="availabilityPanel"]').click();
  const weekStart = win.startOfWeekIso(win.addDaysIso(win.todayIso(), 14));
  const date = win.addDaysIso(weekStart, 2);
  const makeSlot = (id, start, end, location, booked = false) => ({
    id, coachId: "maya", date, start, end, location, availabilityLocation: location,
    booked, student: booked ? { name: "Keep booking", email: "keep@example.com" } : null,
    lessonName: "Private lesson", lessonDuration: 30, lessonPrice: 60,
  });
  const booking = makeSlot("keep-booking", "08:00", "08:30", "Zoom", true);
  win.slots = [
    makeSlot("original-purple", "06:00", "06:30", "Any served rink"),
    makeSlot("original-green", "06:30", "07:00", "Polar Ice Rink"),
    makeSlot("original-purple-later", "07:00", "07:30", "Any served rink"),
    makeSlot("draft-base", "07:30", "08:00", "Arcadia Ice Arena"), booking,
    makeSlot("reverse-start", "08:30", "09:00", "Any served rink"),
  ];
  doc.querySelector("#calendarWeekStart").value = weekStart;
  win.renderDragCalendar();
  const cell = (minutes) => doc.querySelector(`#dragCalendar .calendar-cell[data-day-index="2"][data-minutes="${minutes}"]`);
  const begin = (minutes, location, pointerId = 1) => {
    doc.querySelector("#calendarLocationType").value = location;
    win.startCalendarDrag({ target: cell(minutes), pointerId });
  };
  const move = (minutes) => {
    doc.elementFromPoint = () => cell(minutes);
    win.moveCalendarDrag({ clientX: 1, clientY: 1 });
  };
  const view = (minutes) => {
    const node = cell(minutes);
    return [node.className, node.dataset.calendarLocation, node.title, node.getAttribute("aria-label"), node.style.cssText].join("|");
  };
  begin(450, "Oceanside Ice Arena");
  win.finishCalendarDrag();
  assert(cell(450).classList.contains("is-editing") && cell(450).dataset.calendarLocation === "Oceanside Ice Arena", "The regression setup must include an earlier unsaved location edit.");
  const before = JSON.stringify(win.captureAvailabilityUndoState());
  const minutes = [360, 390, 420, 450, 480, 510, 540];
  const originals = new Map(minutes.map((minute) => [minute, view(minute)]));
  const bookingBefore = JSON.stringify(win.slots.find((slot) => slot.id === booking.id));
  begin(360, "Arcadia Ice Arena");
  move(540);
  assert(cell(420).style.getPropertyValue("--selection-color") === "#bfdbfe" && cell(420).dataset.calendarLocation === "Arcadia Ice Arena", "The live drag range must show the selected location color and name.");
  assert(view(480) === originals.get(480) && JSON.stringify(win.captureAvailabilityUndoState()) === before, "Drag preview must not change occupied cells, business data, or earlier unsaved edits.");
  move(390);
  for (const minute of [420, 450, 480, 510, 540]) assert(view(minute) === originals.get(minute), `Retraction must restore the pre-gesture state at ${minute}, including unsaved colors and originally blocked time.`);
  doc.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  for (const minute of minutes) assert(view(minute) === originals.get(minute), "Escape must restore every original cell, label and unsaved marker.");
  assert(JSON.stringify(win.captureAvailabilityUndoState()) === before, "Cancelling preview must not restore a saved baseline over an existing draft.");
  begin(510, "Arcadia Ice Arena", 2);
  move(360);
  move(450);
  for (const minute of [360, 390, 420]) assert(view(minute) === originals.get(minute), "Reverse retraction must restore each original location rather than turning it grey.");
  doc.querySelector("#dragCalendar").dispatchEvent(new win.Event("pointercancel", { bubbles: true }));
  for (const minute of minutes) assert(view(minute) === originals.get(minute), "Pointer cancellation must restore the full pre-gesture view.");
  begin(450, "Oceanside Ice Arena", 3);
  assert(!cell(450).classList.contains("reverting") && cell(450).style.getPropertyValue("--selection-color") === "#fde68a", "Starting on the same unsaved location must remain a paint operation instead of implicitly reverting to grey.");
  win.cancelCalendarDrag();
  begin(360, "Arcadia Ice Arena", 4);
  move(540);
  move(390);
  win.finishCalendarDrag();
  assert(!doc.querySelector("#conflictDialog").open && cell(360).dataset.calendarLocation === "Arcadia Ice Arena" && cell(390).dataset.calendarLocation === "Arcadia Ice Arena", "Pointer-up must commit only the final shortened range.");
  for (const minute of [420, 450, 480, 510, 540]) assert(view(minute) === originals.get(minute), "Committed drag must not change cells withdrawn from its final range.");
  begin(450, "Unavailable", 5);
  move(510);
  win.finishCalendarDrag();
  assert(JSON.stringify(win.slots.find((slot) => slot.id === booking.id)) === bookingBefore, "Both opening and blocking recurring availability must preserve the complete existing booking record.");
  assert(doc.querySelector('.availability-panel .heading-note').textContent === "设置每周重复的可预约时间" && doc.querySelector('[data-method="dropdownPanel"]').textContent.trim() === "表单", "Availability heading and edit-method labels must describe their actual purpose.");
  assert(!doc.querySelector('#calendarRinkOptions [data-rink="Unavailable"]') && doc.querySelector("#calendarUnavailableTool"), "Unavailable time must be a separate editing operation rather than a location option.");
  assertNoRuntimeErrors("Availability drag retraction", errors);
  dom.window.close();
}

async function main() {
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
  await testStudentPage();
  await testPublicCoachProfile();
  await testFullStudentPage();
  await testRecurringAvailabilityAcceptance();
  await testTicketAcceptanceCoverage();
  console.log("Smoke test passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
