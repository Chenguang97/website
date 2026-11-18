import { deriveServiceReceipt } from "../domain/service-receipt.mjs";
import { rebaseServiceProfile, stripServiceProfileIdentity } from "../domain/profile-rebase.mjs";
import { compileAvailabilitySubmission, compileAvailabilityPublication } from "../domain/availability-publication.mjs";
import { readServiceBootstrap, readServiceSession, readServiceContext } from "./config.js";
import { normalizeSchedulingData } from "./storage-codecs.js";
import { buildOpenAvailabilityCandidate, buildOptimizationCandidate, buildAvailabilitySafetyCandidate } from "../domain/availability-candidates.mjs";
import { createOwner } from "./owned-values.js";
import { indexScheduleSnapshot } from "./schedule-index.js";
import { validatePreviewDay } from "../domain/schedule-review.mjs";
import { validOnlinePreparation, schedulingConfigFingerprint } from "../domain/scheduling-config.mjs";
import { captureAvailabilityModel, rebaseAvailabilityModel, revealUnblockedSupply } from "../domain/availability-provenance.mjs";
import { addDaysIso, createId, markSlotCells, minutesFromTime } from "./utils-data.js";
import { initializeApplicationData } from "./application-bootstrap.js";
import { calendarStep, currentCoachId } from "./config.js";
import {
  getLastStorageRecoveryMessage,
  persistProfiles,
  persistBookingRequests,
  persistSchedule,
} from "./data-store.js";
import { createDefaultLessonOptions, createDefaultProfile, createDefaultProfiles, createDefaultSlots } from "./demo-data.js";
import { slotSort } from "../domain/scheduling.mjs";
import { captureProductClock } from "./product-clock.js";
import { normalizeSchedulingConfig } from "../domain/scheduling-config.mjs";
import { withTravelPresets } from "./rink-catalog.js";
import { reconcileAvailabilityDraft, reconcileBlockedDraft, reconcilePlanningDraft } from "../domain/schedule-draft.mjs";

const initializedFromService = Boolean(readServiceContext().service);
const initialData = initializeApplicationData();
function assertStateSource() {
  if (readServiceContext().service && !initializedFromService) throw new Error("服务 owner 必须在 bootstrap 后初始化，请重新载入页面。");
}
const initialSlots = initialData.slots.slice().sort(slotSort);
const initialScheduling = initialData.scheduling;
const initialBlockedExceptions = initialData.blockedExceptions;
const copy = (value) => JSON.parse(JSON.stringify(value));

const ownership = createOwner({
  coachProfiles: initialData.coachProfiles,
  coachProfileDraft: null,
  slots: initialSlots,
  publishedSlots: null,
  scheduling: initialScheduling,
  publishedScheduling: null,
  hasUnsavedSchedulingChanges: false,
  bookingRequests: initialData.bookingRequests,
  blockedExceptions: initialBlockedExceptions,
  publishedBlockedExceptions: null,
  hasUnsavedAvailabilityChanges: false,
  hasUnsavedProfileChanges: false,
  unsavedAddedSlotIds: [],
  unsavedBlockedCellKeys: [],
  unsavedRecurringCellKeys: [],
  unsavedBlockExceptionIds: [],
  pendingDeletedSlots: [],
  undoStack: [],
  undoStackLimit: 30,
}, ["slots", "publishedSlots", "scheduling", "publishedScheduling", "blockedExceptions", "publishedBlockedExceptions", "coachProfiles", "bookingRequests"]);
let state = ownership.values();
let profileEditSequence = 0;
function commit(fields) {
  state = ownership.commit(fields);
}
commit({ publishedSlots: state.slots, publishedScheduling: state.scheduling, publishedBlockedExceptions: state.blockedExceptions });

// Construction provenance is owner-private and keyed by trusted immutable
// records. It is not persisted and does not retain removed records/history.
const availabilityDisplayKinds = new WeakMap();
function retainConstructionKinds(additions = {}) {
  for (const row of state.slots) if (Object.hasOwn(additions, row.id)) availabilityDisplayKinds.set(row, additions[row.id]);
}
function installDraftSlots(nextSlots) {
  commit({ slots: nextSlots.slice().sort(slotSort) });
  availabilityModel = null;
}
function getAvailabilityLesson(coachId = currentCoachId) {
  assertStateSource();
  const profile = readProfileState(coachId).effective;
  const lessonOptions = Array.isArray(profile.lessonOptions) && profile.lessonOptions.length
    ? profile.lessonOptions
    : readServiceContext().service ? [] : createDefaultLessonOptions(Number(profile.rate || 0));
  if (readServiceContext().service && !profile.lessonOptions?.length) return null;
  const lesson30 = lessonOptions.find((lesson) => Number(lesson.duration) === calendarStep);
  const baseLesson = lesson30 || lessonOptions[0];
  return ownership.own({ ...baseLesson, duration: calendarStep });
}

export function getSchedulingConfig(coachId = currentCoachId, source = "draft") {
  const profile = readProfileState(coachId).saved;
  const config = normalizeSchedulingConfig((source === "published" ? state.publishedScheduling : state.scheduling).configs[coachId], profile.servedRinks || []);
  if (!["draft", "published"].includes(source)) throw new TypeError("Unknown scheduling source");
  return ownership.own(withTravelPresets(config));
}

export function setSchedulingConfig(coachId, config) {
  if (!validOnlinePreparation(config.onlinePreparationMinutes)) return { ok: false, reason: 'config', message: '线上课前准备时间应为不小于 0 的整数分钟。' };
  if (Number(state.scheduling.configs[coachId]?.onlinePreparationMinutes ?? 0) !== Number(config.onlinePreparationMinutes ?? 0)) recordAvailabilityUndo();
  commit({ scheduling: { ...state.scheduling, configs: { ...state.scheduling.configs, [coachId]: config } } });
  retainAvailabilityModelVersion();
  refreshAvailabilityChangeSet();
}

function commitPublishedSchedule(slots, scheduling, blockedExceptions = state.blockedExceptions) {
  commit({ publishedSlots: slots, publishedScheduling: scheduling, publishedBlockedExceptions: blockedExceptions, hasUnsavedSchedulingChanges: false });
  acceptAvailabilityModel(null);
}

// Receiving committed facts never publishes, discards or clears local edits.
export function receivePublishedSchedule(input) {
  if (readServiceContext().service) return { ok: false, reason: "source", message: "服务事实必须通过带身份和版本的接收接口安装。" };
  const { slots, scheduling, blockedExceptions, requests } = ownership.own(input);
  const model = availabilityModel ? readAvailabilityModel() : null;
  const previous = { slots: state.publishedSlots, planning: state.publishedScheduling, blocked: state.publishedBlockedExceptions };
  const candidate = {
    slots: reconcileAvailabilityDraft(state.slots, state.publishedSlots, slots).slice().sort(slotSort),
    scheduling: reconcilePlanningDraft(state.scheduling, state.publishedScheduling, scheduling),
    blockedExceptions: reconcileBlockedDraft(state.blockedExceptions, state.publishedBlockedExceptions, blockedExceptions),
    publishedSlots: slots, publishedScheduling: scheduling, publishedBlockedExceptions: blockedExceptions,
    ...(requests ? { bookingRequests: requests } : {}),
  };
  const nextModel = model ? rebaseAvailabilityModel(model, previous, { slots, planning: scheduling, blocked: blockedExceptions }) : null;
  commit(candidate);
  acceptAvailabilityModel(nextModel);
  refreshAvailabilityChangeSet();
}
function restoreAvailabilityDraft(input) {
  const snapshot = ownership.own(input);
  const candidate = {
    slots: reconcileAvailabilityDraft(snapshot.slots, snapshot.publishedSlots, state.publishedSlots).slice().sort(slotSort),
    scheduling: reconcilePlanningDraft(snapshot.scheduling, snapshot.publishedScheduling, state.publishedScheduling),
    blockedExceptions: reconcileBlockedDraft(snapshot.blockedExceptions, snapshot.publishedBlockedExceptions, state.publishedBlockedExceptions),
  };
  const nextModel = snapshot.availabilityModel ? rebaseAvailabilityModel(snapshot.availabilityModel,
    { slots: snapshot.publishedSlots, planning: snapshot.publishedScheduling, blocked: snapshot.publishedBlockedExceptions },
    { slots: state.publishedSlots, planning: state.publishedScheduling, blocked: state.publishedBlockedExceptions }) : null;
  commit(candidate);
  acceptAvailabilityModel(nextModel);
  refreshAvailabilityChangeSet();
}

export { getLastStorageRecoveryMessage };


// Private model and preview ownership; public reads only return owned values.
let availabilityModel = null;
let modelInputVersion = "";
let modelBlockedSnapshot = null;
function acceptAvailabilityModel(model) {
  availabilityModel = ownership.own(model);
  modelInputVersion = availabilityInputVersion();
  modelBlockedSnapshot = ownership.snapshot("blockedExceptions");
}
function retainAvailabilityModelVersion() {
  if (!availabilityModel) return;
  const [slotsVersion, , blockedVersion] = modelInputVersion.split("|");
  if (Number(slotsVersion) !== ownership.version("slots") || Number(blockedVersion) !== ownership.version("blockedExceptions")) return;
  modelInputVersion = availabilityInputVersion();
}
const availabilityInputVersion = () => ["slots", "scheduling", "blockedExceptions"].map(field => ownership.version(field)).join("|");
let planningPreview = null;
const freeze = value => {
  if (value && typeof value === "object") { Object.freeze(value); Object.values(value).forEach(freeze); }
  return value;
};
const scheduleFields = ["slots", "publishedSlots", "scheduling", "publishedScheduling", "blockedExceptions", "publishedBlockedExceptions", "coachProfiles", "bookingRequests"];
let snapshotRevision = -1;
let fullSnapshot = null;
const selections = new Map();
function indexed(field) {
  const records = ownership.snapshot(field);
  return indexScheduleSnapshot(records);
}
export const readScheduleRevision = () => ownership.revision();
export function readScheduleState(selection = null) {
  assertStateSource();
  const revision = ownership.revision();
  if (snapshotRevision !== revision) {
    snapshotRevision = revision;
    fullSnapshot = null;
    selections.clear();
  }
  if (!selection && fullSnapshot) return fullSnapshot;
  const key = selection ? JSON.stringify([selection.coachId, selection.date]) : null;
  if (selection && selections.has(key)) return selections.get(key);
  const snapshot = Object.fromEntries(scheduleFields.map(field => [field,
    selection && ["slots", "publishedSlots"].includes(field)
      ? indexed(field).forDay(selection.coachId, selection.date) : ownership.snapshot(field)]));
  const result = Object.freeze({ ...snapshot, revision });
  if (selection) selections.set(key, result);
  else fullSnapshot = result;
  return result;
}
const defaultProfileViews = new Map();
function savedProfileView(coachId) {
  const saved = ownership.snapshot("coachProfiles")[coachId];
  if (saved) return saved;
  if (!defaultProfileViews.has(coachId)) defaultProfileViews.set(coachId, readServiceContext().service
    ? ownership.own({ coachId, unavailable: true, name: "", bio: "", photoUrl: "", rate: null, servedRinks: [], lessonOptions: [], teachingDisciplines: [], specialties: [], customSpecialties: [], selectedCustomSpecialties: [] })
    : freeze(createDefaultProfile(coachId)));
  return defaultProfileViews.get(coachId);
}
// Used by the sole scheduling runtime binder. Read only the requested source;
// selection is indexed before rule evaluation and does not clone other sources.
export function readSchedulingInputs(coachId, source = "draft", selection = null) {
  assertStateSource();
  if (!["draft", "published"].includes(source)) throw new TypeError("Unknown scheduling source");
  const published = source === "published";
  const slotsField = published ? "publishedSlots" : "slots";
  const blockedField = published ? "publishedBlockedExceptions" : "blockedExceptions";
  return Object.freeze({
    slots: selection ? indexed(slotsField).forDay(coachId, selection.date) : ownership.snapshot(slotsField),
    blocked: selection ? indexed(blockedField).forDay(coachId, selection.date) : ownership.snapshot(blockedField),
    planning: ownership.snapshot(published ? "publishedScheduling" : "scheduling"),
    profile: savedProfileView(coachId),
  });
}
export function readAvailabilityModel() {
  if (availabilityModel && modelInputVersion !== availabilityInputVersion()) {
    const [slotsVersion, schedulingVersion] = modelInputVersion.split("|");
    if (Number(slotsVersion) === ownership.version("slots") && Number(schedulingVersion) === ownership.version("scheduling")) {
      availabilityModel = revealUnblockedSupply(availabilityModel, {
        slots: ownership.snapshot("slots"), planning: ownership.snapshot("scheduling"),
        blocked: ownership.snapshot("blockedExceptions"), previousBlocked: modelBlockedSnapshot || [],
      });
    } else availabilityModel = null;
  }
  availabilityModel ||= captureAvailabilityModel(state.slots, state.scheduling, state.blockedExceptions);
  modelInputVersion = availabilityInputVersion();
  modelBlockedSnapshot = ownership.snapshot("blockedExceptions");
  availabilityModel = ownership.own(availabilityModel);
  return availabilityModel;
}
function refreshAvailabilityChangeSet() {
  const previous = new Map(state.publishedSlots.filter(slot => !slot.booked).map(slot => [slot.id, slot]));
  const current = new Map(state.slots.filter(slot => !slot.booked).map(slot => [slot.id, slot]));
  const added = [...current].filter(([id, slot]) => previous.get(id) !== slot && JSON.stringify(previous.get(id)) !== JSON.stringify(slot)).map(([id]) => id);
  const deleted = [...previous].filter(([id, slot]) => current.get(id) !== slot && JSON.stringify(current.get(id)) !== JSON.stringify(slot)).map(([,slot]) => slot);
  const cells = new Set();
  for (const slot of deleted) markSlotCells(slot, cells);
  const oldBlocks = new Map(state.publishedBlockedExceptions.map(block => [block.id, block]));
  const blocks = new Map(state.blockedExceptions.map(block => [block.id, block]));
  const blockIds = [...blocks].filter(([id, block]) => JSON.stringify(oldBlocks.get(id)) !== JSON.stringify(block)).map(([id]) => id);
  for (const id of oldBlocks.keys()) if (!blocks.has(id)) blockIds.push(`delete-${id}`);
  for (const [id, block] of blocks) if (blockIds.includes(id)) markSlotCells(block, cells);
  const schedulingDirty = state.scheduling !== state.publishedScheduling && JSON.stringify(state.scheduling) !== JSON.stringify(state.publishedScheduling);
  commit({ unsavedAddedSlotIds: added, pendingDeletedSlots: deleted, unsavedBlockedCellKeys: [...cells], unsavedBlockExceptionIds: blockIds,
    hasUnsavedSchedulingChanges: schedulingDirty,
    hasUnsavedAvailabilityChanges: schedulingDirty || added.length > 0 || deleted.length > 0 || blockIds.length > 0 || state.unsavedRecurringCellKeys.length > 0 });
  return state.hasUnsavedAvailabilityChanges;
}
function captureAvailabilitySnapshot() {
  return ownership.own({ type: "availability", slots: state.slots, scheduling: state.scheduling,
    blockedExceptions: state.blockedExceptions, publishedSlots: state.publishedSlots,
    publishedScheduling: state.publishedScheduling, publishedBlockedExceptions: state.publishedBlockedExceptions,
    availabilityModel: readAvailabilityModel() });
}
function pushHistory(snapshot) {
  const owned = ownership.own(snapshot);
  commit({ undoStack: [...state.undoStack, owned].slice(-state.undoStackLimit) });
}
function takeHistory(type, { peek = false } = {}) {
  const index = state.undoStack.findLastIndex(snapshot => snapshot.type === type);
  if (index < 0) return null;
  const snapshot = state.undoStack[index];
  if (!peek) commit({ undoStack: state.undoStack.filter((_item, position) => position !== index) });
  return snapshot;
}
function clearHistory(type) {
  commit({ undoStack: type ? state.undoStack.filter(snapshot => snapshot.type !== type) : [] });
}
export function recordBookingUndo(before) {
  pushHistory({ type: "booking", slots: before, after: state.publishedSlots });
}
export function peekBookingUndo() { return takeHistory("booking", { peek: true }); }
export function completeBookingUndo(snapshot) {
  if (peekBookingUndo() !== snapshot) return { ok: false, reason: "stale" };
  takeHistory("booking");
  return { ok: true };
}
function recordAvailabilityUndo(snapshot = captureAvailabilitySnapshot()) {
  pushHistory(snapshot);
}
export function undoAvailabilityDraft() {
  const snapshot = takeHistory("availability", { peek: true });
  if (!snapshot) return { ok: false, reason: "empty" };
  restoreAvailabilityDraft(snapshot);
  takeHistory("availability");
  return { ok: true };
}

// Atomic owner commit for a validated open-supply plan. UI never edits tracking
// sets, deletion maps, layer identities or booking records one field at a time.
export function applyOpenAvailabilityPlan(coachId, plan, scope, options = {}) {
  if (readServiceContext().service && !getAvailabilityLesson(coachId)) return { ok: false, reason: "catalog", message: "请先设置真实课程资料。" };
  const snapshot = captureAvailabilitySnapshot();
  const candidate = buildOpenAvailabilityCandidate({ slots: snapshot.slots, planning: snapshot.scheduling,
    model: snapshot.availabilityModel, coachId, plan, scope, lesson: getAvailabilityLesson(coachId),
    createId, addDays: addDaysIso, restoreUnderlying: options.restoreUnderlying,
    restoration: options.restoration, sourceRemovals: options.sourceRemovals });
  commit({ slots: candidate.slots, scheduling: candidate.planning });
  retainConstructionKinds(candidate.displayKinds);
  acceptAvailabilityModel(candidate.availabilityModel);
  pushHistory(snapshot);
  refreshAvailabilityChangeSet();
  return { ok: true };
}
function removeAvailabilityBlock(id) {
  if (!state.blockedExceptions.some(block => block.id === id)) return { ok: false, reason: "missing" };
  recordAvailabilityUndo();
  commit({ blockedExceptions: state.blockedExceptions.filter(block => block.id !== id) });
  refreshAvailabilityChangeSet();
  return { ok: true };
}
export function setPlanningPreviewDraft(value) {
  planningPreview = value == null ? null : ownership.own(value);
}
export function readPlanningPreview() { return planningPreview; }
export function choosePlanningPreviewDay(date, choice) {
  const preview = planningPreview, day = preview?.days.find(item => item.date === date);
  if (!day) return { ok: false, reason: "missing" };
  let updated;
  if (choice === "skip") updated = { ...day, excluded: true };
  else {
    const option = day.alternatives.find(item => item.id === choice);
    if (!option) return { ok: false, reason: "missing" };
    updated = { ...day, ...option.day, input: { ...day.input, config: { ...day.input.config, lunch: option.lunch } }, alternatives: day.alternatives, issues: day.issues, choice: option.id, choiceLabel: option.label, feasible: true, excluded: false, notBefore: day.notBefore };
  }
  setPlanningPreviewDraft({ ...preview, days: preview.days.map(item => item === day ? updated : item) });
  return { ok: true };
}
function publishProfiles() {
  const persistence = persistProfiles(state.coachProfiles);
  return { ok: persistence.persisted, reason: persistence.persisted ? null : "storage", persistence };
}
export function publishBookingRequests(input) {
  const requests = ownership.own(input);
  const persistence = persistBookingRequests(requests);
  if (persistence.persisted) commit({ bookingRequests: requests });
  return { ok: persistence.persisted, reason: persistence.persisted ? null : "storage", persistence };
}
export function publishAvailabilityDraft() {
  if (Object.values(state.scheduling.configs).some(config => !validOnlinePreparation(config.onlinePreparationMinutes))) return { ok: false, reason: 'config', message: '线上课前准备时间应为不小于 0 的整数分钟。' };
  const persistence = persistSchedule(state.slots, state.blockedExceptions, state.coachProfiles, state.scheduling, state.bookingRequests);
  receiveStorageRecovery(persistence);
  if (!persistence.persisted) return { ok: false, reason: "storage", persistence, message: getLastStorageRecoveryMessage() || "保存失败。请清理浏览器存储后再试，当前草稿已保留。" };
  commitPublishedSchedule(state.slots, state.scheduling);
  commit({ unsavedRecurringCellKeys: [] });
  refreshAvailabilityChangeSet();
  clearHistory("availability");
  clearHistory("booking");
  return { ok: true, persistence };
}
export function cancelAvailabilityDraft() {
  commit({ slots: state.publishedSlots });
  commit({ scheduling: state.publishedScheduling });
  commit({ blockedExceptions: state.publishedBlockedExceptions });
  acceptAvailabilityModel(null);
  planningPreview = null;
  commit({ unsavedRecurringCellKeys: [] });
  clearHistory("availability");
  refreshAvailabilityChangeSet();
  return { ok: true };
}
export function applyAvailabilitySafety(safe) {
  const snapshot = captureAvailabilitySnapshot();
  const candidate = buildAvailabilitySafetyCandidate({ slots: snapshot.slots,
    safe, model: snapshot.availabilityModel, createId });
  commit({ slots: candidate.slots });
  acceptAvailabilityModel(candidate.availabilityModel);
  pushHistory(snapshot);
  refreshAvailabilityChangeSet();
}

export function applyAvailabilityOptimization(coachId, config, days, scope) {
  if (readServiceContext().service && !getAvailabilityLesson(coachId)) return { ok: false, reason: "catalog", message: "请先设置真实课程资料。" };
  const snapshot = captureAvailabilitySnapshot();
  const candidate = buildOptimizationCandidate({ slots: snapshot.slots, planning: snapshot.scheduling,
    model: snapshot.availabilityModel, coachId, config, days, scope,
    profile: readProfileState(coachId).saved, blocked: snapshot.blockedExceptions, createId });
  commit({ slots: candidate.slots, scheduling: candidate.planning });
  retainConstructionKinds(candidate.displayKinds);
  acceptAvailabilityModel(candidate.availabilityModel);
  pushHistory(snapshot);
  refreshAvailabilityChangeSet();
  return { ok: true };
}
function addAvailabilityLock(lock) {
  const next = ownership.own({ ...lock, id: createId(), locked: true, source: "manual" });
  recordAvailabilityUndo();
  commit({ scheduling: { ...state.scheduling, locks: [...state.scheduling.locks, next] } });
  retainAvailabilityModelVersion();
  refreshAvailabilityChangeSet();
  return ownership.own(next);
}
export function updateCalendarWorkHours(coachId) {
  const config = getSchedulingConfig(coachId);
  if (!config.enabled || config.workHoursSource === "availability") return;
  const previousFingerprint = schedulingConfigFingerprint(config);
  const next = { ...config, workHoursSource: "availability" };
  setSchedulingConfig(coachId, next);
  if (state.scheduling.generatedConfigFingerprints?.[coachId] === previousFingerprint) {
    commit({ scheduling: { ...state.scheduling, generatedConfigFingerprints: { ...state.scheduling.generatedConfigFingerprints, [coachId]: schedulingConfigFingerprint(next) } } });
    retainAvailabilityModelVersion();
  }
}


export function editPlanningPreviewRange(date, kind, index, field, value) {
  if (!["start", "end", "location"].includes(field)) return { ok: false, reason: "field" };
  const preview = planningPreview, day = preview?.days.find(item => item.date === date);
  const key = kind === "open" ? "open" : "blocks", range = day?.[key]?.[index];
  if (!range) return { ok: false, reason: "missing" };
  const next = { ...range, [field]: value };
  const updated = { ...day, [key]: day[key].map((item, position) => position === index ? next : item) };
  if (next.source === "lunch") updated.lunchPolicy = { mode: "fixed", start: next.start, end: next.end, duration: minutesFromTime(next.end) - minutesFromTime(next.start) };
  updated.validationErrors = validatePreviewDay(updated, day.input);
  setPlanningPreviewDraft({ ...preview, days: preview.days.map(item => item === day ? updated : item) });
  return { ok: true };
}

let changesVersion = "";
let changesSnapshot = null;
export function readAvailabilityChanges() {
  const fields = ["hasUnsavedAvailabilityChanges", "hasUnsavedSchedulingChanges", "unsavedAddedSlotIds", "pendingDeletedSlots", "unsavedBlockedCellKeys", "unsavedRecurringCellKeys", "unsavedBlockExceptionIds"];
  const version = fields.map(field => ownership.version(field)).join("|");
  if (version !== changesVersion || !changesSnapshot) {
    changesVersion = version;
    changesSnapshot = freeze(copy({ dirty: state.hasUnsavedAvailabilityChanges, schedulingDirty: state.hasUnsavedSchedulingChanges,
      addedSlotIds: [...state.unsavedAddedSlotIds], deletedSlots: state.pendingDeletedSlots,
      blockedCellKeys: [...state.unsavedBlockedCellKeys], recurringCellKeys: [...state.unsavedRecurringCellKeys],
      blockExceptionIds: [...state.unsavedBlockExceptionIds] }));
  }
  return changesSnapshot;
}
const profileViews = new Map();
export function readProfileState(coachId = currentCoachId) {
  assertStateSource();
  const saved = savedProfileView(coachId);
  const currentDraft = ownership.snapshot("coachProfileDraft");
  const draft = currentDraft?.coachId === coachId ? currentDraft : null;
  const dirty = Boolean(draft && state.hasUnsavedProfileChanges);
  const previous = profileViews.get(coachId);
  if (previous && previous.saved === saved && previous.draft === draft && previous.dirty === dirty) return previous;
  const result = Object.freeze({ saved, draft, effective: draft || saved, dirty });
  profileViews.set(coachId, result);
  return result;
}
export function addAvailabilityBlocks(blocks) {
  if (!blocks.length) return { ok: false, reason: "empty" };
  const next = ownership.own([...state.blockedExceptions, ...blocks]);
  recordAvailabilityUndo();
  commit({ blockedExceptions: next });
  refreshAvailabilityChangeSet();
  return { ok: true };
}

function profileCandidate(coachId, candidate) {
  if (!candidate || candidate.coachId !== coachId) {
    return { ok: false, reason: "owner", message: "资料所属教练已变化，请重新打开编辑。" };
  }
  return { ok: true, candidate: ownership.own(candidate) };
}
export function replaceCoachProfileDraft(coachId, candidate) {
  const prepared = profileCandidate(coachId, candidate);
  if (!prepared.ok) return prepared;
  profileEditSequence++;
  commit({ coachProfileDraft: prepared.candidate });
  commit({ hasUnsavedProfileChanges: true });
  return { ok: true, profile: readProfileState(coachId).effective };
}
export function captureCoachProfileUndo(coachId = currentCoachId) {
  const profile = readProfileState(coachId);
  return ownership.own({ type: "coach-profile", coachId, coachProfileDraft: profile.effective,
    hasUnsavedProfileChanges: profile.dirty,
    ...(readServiceContext().service ? { serviceProfileBasis: profile.saved, serviceActorId: readServiceSession()?.user?.id || null } : {}) });
}
export function recordCoachProfileUndo(snapshot = captureCoachProfileUndo()) {
  const coachId = snapshot.coachId || snapshot.coachProfileDraft?.coachId;
  if (snapshot.type !== "coach-profile" || !coachId || snapshot.coachProfileDraft?.coachId !== coachId) {
    return { ok: false, reason: "owner" };
  }
  pushHistory({ ...snapshot, coachId });
  return { ok: true };
}
// The feature uses this for submit-time catalog/autofill checkpoints. Persistence
// itself never replaces a draft on failure; collecting DOM values stays in UI.
export function checkpointCoachProfileDraft(coachId, candidate) {
  const prepared = profileCandidate(coachId, candidate);
  if (!prepared.ok) return prepared;
  const current = readProfileState(coachId);
  if (JSON.stringify(current.effective) === JSON.stringify(prepared.candidate)) {
    return { ok: true, changed: false };
  }
  recordCoachProfileUndo(captureCoachProfileUndo(coachId));
  replaceCoachProfileDraft(coachId, prepared.candidate);
  return { ok: true, changed: true };
}
function restoreCoachProfileDraft(snapshot) {
  const coachId = snapshot?.coachId || snapshot?.coachProfileDraft?.coachId;
  if (readServiceContext().service && snapshot?.serviceActorId !== (readServiceSession()?.user?.id || null)) return { ok: false, reason: "actor" };
  const restored = readServiceContext().service && snapshot?.serviceProfileBasis
    ? rebaseServiceProfile(snapshot.coachProfileDraft, snapshot.serviceProfileBasis, savedProfileView(coachId)) : snapshot?.coachProfileDraft;
  const prepared = profileCandidate(coachId, restored);
  if (!coachId || !prepared.ok || snapshot.type !== "coach-profile") return { ok: false, reason: "owner" };
  profileEditSequence++;
  commit({ coachProfileDraft: prepared.candidate });
  commit({ hasUnsavedProfileChanges: Boolean(snapshot.hasUnsavedProfileChanges) });
  return { ok: true, profile: readProfileState(coachId).effective, dirty: readProfileState(coachId).dirty };
}
export function undoCoachProfileDraft(coachId = currentCoachId) {
  const snapshot = takeHistory("coach-profile", { peek: true });
  if (!snapshot) return { ok: false, reason: "empty" };
  if ((snapshot.coachId || snapshot.coachProfileDraft?.coachId) !== coachId) return { ok: false, reason: "owner" };
  const result = restoreCoachProfileDraft(snapshot);
  if (result.ok) takeHistory("coach-profile");
  return result;
}
export function discardCoachProfileDraft(coachId = currentCoachId) {
  if (state.coachProfileDraft && state.coachProfileDraft.coachId !== coachId) return { ok: false, reason: "owner" };
  profileEditSequence++;
  commit({ coachProfileDraft: null });
  commit({ hasUnsavedProfileChanges: false });
  clearHistory("coach-profile");
  return { ok: true };
}
export function publishCoachProfileDraft(coachId, validatedCandidate) {
  const prepared = profileCandidate(coachId, validatedCandidate);
  if (!prepared.ok) return prepared;
  const profiles = { ...ownership.snapshot("coachProfiles"), [coachId]: prepared.candidate };
  const persistence = persistProfiles(profiles);
  if (!persistence.persisted) {
    return { ok: false, reason: "storage", persistence,
      message: getLastStorageRecoveryMessage() || "保存失败。请检查浏览器存储空间后重试，当前草稿仍已保留。" };
  }
  commit({ coachProfiles: profiles });
  // Saving a validated candidate must not discard another coach's active draft.
  if (!state.coachProfileDraft || state.coachProfileDraft.coachId === coachId) {
    commit({ coachProfileDraft: null });
    commit({ hasUnsavedProfileChanges: false });
    clearHistory("coach-profile");
  }
  return { ok: true, persistence, profile: readProfileState(coachId).saved };
}

// Preserve the existing admin reset order. Profiles and schedule are separate
// resources; defaults remain applied in memory even when either write fails.
export function resetDemoApplicationData() {
  if (readServiceContext().service) return { ok: false, reason: "service", resetApplied: false, atomic: false, message: "服务模式不执行本地示例重置。" };
  commit({ coachProfiles: createDefaultProfiles() });
  commit({ coachProfileDraft: null });
  installDraftSlots(createDefaultSlots());
  commit({ hasUnsavedProfileChanges: false });
  commit({ unsavedAddedSlotIds: [] });
  commit({ unsavedBlockedCellKeys: [] });
  commit({ unsavedRecurringCellKeys: [] });
  commit({ unsavedBlockExceptionIds: [] });
  commit({ pendingDeletedSlots: [] });
  clearHistory();
  const profiles = publishProfiles();
  const schedule = profiles.ok ? publishAvailabilityDraft() : {
    ok: false, reason: "skipped", persistence: null,
  };
  return {
    ok: profiles.ok && schedule.ok,
    reason: !profiles.ok ? "profiles" : !schedule.ok ? "schedule" : null,
    resetApplied: true, atomic: false,
    resources: {
      profiles: { attempted: true, ...profiles },
      schedule: { attempted: profiles.ok, ...schedule },
    },
  };
}

// Storage returns a detached recovery effect; only this owner changes profiles.
export function receiveStorageRecovery(persistence) {
  const profiles = persistence.recovery?.recoveredProfiles;
  if (profiles) commit({ coachProfiles: profiles });
}

// Confirmed service facts share this owner; transport owns no mutable business data.
const serviceActorId = readServiceSession()?.user?.id || null;
const serviceScope = () => JSON.stringify([readServiceSession()?.user?.id || null, readServiceSession()?.user?.role || null, readServiceSession()?.user?.coachId || null, readServiceSession()?.user?.status || null]);
const initialServiceScope = serviceScope();
let serviceRevision = readServiceBootstrap()?.revision ?? null;
let serviceSequence = readServiceBootstrap()?.sequence ?? 0;
let serviceProjection = ownership.own(readServiceBootstrap()?.data ? canonicalServiceProjection(readServiceBootstrap().data) : null);
const serviceSubmissions = new WeakMap();
export function readConfirmedServiceProjection() {
  return Object.freeze({ actorId: serviceActorId, revision: serviceRevision, sequence: serviceSequence, data: serviceProjection });
}
export function readServiceOwnerState() {
  return Object.freeze({ service: readServiceContext().service, actorId: serviceActorId, revision: serviceRevision, identityCurrent: !readServiceContext().reloadRequired && serviceScope() === initialServiceScope });
}
function canonicalServiceProjection(data) {
  return { ...data, coachProfiles: Object.fromEntries(Object.entries(data.coachProfiles).map(([id, profile]) => [id, { ...profile, coachId: id }])) };
}
function validateServiceProjection(packet) {
  if (!packet || typeof packet !== "object") return { ok: false, reason: "projection" };
  if (!readServiceContext().service || serviceRevision === null) return { ok: false, reason: "source", message: "请先完成服务 bootstrap，再载入 owner。" };
  if (packet.actorId !== serviceActorId || (readServiceSession()?.user?.id || null) !== serviceActorId || serviceScope() !== initialServiceScope || readServiceContext().reloadRequired) return { ok: false, reason: "actor", message: "账号已变化，请重新载入页面。" };
  if (!Number.isInteger(packet.revision) || packet.revision < serviceRevision) return { ok: false, reason: "stale", message: "服务数据版本已更新。" };
  const data = packet.data;
  if (!data || !data.coachProfiles || typeof data.coachProfiles !== "object" || Array.isArray(data.coachProfiles) || !Object.values(data.coachProfiles).every(profile => profile && typeof profile === "object" && !Array.isArray(profile)) || !Array.isArray(data.slots) || !data.scheduling || !Array.isArray(data.blockedExceptions) || !Array.isArray(data.bookingRequests)) return { ok: false, reason: "projection", message: "服务投影不完整。" };
  if (packet.revision === serviceRevision && JSON.stringify(canonicalServiceProjection(data)) !== JSON.stringify(serviceProjection) && !(Number.isInteger(packet.sequence) && packet.sequence > serviceSequence)) return { ok: false, reason: "revision", message: "同一版本的服务数据不一致。" };
  if (packet.revision === serviceRevision && Number.isInteger(packet.sequence) && packet.sequence < serviceSequence) return { ok: false, reason: "stale" };
  return { ok: true };
}
function installServiceProjection(packet, submission = null) {
  const validation = validateServiceProjection(packet);
  if (!validation.ok) return validation;
  if (!submission && packet.revision === serviceRevision && JSON.stringify(canonicalServiceProjection(packet.data)) === JSON.stringify(serviceProjection)) {
    serviceSequence = Math.max(serviceSequence, packet.sequence || 0);
    return { ok: true, changed: false, revision: serviceRevision };
  }
  const nextData = ownership.own(canonicalServiceProjection(packet.data));
  const next = { slots: nextData.slots, scheduling: normalizeSchedulingData(nextData.scheduling), blockedExceptions: nextData.blockedExceptions };
  const publishedBasis = { slots: state.publishedSlots, scheduling: state.publishedScheduling, blockedExceptions: state.publishedBlockedExceptions };
  const current = { slots: state.slots, scheduling: state.scheduling, blockedExceptions: state.blockedExceptions };
  const fallbackProfiles = Object.fromEntries([...new Set([state.coachProfileDraft?.coachId, submission?.coachId].filter(Boolean))].map(id => [id, savedProfileView(id)]));
  const candidate = deriveServiceReceipt({ draft: current, published: publishedBasis, next, confirmed: nextData, submission,
    profileDraft: state.coachProfileDraft, profileDirty: state.hasUnsavedProfileChanges,
    profiles: state.coachProfiles, profileSequence: profileEditSequence, fallbackProfiles,
    historyInput: state.undoStack, availabilityModel: availabilityModel ? readAvailabilityModel() : null,
    recurringInput: state.unsavedRecurringCellKeys, recurringVersion: ownership.version("unsavedRecurringCellKeys") });
  // All candidate/rebase work precedes the single business commit.
  commit({ ...candidate.schedule, publishedSlots: next.slots, publishedScheduling: next.scheduling, publishedBlockedExceptions: next.blockedExceptions,
    coachProfiles: nextData.coachProfiles, bookingRequests: nextData.bookingRequests, coachProfileDraft: candidate.profileDraft, hasUnsavedProfileChanges: candidate.profileDirty,
    undoStack: candidate.history, unsavedRecurringCellKeys: candidate.recurring });
  acceptAvailabilityModel(candidate.availabilityModel);
  serviceProjection = nextData; serviceRevision = packet.revision; serviceSequence = packet.sequence ?? serviceSequence + 1;
  refreshAvailabilityChangeSet();
  return { ok: true, changed: true, revision: serviceRevision, profileDirty: state.hasUnsavedProfileChanges, availabilityDirty: state.hasUnsavedAvailabilityChanges };
}
export function receiveServiceProjection(packet) { return installServiceProjection(packet); }
function captureServicePublication(resource, { coachId = currentCoachId, commandId, candidate, acceptedSafety } = {}) {
  const validation = validateServiceProjection({ actorId: serviceActorId, revision: serviceRevision, sequence: serviceSequence, data: serviceProjection });
  if (!validation.ok) return validation;
  const user = readServiceSession()?.user;
  if (typeof commandId !== "string" || !commandId || typeof coachId !== "string" || !coachId || !(coachId === user?.coachId || resource === "profile" && user?.role === "admin")) return { ok: false, reason: "owner" };
  if (resource === "availability" && user?.status !== "active") return { ok: false, reason: "coach-pending", message: "申请待审核，不能发布开放时间。" };
  let compiled = null;
  if (resource === "availability" && candidate) {
    try { compiled = compileAvailabilitySubmission(servicePublicationContext(coachId, candidate.openSlots?.some(row => Object.hasOwn(row, "metadataSourceId"))), coachId, candidate,
      acceptedSafety === undefined ? undefined : ownership.own(acceptedSafety)); }
    catch { return { ok: false, reason: "safety", message: "安全关闭方案无效，请重新检查后确认保存。" }; }
    if (!compiled.ok) return compiled;
  }
  const safety = compiled?.safety;
  const submission = Object.freeze({ resource, coachId, commandId, actorId: serviceActorId, revision: serviceRevision });
  const requestedProfile = resource === "profile" && candidate?.profile
    ? { ...state.coachProfiles[coachId], ...candidate.profile, coachId } : readProfileState(coachId).effective;
  const availability = resource === "availability" && candidate ? compiled.availability : { slots: state.slots, scheduling: state.scheduling, blockedExceptions: state.blockedExceptions };
  const matches = resource === "profile" ? JSON.stringify(stripServiceProfileIdentity(requestedProfile)) === JSON.stringify(stripServiceProfileIdentity(readProfileState(coachId).effective))
    : JSON.stringify(availability) === JSON.stringify({ slots: state.slots, scheduling: state.scheduling, blockedExceptions: state.blockedExceptions });
  serviceSubmissions.set(submission, { ...submission, matches, profile: ownership.own(requestedProfile), profileSequence: profileEditSequence,
    availability: ownership.own(availability), acceptedSafety: safety ? ownership.own({ prepared: safety.accepted, inheritance: safety.inheritance }) : null, availabilityAtCapture: ownership.own({ slots: state.slots, scheduling: state.scheduling, blockedExceptions: state.blockedExceptions }), history: new Set(state.undoStack),
    recurring: state.unsavedRecurringCellKeys, recurringVersion: ownership.version("unsavedRecurringCellKeys"), confirmed: false });
  return { ok: true, submission };
}
export function captureServiceProfilePublication(input) { return captureServicePublication("profile", input); }
export function captureServiceAvailabilityPublication(input) { return captureServicePublication("availability", input); }
function confirmServicePublication(resource, handle, receipt) {
  const submission = serviceSubmissions.get(handle);
  if (!submission || submission.resource !== resource || receipt?.ok !== true || receipt.commandId !== submission.commandId) return { ok: false, reason: "unconfirmed" };
  if (receipt.actorId !== submission.actorId || !Number.isInteger(receipt.ackRevision) || receipt.ackRevision < submission.revision || receipt.revision < receipt.ackRevision) return { ok: false, reason: "receipt" };
  const validation = validateServiceProjection(receipt);
  if (!validation.ok) return validation;
  if (submission.confirmed) return { ...installServiceProjection(receipt), alreadyConfirmed: true };
  const result = installServiceProjection(receipt, submission);
  if (result.ok) submission.confirmed = true;
  return result;
}
export function confirmServiceProfilePublication(handle, receipt) { return confirmServicePublication("profile", handle, receipt); }
export function confirmServiceAvailabilityPublication(handle, receipt) { return confirmServicePublication("availability", handle, receipt); }


const sameProfileValue = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function servicePublicationContext(coachId, requiresClock = false) {
  return {
    draft: { slots: state.slots, scheduling: state.scheduling, blockedExceptions: state.blockedExceptions },
    published: { slots: state.publishedSlots, scheduling: state.publishedScheduling, blockedExceptions: state.publishedBlockedExceptions },
    profile: readProfileState(coachId).saved, lesson: getAvailabilityLesson(coachId),
    effectiveConfig: getSchedulingConfig(coachId), displayKinds: ownership.own(Object.fromEntries(state.slots.filter(row => availabilityDisplayKinds.has(row)).map(row => [row.id, availabilityDisplayKinds.get(row)]))), actorId: serviceActorId,
    revision: readScheduleRevision(), clock: requiresClock ? captureProductClock() : null,
  };
}
export function compileServiceAvailabilityPublication({ coachId = currentCoachId, candidate, acceptedSafety } = {}) {
  const validation = validateServiceProjection({ actorId: serviceActorId, revision: serviceRevision, sequence: serviceSequence, data: serviceProjection });
  if (!validation.ok) return validation;
  if (readServiceSession()?.user?.coachId !== coachId || readServiceSession()?.user?.status !== "active") return { ok: false, reason: "owner" };
  try {
    return ownership.own(compileAvailabilityPublication(servicePublicationContext(coachId, true), coachId,
      ownership.own(candidate), ownership.own(acceptedSafety)));
  } catch { return { ok: false, reason: "safety", message: "安全关闭来源无效，请重新检查后确认保存。" }; }
}
