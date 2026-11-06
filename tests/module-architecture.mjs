import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const jsRoot = path.join(root, "js");

function walk(directory, extensions) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".git") return [];
      return walk(target, extensions);
    }
    return extensions.has(path.extname(entry.name)) ? [target] : [];
  });
}

const modules = walk(jsRoot, new Set([".js", ".mjs"]));
const moduleSet = new Set(modules);
const graph = new Map();
const importPattern = /(?:import|export)\s+(?:[^"']*?\s+from\s+)?["']([^"']+)["']/g;

for (const file of modules) {
  const source = fs.readFileSync(file, "utf8");
  assert(!/Object\.(?:assign|defineProperty)\(globalThis|globalThis\.[\w$]+\s*=/.test(source), `${path.relative(root, file)} exposes a production global.`);
  const dependencies = [];
  for (const match of source.matchAll(importPattern)) {
    if (!match[1].startsWith(".")) continue;
    const dependency = path.resolve(path.dirname(file), match[1]);
    assert(moduleSet.has(dependency), `${path.relative(root, file)} imports missing module ${match[1]}.`);
    dependencies.push(dependency);
  }
  graph.set(file, dependencies);
}

const visiting = new Set();
const visited = new Set();
function visit(file, trail = []) {
  if (visiting.has(file)) {
    const cycleStart = trail.indexOf(file);
    const cycle = [...trail.slice(cycleStart), file].map((item) => path.relative(root, item)).join(" -> ");
    assert.fail(`Circular module dependency: ${cycle}`);
  }
  if (visited.has(file)) return;
  visiting.add(file);
  for (const dependency of graph.get(file) || []) visit(dependency, [...trail, file]);
  visiting.delete(file);
  visited.add(file);
}
for (const file of modules) visit(file);

assert(!fs.existsSync(path.join(root, "app.js")), "Legacy app.js compatibility entry still exists.");
assert(!fs.existsSync(path.join(jsRoot, "domain", "install.mjs")), "Legacy domain installer still exists.");
for (const legacyModule of ["app-init.js", "actions.js", "navigation.js", "booking-actions.js", "undo.js", "render.js", "elements.js"]) {
  assert(!fs.existsSync(path.join(jsRoot, legacyModule)), `Superseded coordination module ${legacyModule} still exists.`);
}

const roleBoundaries = {
  "coach/app.js": ["../dom/coach-elements.js", "./availability/actions.js", "./bookings/controls.js", "./profile/actions.js"],
  "student/app.js": ["../dom/student-elements.js", "./actions.js"],
  "admin/app.js": ["../dom/admin-elements.js", "./actions.js"],
};
for (const [fileName, expectedImports] of Object.entries(roleBoundaries)) {
  const source = fs.readFileSync(path.join(jsRoot, fileName), "utf8");
  assert(!source.includes('from "./elements.js"'), `${fileName} imports the cross-role DOM aggregate.`);
  expectedImports.forEach((expectedImport) => assert(source.includes(expectedImport), `${fileName} does not declare its ${expectedImport} boundary.`));
}

const profileRenderSource = fs.readFileSync(path.join(jsRoot, "coach", "profile", "render.js"), "utf8");
assert(profileRenderSource.includes("function renderCoachCustomSpecialties"), "Coach profile rendering is not owned by coach/profile.");
const studentRenderSource = fs.readFileSync(path.join(jsRoot, "student", "render.js"), "utf8");
assert(studentRenderSource.includes("function renderStudentSlots"), "Student rendering is not owned by student/render.js.");
const calendarGridSource = fs.readFileSync(path.join(jsRoot, "ui", "calendar-grid.js"), "utf8");
assert(!calendarGridSource.includes("state."), "The shared calendar grid must remain independent of application state.");

const renderSource = fs.readFileSync(path.join(jsRoot, "coach", "bookings", "render.js"), "utf8");
assert(!/state\.coachBookingStudentKeys\s*=/.test(renderSource), "Coach booking rendering must not mutate the applied student filter.");
const pickerSource = fs.readFileSync(path.join(jsRoot, "coach", "bookings", "student-picker.js"), "utf8");
assert(!/core\/state\.js/.test(pickerSource) && /let searchQuery =/.test(pickerSource), "Coach booking picker drafts and search must remain local to the feature.");
const profileActionsSource = fs.readFileSync(path.join(jsRoot, "coach", "profile", "actions.js"), "utf8");
assert(!profileActionsSource.includes("renderCoachPage"), "Coach profile actions must not refresh unrelated coach features.");
const availabilityActionsSource = fs.readFileSync(path.join(jsRoot, "coach", "availability", "actions.js"), "utf8");
assert(!availabilityActionsSource.includes("renderCoachPage"), "Coach availability actions must not refresh the whole coach page.");
assert(!availabilityActionsSource.includes('action === "cancel"'), "Booking cancellation must remain owned by coach/bookings.");
const availabilityUndoSource = fs.readFileSync(path.join(jsRoot, "coach", "availability", "undo.js"), "utf8");
assert(!availabilityUndoSource.includes("booking-undo.js"), "Availability undo must not restore booking-owned snapshots.");
const coachBookingUndoSource = fs.readFileSync(path.join(jsRoot, "coach", "bookings", "undo.js"), "utf8");
assert(coachBookingUndoSource.includes('popLatestUndoSnapshot("booking")'), "Coach bookings must own restoration of booking snapshots.");
const bookingActionsSource = fs.readFileSync(path.join(jsRoot, "coach", "bookings", "actions.js"), "utf8");
for (const bookingAction of ["shiftScheduleWeek", "goToCurrentScheduleWeek", "openBlockTimeDialog", "addBlockException"]) {
  assert(bookingActionsSource.includes(`function ${bookingAction}`), `Coach booking actions must own ${bookingAction}.`);
}
for (const fileName of ["coach/availability/actions.js", "student/booking-actions.js", "coach/availability/render.js"]) {
  const source = fs.readFileSync(path.join(jsRoot, fileName), "utf8");
  assert(!/as (?:canFitLessonFrom|findSlotAtIn|getCoveredSlots|overlapsBlocked)/.test(source), `${fileName} duplicates a state-bound scheduling rule adapter.`);
}

for (const htmlFile of walk(root, new Set([".html"]))) {
  const html = fs.readFileSync(htmlFile, "utf8");
  for (const script of html.matchAll(/<script\b([^>]*)\bsrc=["'][^"']+["'][^>]*>/g)) {
    assert(/\btype=["']module["']/.test(script[1]), `${path.relative(root, htmlFile)} loads a non-module external script.`);
  }
}

console.log(`Module architecture tests passed (${modules.length} modules, 0 cycles).`);
