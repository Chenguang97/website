import { readServiceContext } from "./config.js";
import {
  activeCoachPanelStorageKey,
  activeStudentPanelStorageKey,
  blockedStorageKey,
  bookingRequestsStorageKey,
  profileStorageKey,
  slotsStorageKey
} from "./config.js";
import { storageGetItem, storageKeys, removeStorageItem, writeStorageItem } from "./storage-adapter.js";
import { serializeSlots, deserializeSlots } from "../domain/schedule-codec.mjs";
import { normalizeSchedulingData, decodeLegacyArray } from "./storage-codecs.js";
let lastStorageRecoveryMessage = "";
function getLastStorageRecoveryMessage() {
  return lastStorageRecoveryMessage;
}
function cleanupLegacyAppStorage() {
  const keepKeys = /* @__PURE__ */ new Set([slotsStorageKey, profileStorageKey, blockedStorageKey, bookingRequestsStorageKey, activeCoachPanelStorageKey, activeStudentPanelStorageKey]);
  const prefixes = [
    "ice-skating-coach-booking-slots-",
    "ice-skating-coach-profiles-",
    "ice-skating-coach-blocked-exceptions-"
  ];
  storageKeys().forEach((key) => {
    if (keepKeys.has(key)) return;
    if (prefixes.some((prefix) => key.startsWith(prefix))) {
      removeStorageItem(key);
    }
  });
}
// Legacy cross-resource recovery: runs after any failed schedule write, even
// unavailability; removes the old photo record before retry. The state owner must
// explicitly adopt recoveredProfiles even when the schedule retry fails.
function clearOversizedLocalPhotos(coachProfiles) {
  const recoveredProfiles = JSON.parse(JSON.stringify(coachProfiles));
  let removedCount = 0;
  Object.values(recoveredProfiles).forEach((profile) => {
    if (profile.photoUrl && profile.photoUrl.startsWith("data:image/")) {
      profile.photoUrl = "";
      removedCount += 1;
    }
  });
  if (!removedCount) return false;
  const removal = removeStorageItem(profileStorageKey);
  const result = writeStorageItem(profileStorageKey, JSON.stringify(recoveredProfiles));
  lastStorageRecoveryMessage = `已清理 ${removedCount} 张过大的本地照片，并保存当前更改。`;
  return { removedPhotos: removedCount, profiles: result, removal, recoveredProfiles };
}
function loadBlockedExceptions() {
  const schedule = readScheduleEnvelope();
  if (Array.isArray(schedule?.blockedExceptions)) return schedule.blockedExceptions;
  return decodeLegacyArray(storageGetItem(blockedStorageKey), []);
}

function persistProfiles(coachProfiles) {
  if (readServiceContext().service) return { persisted: false, reason: "remote-required", message: "服务模式必须等待服务器确认，未写入本地数据。" };
  lastStorageRecoveryMessage = "";
  try {
    cleanupLegacyAppStorage();
    const result = writeStorageItem(profileStorageKey, JSON.stringify(coachProfiles));
    const saved = result.persisted;
    if (!saved) {
      lastStorageRecoveryMessage = "浏览器本地存储不可用，本次更改只会保留到刷新前。";
    }
    return result;
  } catch (error) {
    console.error("Failed to save coach profiles.", error);
    return { persisted: false, reason: "serialization", error };
  }
}
function readScheduleEnvelope() {
  try {
    const value = JSON.parse(storageGetItem(slotsStorageKey));
    return value?.version === 2 ? value : null;
  } catch {
    return null;
  }
}
function readLocalScheduleSnapshot() {
  if (readServiceContext().service) return null;
  try {
    const parsed = JSON.parse(storageGetItem(slotsStorageKey));
    const slots = deserializeSlots(parsed);
    if (!slots) return null;
    return {
      slots,
      scheduling: normalizeSchedulingData(parsed?.scheduling),
      blockedExceptions: Array.isArray(parsed?.blockedExceptions)
        ? parsed.blockedExceptions : loadBlockedExceptions(),
      requests: Array.isArray(parsed?.bookingRequests) ? parsed.bookingRequests : undefined,
    };
  } catch {
    return null;
  }
}
function persistSchedule(slots, blockedExceptions, coachProfiles, scheduling, bookingRequests) {
  if (readServiceContext().service) return { persisted: false, reason: "remote-required", message: "服务模式必须等待服务器确认，未写入本地数据。" };
  lastStorageRecoveryMessage = "";
  try {
    cleanupLegacyAppStorage();
    // The schedule envelope is one authoritative write for bookings/planning/occupancy.
    // Photo recovery below is a separate resource and is not transactional.
    // Old arrays and v2 slot-only envelopes continue to load unchanged.
    const previous = readScheduleEnvelope();
    const serializedSlots = serializeSlots(slots, {
      ...previous,
      blockedExceptions,
      scheduling: scheduling || previous?.scheduling,
      bookingRequests: bookingRequests || previous?.bookingRequests,
    });
    let result = writeStorageItem(slotsStorageKey, serializedSlots);
    let recovery = null;
    let slotsSaved = result.persisted;
    if (!slotsSaved) {
      const initialWrite = result;
      recovery = clearOversizedLocalPhotos(coachProfiles);
      if (recovery) {
        recovery.trigger = initialWrite;
        result = writeStorageItem(slotsStorageKey, serializedSlots);
        slotsSaved = result.persisted;
      }
    }
    if (!slotsSaved) {
      lastStorageRecoveryMessage = "浏览器存储空间不足，未能保存；当前草稿已保留。";
    }
    return { ...result, recovery };
  } catch (error) {
    console.error("Failed to save availability.", error);
    return { persisted: false, reason: "serialization", error };
  }
}
function persistBookingRequests(requests) {
  if (readServiceContext().service) return { persisted: false, reason: "remote-required", message: "服务模式必须等待服务器确认，未写入本地数据。" };
  try {
    const schedule = readScheduleEnvelope();
    if (schedule) {
      return writeStorageItem(slotsStorageKey, JSON.stringify({ ...schedule, bookingRequests: requests }));
    }
    return writeStorageItem(bookingRequestsStorageKey, JSON.stringify(requests));
  } catch (error) {
    console.error("Failed to save booking requests.", error);
    return { persisted: false, reason: "serialization", error };
  }
}
export {
  persistProfiles, persistSchedule, persistBookingRequests,
  getLastStorageRecoveryMessage,
  readLocalScheduleSnapshot
};

import { readStorageItemResult } from "./storage-adapter.js";

// Explicit user-requested backup only. No startup calls, demo installation or writes.
export function exportSavedLocalApplicationData() {
  if (readServiceContext().service || readServiceContext().mode !== "demo") {
    return { ok: false, code: "local-export-unavailable", message: "请回到原来使用的网址导出本地资料。" };
  }
  const rawByKey = {};
  for (const key of [slotsStorageKey, profileStorageKey, blockedStorageKey, bookingRequestsStorageKey]) {
    const result = readStorageItemResult(key);
    if (!result.ok) {
      return { ok: false, code: "backup-read-failed", message: "无法可靠读取此浏览器已保存的资料，未生成完整备份。请保留原网址和资料，恢复浏览器存储访问后重试。" };
    }
    rawByKey[key] = result.value;
  }
  const issues = [];
  const parsed = (key, fallback) => {
    if (rawByKey[key] === null) return fallback;
    try { return JSON.parse(rawByKey[key]); }
    catch { issues.push({ key, message: "已保存内容无法读取；原文仍在私密备份中。" }); return fallback; }
  };
  const savedSchedule = parsed(slotsStorageKey, []);
  const slots = deserializeSlots(savedSchedule);
  if (!slots || slots.some(slot => !slot || typeof slot !== "object" || Array.isArray(slot)) || slots.length !== (Array.isArray(savedSchedule) ? savedSchedule.length : savedSchedule?.slots?.length)) {
    issues.push({ key: slotsStorageKey, message: "部分时段无法读取；请保留原始备份，暂勿导入。" });
  }
  const source = { ...(savedSchedule?.version === 2 ? savedSchedule : {}), slots: slots || [] };
  delete source.version;
  const profiles = parsed(profileStorageKey, {});
  if (!profiles || typeof profiles !== "object" || Array.isArray(profiles)) issues.push({ key: profileStorageKey, message: "教练资料格式异常；原文仍保留。" });
  else source.coachProfiles = profiles;
  for (const [field, key] of [["blockedExceptions", blockedStorageKey], ["bookingRequests", bookingRequestsStorageKey]]) {
    const legacy = parsed(key, []);
    if (!Array.isArray(legacy)) issues.push({ key, message: "已保存列表格式异常；原文仍保留。" });
    if (!Array.isArray(source[field])) source[field] = Array.isArray(legacy) ? legacy : [];
  }
  const compatibleSource = issues.length ? source : JSON.parse(serializeSlots(source.slots, Object.fromEntries(Object.entries(source).filter(([key]) => key !== "slots"))));
  const backup = { format: "icecoach-local-backup", version: 1, exportedAt: new Date().toISOString(),
    readyForImport: issues.length === 0, source: compatibleSource, issues,
    privateTrace: { notice: "包含学生联系方式、照片及原始保存内容，请勿公开。只自动导入 source；此原文用于备份核对。", rawByKey } };
  const text = JSON.stringify(backup, null, 2);
  if (new TextEncoder().encode(text).byteLength > 20 * 1024 * 1024) return { ok: false, code: "backup-too-large", message: "备份超过 20 MB，未截断或下载不完整资料。请先保留原网址和原始资料。" };
  return { ok: true, backup, text, readyForImport: backup.readyForImport };
}
