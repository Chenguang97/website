import { coachElements as elements } from "../../dom/coach-elements.js";
import {
  getAppliedCoachBookingStudentKeys,
  resetAppliedCoachBookingStudentKeys,
  setAppliedCoachBookingStudentKeys,
} from "./filter-state.js";

let isOpen = false;
let activeIndex = -1;
let draftKeys = new Set();
let searchQuery = "";

function matchingStudents(students) {
  const query = searchQuery.trim().toLocaleLowerCase();
  return query
    ? students.filter((student) => `${student.name} ${student.email}`.toLocaleLowerCase().includes(query))
    : students;
}

function selectedStudents(students) {
  const appliedKeys = getAppliedCoachBookingStudentKeys();
  return students.filter((student) => appliedKeys.includes(student.key));
}

function closedLabel(students) {
  const selected = selectedStudents(students);
  if (!getAppliedCoachBookingStudentKeys().length) return "全部学生";
  if (selected.length === 1) return selected[0].name;
  return `已选${selected.length}位学生`;
}

function duplicateNames(students) {
  const counts = new Map();
  for (const student of students) {
    const name = String(student.name || "").trim().toLocaleLowerCase();
    counts.set(name, (counts.get(name) || 0) + 1);
  }
  return new Set([...counts].filter(([, count]) => count > 1).map(([name]) => name));
}

function renderOptions(students) {
  const matches = matchingStudents(students);
  const duplicates = duplicateNames(students);
  activeIndex = matches.length ? Math.min(Math.max(activeIndex, 0), matches.length - 1) : -1;
  const nodes = matches.map((student, index) => {
    const label = document.createElement("label");
    label.id = `coachStudentOption${index}`;
    label.className = "coach-student-option";
    label.dataset.studentKey = student.key;
    label.setAttribute("role", "option");
    label.setAttribute("aria-selected", String(draftKeys.has(student.key)));
    label.classList.toggle("is-active", index === activeIndex);

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = draftKeys.has(student.key);
    checkbox.dataset.studentKey = student.key;

    const copy = document.createElement("span");
    copy.className = "coach-student-option-copy";
    const name = document.createElement("strong");
    name.textContent = student.name;
    copy.append(name);
    if (duplicates.has(String(student.name || "").trim().toLocaleLowerCase()) && student.email) {
      const email = document.createElement("span");
      email.textContent = student.email;
      copy.append(email);
    }
    label.append(checkbox, copy);
    return label;
  });

  if (!nodes.length) {
    const empty = document.createElement("p");
    empty.className = "coach-student-empty";
    empty.textContent = "未找到匹配学生";
    elements.coachBookingStudentOptions.replaceChildren(empty);
    elements.coachBookingStudentStatus.textContent = "未找到匹配学生";
  } else {
    elements.coachBookingStudentOptions.replaceChildren(...nodes);
    elements.coachBookingStudentStatus.textContent = `找到 ${nodes.length} 位学生`;
  }
  elements.coachBookingStudentSearch.setAttribute("aria-activedescendant", activeIndex >= 0 ? `coachStudentOption${activeIndex}` : "");
}

function renderCoachBookingStudentPicker(students) {
  const input = elements.coachBookingStudentSearch;
  if (!input) return;
  input.setAttribute("aria-expanded", String(isOpen));
  elements.coachBookingStudentResults.hidden = !isOpen;
  if (!isOpen) {
    input.value = closedLabel(students);
    input.removeAttribute("aria-activedescendant");
    return;
  }

  renderOptions(students);
  elements.coachBookingStudentDraftCount.textContent = `已选 ${draftKeys.size} 位`;
  const apply = elements.coachBookingStudentResults.querySelector('[data-student-action="apply"]');
  apply.disabled = draftKeys.size === 0;
  elements.coachBookingStudentValidation.hidden = draftKeys.size !== 0;
  const selectMatches = elements.coachBookingStudentResults.querySelector('[data-student-action="select-matches"]');
  selectMatches.textContent = searchQuery.trim() ? "全选搜索结果" : "全选";
}

function openCoachBookingStudentPicker(students) {
  if (isOpen) return;
  isOpen = true;
  searchQuery = "";
  const appliedKeys = getAppliedCoachBookingStudentKeys();
  draftKeys = new Set(appliedKeys.length ? appliedKeys : students.map((student) => student.key));
  activeIndex = students.length ? 0 : -1;
  elements.coachBookingStudentSearch.value = "";
  renderCoachBookingStudentPicker(students);
}

function closeCoachBookingStudentPicker(students, { restoreFocus = false } = {}) {
  if (!isOpen) return;
  isOpen = false;
  activeIndex = -1;
  draftKeys = new Set();
  searchQuery = "";
  renderCoachBookingStudentPicker(students);
  if (restoreFocus) elements.coachBookingStudentSearch.focus();
}

function toggleCoachBookingStudentPicker(students) {
  if (isOpen) closeCoachBookingStudentPicker(students, { restoreFocus: true });
  else openCoachBookingStudentPicker(students);
}

function updateCoachBookingStudentSearch(students, query) {
  if (!isOpen) openCoachBookingStudentPicker(students);
  searchQuery = query;
  activeIndex = matchingStudents(students).length ? 0 : -1;
  renderCoachBookingStudentPicker(students);
}

function toggleDraftStudent(students, studentKey) {
  if (!studentKey) return;
  if (draftKeys.has(studentKey)) draftKeys.delete(studentKey);
  else draftKeys.add(studentKey);
  renderCoachBookingStudentPicker(students);
}

function selectMatchingStudents(students) {
  for (const student of matchingStudents(students)) draftKeys.add(student.key);
  renderCoachBookingStudentPicker(students);
}

function clearDraftStudents(students) {
  draftKeys.clear();
  renderCoachBookingStudentPicker(students);
}

function applyCoachBookingStudentPicker(students) {
  if (!draftKeys.size) {
    renderCoachBookingStudentPicker(students);
    return false;
  }
  setAppliedCoachBookingStudentKeys([...draftKeys], students);
  closeCoachBookingStudentPicker(students, { restoreFocus: true });
  return true;
}

function resetCoachBookingStudentPicker(students) {
  resetAppliedCoachBookingStudentKeys();
  closeCoachBookingStudentPicker(students, { restoreFocus: true });
}

function moveCoachBookingStudentHighlight(students, direction) {
  const matches = matchingStudents(students);
  if (!isOpen) {
    openCoachBookingStudentPicker(students);
    return;
  }
  if (!matches.length) return;
  activeIndex = (activeIndex + direction + matches.length) % matches.length;
  renderCoachBookingStudentPicker(students);
  elements.coachBookingStudentOptions.querySelector(".is-active")?.scrollIntoView?.({ block: "nearest" });
}

function getHighlightedCoachBookingStudentKey(students) {
  return matchingStudents(students)[activeIndex]?.key;
}

function isCoachBookingStudentPickerOpen() {
  return isOpen;
}

export {
  applyCoachBookingStudentPicker,
  clearDraftStudents,
  closeCoachBookingStudentPicker,
  getHighlightedCoachBookingStudentKey,
  isCoachBookingStudentPickerOpen,
  moveCoachBookingStudentHighlight,
  openCoachBookingStudentPicker,
  renderCoachBookingStudentPicker,
  resetCoachBookingStudentPicker,
  selectMatchingStudents,
  toggleCoachBookingStudentPicker,
  toggleDraftStudent,
  updateCoachBookingStudentSearch,
};

