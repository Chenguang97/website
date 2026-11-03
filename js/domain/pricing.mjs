export const basePriceUnitMinutes = 30;

export function calculateLessonPrice(basePrice, durationMinutes) {
  const price = Number(basePrice) * Number(durationMinutes) / basePriceUnitMinutes;
  if (!Number.isFinite(price)) return 0;
  return Math.floor(price);
}

export function isValidBasePrice(value) {
  const price = Number(value);
  return Number.isInteger(price) && price > 0;
}

export function isValidLessonPrice(value) {
  if (value === "") return false;
  const price = Number(value);
  return Number.isFinite(price) && price >= 0 && Math.abs(price * 100 - Math.round(price * 100)) < 1e-8;
}

export function migrateLegacyProfilePricing(profile) {
  if (Number(profile.basePriceUnitMinutes) === basePriceUnitMinutes) {
    return { profile, migrated: false, issue: null };
  }

  const convertedBasePrice = calculateLessonPrice(profile.rate, 15);
  return {
    profile: { ...profile, rate: convertedBasePrice, basePriceUnitMinutes },
    migrated: true,
    issue: null,
  };
}
