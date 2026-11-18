import { currentCoachId, readServiceSession, readServiceContext } from "../../core/config.js";
import {
  coachSpecialtyOptions,
  coachTeachingDisciplineOptions,
  normalizeCoachSpecialties,
  normalizeCoachTeachingDisciplines,
  normalizeCustomCoachSpecialties,
} from "../../domain/coach-profile.mjs";
import { coachElements as elements } from "../../dom/coach-elements.js";
import { readProfileEdit } from "./draft.js";
import { escapeAttribute } from "../../ui/safe-html.mjs";
import { getCoach } from "../../core/utils-data.js";

// View-local receipt of the last full form projection. It is not a profile
// draft: native autofill/IME may update inputs before emitting owner commands.
let projectedInputs = '';
export function captureCoachProfileInputs() {
  return JSON.stringify([...elements.coachProfileForm.querySelectorAll('input,textarea,select')].map(node => [node.id, node.value, node.checked]));
}
export function hasUnprojectedCoachProfileInputs() { return projectedInputs !== captureCoachProfileInputs(); }
// An acknowledged save can accept the unchanged form without repainting it.
export function acceptCoachProfileInputCheckpoint() { projectedInputs = captureCoachProfileInputs(); }
export function renderCoachProfile() {
  renderProfileFields();
  renderProfilePhoto();
  acceptCoachProfileInputCheckpoint();
}

function renderProfileFields() {
  const profile = readProfileEdit();
  renderCoachProfileIdentity(profile);
  elements.coachRate.value = profile.rate;
  elements.coachBio.value = typeof profile.bio === "string" ? profile.bio : "";
  renderCoachTeachingDisciplines(profile.teachingDisciplines);
  renderCoachSpecialtyOptions(profile.specialties);
  renderCoachCustomSpecialties(profile.customSpecialties, profile.selectedCustomSpecialties);
  document.querySelectorAll("#servedRinks input[name=servedRinks]").forEach((input) => {
    input.checked = profile.servedRinks.includes(input.value);
  });
  elements.travelsToOtherRinks.value = profile.travelsToOtherRinks ? "negotiable" : "no";
  elements.travelConditions.value = typeof profile.travelConditions === "string" ? profile.travelConditions : "";
  elements.travelConditionsLabel.classList.toggle("is-hidden", !profile.travelsToOtherRinks);
  renderLessonOptions();
}

export function renderCoachProfileIdentity(profile = readProfileEdit()) {
  const profileName = typeof profile.name === "string" ? profile.name.trim() : "";
  const accountName = readServiceSession()?.user?.name;
  elements.coachProfileName.textContent = profileName
    || (typeof accountName === "string" ? accountName.trim() : "")
    || (!readServiceContext().service ? getCoach(currentCoachId)?.name : "")
    || "教练";
}

function renderCoachTeachingDisciplines(selectedValues) {
  const selected = new Set(normalizeCoachTeachingDisciplines(selectedValues));
  elements.coachTeachingDisciplines.replaceChildren(...coachTeachingDisciplineOptions.map((option) => {
    const label = document.createElement("label");
    label.className = "coach-specialty-checkbox coach-discipline-checkbox";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.name = "coachTeachingDisciplines";
    input.value = option.id;
    input.checked = selected.has(option.id);
    label.append(input, document.createTextNode(option.label));
    return label;
  }));
}

export function renderCoachCustomSpecialties(
  values = readProfileEdit().customSpecialties,
  selectedValues = readProfileEdit().selectedCustomSpecialties,
) {
  const specialties = normalizeCustomCoachSpecialties(values);
  const selected = new Set(normalizeCustomCoachSpecialties(selectedValues));
  elements.coachCustomSpecialties.replaceChildren(...specialties.map((specialty) => {
    const item = document.createElement("span");
    item.className = "coach-custom-specialty-item";
    const label = document.createElement("label");
    label.className = "coach-specialty-checkbox coach-custom-specialty";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = selected.has(specialty);
    input.dataset.action = "toggle-custom-specialty";
    input.dataset.specialty = specialty;
    input.setAttribute("aria-label", `选择专长 ${specialty}`);
    label.append(input, document.createTextNode(specialty));
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "custom-specialty-delete";
    remove.dataset.action = "delete-custom-specialty";
    remove.dataset.specialty = specialty;
    remove.setAttribute("aria-label", `删除自定义专长 ${specialty}`);
    remove.title = "删除自定义专长";
    remove.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 3h6l1 2h4v2h-1l-1 14H6L5 7H4V5h4l1-2Zm-1.86 4 .75 12h8.22l.75-12H7.14ZM10 9h2v7h-2V9Zm4 0h2v7h-2V9Z" /></svg>';
    item.append(label, remove);
    return item;
  }));
  elements.coachCustomSpecialties.hidden = !specialties.length;
}

function renderCoachSpecialtyOptions(selectedValues) {
  const selected = new Set(normalizeCoachSpecialties(selectedValues));
  elements.coachSpecialtyOptions.replaceChildren(...coachSpecialtyOptions.map((option) => {
    const label = document.createElement("label");
    label.className = "coach-specialty-checkbox coach-specialty-preset";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.name = "coachSpecialties";
    input.value = option.id;
    input.checked = selected.has(option.id);
    label.append(input, document.createTextNode(option.label));
    return label;
  }));
}

function renderLessonOptions() {
  const profile = readProfileEdit();
  elements.lessonOptionsList.innerHTML = profile.lessonOptions.map((lesson) => {
    const displayName = lesson.name
      .replace("30 min private lesson", "30 分钟私教")
      .replace("60 min private lesson", "60 分钟私教")
      .replace("45 min private lesson", "45 分钟私教");
    return `
      <article class="lesson-option-row" data-lesson-id="${escapeAttribute(lesson.id)}">
        <input class="lesson-name-input" type="text" value="${escapeAttribute(displayName)}" aria-label="课程名称" />
        <input class="lesson-duration-input" type="number" min="15" step="15" value="${escapeAttribute(lesson.duration)}" aria-label="Lesson duration" />
        <input class="lesson-price-input" type="number" min="0" step="0.01" value="${escapeAttribute(lesson.price)}" aria-label="Lesson price" />
        <button class="lesson-delete-button" type="button" data-action="remove-lesson" data-tooltip="删除课程" aria-label="删除 ${escapeAttribute(displayName)}">
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 3h6l1 2h4v2h-1l-1 14H6L5 7H4V5h4l1-2Zm-1.86 4 .75 12h8.22l.75-12H7.14ZM10 9h2v7h-2V9Zm4 0h2v7h-2V9Z" /></svg>
        </button>
      </article>`;
  }).join("");
}

function setPhotoPreview(element, photoUrl) {
  const coach = getCoach(currentCoachId);
  if (photoUrl) {
    element.textContent = "";
    element.style.backgroundImage = `url("${photoUrl}")`;
    return;
  }
  element.style.backgroundImage = "";
  element.textContent = coach.name.split(" ").map((part) => part[0]).join("").slice(0, 2);
}

export function setCoachPhotoPreview(photoUrl) {
  setPhotoPreview(elements.coachPhotoPreview, photoUrl);
}

export function setCoachPhotoDialogPreview(photoUrl) {
  setPhotoPreview(elements.coachPhotoDialogPreview, photoUrl);
}

function renderProfilePhoto() {
  setCoachPhotoPreview(readProfileEdit().photoUrl || "");
}
