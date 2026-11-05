import {
  activeCoachPanelStorageKey,
  activeStudentPanelStorageKey,
  blockedStorageKey,
  profileStorageKey,
  rinks,
  slotsStorageKey
} from "./config.js";
import { createDefaultLessonOptions, createDefaultProfile, createDefaultProfiles, createDefaultSlots } from "./demo-data.js";
import { migrateLegacyProfilePricing } from "./domain/pricing.mjs";
import {
  normalizeCoachSpecialties,
  normalizeCoachTeachingDisciplines,
  normalizeStartYear,
  normalizeCustomCoachSpecialties,
} from "./domain/coach-profile.mjs";
import { isQuotaError, storageGetItem, storageKeys, storageRemoveItem, storageSetItem } from "./storage-adapter.js";
let lastStorageRecoveryMessage = "";
function getLastStorageRecoveryMessage() {
  return lastStorageRecoveryMessage;
}
function cleanupLegacyAppStorage() {
  const keepKeys = /* @__PURE__ */ new Set([slotsStorageKey, profileStorageKey, blockedStorageKey, activeCoachPanelStorageKey, activeStudentPanelStorageKey]);
  const prefixes = [
    "ice-skating-coach-booking-slots-",
    "ice-skating-coach-profiles-",
    "ice-skating-coach-blocked-exceptions-"
  ];
  storageKeys().forEach((key) => {
    if (keepKeys.has(key)) return;
    if (prefixes.some((prefix) => key.startsWith(prefix))) {
      storageRemoveItem(key);
    }
  });
}
function clearOversizedLocalPhotos(coachProfiles) {
  let removedCount = 0;
  Object.values(coachProfiles).forEach((profile) => {
    if (profile.photoUrl && profile.photoUrl.startsWith("data:image/")) {
      profile.photoUrl = "";
      removedCount += 1;
    }
  });
  if (!removedCount) return false;
  storageRemoveItem(profileStorageKey);
  storageSetItem(profileStorageKey, JSON.stringify(coachProfiles));
  lastStorageRecoveryMessage = `已清理 ${removedCount} 张过大的本地照片，并保存当前更改。`;
  return true;
}
function normalizeProfile(profile) {
  const defaultProfile = createDefaultProfile(profile.coachId);
  const shouldInstallDemoPhoto = !profile.demoPhotoVersion && !(typeof profile.photoUrl === "string" && profile.photoUrl.trim());
  const profileWithPricing = Object.prototype.hasOwnProperty.call(profile, "rate")
    ? profile
    : { ...profile, rate: defaultProfile.rate, basePriceUnitMinutes: defaultProfile.basePriceUnitMinutes };
  const migration = migrateLegacyProfilePricing(profileWithPricing);
  const normalized = { ...defaultProfile, ...migration.profile };
  if (shouldInstallDemoPhoto) normalized.photoUrl = defaultProfile.photoUrl;
  normalized.demoPhotoVersion = defaultProfile.demoPhotoVersion;
  normalized.city = typeof normalized.city === "string" ? normalized.city : "";
  normalized.bio = typeof normalized.bio === "string" ? normalized.bio : "";
  normalized.teachingDisciplines = normalizeCoachTeachingDisciplines(normalized.teachingDisciplines);
  normalized.skatingStartYear = normalizeStartYear(normalized.skatingStartYear);
  normalized.coachingStartYear = normalizeStartYear(normalized.coachingStartYear);
  normalized.specialties = normalizeCoachSpecialties(normalized.specialties);
  normalized.customSpecialties = normalizeCustomCoachSpecialties(normalized.customSpecialties);
  const hadSelectedCustomSpecialties = Array.isArray(profile.selectedCustomSpecialties);
  const selectedCustomSpecialties = hadSelectedCustomSpecialties
    ? normalizeCustomCoachSpecialties(profile.selectedCustomSpecialties)
    : normalized.customSpecialties;
  const customSpecialtySet = new Set(normalized.customSpecialties);
  normalized.selectedCustomSpecialties = selectedCustomSpecialties.filter((specialty) => customSpecialtySet.has(specialty));
  const hadTravelConditions = typeof profile.travelConditions === "string";
  normalized.travelConditions = hadTravelConditions ? profile.travelConditions.trim() : "";
  if (!hadTravelConditions && normalized.travelsToOtherRinks && Number(normalized.travelFee) > 0) {
    normalized.travelConditions = `额外出行费 $${Number(normalized.travelFee)}/次，其他安排可协商。`;
  }
  if (!Array.isArray(normalized.servedRinks) || !normalized.servedRinks.length) {
    normalized.servedRinks = [normalized.homeRink || rinks[0]];
  }
  if (!Array.isArray(normalized.lessonOptions) || !normalized.lessonOptions.length) {
    normalized.lessonOptions = createDefaultLessonOptions(Number(normalized.rate || 0));
  } else {
    normalized.lessonOptions = normalized.lessonOptions.slice().sort((a, b) => Number(a.duration) - Number(b.duration));
  }
  const migratedProfileFields = !Array.isArray(profile.customSpecialties)
    || !hadSelectedCustomSpecialties
    || !hadTravelConditions
    || !Array.isArray(profile.teachingDisciplines)
    || !Object.prototype.hasOwnProperty.call(profile, "skatingStartYear")
    || !Object.prototype.hasOwnProperty.call(profile, "coachingStartYear");
  return { profile: normalized, migrated: migration.migrated || !profile.demoPhotoVersion || migratedProfileFields };
}
function loadProfiles() {
  const stored = storageGetItem(profileStorageKey);
  if (!stored) return createDefaultProfiles();
  try {
    const parsed = { ...createDefaultProfiles(), ...JSON.parse(stored) };
    let didMigrate = false;
    const normalizedProfiles = Object.fromEntries(Object.entries(parsed).map(([coachId, profile]) => {
      const normalized = normalizeProfile({ ...profile, coachId });
      didMigrate ||= normalized.migrated;
      return [coachId, normalized.profile];
    }));
    if (didMigrate) storageSetItem(profileStorageKey, JSON.stringify(normalizedProfiles));
    return normalizedProfiles;
  } catch {
    return createDefaultProfiles();
  }
}
function loadSlots() {
  const stored = storageGetItem(slotsStorageKey);
  if (!stored) return createDefaultSlots();
  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.map((slot) => ({ ...slot, availabilityLocation: slot.availabilityLocation || slot.location })) : createDefaultSlots();
  } catch {
    return createDefaultSlots();
  }
}
function loadBlockedExceptions() {
  const stored = storageGetItem(blockedStorageKey);
  if (!stored) return [];
  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
function saveProfilesData(coachProfiles) {
  lastStorageRecoveryMessage = "";
  try {
    cleanupLegacyAppStorage();
    const saved = storageSetItem(profileStorageKey, JSON.stringify(coachProfiles));
    if (!saved) {
      lastStorageRecoveryMessage = "浏览器本地存储不可用，本次更改只会保留到刷新前。";
    }
    return saved;
  } catch (error) {
    console.error("Failed to save coach profiles.", error);
    return false;
  }
}
function saveSlotsData(slots, blockedExceptions, coachProfiles) {
  lastStorageRecoveryMessage = "";
  try {
    cleanupLegacyAppStorage();
    const slotsSaved = storageSetItem(slotsStorageKey, JSON.stringify(slots));
    const blocksSaved = storageSetItem(blockedStorageKey, JSON.stringify(blockedExceptions));
    if (!slotsSaved || !blocksSaved) {
      lastStorageRecoveryMessage = "浏览器本地存储不可用，本次更改只会保留到刷新前。";
    }
    return true;
  } catch (error) {
    if (isQuotaError(error)) {
      try {
        cleanupLegacyAppStorage();
        clearOversizedLocalPhotos(coachProfiles);
        storageSetItem(slotsStorageKey, JSON.stringify(slots));
        storageSetItem(blockedStorageKey, JSON.stringify(blockedExceptions));
        if (!lastStorageRecoveryMessage) {
          lastStorageRecoveryMessage = "已清理旧版本缓存，并保存当前更改。";
        }
        return true;
      } catch (retryError) {
        console.error("Failed to recover storage space for availability.", retryError);
      }
    }
    console.error("Failed to save availability.", error);
    return false;
  }
}
export {
  getLastStorageRecoveryMessage,
  loadBlockedExceptions,
  loadProfiles,
  loadSlots,
  saveProfilesData,
  saveSlotsData
};
