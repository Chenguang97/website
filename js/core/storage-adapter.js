const memoryStorage = {};
export function storageGetItem(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return Object.prototype.hasOwnProperty.call(memoryStorage, key) ? memoryStorage[key] : null;
  }
}
// Persistence result distinguishes durable writes from session-only fallback.
export function writeStorageItem(key, value) {
  try {
    localStorage.setItem(key, value);
    return { key, persisted: true, memoryFallback: false, reason: null };
  } catch (error) {
    memoryStorage[key] = value;
    console.warn("localStorage unavailable; using in-memory storage for this session.", error);
    return { key, persisted: false, memoryFallback: true, reason: isQuotaError(error) ? "quota" : "unavailable", error };
  }
}
export function removeStorageItem(key) {
  try {
    localStorage.removeItem(key);
    return { key, persisted: true, memoryFallback: false, reason: null };
  } catch (error) {
    delete memoryStorage[key];
    return { key, persisted: false, memoryFallback: true, reason: isQuotaError(error) ? "quota" : "unavailable", error };
  }
}
export function storageKeys() {
  try {
    return Object.keys(localStorage);
  } catch {
    return Object.keys(memoryStorage);
  }
}
export function isQuotaError(error) {
  return error && (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED" || error.code === 22 || error.code === 1014);
}

// Durable read only: a backup must distinguish a missing key from inaccessible storage.
export function readStorageItemResult(key) {
  try {
    return { ok: true, value: localStorage.getItem(key) };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}
