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
      import { state, replaceBlockedExceptions, replaceSlots, getProfile, getSavedProfile, setCoachProfileDraft } from ${JSON.stringify(path.resolve("js/core/state.js"))};
      import { openBookingDetails } from ${JSON.stringify(path.resolve("js/ui/booking-details.js"))};
      import { openBookingDialog, openModifyBookingDialog, syncBookingForSelf } from ${JSON.stringify(path.resolve("js/student/booking-actions.js"))};
      import { renderCoachPage } from ${JSON.stringify(path.resolve("js/coach/render.js"))};
      import { renderDragCalendar } from ${JSON.stringify(path.resolve("js/coach/availability/render.js"))};
      import { renderExceptionDragCalendar } from ${JSON.stringify(path.resolve("js/coach/bookings/calendar-render.js"))};
      import { renderStudentOwnBookings, renderStudentPage } from ${JSON.stringify(path.resolve("js/student/render.js"))};
      import { finishCalendarDrag, startCalendarDrag } from ${JSON.stringify(path.resolve("js/coach/availability/actions.js"))};
      import { shiftScheduleWeek } from ${JSON.stringify(path.resolve("js/coach/bookings/actions.js"))};
      import { getCoachBookingStudentKey } from ${JSON.stringify(path.resolve("js/coach/bookings/render.js"))};
      import { addDaysIso, minutesFromTime, nextWeekdayIso, startOfWeekIso, todayIso, weekdayIndex } from ${JSON.stringify(path.resolve("js/core/utils-data.js"))};
      Object.defineProperty(globalThis, "slots", { configurable: true, get: () => state.slots, set: replaceSlots });
      Object.defineProperty(globalThis, "blockedExceptions", { configurable: true, get: () => state.blockedExceptions, set: replaceBlockedExceptions });
      Object.defineProperty(globalThis, "hasUnsavedProfileChanges", { configurable: true, get: () => state.hasUnsavedProfileChanges });
      const render = () => document.body.dataset.page === "coach" ? renderCoachPage() : renderStudentPage();
      Object.assign(globalThis, {
        addDaysIso, getProfile, getSavedProfile, nextWeekdayIso, openBookingDetails, openBookingDialog,
        openModifyBookingDialog, render, renderDragCalendar, renderExceptionDragCalendar,
        getCoachBookingStudentKey, minutesFromTime, renderStudentOwnBookings, replaceSlots,
        finishCalendarDrag, setCoachProfileDraft, shiftScheduleWeek, startCalendarDrag, startOfWeekIso,
        syncBookingForSelf, todayIso, weekdayIndex,
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
  assert(document.querySelector('.role-page-nav a[href="../index.html"]')?.textContent.includes("返回首页"), "Coach page home navigation is missing.");
  assert(document.querySelector("#coachHeading")?.textContent === "教练工作台", "Coach workspace title did not use the page-wide meaning.");
  assert(!document.body.textContent.includes("更新学生在预约页面看到的信息"), "The profile-only subtitle remained on the coach workspace.");
  const workspaceContainer = document.querySelector(".coach-workspace-container");
  assert(workspaceContainer?.contains(document.querySelector(".coach-page-nav")) && workspaceContainer.contains(document.querySelector("#coachView")), "Coach navigation and panels must share one content container.");

  document.querySelector('[data-coach-panel="bookingsPanel"]').click();
  assert(
    document.querySelector(".coach-panel.active")?.dataset.coachContent === "bookingsPanel",
    "Schedule tab did not activate.",
  );
  assert(document.querySelectorAll("#exceptionDragCalendar .calendar-cell").length > 0, "Schedule calendar did not render cells.");

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
}

async function testBlockedTimeDialogFlow() {
  const { dom, errors } = await loadPage("coach/index.html");
  const { document } = dom.window;
  document.querySelector('[data-coach-panel="bookingsPanel"]').click();

  const studentSearch = document.querySelector("#coachBookingStudentSearch");
  const studentResults = document.querySelector("#coachBookingStudentResults");
  const openButton = document.querySelector("#openBlockDialog");
  const dialog = document.querySelector("#blockDialog");
  const form = document.querySelector("#blockDialogForm");
  studentSearch.click();
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

  document.querySelector("#saveAvailability").click();
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
    assert(document.querySelector('.role-page-nav a[href="../index.html"]'), `${fileName} lost its home navigation.`);
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
  doc.querySelector("#cancelConflictOverride").click();
  assert(!doc.querySelector("#conflictDialog").open, "Cancel did not close the availability conflict dialog.");
  assert(JSON.stringify(win.slots) === beforeConflict, "Cancel changed availability despite rejecting the override.");

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
  assert(doc.querySelector(".coach-action-bar .header-actions #saveProfileChanges")?.getAttribute("form") === "coachProfileForm", "The sticky header save button must submit the full profile form.");
  assert(doc.querySelectorAll(".coach-action-bar").length === 1 && doc.querySelector("#profileSaveStatus").textContent.trim() === "已保存", "The coach page must expose one initialized sticky action bar.");
  assert(doc.querySelector("#previewCoachProfile").target === "_blank" && doc.querySelector("#previewCoachProfile").getAttribute("aria-describedby") === "profilePreviewNote", "Profile preview must preserve the draft tab and describe saved-content behavior.");
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
  assert(doc.querySelector("#profileSaveStatus").textContent.trim() === "有未保存的更改" && !doc.querySelector("#profilePreviewNote").hidden, "Editing the profile did not update the sticky unsaved state or preview note.");
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
  doc.querySelector("#saveProfileChanges").click();
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
  assert(!doc.querySelector("#saveProfileChanges").disabled && !doc.querySelector("#saveProfileChanges").hasAttribute("aria-busy"), "The profile save action remained busy after completion.");
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
  assert(doc.querySelector("#profileSaveStatus").textContent.trim() === "有未保存的更改", "Draft deletion did not update the sticky unsaved state.");

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
  assert(!doc.querySelector("#saveProfileChanges").disabled && !doc.querySelector("#saveProfileChanges").hasAttribute("aria-busy"), "The save action remained locked after failure.");

  win.localStorage.setItem = nativeSetItem;
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

  document.querySelector("#saveAvailability").click();
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
  if (!("status" in bookedSlot) || bookedSlot.status !== "Confirmed") {
    addFinding("已发布时段支持直接预约并自动确认", "Booked slots do not store an explicit Confirmed status.");
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
  if (!/已确认|Confirmed/.test(coachBookingsText)) {
    addFinding("教练端查看已确认预约", "Coach bookings list does not display a confirmed status.");
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
  const future = win.nextWeekdayIso(1);
  const past = win.todayIso(-2);
  const booking = (id, date, start, end, name, email, extra = {}) => ({
    id, coachId: "maya", date, start, end, location: "Polar Ice Rink", availabilityLocation: "Polar Ice Rink",
    booked: true, lessonName: "私教课", lessonDuration: win.minutesFromTime(end) - win.minutesFromTime(start), lessonPrice: 60,
    status: "Confirmed", student: { name, email, note: "Review edges" }, ...extra,
  });
  const adaNear = booking("ada-near", future, "08:00", "09:30", "Ada", "ada@example.com");
  const beaNear = booking("bea-near", future, "10:00", "11:30", "Bea", "bea@example.com");
  const adaFar = booking("ada-far", win.addDaysIso(future, 7), "09:00", "10:00", "Ada", "ada@example.com", { location: "Arcadia Ice Arena", status: "Pending" });
  const sameName = booking("other-ada", win.addDaysIso(future, 14), "14:00", "14:30", "Ada", "another@example.com");
  const adaPast = booking("ada-past", past, "14:00", "14:30", "Ada", "ada@example.com", { student: { name: "Ada", email: "ada@example.com", note: "<img src=x onerror=alert(1)>" } });
  const adaOlder = booking("ada-older", win.addDaysIso(past, -14), "14:00", "14:30", "Ada", "ada@example.com");
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
  const pickerTrigger = doc.querySelector(".coach-student-picker-input");
  const pickerCaret = doc.querySelector(".coach-student-picker-caret");
  const results = doc.querySelector("#coachBookingStudentResults");
  const optionFor = (key) => [...results.querySelectorAll("[data-student-key]")].find((option) => option.dataset.studentKey === key);
  const rows = () => [...doc.querySelectorAll("#coachSlots .coach-booking-card")];
  const rowIds = () => rows().map((row) => row.dataset.slotId).join(",");
  const listTab = doc.querySelector('[data-booking-section="bookingListSection"]');
  const calendarTab = doc.querySelector('[data-booking-section="bookingCalendarSection"]');
  assert(listTab.textContent === "预约列表", "Coach list tab must use the appointment-list label.");
  assert(!doc.querySelector("#coachBookingStudentFilter") && search.placeholder === "全部学生" && search.getAttribute("role") === "combobox", "Student filtering must use one searchable picker that defaults to all students.");
  assert(doc.querySelector("#openBlockDialog").parentElement.classList.contains("coach-booking-calendar-actions") && doc.querySelector("#toggleExceptionCalendarHours").parentElement === doc.querySelector("#openBlockDialog").parentElement, "Calendar actions must share the feedback bar without duplicate buttons.");
  assert(doc.querySelector(".bookings-panel").contains(doc.querySelector("#exceptionDragCalendar")) && !doc.querySelector(".bookings-panel .calendar-panel"), "Appointment heading, tools and calendar must remain in one outer card without a nested calendar card.");
  assert(doc.querySelector(".bookings-panel .heading-note").textContent === "查看学生预约与安排不可预约时间" && doc.querySelector("#coachBookingStudentPicker > label").textContent === "查看学生" && doc.querySelector(".coach-booking-date-filter > .coach-booking-filter-label").textContent === "查看日期", "Appointment heading or aligned filter labels are missing.");
  assert(!doc.querySelector(".bookings-panel .calendar-help") && !doc.querySelector(".coach-booking-filters"), "Removed appointment help or filter panels remain visible.");
  assert(rowIds() === "ada-near,bea-near,ada-far,other-ada", "Upcoming appointments must be chronological across weeks and limited to this coach.");
  assert(!doc.querySelector("#coachSlots .student-booking-group"), "Coach list must not group students or rinks.");
  assert(rows()[0].textContent.includes("Ada") && rows()[0].textContent.includes(future.slice(0, 4)) && rows()[0].textContent.includes("08:00–09:30"), "Appointment row must show student, full date and time.");
  assert(rows()[0].textContent.includes("90 分钟") && rows()[0].textContent.includes("$60") && rows()[0].textContent.includes("Review edges"), "Appointment row must retain course, price and note details.");
  assert(doc.querySelector('[data-slot-id="ada-far"]').textContent.includes("待确认"), "Pending status must not be shown as confirmed.");
  const snapshot = JSON.stringify(win.slots);
  pickerTrigger.click();
  assert(!results.hidden && search.getAttribute("aria-expanded") === "true", "Clicking blank space in the student control must open the picker once.");
  pickerTrigger.click();
  assert(results.hidden && search.getAttribute("aria-expanded") === "false", "Clicking the unified student control again must close the picker once.");
  pickerCaret.dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
  assert(!results.hidden && search.getAttribute("aria-expanded") === "true", "Clicking the student caret must open the same picker.");
  pickerCaret.dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
  assert(results.hidden && search.getAttribute("aria-expanded") === "false", "Clicking the student caret must not double-toggle the picker.");
  search.click();
  assert(!results.hidden && [...results.querySelectorAll('input[type="checkbox"]')].every((checkbox) => checkbox.checked), "Opening an unfiltered picker must represent the dynamic all-students state with every current student checked.");
  search.value = "bea@example.com";
  search.dispatchEvent(new win.Event("input", { bubbles: true }));
  assert(!results.hidden && results.textContent.includes("Bea") && !results.textContent.includes("bea@example.com"), "Unique-name results should stay concise while email search remains supported.");
  results.querySelector('[data-student-action="clear-draft"]').click();
  assert(results.querySelector('[data-student-action="apply"]').disabled && !doc.querySelector("#coachBookingStudentValidation").hidden, "An empty draft must disable apply and explain how to continue.");
  search.dispatchEvent(new win.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
  search.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  assert(!results.hidden && rowIds() === "ada-near,bea-near,ada-far,other-ada" && optionFor(win.getCoachBookingStudentKey(beaNear)).querySelector('input[type="checkbox"]').checked, "Keyboard selection must change only the draft and keep the menu open.");
  results.querySelector('[data-student-action="apply"]').click();
  assert(results.hidden && search.value === "Bea" && rowIds() === "bea-near", "Applying must update the shared filter once and close the picker.");
  search.click();
  search.value = "ADA@EXAMPLE.COM";
  search.dispatchEvent(new win.Event("input", { bubbles: true }));
  assert([...results.querySelectorAll(".coach-student-option")].length === 1 && results.textContent.includes("ada@example.com"), "Case-insensitive email search must work, and duplicate names must show disambiguating email only when needed.");
  assert(rowIds() === "bea-near", "Typing a new search query must preserve existing selected students.");
  optionFor(win.getCoachBookingStudentKey(adaNear)).querySelector('input[type="checkbox"]').click();
  assert(!results.hidden && rowIds() === "bea-near", "Checking another student must not update appointments before apply.");
  results.querySelector('[data-student-action="apply"]').click();
  assert(rowIds() === "ada-near,bea-near,ada-far" && search.value === "已选2位学生", "Applying a multi-student draft must update both views and use the compact count label.");
  assert(doc.querySelector("#coachCalendarFilterSummary").textContent.includes("正在查看2位学生的预约") && doc.querySelector("#coachCalendarFilterSummary").textContent.includes("本周 2 条"), `Applied multi-select feedback must show the combined weekly appointments: ${doc.querySelector("#coachCalendarFilterSummary").textContent}`);
  search.click();
  results.querySelector('[data-student-action="clear-draft"]').click();
  results.querySelector('[data-student-action="cancel"]').click();
  assert(rowIds() === "ada-near,bea-near,ada-far" && search.value === "已选2位学生", "Cancel must discard an un-applied draft.");
  search.click();
  results.querySelector('[data-student-action="clear-draft"]').click();
  doc.body.click();
  assert(results.hidden && rowIds() === "ada-near,bea-near,ada-far" && search.value === "已选2位学生", "Clicking outside must close the picker and discard its draft without changing the applied filter.");
  search.click();
  search.value = "bea@example.com";
  search.dispatchEvent(new win.Event("input", { bubbles: true }));
  optionFor(win.getCoachBookingStudentKey(beaNear)).querySelector('input[type="checkbox"]').click();
  results.querySelector('[data-student-action="apply"]').click();
  assert(rowIds() === "ada-near,ada-far", "Applying after unchecking one student must retain the remaining selection.");
  listTab.click();
  assert(rowIds() === "ada-near,ada-far", "Selected student must display continuously across rinks and weeks, without matching same-name students.");
  calendarTab.click();
  assert(search.value === "Ada", "Calendar/list switching must preserve and display the selected student.");
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
  assert(!doc.querySelector("#coachSlots img") && doc.querySelector("#coachSlots").textContent.includes("<img"), "Booking notes must render safely as text.");
  calendarTab.click();
  win.shiftScheduleWeek(5);
  const emptyWeekSummary = doc.querySelector("#coachCalendarFilterSummary").textContent;
  assert(emptyWeekSummary === "正在查看Ada的预约 · 本周暂无预约", `Calendar must explain when the selected student has no bookings that week: ${emptyWeekSummary}`);
  listTab.click();
  assert(rowIds() === "ada-past,ada-older", "List dates must not be restricted by calendar week navigation.");
  assert(JSON.stringify(win.slots) === snapshot, "Filtering and changing views must not mutate booking data.");
  search.value = "not-a-student";
  search.dispatchEvent(new win.Event("input", { bubbles: true }));
  assert(results.textContent.includes("未找到匹配学生"), "Unmatched student searches need a clear message.");
  assert(rowIds() === "ada-past,ada-older", "Unmatched searches must not silently clear an active student filter.");
  results.querySelector('[data-student-action="reset-filter"]').click();
  assert(search.value === "全部学生" && results.hidden, "The independent reset action must restore the dynamic all-students state and close the panel.");
  calendarTab.click();
  doc.querySelector("#exceptionCalendarWeekStart").value = win.startOfWeekIso(future);
  win.renderExceptionDragCalendar();
  assert(cellAt("10:00").dataset.slotId === "bea-near" && !cellAt("10:00").classList.contains("is-filtered-booking"), "Clearing must restore all students' calendar detail actions.");
  search.click();
  search.value = "ada@example.com";
  search.dispatchEvent(new win.Event("input", { bubbles: true }));
  results.querySelector('[data-student-action="clear-draft"]').click();
  optionFor(win.getCoachBookingStudentKey(adaNear)).querySelector('input[type="checkbox"]').click();
  results.querySelector('[data-student-action="apply"]').click();
  listTab.click();
  doc.querySelector('[data-coach-booking-period="upcoming"]').click();
  doc.querySelector('[data-slot-id="ada-near"] [data-action="coach-booking-details"]').click();
  assert(doc.querySelector("#bookingDetailsDialog").open, "List details action must retain the existing booking details dialog.");
  doc.querySelector("#closeBookingDetails").click();
  let confirmCalls = 0;
  win.confirm = () => { confirmCalls++; return false; };
  doc.querySelector('[data-slot-id="ada-near"] [data-action="coach-cancel-booking"]').click();
  assert(confirmCalls === 1 && adaNear.booked, `Declining cancellation must preserve the booking: confirmCalls=${confirmCalls}, booked=${adaNear.booked}`);
  win.confirm = () => true;
  doc.querySelector('[data-slot-id="ada-near"] [data-action="coach-cancel-booking"]').click();
  assert(!win.slots.find((slot) => slot.id === "ada-near").booked && beaNear.booked, "List cancellation must use existing rules and leave other students' bookings intact.");
  assert(search.value === "Ada" && rowIds() === "ada-far", `Cancellation must refresh the list while preserving the student filter: value=${search.value}, rows=${rowIds()}`);
  doc.querySelector('[data-slot-id="ada-far"] [data-action="coach-cancel-booking"]').click();
  assert(doc.querySelector("#coachSlots .empty-state") && !doc.querySelector('#coachSlots [data-action="clear-coach-booking-student"]'), "Empty filtered lists must rely on the single picker reset entry without a duplicate clear action.");
  search.click();
  results.querySelector('[data-student-action="reset-filter"]').click();
  assert(search.value === "全部学生" && rowIds().includes("bea-near"), "Reset must restore other students' appointments.");
  assertNoRuntimeErrors("Coach schedule interactions", errors);
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
  assert(doc.querySelector('.bookings-panel h3').textContent === "预约管理" && !doc.querySelector('.bookings-panel .panel-heading .eyebrow'), "Appointment title must omit the duplicate eyebrow.");
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

async function testCoachScheduleCalendarGrid() {
  const { dom, errors } = await loadPage("coach/index.html");
  const win = dom.window;
  const doc = win.document;
  const weekStart = win.startOfWeekIso(win.nextWeekdayIso(1));
  const designSystemCss = fs.readFileSync(path.resolve("css/design-system.css"), "utf8");
  assert(/\.coach-week-calendar\s*\{[^}]*overscroll-behavior-y:\s*auto;[^}]*touch-action:\s*pan-x pan-y;/s.test(designSystemCss), "Coach calendars must restore native wheel and touchpad scroll chaining at their boundaries.");
  const booking = (id, day, start, end, location, studentName) => ({
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
  });
  const lesson30 = booking("lesson-30", 0, "08:00", "08:30", "Polar Ice Rink", "Thirty Student");
  const lesson45 = booking("lesson-45", 1, "09:15", "10:00", "Arcadia Ice Arena", "Forty Five Student");
  const lesson60 = booking("lesson-60", 2, "10:30", "11:30", "Oceanside Ice Arena", "Sixty Student");
  const openSlot = { ...booking("open-slot", 3, "12:00", "12:30", "Polar Ice Rink", ""), booked: false, student: null };
  win.slots = [lesson30, lesson45, lesson60, openSlot];
  win.blockedExceptions = [{ id: "grid-block", coachId: "maya", date: win.addDaysIso(weekStart, 4), start: "13:00", end: "13:30", reason: "Unavailable" }];
  doc.querySelector("#exceptionCalendarWeekStart").value = weekStart;
  win.renderExceptionDragCalendar();
  doc.querySelector("#calendarWeekStart").value = weekStart;
  win.renderDragCalendar();

  const block30 = doc.querySelector('.coach-calendar-booking[data-slot-id="lesson-30"]');
  const block45 = doc.querySelector('.coach-calendar-booking[data-slot-id="lesson-45"]');
  const block60 = doc.querySelector('.coach-calendar-booking[data-slot-id="lesson-60"]');
  assert(block30 && block45 && block60, "Coach calendar must render one visible overlay for every appointment.");
  assert(block30.style.gridRow.endsWith("span 30") && block45.style.gridRow.endsWith("span 45") && block60.style.gridRow.endsWith("span 60"), "Appointment block heights must follow their exact minute durations.");
  const availability45 = [...doc.querySelectorAll("#dragCalendar .coach-calendar-booking")].find((block) => block.title.includes("09:15-10:00"));
  assert(doc.querySelector("#dragCalendar").classList.contains("coach-week-calendar") && doc.querySelector("#exceptionDragCalendar").classList.contains("coach-week-calendar"), "Both coach calendars must share the common week-grid style contract.");
  assert(availability45?.classList.contains("is-availability-booking") && availability45.style.gridRow.endsWith("span 45"), "Availability calendar bookings must use the same exact minute scale.");
  assert(availability45.style.getPropertyValue("--booking-accent") === block45.style.getPropertyValue("--booking-accent"), "The same rink must use the same booking color in both calendars.");
  assert(doc.querySelector("#dragCalendar .calendar-time").style.gridRow === doc.querySelector("#exceptionDragCalendar .calendar-time").style.gridRow, "Both calendars must align time-axis rows identically.");
  assert(doc.querySelector("#dragCalendar .calendar-day").innerHTML === doc.querySelector("#exceptionDragCalendar .calendar-day").innerHTML, "Both calendars must share weekday and date header rendering.");
  assert(block45.textContent.includes("Forty Five Student") && block45.textContent.includes("09:15–10:00") && block45.textContent.includes("Arcadia Ice Arena"), "Appointment blocks must retain student, exact time and rink details.");
  assert(block30.style.getPropertyValue("--booking-accent") !== block45.style.getPropertyValue("--booking-accent") && block45.style.getPropertyValue("--booking-accent") !== block60.style.getPropertyValue("--booking-accent"), "Different rinks must retain distinct booking colors.");
  assert(doc.querySelector('#exceptionDragCalendar [data-day-index="3"][data-minutes="720"]').classList.contains("has-slot"), "Available time must remain visible beneath the appointment layer.");
  assert(doc.querySelector('#exceptionDragCalendar [data-day-index="4"][data-minutes="780"]').classList.contains("has-blocked"), "Unavailable time must retain its blocked state.");
  assert([...doc.querySelectorAll("#exceptionDragCalendar .calendar-day")].every((header, index) => header.textContent.includes(`周${"一二三四五六日"[index]}`)), "Week headers must show clear localized weekday labels.");
  block45.click();
  assert(doc.querySelector("#bookingDetailsDialog").open && doc.querySelector("#bookingDetailsBody").textContent.includes("Forty Five Student"), "Clicking a calendar appointment must retain the existing details action.");
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
  await testCoachScheduleWeekNavigation();
  await testCoachScheduleCalendarGrid();
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
