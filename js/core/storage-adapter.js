const memoryStorage = {};
export function storageGetItem(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return Object.prototype.hasOwnProperty.call(memoryStorage, key) ? memoryStorage[key] : null;
  }
}
export function storageSetItem(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    memoryStorage[key] = value;
    console.warn("localStorage unavailable; using in-memory storage for this session.", error);
    return false;
  }
}
export function storageRemoveItem(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    delete memoryStorage[key];
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


