import { locationShortLabels, unavailableSelection } from "../core/config.js";

export function formatLocationLabel(location) {
  if (location === "Any served rink") return "\u4E0D\u9650\u51B0\u573A";
  if (location === unavailableSelection) return "\u4E0D\u53EF\u9884\u7EA6";
  return location;
}

export function formatLocationShortLabel(location) {
  const shortLabel = locationShortLabels[location];
  if (!shortLabel) return formatLocationLabel(location);
  const hasConflict = Object.entries(locationShortLabels)
    .some(([otherLocation, otherLabel]) => otherLocation !== location && otherLabel === shortLabel);
  return hasConflict ? formatLocationLabel(location) : shortLabel;
}
