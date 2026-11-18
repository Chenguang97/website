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
    assert(!/[?#]/.test(match[1]), `${path.relative(root, file)} gives a production module a noncanonical URL: ${match[1]}`);
    const dependency = path.resolve(path.dirname(file), match[1].split(/[?#]/, 1)[0]);
    assert(moduleSet.has(dependency), `${path.relative(root, file)} imports missing module ${match[1]}.`);
    dependencies.push(dependency);
  }
  graph.set(file, dependencies);
}

// Enforce dependency direction rather than relying only on directory names.
for (const [file, dependencies] of graph) {
  const relative = path.relative(jsRoot, file);
  for (const dependency of dependencies) {
    const target = path.relative(jsRoot, dependency);
    if (relative.startsWith(`domain${path.sep}`)) {
      assert(target.startsWith(`domain${path.sep}`), `${relative} must not bind pure rules to ${target}.`);
    }
    if (relative.startsWith(`core${path.sep}`)) {
      assert(["core", "domain"].includes(target.split(path.sep)[0]), `${relative} must not depend on page or DOM module ${target}.`);
    }
  }
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
  "coach/app.js": ["../dom/coach-elements.js", "./availability/actions.js", "./bookings/controls.js", "./profile/fields-controller.js", "./profile/lesson-controller.js", "./profile/photo-controller.js", "./profile/save-controller.js"],
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

const renderModules = modules.filter((file) => path.basename(file) === "render.js");
for (const file of renderModules) {
  const source = fs.readFileSync(file, "utf8");
  const relativePath = path.relative(root, file);
  assert(!/\bstate\.[\w$]+\s*(?:=(?!=)|\+\+|--)/.test(source), `${relativePath} assigns to shared state during rendering.`);
  assert(!/\bstate\.[\w$]+\.(?:sort|push|pop|shift|unshift|splice|reverse|copyWithin|fill|add|delete|clear|set)\s*\(/.test(source), `${relativePath} mutates shared state during rendering.`);
}

const stateSource = fs.readFileSync(path.join(jsRoot, "core", "state.js"), "utf8");
for (const removed of ['state-boundary.js', 'schedule-planning.js', 'undo-history.js']) assert(!fs.existsSync(path.join(jsRoot, 'core', removed)), `Removed bridge ${removed} reappeared.`);
assert(!/export\s+(?:const|let|var)\s+state\b/.test(stateSource), 'Raw state must remain private.');
assert(!/new Proxy\b/.test(stateSource + fs.readFileSync(path.join(jsRoot, 'core', 'owned-values.js'), 'utf8')), 'Owner must use explicit commits rather than observing external writes.');

const renderSource = fs.readFileSync(path.join(jsRoot, "coach", "bookings", "render.js"), "utf8");
assert(!/state\.coachBookingStudentKeys\s*=/.test(renderSource), "Coach booking rendering must not mutate the applied student filter.");
const pickerSource = fs.readFileSync(path.join(jsRoot, "coach", "bookings", "student-picker.js"), "utf8");
assert(!/core\/state\.js/.test(pickerSource) && /let searchQuery =/.test(pickerSource), "Coach booking picker drafts and search must remain local to the feature.");
assert(!fs.existsSync(path.join(jsRoot, "coach", "profile", "actions.js")), "Superseded profile facade must not reappear.");
for (const controller of ["fields-controller.js", "lesson-controller.js", "photo-controller.js", "save-controller.js"]) {
  const source = fs.readFileSync(path.join(jsRoot, "coach", "profile", controller), "utf8");
  assert(!source.includes("renderCoachPage"), `Coach profile ${controller} must not refresh unrelated coach features.`);
}
const availabilityActionsSource = fs.readFileSync(path.join(jsRoot, "coach", "availability", "actions.js"), "utf8");
assert(!availabilityActionsSource.includes("renderCoachPage"), "Coach availability actions must not refresh the whole coach page.");
assert(!availabilityActionsSource.includes('action === "cancel"'), "Booking cancellation must remain owned by coach/bookings.");
const availabilityUndoSource = fs.readFileSync(path.join(jsRoot, "coach", "availability", "undo.js"), "utf8");
assert(!availabilityUndoSource.includes("booking-undo.js"), "Availability undo must not restore booking-owned snapshots.");
const coachBookingUndoSource = fs.readFileSync(path.join(jsRoot, "coach", "bookings", "undo.js"), "utf8");
assert(graph.get(path.join(jsRoot, 'coach/bookings/undo.js')).includes(path.join(jsRoot, 'core/booking-undo.js')), 'Coach undo must use the booking owner.');
for (const role of ['coach/bookings', 'student']) {
  const undo = fs.readFileSync(path.join(jsRoot, role, 'undo.js'), 'utf8');
  assert(!/popLatestUndoSnapshot|pushUndoSnapshot|restoreBookingUndoSnapshot/.test(undo), 'UI cannot consume history before persistence succeeds.');
}
for (const file of modules.filter(file => file.startsWith(path.join(jsRoot, 'core') + path.sep))) {
  assert(!/\bHTMLElement\b|\bdocument\b/.test(fs.readFileSync(file, 'utf8')), 'Core cannot contain DOM keyboard policy.');
}
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
