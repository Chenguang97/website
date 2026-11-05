import { currentCoachId, rinks } from "./config.js";
import {
  basePriceUnitMinutes,
  calculateLessonPrice,
  isValidBasePrice,
  isValidLessonPrice,
} from "./domain/pricing.mjs";
import {
  coachSpecialtyOptions,
  customCoachSpecialtyMaxLength,
  normalizeCoachTeachingDisciplines,
  normalizeCustomCoachSpecialties,
} from "./domain/coach-profile.mjs";
import { elements } from "./elements.js";
import {
  setProfileDirty,
  setProfileSaveStatus,
  setProfileSaving,
  showProfileMessage,
  showProfileSaveFailure,
} from "./coach-profile-status.js";
import { handlePhotoFileChange, render, renderCoachCustomSpecialties, setCoachPhotoDialogPreview, setCoachPhotoPreview, syncLocationOptions } from "./render.js";
import {
  clearCoachProfileDraft,
  ensureCoachProfileDraft,
  getLastStorageRecoveryMessage,
  getSavedProfile,
  saveProfiles,
  setCoachProfile,
  setCoachProfileDraft,
  state
} from "./state.js";
import { captureProfileUndoState, clearUndoHistory, pushUndoState } from "./undo.js";
import { todayIso } from "./utils-data.js";
let photoDialogCandidateUrl = "";
let photoDialogReturnFocus = null;

function discardProfileChanges() {
  clearCoachProfileDraft();
  clearUndoHistory("coach-profile");
  setProfileDirty(false);
  render();
}

function showPhotoMessage(message, isError = false) {
  elements.photoMessage.textContent = message;
  elements.photoMessage.style.color = isError ? "var(--red)" : "var(--green)";
}

function setPhotoDialogCandidate(photoUrl) {
  photoDialogCandidateUrl = photoUrl;
  setCoachPhotoDialogPreview(photoUrl || ensureCoachProfileDraft().photoUrl || "");
  elements.confirmCoachPhoto.disabled = !photoUrl;
}

function resetPhotoDialog() {
  photoDialogCandidateUrl = "";
  elements.coachPhotoFile.value = "";
  elements.chooseCoachPhoto.disabled = false;
  elements.chooseCoachPhoto.textContent = "选择照片";
  elements.confirmCoachPhoto.disabled = true;
  showPhotoMessage("");
  setCoachPhotoDialogPreview(ensureCoachProfileDraft().photoUrl || "");
}

function openCoachPhotoDialog(event) {
  photoDialogReturnFocus = event.currentTarget;
  resetPhotoDialog();
  elements.coachPhotoDialog.showModal();
  elements.chooseCoachPhoto.focus();
}

function closeCoachPhotoDialog() {
  resetPhotoDialog();
  elements.coachPhotoDialog.close();
  photoDialogReturnFocus?.focus();
}

function handleCoachPhotoDialogCancel() {
  resetPhotoDialog();
  window.setTimeout(() => photoDialogReturnFocus?.focus(), 0);
}

async function handleCoachPhotoFileChange() {
  photoDialogCandidateUrl = "";
  elements.confirmCoachPhoto.disabled = true;
  elements.chooseCoachPhoto.disabled = true;
  elements.chooseCoachPhoto.textContent = "处理中…";
  showPhotoMessage("");
  const photoUrl = await handlePhotoFileChange();
  elements.chooseCoachPhoto.disabled = false;
  if (!photoUrl) {
    elements.chooseCoachPhoto.textContent = "选择照片";
    setCoachPhotoDialogPreview(ensureCoachProfileDraft().photoUrl || "");
    return;
  }
  elements.chooseCoachPhoto.textContent = "重新选择";
  setPhotoDialogCandidate(photoUrl);
}

function confirmCoachPhoto() {
  if (!photoDialogCandidateUrl) return;
  setCoachProfileDraft({ ...ensureCoachProfileDraft(), photoUrl: photoDialogCandidateUrl });
  setCoachPhotoPreview(photoDialogCandidateUrl);
  setProfileDirty(true, "有未保存的头像更改。");
  photoDialogCandidateUrl = "";
  elements.coachPhotoDialog.close();
  photoDialogReturnFocus?.focus();
}
function confirmDiscardProfileChanges() {
  if (!state.hasUnsavedProfileChanges) return true;
  const confirmed = window.confirm("你有尚未保存的更改，确定要放弃这些更改并离开吗？");
  if (confirmed) {
    discardProfileChanges();
  }
  return confirmed;
}
function saveCoachProfile(event) {
  event.preventDefault();
  if (state.isSavingProfile) return;
  const coachId = currentCoachId;
  const travels = elements.travelsToOtherRinks.value === "negotiable";
  const rate = Number(elements.coachRate.value || 0);
  const lessonOptions = getLessonOptionsFromForm();
  const servedRinks = getSelectedServedRinks();
  if (!isValidBasePrice(elements.coachRate.value)) {
    showProfileMessage("基础价格必须是大于 0 的整数。", true);
    return;
  }
  if (lessonOptions.some((lesson) => !isValidLessonPrice(lesson.price))) {
    showProfileMessage("课程价格最多保留两位小数。", true);
    return;
  }
  if (!servedRinks.length) {
    showProfileMessage("请至少选择一个可授课冰场。", true);
    return;
  }
  const previousProfile = getSavedProfile(coachId);
  const savedProfile = {
    ...ensureCoachProfileDraft(coachId),
    coachId,
    rate,
    basePriceUnitMinutes,
    homeRink: servedRinks[0],
    servedRinks,
    travelsToOtherRinks: travels,
    travelConditions: elements.travelConditions.value.trim(),
    teachingDisciplines: getSelectedTeachingDisciplines(),
    lessonOptions,
  };
  setProfileSaving(true);
  try {
    setCoachProfile(coachId, savedProfile);
    if (!saveProfiles()) {
      setCoachProfile(coachId, previousProfile);
      showProfileSaveFailure(getLastStorageRecoveryMessage() || "保存失败。请检查浏览器存储空间后重试，当前草稿仍已保留。");
      return;
    }
    clearCoachProfileDraft();
    clearUndoHistory("coach-profile");
    elements.photoMessage.textContent = "";
    setProfileDirty(false);
    setProfileSaveStatus("已保存");
    showProfileMessage("已保存");
    render();
  } finally {
    setProfileSaving(false);
  }
}
function getSelectedServedRinks() {
  const selectedRinks = new Set(Array.from(elements.servedRinkInputs).filter((input) => input.checked).map((input) => input.value));
  return rinks.filter((rink) => selectedRinks.has(rink));
}
function getSelectedTeachingDisciplines() {
  return normalizeCoachTeachingDisciplines(
    [...elements.coachTeachingDisciplines.querySelectorAll('input[name="coachTeachingDisciplines"]:checked')]
      .map((input) => input.value),
  );
}
function getLessonOptionsFromForm() {
  const existingProfile = ensureCoachProfileDraft();
  return [...elements.lessonOptionsList.querySelectorAll(".lesson-option-row")].map((row) => {
    const existingLesson = existingProfile.lessonOptions.find((lesson) => lesson.id === row.dataset.lessonId) || {};
    const duration = Number(row.querySelector(".lesson-duration-input").value || existingLesson.duration || 0);
    const price = Number(row.querySelector(".lesson-price-input").value || existingLesson.price || 0);
    return {
      ...existingLesson,
      id: row.dataset.lessonId,
      name: row.querySelector(".lesson-name-input").value.trim() || `${duration}-minute private lesson`,
      duration,
      price,
      custom: true
    };
  });
}
function previewServedRinksChange() {
  const servedRinks = getSelectedServedRinks();
  if (!servedRinks.length) return;
  setCoachProfileDraft({
    ...ensureCoachProfileDraft(),
    homeRink: servedRinks[0],
    servedRinks
  });
  setProfileDirty(true, "有未保存的更改。");
  syncLocationOptions();
}
function handleCoachBioInput() {
  setCoachProfileDraft({ ...ensureCoachProfileDraft(), bio: elements.coachBio.value });
  setProfileDirty(true, "有未保存的个人介绍更改。");
}
function handleCoachTeachingDisciplinesChange() {
  const profile = { ...ensureCoachProfileDraft(), teachingDisciplines: getSelectedTeachingDisciplines() };
  setCoachProfileDraft(profile);
  setProfileDirty(true, "有未保存的教学项目更改。");
}
function handleCoachSpecialtiesChange() {
  const specialties = [...elements.coachSpecialtyOptions.querySelectorAll('input[name="coachSpecialties"]:checked')]
    .map((input) => input.value);
  setCoachProfileDraft({ ...ensureCoachProfileDraft(), specialties });
  setProfileDirty(true, "有未保存的教学专长更改。");
}

function showCustomSpecialtyMessage(message, isError = false) {
  elements.customSpecialtyMessage.textContent = message;
  elements.customSpecialtyMessage.classList.toggle("error", isError);
}

function closeCustomSpecialtyEditor({ restoreFocus = true } = {}) {
  elements.customSpecialtyEditor.hidden = true;
  elements.toggleCustomSpecialty.hidden = false;
  elements.toggleCustomSpecialty.setAttribute("aria-expanded", "false");
  elements.customSpecialtyInput.value = "";
  showCustomSpecialtyMessage("");
  if (restoreFocus) elements.toggleCustomSpecialty.focus();
}

function toggleCustomSpecialtyEditor() {
  elements.customSpecialtyEditor.hidden = false;
  elements.toggleCustomSpecialty.hidden = true;
  elements.toggleCustomSpecialty.setAttribute("aria-expanded", "true");
  showCustomSpecialtyMessage("");
  elements.customSpecialtyInput.focus();
}

function addCustomSpecialty() {
  const value = elements.customSpecialtyInput.value.trim();
  if (!value) {
    showCustomSpecialtyMessage("请输入专长名称。", true);
    return;
  }
  if (value.length > customCoachSpecialtyMaxLength) {
    showCustomSpecialtyMessage(`专长名称不能超过 ${customCoachSpecialtyMaxLength} 个字符。`, true);
    return;
  }
  const profile = ensureCoachProfileDraft();
  const current = normalizeCustomCoachSpecialties(profile.customSpecialties);
  const normalizedValue = value.toLocaleLowerCase();
  const duplicatesPreset = coachSpecialtyOptions.some((option) => option.label.toLocaleLowerCase() === normalizedValue);
  const duplicatesCustom = current.some((specialty) => specialty.toLocaleLowerCase() === normalizedValue);
  if (duplicatesPreset || duplicatesCustom) {
    showCustomSpecialtyMessage("该专长已存在。", true);
    return;
  }
  const customSpecialties = [...current, value];
  const selectedCustomSpecialties = [
    ...normalizeCustomCoachSpecialties(profile.selectedCustomSpecialties),
    value,
  ];
  setCoachProfileDraft({ ...profile, customSpecialties, selectedCustomSpecialties });
  elements.customSpecialtyInput.value = "";
  showCustomSpecialtyMessage("");
  renderCoachCustomSpecialties(customSpecialties, selectedCustomSpecialties);
  setProfileDirty(true, "有未保存的教学专长更改。");
  closeCustomSpecialtyEditor();
}

function handleCustomSpecialtyKeydown(event) {
  if (event.key === "Enter") {
    event.preventDefault();
    addCustomSpecialty();
  } else if (event.key === "Escape") {
    event.preventDefault();
    closeCustomSpecialtyEditor();
  }
}

function handleCustomSpecialtyChange(event) {
  const input = event.target.closest('input[data-action="toggle-custom-specialty"]');
  if (!input) return;
  const profile = ensureCoachProfileDraft();
  const selected = new Set(normalizeCustomCoachSpecialties(profile.selectedCustomSpecialties));
  if (input.checked) selected.add(input.dataset.specialty);
  else selected.delete(input.dataset.specialty);
  setCoachProfileDraft({ ...profile, selectedCustomSpecialties: [...selected] });
  setProfileDirty(true, "有未保存的教学专长更改。");
}

function handleCustomSpecialtyDelete(event) {
  const button = event.target.closest('button[data-action="delete-custom-specialty"]');
  if (!button) return;
  const profile = ensureCoachProfileDraft();
  const customSpecialties = normalizeCustomCoachSpecialties(profile.customSpecialties)
    .filter((specialty) => specialty !== button.dataset.specialty);
  const selectedCustomSpecialties = normalizeCustomCoachSpecialties(profile.selectedCustomSpecialties)
    .filter((specialty) => specialty !== button.dataset.specialty);
  setCoachProfileDraft({ ...profile, customSpecialties, selectedCustomSpecialties });
  renderCoachCustomSpecialties(customSpecialties, selectedCustomSpecialties);
  setProfileDirty(true, "有未保存的教学专长更改。");
}

function handleTravelPreferenceChange() {
  const profile = ensureCoachProfileDraft();
  const travelsToOtherRinks = elements.travelsToOtherRinks.value === "negotiable";
  setCoachProfileDraft({ ...profile, travelsToOtherRinks });
  elements.travelConditionsLabel.classList.toggle("is-hidden", !travelsToOtherRinks);
  setProfileDirty(true, "有未保存的更改。");
}

function handleTravelConditionsInput() {
  setCoachProfileDraft({ ...ensureCoachProfileDraft(), travelConditions: elements.travelConditions.value });
  setProfileDirty(true, "有未保存的更改。");
}

function setLessonFieldError(input, errorElement, message = "") {
  errorElement.textContent = message;
  input.toggleAttribute("aria-invalid", Boolean(message));
}

function clearLessonOptionErrors() {
  setLessonFieldError(elements.lessonName, elements.lessonNameError);
  setLessonFieldError(elements.lessonDuration, elements.lessonDurationError);
  setLessonFieldError(elements.lessonPrice, elements.lessonPriceError);
}

function openLessonOptionEditor() {
  clearLessonOptionErrors();
  elements.lessonOptionEditor.hidden = false;
  elements.openLessonOptionEditor.hidden = true;
  elements.openLessonOptionEditor.setAttribute("aria-expanded", "true");
  elements.lessonName.focus();
}

function closeLessonOptionEditor({ restoreFocus = true } = {}) {
  elements.lessonName.value = "";
  elements.lessonDuration.value = "";
  elements.lessonPrice.value = "";
  state.newLessonPriceIsCustom = false;
  clearLessonOptionErrors();
  elements.lessonOptionEditor.hidden = true;
  elements.openLessonOptionEditor.hidden = false;
  elements.openLessonOptionEditor.setAttribute("aria-expanded", "false");
  if (restoreFocus) elements.openLessonOptionEditor.focus();
}

function addLessonOption() {
  const profile = ensureCoachProfileDraft();
  const duration = Number(elements.lessonDuration.value || 0);
  const priceValue = elements.lessonPrice.value;
  const price = Number(priceValue);
  const name = elements.lessonName.value.trim() || `${duration}-minute private lesson`;
  clearLessonOptionErrors();
  let hasError = false;
  if (!duration) {
    setLessonFieldError(elements.lessonDuration, elements.lessonDurationError, "请填写课程时长。");
    hasError = true;
  }
  if (!priceValue) {
    setLessonFieldError(elements.lessonPrice, elements.lessonPriceError, "请填写课程价格。");
    hasError = true;
  } else if (!isValidLessonPrice(priceValue)) {
    setLessonFieldError(elements.lessonPrice, elements.lessonPriceError, "价格最多保留两位小数。");
    hasError = true;
  }
  if (hasError) {
    return;
  }
  profile.lessonOptions.push({
    id: `lesson-${Date.now()}`,
    name,
    duration,
    price,
    custom: true
  });
  setCoachProfileDraft(profile);
  closeLessonOptionEditor();
  setProfileDirty(true, "已添加课程，记得保存更改。");
  render();
}
function updateNewLessonDefaultPrice() {
  if (state.newLessonPriceIsCustom) return;
  const duration = Number(elements.lessonDuration.value || 0);
  if (!isValidBasePrice(elements.coachRate.value) || !duration) {
    elements.lessonPrice.value = "";
    return;
  }
  elements.lessonPrice.value = String(calculateLessonPrice(elements.coachRate.value, duration));
}
function handleBasePriceInput() {
  if (isValidBasePrice(elements.coachRate.value)) {
    setCoachProfileDraft({
      ...ensureCoachProfileDraft(),
      rate: Number(elements.coachRate.value),
      basePriceUnitMinutes,
    });
  }
  setProfileDirty(true, "有未保存的更改。");
  updateNewLessonDefaultPrice();
}
function handleNewLessonDurationInput() {
  setLessonFieldError(elements.lessonDuration, elements.lessonDurationError);
  state.newLessonPriceIsCustom = false;
  updateNewLessonDefaultPrice();
}
function handleNewLessonPriceInput() {
  setLessonFieldError(elements.lessonPrice, elements.lessonPriceError);
  state.newLessonPriceIsCustom = true;
}
function handleLessonOptionChange(event) {
  const row = event.target.closest(".lesson-option-row");
  if (!row) return;
  const profile = ensureCoachProfileDraft();
  const lesson = profile.lessonOptions.find((item) => item.id === row.dataset.lessonId);
  if (!lesson) return;
  lesson.name = row.querySelector(".lesson-name-input").value.trim() || `${lesson.duration}-minute private lesson`;
  lesson.duration = Number(row.querySelector(".lesson-duration-input").value || lesson.duration);
  lesson.price = Number(row.querySelector(".lesson-price-input").value || lesson.price);
  lesson.custom = true;
  setCoachProfileDraft(profile);
  setProfileDirty(true, "有未保存的课程价格更改。");
}
function hasFutureBookingsForLesson(lesson) {
  return state.slots.some((slot) => {
    return slot.coachId === currentCoachId && slot.booked && slot.date >= todayIso() && slot.lessonName === lesson.name && Number(slot.lessonDuration) === Number(lesson.duration);
  });
}
function handleLessonOptionClick(event) {
  const button = event.target.closest("button[data-action='remove-lesson']");
  if (!button) return;
  const row = button.closest(".lesson-option-row");
  const profile = ensureCoachProfileDraft();
  const lesson = profile.lessonOptions.find((item) => item.id === row.dataset.lessonId);
  if (profile.lessonOptions.length <= 1) {
    showProfileMessage("至少保留一个课程选项。", true);
    return;
  }
  if (!lesson) return;
  if (hasFutureBookingsForLesson(lesson)) {
    showProfileMessage("这个课程已有未来预约，不能直接删除。", true);
    return;
  }
  pushUndoState(captureProfileUndoState());
  profile.lessonOptions = profile.lessonOptions.filter((lesson2) => lesson2.id !== row.dataset.lessonId);
  setCoachProfileDraft(profile);
  setProfileDirty(true);
  render();
  showProfileMessage("已移除课程，保存后生效", false, true);
}
export {
  addLessonOption,
  closeCoachPhotoDialog,
  confirmCoachPhoto,
  confirmDiscardProfileChanges,
  handleCoachPhotoDialogCancel,
  handleCoachPhotoFileChange,
  handleCoachBioInput,
  handleCoachTeachingDisciplinesChange,
  handleCoachSpecialtiesChange,
  addCustomSpecialty,
  handleCustomSpecialtyChange,
  handleCustomSpecialtyDelete,
  handleCustomSpecialtyKeydown,
  handleTravelConditionsInput,
  handleTravelPreferenceChange,
  closeLessonOptionEditor,
  handleLessonOptionChange,
  handleLessonOptionClick,
  handleBasePriceInput,
  handleNewLessonDurationInput,
  handleNewLessonPriceInput,
  previewServedRinksChange,
  saveCoachProfile,
  openCoachPhotoDialog,
  openLessonOptionEditor,
  closeCustomSpecialtyEditor,
  toggleCustomSpecialtyEditor,
};
