import { calendarStep, currentCoachId } from "./config.js";
import {
  getLastStorageRecoveryMessage,
  loadBlockedExceptions,
  loadProfiles,
  loadSlots,
  saveProfilesData,
  saveSlotsData,
} from "./data-store.js";
import { createDefaultLessonOptions, createDefaultProfile } from "./demo-data.js";

export const state = {
  coachProfiles: loadProfiles(),
  coachProfileDraft: null,
  slots: loadSlots(),
  blockedExceptions: loadBlockedExceptions(),
  dragState: null,
  hasUnsavedAvailabilityChanges: false,
  hasUnsavedProfileChanges: false,
  isSavingProfile: false,
  newLessonPriceIsCustom: false,
  calendarShowsFullDay: false,
  exceptionCalendarShowsFullDay: false,
  studentViewMode: "week",
  studentSelectedDate: "",
  coachBookingStudentKey: "",
  coachBookingStudentSearch: "",
  coachBookingSelectedStudent: null,
  coachBookingListPeriod: "upcoming",
  unsavedAddedSlotIds: new Set(),
  unsavedBlockedCellKeys: new Set(),
  unsavedRecurringCellKeys: new Set(),
  unsavedBlockExceptionIds: new Set(),
  pendingDeletedSlots: new Map(),
  pendingAvailabilityConflict: null,
  undoStack: [],
  undoStackLimit: 30,
};

export function replaceCoachProfiles(nextProfiles) {
  state.coachProfiles = nextProfiles;
  return state.coachProfiles;
}

export function replaceSlots(nextSlots) {
  state.slots = nextSlots;
  return state.slots;
}

export function replaceBlockedExceptions(nextBlocks) {
  state.blockedExceptions = nextBlocks;
  return state.blockedExceptions;
}

export function addBlockedException(block) {
  state.blockedExceptions.push(block);
  return block;
}

export function getSavedProfile(coachId) {
  return state.coachProfiles[coachId] || createDefaultProfile(coachId);
}

export function getProfile(coachId) {
  if (state.coachProfileDraft?.coachId === coachId) return state.coachProfileDraft;
  return getSavedProfile(coachId);
}

export function getAvailabilityLesson(coachId = currentCoachId) {
  const profile = getProfile(coachId);
  const lessonOptions = Array.isArray(profile.lessonOptions) && profile.lessonOptions.length
    ? profile.lessonOptions
    : createDefaultLessonOptions(Number(profile.rate || 0));
  const lesson30 = lessonOptions.find((lesson) => Number(lesson.duration) === calendarStep);
  const baseLesson = lesson30 || lessonOptions[0];
  return { ...baseLesson, duration: calendarStep };
}

export function setCoachProfile(coachId, profile) {
  state.coachProfiles[coachId] = profile;
  return profile;
}

export function ensureCoachProfileDraft(coachId = currentCoachId) {
  if (!state.coachProfileDraft || state.coachProfileDraft.coachId !== coachId) {
    state.coachProfileDraft = JSON.parse(JSON.stringify(getSavedProfile(coachId)));
  }
  return state.coachProfileDraft;
}

export function setCoachProfileDraft(profile) {
  state.coachProfileDraft = profile;
  return state.coachProfileDraft;
}

export function clearCoachProfileDraft() {
  state.coachProfileDraft = null;
}

export function saveProfiles() {
  return saveProfilesData(state.coachProfiles);
}

export function saveSlots() {
  return saveSlotsData(state.slots, state.blockedExceptions, state.coachProfiles);
}

export { getLastStorageRecoveryMessage };
